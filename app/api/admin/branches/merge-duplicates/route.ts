// BAGDROP — app/api/admin/branches/merge-duplicates/route.ts
//
// Founder request (2026-09-02): "don't repeat city names ... keep only one
// branch for every location ... remove extra duplicate branches for same
// city" — e.g. a separate "Mumbai" and "Mumbai Airport" branch both
// existing (most likely created manually via Add Branch before this file's
// duplicate-city guard existed on POST /api/admin/branches; the inquiry
// seeder in seed-from-inquiries/route.ts already deduped by city on its
// own, so it's an unlikely source).
//
// This is a MERGE, not a delete: hard-deleting a branch would either orphan
// its already-issued LRs (lrs.branch_id is ON DELETE SET NULL) or, worse,
// silently make them stop showing up under any branch filter. Instead:
//   1. One branch per duplicate group is chosen to survive (the one with
//      the most LRs already issued under it — the "real" branch in
//      practice — tie-broken by earliest created_at).
//   2. Every LR currently pointing at a losing branch is repointed
//      (lrs.branch_id) to the survivor, so it shows up correctly in
//      future branch-filtered views.
//   3. Losing branches are soft-deactivated (is_active = false), never
//      hard-deleted — same convention as DELETE /api/admin/branches/[id].
//      Their access_key stops granting access; their branch_code and
//      lr_series_prefix are frozen exactly as they were.
// Per the branch-wise LR data-integrity rules, an already-issued LR's own
// branch_name/branch_code/branch_address/etc. are a SNAPSHOT taken at
// creation time (see supabase/migrations/20260902_branch_wise_lr.sql) —
// repointing branch_id never changes what already-printed LR documents
// say, and it never touches lr_number (no LR is ever renumbered).
//
// GET  — preview: which city groups have more than one active branch,
//        which branch would survive, and how many LRs would move.
// POST — executes the merge for the requested groups (or every previewed
//        group if `cityKeys` is omitted).
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'
import { normalizeCity } from '@/lib/city-normalize'

export const runtime = 'nodejs'

interface BranchRow {
  id: string; branch_code: string; branch_name: string; city: string; created_at: string
}
interface MergeGroup {
  cityKey:      string
  primary:      { id: string; branch_code: string; branch_name: string; city: string }
  duplicates:   { id: string; branch_code: string; branch_name: string; city: string; lr_count: number }[]
}

async function buildMergeGroups(): Promise<MergeGroup[]> {
  const { data: branches, error } = await supabaseAdmin
    .from('branches')
    .select('id, branch_code, branch_name, city, created_at')
    .eq('is_active', true)
  if (error) throw new Error(error.message)

  const byCity = new Map<string, BranchRow[]>()
  for (const b of (branches ?? []) as BranchRow[]) {
    const key = normalizeCity(b.city)
    if (!key) continue
    const list = byCity.get(key) ?? []
    list.push(b)
    byCity.set(key, list)
  }

  const dupGroups = Array.from(byCity.entries()).filter(([, list]) => list.length > 1)
  if (dupGroups.length === 0) return []

  const allIds = dupGroups.flatMap(([, list]) => list.map(b => b.id))
  const { data: lrRows, error: lrErr } = await supabaseAdmin
    .from('lrs')
    .select('branch_id')
    .in('branch_id', allIds)
  if (lrErr) throw new Error(lrErr.message)

  const lrCountByBranch = new Map<string, number>()
  for (const row of (lrRows ?? []) as { branch_id: string | null }[]) {
    if (!row.branch_id) continue
    lrCountByBranch.set(row.branch_id, (lrCountByBranch.get(row.branch_id) ?? 0) + 1)
  }

  return dupGroups.map(([cityKey, list]) => {
    // Survivor = most LRs already issued under it (the branch actually in
    // use), tie-broken by earliest created_at (the original, not a
    // later accidental re-add).
    const sorted = [...list].sort((a, b) => {
      const countDiff = (lrCountByBranch.get(b.id) ?? 0) - (lrCountByBranch.get(a.id) ?? 0)
      if (countDiff !== 0) return countDiff
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
    const [primary, ...rest] = sorted
    return {
      cityKey,
      primary: { id: primary.id, branch_code: primary.branch_code, branch_name: primary.branch_name, city: primary.city },
      duplicates: rest.map(b => ({
        id: b.id, branch_code: b.branch_code, branch_name: b.branch_name, city: b.city,
        lr_count: lrCountByBranch.get(b.id) ?? 0,
      })),
    }
  })
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized — branch management requires an admin key' }, { status: 401 })
  }
  try {
    const groups = await buildMergeGroups()
    return NextResponse.json({ groups })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Scan failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized — branch management requires an admin key' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({})) as { cityKeys?: string[] }

  let groups: MergeGroup[]
  try {
    groups = await buildMergeGroups()
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Scan failed' }, { status: 500 })
  }
  if (Array.isArray(body.cityKeys) && body.cityKeys.length > 0) {
    const wanted = new Set(body.cityKeys)
    groups = groups.filter(g => wanted.has(g.cityKey))
  }
  if (groups.length === 0) {
    return NextResponse.json({ merged: [], reassignedLrCount: 0, deactivatedCount: 0 })
  }

  const merged: { cityKey: string; primary: string; deactivated: string[]; reassignedLrCount: number }[] = []
  let totalReassigned = 0
  let totalDeactivated = 0

  for (const g of groups) {
    const dupIds = g.duplicates.map(d => d.id)
    if (dupIds.length === 0) continue

    const { data: reassigned, error: reassignErr } = await supabaseAdmin
      .from('lrs')
      .update({ branch_id: g.primary.id })
      .in('branch_id', dupIds)
      .select('id')
    if (reassignErr) {
      console.error(`[branches merge-duplicates] LR reassign failed for city "${g.cityKey}":`, reassignErr.message)
      continue
    }

    const { error: deactivateErr } = await supabaseAdmin
      .from('branches')
      .update({ is_active: false })
      .in('id', dupIds)
    if (deactivateErr) {
      console.error(`[branches merge-duplicates] Deactivate failed for city "${g.cityKey}":`, deactivateErr.message)
      continue
    }

    const reassignedCount = reassigned?.length ?? 0
    totalReassigned  += reassignedCount
    totalDeactivated += dupIds.length
    merged.push({
      cityKey: g.cityKey,
      primary: `${g.primary.branch_name} (${g.primary.branch_code})`,
      deactivated: g.duplicates.map(d => `${d.branch_name} (${d.branch_code})`),
      reassignedLrCount: reassignedCount,
    })
  }

  return NextResponse.json({ merged, reassignedLrCount: totalReassigned, deactivatedCount: totalDeactivated })
}
