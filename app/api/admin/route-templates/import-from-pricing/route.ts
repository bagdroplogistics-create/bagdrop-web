// BAGDROP — app/api/admin/route-templates/import-from-pricing/route.ts
// Founder request, 2026-09-15: "fetch all the locations from route pricing
// table and update all route templates" — bulk-create a Route Template
// shell for every from/to city pair already defined in `route_pricing`
// (the CUSTOMER-facing quote pricing table: base_price + per_bag_rate),
// so every route Bagdrop already quotes for has a template ready to fill
// in with real vendor operations, instead of the admin retyping city
// names by hand one route at a time.
//
// Deliberately does NOT copy base_price/per_bag_rate into any operation —
// those are CUSTOMER pricing (revenue side), not vendor cost (the thing a
// Route Template operation models). Carrying them over would silently
// mislabel a customer rate as a vendor cost. Each imported route is
// created with zero operations — a real shell, ready for the admin to
// add its actual Pickup/Middle Mile/Delivery/etc. vendor operations, same
// as building one from scratch would require, just without retyping the
// city names or risking a typo that no longer matches Route Pricing.
//
// Idempotent by design: skips any (from_city, to_city) pair that already
// has a route_template, case-insensitively, so running this again after
// adding a few new Route Pricing rows only creates the new ones.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export const runtime = 'nodejs'

function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const activeOnly = body?.active_only !== false // default true — skip deactivated pricing rows

  const { data: pricingRows, error: pricingErr } = await supabaseAdmin
    .from('route_pricing')
    .select('from_city, to_city, is_active')
    .order('from_city')
  if (pricingErr) return NextResponse.json({ error: pricingErr.message }, { status: 500 })

  const { data: existingTemplates, error: templatesErr } = await supabaseAdmin
    .from('route_templates')
    .select('from_city, to_city')
  if (templatesErr) return NextResponse.json({ error: templatesErr.message }, { status: 500 })

  const existingKey = (from: string, to: string) => `${from.trim().toLowerCase()}|${to.trim().toLowerCase()}`
  const existingSet = new Set((existingTemplates ?? []).map(t => existingKey(t.from_city, t.to_city)))

  const seenThisRun = new Set<string>() // route_pricing itself is unique per (from,to), but guard anyway
  const toCreate: { route_name: string; from_city: string; to_city: string; status: 'active'; notes: string }[] = []
  const skipped: { from_city: string; to_city: string; reason: string }[] = []

  for (const r of pricingRows ?? []) {
    if (activeOnly && r.is_active === false) {
      skipped.push({ from_city: r.from_city, to_city: r.to_city, reason: 'inactive in Route Pricing' })
      continue
    }
    const key = existingKey(r.from_city, r.to_city)
    if (existingSet.has(key) || seenThisRun.has(key)) {
      skipped.push({ from_city: r.from_city, to_city: r.to_city, reason: 'route template already exists' })
      continue
    }
    seenThisRun.add(key)
    const fromCity = titleCase(r.from_city)
    const toCity   = titleCase(r.to_city)
    toCreate.push({
      route_name: `${fromCity} → ${toCity}`,
      from_city:  fromCity,
      to_city:    toCity,
      status:     'active',
      notes:      `Imported from Route Pricing on ${new Date().toISOString().slice(0, 10)} — add this route's real vendor operations (Pickup, Middle Mile, Delivery, etc.) below.`,
    })
  }

  let created = 0
  if (toCreate.length > 0) {
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('route_templates')
      .insert(toCreate)
      .select('id')
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
    created = inserted?.length ?? 0
  }

  return NextResponse.json({
    success:  true,
    created,
    skipped:  skipped.length,
    skipped_routes: skipped,
    created_routes: toCreate.map(t => t.route_name),
  })
}
