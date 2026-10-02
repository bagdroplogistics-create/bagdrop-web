// BAGDROP — lib/estimate-quote.ts
//
// Automatic ESTIMATE quote generation (Founder request, 2026-10-02):
// "Whenever a new inquiry is received and the requested route already
// exists in Route/Pricing Master, and the inquiry has a bag count,
// automatically calculate and show an ESTIMATE quote in the Dashboard —
// without Admin having to manually create the initial estimate."
//
// ── Critical boundary (per Founder spec) ──────────────────────────────
// This is NOT a second pricing engine. It reuses the exact same
// route_pricing lookup (findRouteMatch — lib/city-normalize.ts) and the
// exact same pricing formula already used by:
//   - app/api/admin/route-pricing/calculate/route.ts (admin pricing tool)
//   - app/api/admin/zoho/generate-quote/route.ts's buildRouteItems()
//     (the real Final Quote generator)
// Base price covers 1–2 bags; every bag beyond 2 is charged at
// per_bag_rate. GST is the same flat 5% (2.5% CGST + 2.5% SGST) split
// used everywhere else in the app.
//
// An estimate is ONLY ever generated when a real route_pricing match and
// a real bag count exist — never invented, never guessed, never defaults
// to some other route's price. No match → no estimate → the existing
// manual quote workflow is completely unchanged for that lead.
//
// This module never creates a booking, never mints a quote_number
// (that series — QT-YYYY-NNNN — is reserved for real Final Quotes), and
// never sends anything to the customer. It only writes the dedicated
// estimate_* columns on the lead (see supabase/migrations/
// 20261002_lead_auto_estimate.sql) — a real Final Quote generated later
// via app/api/admin/zoho/generate-quote/route.ts is a completely
// separate record and is never overwritten by this.
//
// Every call site below is wrapped to be non-throwing/best-effort — an
// estimate failing to calculate must never break inquiry creation or
// lead editing, the same convention as lib/new-inquiry-notification.ts.

import { supabaseAdmin } from './supabase'
import { findRouteMatch } from './city-normalize'

const GST_PCT = 5 // 5% total GST (2.5% CGST + 2.5% SGST) — matches generate-quote/route.ts

export interface EstimateLineItem {
  name:        string
  description: string
  quantity:    number
  rate:        number
  amount:      number
}

export interface EstimateResult {
  from_city: string
  to_city:   string
  bags:      number
  subtotal:  number
  tax:       number
  total:     number
  line_items: EstimateLineItem[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function buildEstimateLineItems(from: string, to: string, bags: number, base: number, perBag: number): EstimateLineItem[] {
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

/**
 * Looks up the Route/Pricing Master for a route match and, if found,
 * computes the estimate using the exact same ≤2-bags-base +
 * beyond-2-per-bag formula as the real Final Quote generator. Returns
 * null (never a guessed number) when there's no active route match or
 * no usable bag count.
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
    return null
  }

  const route = findRouteMatch(routes ?? [], fromCity, toCity)
  if (!route) return null

  const lineItems = buildEstimateLineItems(fromCity, toCity, bags, Number(route.base_price), Number(route.per_bag_rate))
  const subtotal   = round2(lineItems.reduce((s, i) => s + i.amount, 0))
  const tax        = round2(subtotal * GST_PCT / 100)
  const total       = round2(subtotal + tax)

  return { from_city: fromCity, to_city: toCity, bags, subtotal, tax, total, line_items: lineItems }
}

const ESTIMATE_CLEAR_FIELDS = {
  estimate_status:       null,
  estimate_subtotal:     null,
  estimate_tax:          null,
  estimate_total:        null,
  estimate_line_items:   null,
  estimate_route_from:   null,
  estimate_route_to:     null,
  estimate_bags_count:   null,
  estimate_generated_at: null,
}

/**
 * Generates or refreshes the automatic estimate on a lead. Safe to call
 * on every inquiry creation AND every subsequent edit (bags/route/service
 * changed) — it is the single source of truth for keeping
 * leads.estimate_* in sync with leads.from_city/to_city/bags_count, right
 * up until a real Final Quote exists.
 *
 * Deliberately a no-op (frozen) once estimate_status is 'converted' — set
 * by app/api/admin/zoho/generate-quote/route.ts the moment a real
 * quote_number is written — per Founder spec #11/#13: "once Admin
 * converts the estimate into a Final Quote, the final quote should become
 * its own quotation record/version and should not unexpectedly change
 * because of later inquiry edits." Also skips (treats as already
 * converted) whenever quote_number is already set, even if estimate_status
 * somehow wasn't — belt and braces against ever touching a lead that has
 * a real quote.
 *
 * Never throws — every caller treats this as fire-and-forget.
 */
export async function generateEstimateForLead(leadId: string | null | undefined): Promise<void> {
  if (!leadId) return
  try {
    const { data: lead, error: fetchErr } = await supabaseAdmin
      .from('leads')
      .select('id, from_city, to_city, bags_count, quote_number, estimate_status')
      .eq('id', leadId)
      .maybeSingle()

    if (fetchErr || !lead) return
    if (lead.quote_number || lead.estimate_status === 'converted') return // real quote exists — never touch

    const result = await calculateRouteEstimate(lead.from_city, lead.to_city, lead.bags_count)

    if (!result) {
      // No route match (yet) / no bag count — clear a stale estimate if
      // one was previously calculated under different route/bags, rather
      // than leaving outdated numbers visible in the Dashboard. No-op
      // (and no extra write) when there was never one to begin with.
      if (lead.estimate_status) {
        await supabaseAdmin.from('leads').update(ESTIMATE_CLEAR_FIELDS).eq('id', leadId)
      }
      return
    }

    await supabaseAdmin.from('leads').update({
      estimate_subtotal:     result.subtotal,
      estimate_tax:          result.tax,
      estimate_total:        result.total,
      estimate_line_items:   result.line_items,
      estimate_status:       'generated',
      estimate_generated_at: new Date().toISOString(),
      estimate_route_from:   result.from_city,
      estimate_route_to:     result.to_city,
      estimate_bags_count:   result.bags,
    }).eq('id', leadId)

    console.log(`[AutoEstimate] Lead ${leadId} — ₹${result.total} estimate (${result.from_city} → ${result.to_city}, ${result.bags} bag${result.bags > 1 ? 's' : ''})`)
  } catch (err) {
    console.error('[AutoEstimate] generateEstimateForLead failed (non-fatal):', err)
  }
}
