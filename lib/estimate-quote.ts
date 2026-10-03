// BAGDROP — lib/estimate-quote.ts
//
// Automatic Estimate Quote generation.
//
// v1 (Founder spec, 2026-10-02): auto-calculate an estimate whenever a new
// inquiry's route matched Route/Pricing Master and a bag count was given.
//
// v2 (Founder spec, 2026-10-03 — THIS version): "Admin should never need
// to manually create the initial quote for an inquiry." Every inquiry now
// gets an estimate automatically, known route or not:
//   - Known route  → exact same route_pricing formula as before (never a
//     second pricing engine — see calculateRouteEstimate below).
//   - Unknown route → a ₹10,000 / 2-bag starting estimate. This figure is
//     a Founder-specified business rule (given verbatim in the 2026-10-03
//     spec), not a number invented by this code — it exists purely so
//     Admin has something to open and edit instead of a blank quote, and
//     is always flagged estimate_needs_review / estimate_is_unknown_route
//     so it can never be mistaken for a priced quote.
//
// ── Critical boundaries (unchanged from v1, still enforced) ───────────
// This is NOT a second pricing engine — known-route pricing is the exact
// same route_pricing lookup + formula used by app/api/admin/route-pricing/
// calculate/route.ts and app/api/admin/zoho/generate-quote/route.ts.
//
// An estimate is a completely separate record from a real Final Quote:
//   - estimate_number (EST-YYYY-NNNN, lib/number-series.ts) is a SEPARATE
//     series from quote_number (QT-YYYY-NNNN) — never the same series,
//     never minted more than once per lead.
//   - No booking is created or touched here.
//   - Nothing is ever emailed/WhatsApped to the customer from this module.
//   - estimate_status only ever holds 'generated' or 'converted' — never
//     any real booking-workflow status.
// A real Final Quote generated later (app/api/admin/zoho/generate-quote/
// route.ts) freezes the estimate (estimate_status: 'converted') and is its
// own separate record — the estimate is never overwritten by it, and vice
// versa.
//
// Every call site is wrapped to be non-throwing/best-effort — an estimate
// failing to calculate must never break inquiry creation or lead editing.

import { supabaseAdmin } from './supabase'
import { findRouteMatch } from './city-normalize'
import { nextEstimateNumber } from './number-series'
import { UNKNOWN_ROUTE_DEFAULT_BASE } from './estimate-constants'

const GST_PCT = 5 // 5% total GST (2.5% CGST + 2.5% SGST) — matches generate-quote/route.ts

// Deliberately NOT extrapolated into a per-extra-bag rate for >2 bags on
// an unknown route (spec §7) — there is no real data to derive one from,
// so the amount stays flat and the estimate is flagged for Admin review
// instead of guessing a number. See lib/estimate-constants.ts for the
// figure itself (shared with the client-side New Quote page pre-fill).

export interface EstimateLineItem {
  name:        string
  description: string
  quantity:    number
  rate:        number
  amount:      number
}

export interface EstimateResult {
  from_city:          string
  to_city:            string
  bags:               number
  subtotal:           number
  tax:                number
  total:              number
  line_items:         EstimateLineItem[]
  is_unknown_route:   boolean
  needs_review:       boolean
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function buildKnownRouteLineItems(from: string, to: string, bags: number, base: number, perBag: number): EstimateLineItem[] {
  const route = `${from} → ${to}`
  const items: EstimateLineItem[] = [{
    name:        `Transportation of Goods (Upto 2 Bags) — ${route}`,
    description: 'Airport-to-Doorstep / Doorstep-to-Airport baggage delivery (estimate)',
    quantity:    1,
    rate:        base,
    amount:      base,
  }]
  if (bags > 2) {
    const extra = bags - 2
    items.push({
      name:        `Additional Bag(s) — ${route}`,
      description: 'Per extra bag beyond 2 (estimate)',
      quantity:    extra,
      rate:        perBag,
      amount:      round2(extra * perBag),
    })
  }
  return items
}

function buildUnknownRouteLineItems(from: string, to: string, bags: number): EstimateLineItem[] {
  return [{
    name:        `Starting Estimate (Unknown Route) — ${from} → ${to}`,
    description: `Default starting estimate — Admin review required before sending as a Final Quote. Covers up to 2 bags; ${bags} bag(s) requested.`,
    quantity:    1,
    rate:        UNKNOWN_ROUTE_DEFAULT_BASE,
    amount:      UNKNOWN_ROUTE_DEFAULT_BASE,
  }]
}

/**
 * Computes the estimate for a route + bag count. ALWAYS returns a result
 * (never null) as long as there's a from/to city and a bag count — known
 * routes use the real route_pricing formula, unknown routes use the
 * ₹10,000/2-bag Founder-specified fallback and come back flagged
 * is_unknown_route/needs_review so the UI and Admin can never mistake one
 * for the other. Returns null only when there's genuinely not enough
 * information yet (no cities, or no bag count) — nothing to estimate from
 * at all.
 */
export async function calculateRouteEstimate(
  fromCityRaw: string | null | undefined,
  toCityRaw:   string | null | undefined,
  bagsRaw:     number | null | undefined
): Promise<EstimateResult | null> {
  const fromCity = (fromCityRaw ?? '').trim()
  const toCity   = (toCityRaw   ?? '').trim()
  const bags     = Number(bagsRaw) || 0
  if (!fromCity || !toCity || bags < 1) return null

  const { data: routes, error } = await supabaseAdmin
    .from('route_pricing')
    .select('from_city, to_city, base_price, per_bag_rate')
    .eq('is_active', true)

  if (error) {
    console.error('[AutoEstimate] route_pricing lookup failed:', error.message)
    // Don't silently fall back to "unknown route" pricing on a DB error —
    // that would misrepresent a real (but temporarily unreachable) known
    // route as unpriced. Better to produce no estimate this run than a
    // wrong one; the next trigger (edit, backfill) will retry cleanly.
    return null
  }

  const route = findRouteMatch(routes ?? [], fromCity, toCity)

  if (route) {
    const lineItems = buildKnownRouteLineItems(fromCity, toCity, bags, Number(route.base_price), Number(route.per_bag_rate))
    const subtotal   = round2(lineItems.reduce((s, i) => s + i.amount, 0))
    const tax        = round2(subtotal * GST_PCT / 100)
    const total       = round2(subtotal + tax)
    return { from_city: fromCity, to_city: toCity, bags, subtotal, tax, total, line_items: lineItems, is_unknown_route: false, needs_review: false }
  }

  // Unknown route — Founder-specified ₹10,000/2-bag fallback (spec §6/§7).
  const lineItems = buildUnknownRouteLineItems(fromCity, toCity, bags)
  const subtotal   = round2(lineItems.reduce((s, i) => s + i.amount, 0))
  const tax        = round2(subtotal * GST_PCT / 100)
  const total       = round2(subtotal + tax)
  return { from_city: fromCity, to_city: toCity, bags, subtotal, tax, total, line_items: lineItems, is_unknown_route: true, needs_review: true }
}

const ESTIMATE_CLEAR_FIELDS = {
  estimate_status:            null,
  estimate_subtotal:          null,
  estimate_tax:               null,
  estimate_total:             null,
  estimate_line_items:        null,
  estimate_route_from:        null,
  estimate_route_to:          null,
  estimate_bags_count:        null,
  estimate_generated_at:      null,
  estimate_is_unknown_route:  null,
  estimate_needs_review:      null,
  // estimate_number is deliberately NOT cleared even when the estimate
  // itself is — once minted it's a permanent identifier for this lead
  // (same convention as lead_number/tracking_id never being reused), so a
  // lead that briefly had no calculable estimate and later gets one again
  // reuses the same EST- number rather than minting a second one.
}

/**
 * Generates or refreshes the automatic estimate on a lead. Safe to call on
 * every inquiry creation AND every subsequent edit (bags/route/service
 * changed) — the single source of truth for keeping leads.estimate_* in
 * sync with leads.from_city/to_city/bags_count, right up until a real
 * Final Quote exists.
 *
 * ALWAYS produces an estimate now (v2, 2026-10-03) as long as from_city,
 * to_city and bags_count are all present on the lead — known route or not.
 * Only produces no estimate (and clears any stale one) when the lead
 * genuinely doesn't have enough information yet (e.g. a bag count hasn't
 * been collected).
 *
 * Deliberately a no-op (frozen) once estimate_status is 'converted' — set
 * by app/api/admin/zoho/generate-quote/route.ts the moment a real
 * quote_number is written (spec §11/§13: "once Admin converts the
 * estimate into a Final Quote... should not unexpectedly change because
 * of later inquiry edits"). Also skips whenever quote_number is already
 * set, even if estimate_status somehow wasn't — belt and braces against
 * ever touching a lead that has a real quote.
 *
 * Never throws — every caller treats this as fire-and-forget.
 */
export async function generateEstimateForLead(leadId: string | null | undefined): Promise<void> {
  if (!leadId) return
  try {
    const { data: lead, error: fetchErr } = await supabaseAdmin
      .from('leads')
      .select('id, from_city, to_city, bags_count, quote_number, estimate_status, estimate_number')
      .eq('id', leadId)
      .maybeSingle()

    if (fetchErr || !lead) return
    if (lead.quote_number || lead.estimate_status === 'converted') return // real quote exists — never touch

    const result = await calculateRouteEstimate(lead.from_city, lead.to_city, lead.bags_count)

    if (!result) {
      // Genuinely not enough info yet (e.g. no bag count) — clear a stale
      // estimate if one was previously calculated under different data,
      // rather than leaving outdated numbers visible in the Dashboard.
      // No-op (and no extra write) when there was never one to begin with.
      if (lead.estimate_status) {
        await supabaseAdmin.from('leads').update(ESTIMATE_CLEAR_FIELDS).eq('id', leadId)
      }
      return
    }

    // Mint EST-YYYY-NNNN exactly once per lead (spec §14 — "avoid
    // duplicate quote creation" / "use ... a unique estimate identifier to
    // prevent duplicates"). Every recalculation after the first reuses the
    // number already stored on the row.
    const estimateNumber = lead.estimate_number ?? await nextEstimateNumber()

    await supabaseAdmin.from('leads').update({
      estimate_number:            estimateNumber,
      estimate_subtotal:          result.subtotal,
      estimate_tax:               result.tax,
      estimate_total:             result.total,
      estimate_line_items:        result.line_items,
      estimate_status:            'generated',
      estimate_generated_at:      new Date().toISOString(),
      estimate_route_from:        result.from_city,
      estimate_route_to:          result.to_city,
      estimate_bags_count:        result.bags,
      estimate_is_unknown_route:  result.is_unknown_route,
      estimate_needs_review:      result.needs_review,
    }).eq('id', leadId)

    console.log(`[AutoEstimate] Lead ${leadId} — ${estimateNumber} ₹${result.total} (${result.from_city} → ${result.to_city}, ${result.bags} bag${result.bags > 1 ? 's' : ''})${result.is_unknown_route ? ' [UNKNOWN ROUTE — review required]' : ''}`)
  } catch (err) {
    console.error('[AutoEstimate] generateEstimateForLead failed (non-fatal):', err)
  }
}
