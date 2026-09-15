// BAGDROP — app/api/admin/route-templates/standardize-vadodara/route.ts
// Founder request, 2026-09-15: "replace baroda with Vadodara everywhere" —
// scoped, per the founder's own choice, to Route Pricing + Route Templates
// configuration data only (NOT historical bookings/leads/quotes/invoices,
// which stay untouched — those are real transaction records, not config).
//
// route_pricing.from_city/to_city landed as the raw string "baroda" for
// Vadodara (the shared city-picker's internal id — see lib/constants.ts's
// comment "internal id stays 'baroda'"), which is why the Route Templates
// bulk-import (2026-09-15) produced a title-cased "Baroda → Delhi" instead
// of "Vadodara → Delhi": it title-cases route_pricing's raw stored text
// directly, it doesn't run it through lib/city-normalize.ts's alias table.
// Fixing the raw data here is the real fix — every future Import from
// Route Pricing run then naturally produces "Vadodara" with no special-
// casing needed in the import route itself.
//
// Conflict-safe: if renaming a row to "vadodara"/"Vadodara" would collide
// with a row that already legitimately uses that spelling, this SKIPS it
// and reports the collision instead of merging or deleting anything — same
// caution as the manual duplicate cleanup earlier this session (the Disha
// Patel BDA-2026-0166 vs BDA-0010 situation). A reported collision needs a
// human decision, not an automatic guess.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = {
    route_pricing_updated:    0,
    route_pricing_conflicts:  [] as string[],
    route_templates_updated:   0,
    route_templates_conflicts: [] as string[],
    operations_updated:        0,
  }

  // ── 1. route_pricing (always-lowercase raw text) ────────────────────
  const { data: pricingRows, error: pricingErr } = await supabaseAdmin
    .from('route_pricing')
    .select('id, from_city, to_city')
    .or('from_city.eq.baroda,to_city.eq.baroda')
  if (pricingErr) return NextResponse.json({ error: pricingErr.message }, { status: 500 })

  const { data: allPricing, error: allPricingErr } = await supabaseAdmin
    .from('route_pricing')
    .select('id, from_city, to_city')
  if (allPricingErr) return NextResponse.json({ error: allPricingErr.message }, { status: 500 })

  for (const row of pricingRows ?? []) {
    const newFrom = row.from_city === 'baroda' ? 'vadodara' : row.from_city
    const newTo   = row.to_city   === 'baroda' ? 'vadodara' : row.to_city
    const collision = (allPricing ?? []).some(o => o.id !== row.id && o.from_city === newFrom && o.to_city === newTo)
    if (collision) {
      result.route_pricing_conflicts.push(`${row.from_city} → ${row.to_city} (would collide with an existing ${newFrom} → ${newTo} row — left unchanged)`)
      continue
    }
    const { error: upErr } = await supabaseAdmin
      .from('route_pricing')
      .update({ from_city: newFrom, to_city: newTo })
      .eq('id', row.id)
    if (!upErr) result.route_pricing_updated++
  }

  // ── 2. route_templates (display-cased free text) ────────────────────
  const { data: templateRows, error: templatesErr } = await supabaseAdmin
    .from('route_templates')
    .select('id, route_name, from_city, to_city')
    .or('from_city.ilike.baroda,to_city.ilike.baroda,route_name.ilike.%baroda%')
  if (templatesErr) return NextResponse.json({ error: templatesErr.message }, { status: 500 })

  const { data: allTemplates, error: allTemplatesErr } = await supabaseAdmin
    .from('route_templates')
    .select('id, from_city, to_city')
  if (allTemplatesErr) return NextResponse.json({ error: allTemplatesErr.message }, { status: 500 })

  for (const row of templateRows ?? []) {
    const newFrom = /^baroda$/i.test(row.from_city) ? 'Vadodara' : row.from_city
    const newTo   = /^baroda$/i.test(row.to_city)   ? 'Vadodara' : row.to_city
    const newName = row.route_name.replace(/baroda/gi, 'Vadodara')
    const collision = (allTemplates ?? []).some(o =>
      o.id !== row.id && o.from_city.toLowerCase() === newFrom.toLowerCase() && o.to_city.toLowerCase() === newTo.toLowerCase()
    )
    if (collision) {
      result.route_templates_conflicts.push(`${row.route_name} (would collide with an existing ${newFrom} → ${newTo} template — left unchanged; use Duplicate/Archive to merge manually)`)
      continue
    }
    const { error: upErr } = await supabaseAdmin
      .from('route_templates')
      .update({ route_name: newName, from_city: newFrom, to_city: newTo })
      .eq('id', row.id)
    if (!upErr) result.route_templates_updated++
  }

  // ── 3. route_template_operations (per-operation From/To legs) ───────
  // No uniqueness constraint here, so this is a plain find-and-replace —
  // no collision risk.
  const { data: opRows, error: opsErr } = await supabaseAdmin
    .from('route_template_operations')
    .select('id, from_location, to_location')
    .or('from_location.ilike.%baroda%,to_location.ilike.%baroda%')
  if (opsErr) return NextResponse.json({ error: opsErr.message }, { status: 500 })

  for (const op of opRows ?? []) {
    const newFrom = op.from_location ? op.from_location.replace(/baroda/gi, 'Vadodara') : op.from_location
    const newTo   = op.to_location   ? op.to_location.replace(/baroda/gi, 'Vadodara')   : op.to_location
    const { error: upErr } = await supabaseAdmin
      .from('route_template_operations')
      .update({ from_location: newFrom, to_location: newTo })
      .eq('id', op.id)
    if (!upErr) result.operations_updated++
  }

  return NextResponse.json({ success: true, ...result })
}
