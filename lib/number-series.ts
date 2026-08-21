import { supabaseAdmin } from '@/lib/supabase'

// Atomic, race-safe number series — wraps next_series_number() (see
// supabase/migrations/20260817_atomic_number_series.sql), which upserts a
// per-series-per-year counter in a single statement instead of the old
// "SELECT MAX ... ORDER BY DESC LIMIT 1, then +1, then INSERT" pattern that
// used to live inline in each route. That old pattern could hand the same
// number to two near-simultaneous requests; this can't, because the
// increment happens inside Postgres's own row-level locking.
//
// Call this EXACTLY ONCE per genuinely NEW record (a new booking needing a
// tracking ID, a new lead needing a lead number) — never call it again for
// an existing record. Editing an existing lead/quote/booking, previewing,
// or resending must all reuse the number already stored on that row.
async function nextSeriesNumber(series: 'BDA' | 'BDL' | 'BDQ'): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('next_series_number', { p_series: series })
  if (error || !data) {
    throw new Error(
      `Could not generate a new ${series} number (database sequence call failed): ${error?.message ?? 'no value returned'}`
    )
  }
  return data as string
}

// BDA-YYYY-NNNN — tracking ID for a new booking. One per genuinely new
// inquiry/booking, even for a repeat customer — never derived from or
// reused off another booking/lead's number.
export function nextTrackingId(): Promise<string> {
  return nextSeriesNumber('BDA')
}

// BDL-YYYY-NNNN — lead number for a new lead row. One per genuinely new
// inquiry — never reused off an existing lead just because the phone
// number matches.
export function nextLeadNumber(): Promise<string> {
  return nextSeriesNumber('BDL')
}

// BDQ-YYYY-NNNN — quote number for a new quote row (app/api/admin/quotes/
// route.ts). Consolidated here 2026-08-18 — that route previously had its
// own local "SELECT MAX(quote_number) ... +1" helper, the same race-
// condition-prone pattern this file replaced everywhere else.
export function nextQuoteNumber(): Promise<string> {
  return nextSeriesNumber('BDQ')
}

// ── Paired inquiry numbering ─────────────────────────────────────────────
//
// PROBLEM (recurring, 2026-08-21): a lead's BDL-YYYY-NNNN and its linked
// booking's BDA-YYYY-NNNN are supposed to always carry the SAME NNNN
// suffix. Calling nextTrackingId() and nextLeadNumber() separately — even
// back-to-back in the very same request, which every creation path
// already did — does NOT guarantee this, because 'BDA' and 'BDL' are TWO
// INDEPENDENT counters (separate rows in bagdrop_number_counters). If
// ANYTHING ever advances one series without the other even once —
// a booking insert that fails after its tracking ID was already minted
// (permanently burning a BDA number with no lead attached), a
// duplicate-phone lead rejected after its lead number was already minted
// (permanently burning a BDL number with no booking attached), etc. — the
// two counters permanently drift apart RELATIVE TO EACH OTHER. Every
// subsequent "paired, same-request" mint after that inherits the drift:
// nextLeadNumber() and nextTrackingId() each faithfully return the next
// value of their OWN series, which are simply no longer equal to each
// other, through no fault of that particular request. This is exactly
// what kept happening even after every individual rogue call site (booking
// created for a pre-existing lead, Skybird duplicate-phone early return,
// etc.) was fixed one at a time.
//
// FIX: for any new record that needs BOTH a tracking ID and a lead
// number, mint exactly ONE number (from the 'BDA' series) and derive the
// other prefix from it by string substitution. This makes the two values
// equal BY CONSTRUCTION — there is no second counter involved at all, so
// there is nothing left to drift. Every creation path that inserts a lead
// and its booking together (or mints a tracking ID first and only later
// decides it also needs a lead number for the same record) should use
// this instead of calling nextTrackingId()/nextLeadNumber() separately.
// (The 'BDL' series itself is kept only for genuinely lead-only or
// legacy/repair uses — e.g. re-pairing an orphaned lead to a fresh number
// when its derived slot turns out to already be taken by something else.)
export interface InquiryNumberPair {
  trackingId: string
  leadNumber: string
}

export async function nextInquiryNumberPair(): Promise<InquiryNumberPair> {
  const trackingId = await nextSeriesNumber('BDA')
  return { trackingId, leadNumber: trackingId.replace(/^BDA-/, 'BDL-') }
}
