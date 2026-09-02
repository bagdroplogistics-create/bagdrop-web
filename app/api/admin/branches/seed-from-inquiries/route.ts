// BAGDROP — app/api/admin/branches/seed-from-inquiries/route.ts
//
// Founder request (2026-09-02): "add all branch location as per our all
// inquiry" — scans every inquiry ever taken (leads.from_city, the pickup
// city — the broadest set, since not every inquiry converts into a
// booking) and creates a Branch record for every distinct city that
// doesn't already have one, so the LR form's "LR Issuing Branch" dropdown
// (and the auto-suggestion in lib/lr-auto-create.ts's resolveBranchForLr)
// covers every city Bagdrop has actually operated from — not just the
// handful manually added so far.
//
// Deliberately does NOT invent branch_address / gst_number / contact_number
// / email / branch_manager — an inquiry's pickup city tells us nothing
// about the branch's own office address or GST registration, so those stay
// null (same "flag as an assumption, never invent a fact" rule as
// everywhere else in this codebase). branch_code / lr_series_prefix are
// mechanically derived from the city name; every other Branch field keeps
// its normal create-time default (see POST /api/admin/branches, whose
// insert/counter-seed logic this mirrors exactly rather than calling over
// HTTP, so a partial failure here can't leave a branch without its counter
// row).
//
// GET  — preview: cities with no matching branch yet, grouped by
//        lib/city-normalize.ts's normalizeCity so spelling variants
//        ("Vadodara" / "Baroda", "Mumbai Airport (T2)" / "Mumbai") collapse
//        into one branch instead of near-duplicates.
// POST — creates a branch for each requested key (or every previewed key
//        if `keys` is omitted).
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'
import { normalizeCity, citiesEqual } from '@/lib/city-normalize'
import { indianFinancialYear } from '@/lib/financial-year'

export const runtime = 'nodejs'

interface CityGroup {
  key:   string   // normalizeCity() output — stable dedup key
  label: string   // most common raw spelling seen in leads.from_city
  count: number   // how many inquiries used this city
}

async function buildCityGroups(): Promise<CityGroup[]> {
  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('from_city')
    .not('from_city', 'is', null)
    .limit(20000)
  if (error) throw new Error(error.message)

  // key -> (raw label -> count), so the most common spelling wins as the
  // display label even if normalizeCity collapses several variants together.
  const groups = new Map<string, Map<string, number>>()
  for (const row of (data ?? []) as { from_city: string | null }[]) {
    const raw = (row.from_city ?? '').trim()
    if (!raw) continue
    const key = normalizeCity(raw)
    if (!key) continue
    const labels = groups.get(key) ?? new Map<string, number>()
    labels.set(raw, (labels.get(raw) ?? 0) + 1)
    groups.set(key, labels)
  }

  return Array.from(groups.entries()).map(([key, labels]) => {
    const [label, count] = Array.from(labels.entries()).sort((a, b) => b[1] - a[1])[0]
    const total = Array.from(labels.values()).reduce((s, n) => s + n, 0)
    return { key, label, count: total }
  }).sort((a, b) => b.count - a.count)
}

async function uncoveredGroups(): Promise<CityGroup[]> {
  const [groups, { data: existing, error }] = await Promise.all([
    buildCityGroups(),
    supabaseAdmin.from('branches').select('city'),
  ])
  if (error) throw new Error(error.message)
  const existingCities = (existing ?? []).map(b => b.city as string)
  return groups.filter(g => !existingCities.some(c => citiesEqual(c, g.label)))
}

// Derives a unique 2-10 char branch_code from a city label — first 3
// letters, growing to 4/5/6 on collision, then a numeric suffix in the
// (practically unreachable) case even that collides. `used` is mutated so
// repeated calls within one request never hand out the same code twice.
function generateBranchCode(label: string, used: Set<string>): string {
  const clean = label.toUpperCase().replace(/[^A-Z]/g, '') || 'BR'
  for (let len = 3; len <= Math.min(clean.length, 6); len++) {
    const candidate = clean.slice(0, len)
    if (!used.has(candidate)) { used.add(candidate); return candidate }
  }
  let n = 1
  let candidate = `${clean.slice(0, 3)}${n}`
  while (used.has(candidate)) { n += 1; candidate = `${clean.slice(0, 3)}${n}` }
  used.add(candidate)
  return candidate
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized — branch management requires an admin key' }, { status: 401 })
  }
  try {
    const groups = await uncoveredGroups()
    return NextResponse.json({ branches: groups })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Scan failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized — branch management requires an admin key' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({})) as { keys?: string[] }

  let groups: CityGroup[]
  try {
    groups = await uncoveredGroups()
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Scan failed' }, { status: 500 })
  }
  if (Array.isArray(body.keys) && body.keys.length > 0) {
    const wanted = new Set(body.keys)
    groups = groups.filter(g => wanted.has(g.key))
  }
  if (groups.length === 0) {
    return NextResponse.json({ created: [], skipped: [], failed: [] })
  }

  const { data: existingBranches } = await supabaseAdmin.from('branches').select('branch_code')
  const usedCodes = new Set((existingBranches ?? []).map(b => (b.branch_code as string).toUpperCase()))

  const fy = indianFinancialYear()
  const created: { key: string; branch_code: string; branch_name: string; city: string }[] = []
  const failed:  { key: string; error: string }[] = []

  for (const g of groups) {
    const branchCode = generateBranchCode(g.label, usedCodes)
    const branchName = `${g.label} Branch`
    const accessKey   = crypto.randomBytes(24).toString('base64url')

    const { error } = await supabaseAdmin
      .from('branches')
      .insert({
        branch_code:      branchCode,
        branch_name:      branchName,
        city:             g.label,
        is_active:        true,
        access_key:       accessKey,
        lr_series_prefix: branchCode,
        lr_include_fy:    true,
        lr_start_number:  1,
        lr_padding:       6,
        // state/address/pincode/gst_number/contact_number/email/
        // branch_manager intentionally left null — see file header.
      })

    if (error) {
      failed.push({ key: g.key, error: error.message })
      continue
    }

    await supabaseAdmin
      .from('bagdrop_number_counters')
      .upsert(
        { series: `${branchCode}-LR`, year: fy.startYear, last_seq: 0 },
        { onConflict: 'series,year', ignoreDuplicates: true },
      )

    created.push({ key: g.key, branch_code: branchCode, branch_name: branchName, city: g.label })
  }

  return NextResponse.json({ created, failed })
}
