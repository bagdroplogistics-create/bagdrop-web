// BAGDROP — lib/auto-quote.ts
//
// Automatic Quote Generation (Founder spec, 2026-10-03, follow-up):
// "so when new inquiry came automatic generate quote with this series
// like QT-2026-0240 etc... Below view booking, automatic estimate
// generated quote QT-2026-0240 coming just like chandani travels."
//
// This supersedes the earlier design (lib/estimate-quote.ts — a separate
// EST-YYYY-NNNN shadow record with its own orange "Estimate" badge). The
// Founder's direction, confirmed explicitly: the auto-generated quote
// should BE a real quote — same QT-YYYY-NNNN series, same linked booking,
// same blue badge — exactly as if Admin had opened New Quote and clicked
// Generate, not a separate parallel system. lib/estimate-quote.ts and its
// migrations are left in place (harmless/unused) rather than ripped out,
// since existing leads already carry that data.
//
// ── How this works ──────────────────────────────────────────────────
// Rather than re-implement route lookup, GST, discount, number-collision-
// safety, and booking-sync logic a second time, this calls the EXACT SAME
// POST handler app/api/admin/zoho/generate-quote/route.ts already
// exposes to Admin's manual "Generate Quote" button — in-process, no HTTP
// round trip — so every behavior (real route_pricing match, booking
// creation/update, payment-status recompute, quote-number collision
// handling) is identical and gets fixed in exactly one place if it ever
// needs to change.
//
//   1. Known route  → call generate-quote with just { lead_id }. It does
//      its own route_pricing lookup off the lead's own from_city/to_city/
//      bags_count — identical to a manual click with no edits.
//   2. Unknown route → generate-quote responds { error: 'no_pricing' }
//      (422) on the first attempt. Retry once with explicit_line_items
//      set to the Founder-specified ₹10,000/2-bag flat starting figure
//      (lib/estimate-constants.ts — shared with the New Quote page so the
//      number can't drift) and mark quote_needs_review so Admin knows to
//      double-check it.
//
// send_email is never set — this NEVER emails/WhatsApps the customer
// (spec §13, "should NOT automatically send the Estimate to the
// customer"). Admin sends it through the existing quote-send workflow
// once reviewed.
//
// Skips entirely (no-op) once the lead already has a quote_number — never
// creates a second quote for the same inquiry (spec §14).
//
// Never throws — fire-and-forget from every inquiry-creation call site.

import { NextRequest } from 'next/server'
import { supabaseAdmin } from './supabase'
import { POST as generateQuotePOST } from '@/app/api/admin/zoho/generate-quote/route'
import { UNKNOWN_ROUTE_DEFAULT_BASE } from './estimate-constants'

function buildInternalRequest(body: Record<string, unknown>): NextRequest {
  const adminKey = process.env.ADMIN_SECRET_KEY ?? ''
  return new NextRequest('http://internal.bagdrop/api/admin/zoho/generate-quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-key': adminKey },
    body: JSON.stringify(body),
  })
}

export async function generateAutoQuoteForLead(leadId: string | null | undefined): Promise<void> {
  if (!leadId) return
  try {
    if (!process.env.ADMIN_SECRET_KEY) {
      console.error('[AutoQuote] ADMIN_SECRET_KEY not set — cannot auto-generate quote (non-fatal, lead left for manual Generate Quote)')
      return
    }

    const { data: lead, error: fetchErr } = await supabaseAdmin
      .from('leads')
      .select('id, quote_number, from_city, to_city')
      .eq('id', leadId)
      .maybeSingle()
    if (fetchErr || !lead || lead.quote_number) return // already quoted, or lead vanished — never duplicate

    // ── Attempt 1: known route (generate-quote does its own route_pricing
    // lookup off the lead's own fields) ─────────────────────────────────
    const res1 = await generateQuotePOST(buildInternalRequest({ lead_id: leadId }))
    const d1   = await res1.json().catch(() => ({}))

    if (res1.ok && d1.success) {
      await supabaseAdmin.from('leads').update({ quote_auto_generated: true }).eq('id', leadId)
      console.log(`[AutoQuote] Lead ${leadId} — auto-generated ${d1.quote_number} (₹${d1.total}, known route)`)
      return
    }

    if (d1.error !== 'no_pricing') {
      // Some other failure (DB hiccup, validation issue, etc.) — log and
      // leave the lead for Admin's manual Generate Quote rather than
      // silently retrying with a guessed price for what might be a known
      // route that just hit a transient error.
      console.error(`[AutoQuote] Lead ${leadId} — generate-quote failed (non-fatal):`, d1.error ?? res1.status)
      return
    }

    // ── Attempt 2: unknown route — Founder-specified ₹10,000/2-bag flat
    // starting figure (spec §6/§7), via explicit_line_items so it's a flat
    // amount regardless of bag count, not multiplied per bag. ───────────
    const route = `${(lead.from_city ?? '').trim()} → ${(lead.to_city ?? '').trim()}`
    const res2 = await generateQuotePOST(buildInternalRequest({
      lead_id: leadId,
      explicit_line_items: [{
        name:        `Starting Estimate (Unknown Route) — ${route}`,
        description: 'Default starting estimate — Admin review required before sending this quote.',
        quantity:    1,
        rate:        UNKNOWN_ROUTE_DEFAULT_BASE,
        amount:      UNKNOWN_ROUTE_DEFAULT_BASE,
      }],
    }))
    const d2 = await res2.json().catch(() => ({}))

    if (res2.ok && d2.success) {
      await supabaseAdmin.from('leads').update({ quote_auto_generated: true, quote_needs_review: true }).eq('id', leadId)
      console.log(`[AutoQuote] Lead ${leadId} — auto-generated ${d2.quote_number} (₹${d2.total}, UNKNOWN ROUTE — review required)`)
    } else {
      console.error(`[AutoQuote] Lead ${leadId} — unknown-route generate-quote failed (non-fatal):`, d2.error ?? res2.status)
    }
  } catch (err) {
    console.error('[AutoQuote] generateAutoQuoteForLead failed (non-fatal):', err)
  }
}
