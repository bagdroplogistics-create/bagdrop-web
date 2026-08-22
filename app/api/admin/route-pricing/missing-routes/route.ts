import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { normalizeCity, findRouteMatch } from '@/lib/city-normalize'

export const runtime = 'nodejs'

// ============================================================================
// BAGDROP — Missing Routes detector
//
// Founder request (2026-08-22): "review all our inquiries and identify any
// new routes that are not currently available in the Item Table [=
// route_pricing]... set the price based on the applicable bag-count
// pricing... check for duplicates before adding."
//
// This route does the "review all our inquiries" and "check for duplicates"
// parts automatically, against LIVE data — it does not use any invented or
// sample data. It deliberately does NOT insert anything; app/(admin)/admin/
// route-pricing/page.tsx renders what this returns as a review panel, and
// the founder clicks Add Route per suggestion (same POST /api/admin/
// route-pricing endpoint the manual "Add Route" button already uses).
//
// ── Pricing source (founder-specified, 2026-08-22): "as per we added price
// in inquiry for 1 bag" — i.e. the source of truth for a new route's price
// is the REAL price already quoted for that route in leads.quote_subtotal,
// not an interpolated/invented number. Concretely:
//   - suggested_base_price  = the actual quoted subtotal for a 1–2 bag
//     inquiry on that route (route_pricing.base_price covers 1–2 bags — see
//     ROUTE_PRICING_MIGRATION.sql). Averaged if more than one such inquiry
//     exists for the route.
//   - suggested_per_bag_rate = derived from the marginal difference between
//     a >2-bag quote and suggested_base_price on the SAME route, only when
//     both data points actually exist. Left null otherwise — deliberately
//     NOT defaulted to any other route's rate or a made-up number. The
//     review panel leaves the field blank in that case, forcing the founder
//     to type in a real number before Add Route can be used (same
//     required-field validation the manual Add Route form already has).
//   - A quoted subtotal that had a discount applied (quote_discount_amt /
//     quote_discount_pct) is corrected back to the undiscounted list price
//     first — a one-off discount given to one customer shouldn't quietly
//     become the new standing rate for the whole route going forward.
//
// ── Duplicate check: compares every candidate route against ALL existing
// route_pricing rows (active AND inactive — an inactive row still means
// "this route already has a record, don't create a second one"), using
// findRouteMatch() (lib/city-normalize.ts) so alias/spelling variants
// ("Vadodara" vs "Baroda") and reversed direction ("Mumbai→Baroda" vs
// "Baroda→Mumbai" — route_pricing rows are symmetric, per that table's own
// design) are correctly recognized as the same route, not flagged as new.
//
// ── Scope: reads leads.quote_subtotal (populated whenever a quote has
// actually been generated for that inquiry — app/api/admin/zoho/
// generate-quote/route.ts) rather than bookings.total_amount, which is
// GST-inclusive and therefore not directly comparable to route_pricing.
// base_price (pre-GST). A route that only ever reached booking/payment
// without an addressable lead quote_subtotal (rare — the two are normally
// created together) won't be picked up; flagged here rather than silently
// guessed at.
// ============================================================================

interface LeadRow {
  id:                   string
  lead_number:          string | null
  name:                 string
  from_city:            string | null
  to_city:              string | null
  bags_count:           number | null
  quote_subtotal:       number | null
  quote_discount_amt:   number | null
  quote_discount_pct:   number | null
  created_at:           string
}

interface RouteRow {
  id: string; from_city: string; to_city: string; base_price: number; per_bag_rate: number; is_active: boolean
}

interface DataPoint {
  bags: number; listSubtotal: number; leadNumber: string | null; name: string; createdAt: string
}

const LEAD_SELECT = 'id, lead_number, name, from_city, to_city, bags_count, quote_subtotal, quote_discount_amt, quote_discount_pct, created_at'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [routesQ, leadsQ] = await Promise.all([
    // ALL rows (not just is_active) — an inactive route still counts as
    // "already exists" for de-dup purposes; see comment above.
    supabaseAdmin.from('route_pricing').select('id, from_city, to_city, base_price, per_bag_rate, is_active'),

    // Only leads that actually have a real quoted price — this route is
    // never guessing at what a route "should" cost, only reading what was
    // actually charged.
    supabaseAdmin
      .from('leads')
      .select(LEAD_SELECT)
      .not('quote_subtotal', 'is', null)
      .not('from_city', 'is', null)
      .not('to_city', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5000),
  ])

  if (routesQ.error) return NextResponse.json({ error: routesQ.error.message }, { status: 500 })
  if (leadsQ.error)  return NextResponse.json({ error: leadsQ.error.message },  { status: 500 })

  const existingRoutes = (routesQ.data ?? []) as unknown as RouteRow[]
  const leads          = (leadsQ.data  ?? []) as unknown as LeadRow[]

  // ── Group leads into candidate routes, keyed on normalized+sorted city
  // pair so "Mumbai→Baroda" and "Baroda→Mumbai" (or "Vadodara→Mumbai")
  // land in the same group — route_pricing pricing is symmetric, and so is
  // findRouteMatch()'s lookup, so the grouping needs to match that.
  const groups = new Map<string, { from_city: string; to_city: string; points: DataPoint[] }>()

  for (const lead of leads) {
    const nFrom = normalizeCity(lead.from_city)
    const nTo   = normalizeCity(lead.to_city)
    if (!nFrom || !nTo || nFrom === nTo) continue   // no same-city "route" candidates

    const bags = Number(lead.bags_count) || 1
    const rawSubtotal = Number(lead.quote_subtotal)
    if (!rawSubtotal || rawSubtotal <= 0) continue

    // Correct for a one-off discount so it doesn't silently become the new
    // standing route price. Percentage takes precedence if both are somehow
    // set (matches how the discount fields are used elsewhere — only one is
    // ever really populated per quote).
    let listSubtotal = rawSubtotal
    const discountPct = Number(lead.quote_discount_pct) || 0
    const discountAmt = Number(lead.quote_discount_amt) || 0
    if (discountPct > 0 && discountPct < 100) {
      listSubtotal = rawSubtotal / (1 - discountPct / 100)
    } else if (discountAmt > 0) {
      listSubtotal = rawSubtotal + discountAmt
    }

    const key = [nFrom, nTo].sort().join('|')
    if (!groups.has(key)) {
      groups.set(key, { from_city: lead.from_city!, to_city: lead.to_city!, points: [] })
    }
    groups.get(key)!.points.push({
      bags, listSubtotal: round2(listSubtotal),
      leadNumber: lead.lead_number, name: lead.name, createdAt: lead.created_at,
    })
  }

  // ── Filter out routes that already exist (active or inactive) ──────────
  const missing: Array<{
    from_city: string
    to_city: string
    inquiry_count: number
    suggested_base_price: number | null
    suggested_per_bag_rate: number | null
    base_price_basis: string
    per_bag_rate_basis: string
    sample_points: DataPoint[]
  }> = []

  for (const { from_city, to_city, points } of groups.values()) {
    if (findRouteMatch(existingRoutes, from_city, to_city)) continue   // already covered — not missing

    const basePoints  = points.filter(p => p.bags <= 2)
    const extraPoints = points.filter(p => p.bags > 2)

    let suggestedBase: number | null = null
    let baseBasis = 'No 1–2 bag quote found for this route yet — enter the price manually.'
    if (basePoints.length > 0) {
      suggestedBase = round2(basePoints.reduce((s, p) => s + p.listSubtotal, 0) / basePoints.length)
      baseBasis = basePoints.length === 1
        ? `From 1 real quote (${basePoints[0].bags} bag${basePoints[0].bags > 1 ? 's' : ''}, ${basePoints[0].leadNumber ?? 'lead'})`
        : `Average of ${basePoints.length} real quotes at 1–2 bags`
    }

    let suggestedPerBag: number | null = null
    let perBagBasis = 'No 3+ bag quote found for this route yet — enter the rate manually.'
    if (suggestedBase != null && extraPoints.length > 0) {
      const rates = extraPoints
        .map(p => (p.listSubtotal - suggestedBase!) / (p.bags - 2))
        .filter(r => r > 0)   // guard against noisy/discounted data implying a negative marginal rate
      if (rates.length > 0) {
        suggestedPerBag = round2(rates.reduce((s, r) => s + r, 0) / rates.length)
        perBagBasis = rates.length === 1
          ? `From 1 real 3+ bag quote on this route`
          : `Average of ${rates.length} real 3+ bag quotes on this route`
      }
    }

    missing.push({
      from_city, to_city,
      inquiry_count: points.length,
      suggested_base_price:   suggestedBase,
      suggested_per_bag_rate: suggestedPerBag,
      base_price_basis:   baseBasis,
      per_bag_rate_basis: perBagBasis,
      sample_points: points.slice(0, 5),
    })
  }

  missing.sort((a, b) => b.inquiry_count - a.inquiry_count)

  return NextResponse.json({
    missing_routes:          missing,
    existing_routes_count:   existingRoutes.length,
    leads_considered:        leads.length,
  })
}
