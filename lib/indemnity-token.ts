// BAGDROP — lib/indemnity-token.ts
// Shared token lookup/validation used by every public /api/indemnity/[token]
// route, so "expired", "already submitted", and "not found" are handled
// identically everywhere instead of being re-implemented per route.

import { supabaseAdmin } from './supabase'

export interface IndemnityBondRow {
  id:                     string
  booking_id:             string
  secure_token:           string
  token_expires_at:       string
  otp_contact:            string | null
  otp_verified:           boolean
  otp_verified_at:        string | null
  aadhaar_number:         string | null
  passport_number:        string | null
  licence_number:         string | null
  bond_date:              string | null
  bond_place:             string | null
  signed_at:              string | null
  signed_pdf_path:        string | null
  document_status:        string
  submitted_at:           string | null
  status_history:         Array<Record<string, unknown>> | null
}

export interface BookingSummary {
  id:              string
  tracking_id:     string
  status:          string
  status_history:  Array<Record<string, unknown>> | null
  customer_name:   string | null
  customer_phone:  string | null
  customer_email:  string | null
  service_type:    string | null
  service_label:   string | null
}

type TokenLookupResult =
  | { ok: true; bond: IndemnityBondRow; booking: BookingSummary }
  | { ok: false; status: number; error: string }

/**
 * Looks up the bond by its secure token and validates it's still usable:
 * exists, not expired, and not already submitted. Every public indemnity
 * route should call this first and return its error as-is on failure.
 */
export async function resolveIndemnityToken(token: string): Promise<TokenLookupResult> {
  if (!token) return { ok: false, status: 400, error: 'Missing token' }

  const { data: bond, error: bondErr } = await supabaseAdmin
    .from('indemnity_bonds')
    .select('*')
    .eq('secure_token', token)
    .maybeSingle()

  if (bondErr || !bond) {
    // Previously swallowed silently — logging the real Postgrest error here
    // (missing column, RLS, connection issue, etc.) instead of just the
    // generic customer-facing message, so a bad link is actually diagnosable
    // from Vercel logs instead of guesswork.
    if (bondErr) console.error('[resolveIndemnityToken] bond lookup failed for token', token, '—', bondErr.message)
    return { ok: false, status: 404, error: 'This link is invalid. Please contact Bagdrop for a new one.' }
  }

  if (bond.submitted_at) {
    return { ok: false, status: 409, error: 'This indemnity bond has already been submitted.' }
  }

  if (new Date(bond.token_expires_at).getTime() < Date.now()) {
    return { ok: false, status: 410, error: 'This link has expired. Please contact Bagdrop for a new one.' }
  }

  // NOTE: bookings.lead_id does NOT exist in production (confirmed via
  // Vercel logs — "column bookings.lead_id does not exist") despite being
  // referenced elsewhere in the app (e.g. admin/page.tsx's booking list,
  // /api/admin/bookings?lead_id=). Do not add it to this select — it broke
  // every indemnity link resolve (Postgrest errors the whole query on an
  // unknown column, not just that field) until this was reverted. Any
  // future need for lead_id here must be a separate, isolated, non-fatal
  // lookup — see submit/route.ts's admin-notification email link for the
  // pattern.
  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from('bookings')
    .select('id, tracking_id, status, status_history, customer_name, customer_phone, customer_email, service_type, service_label')
    .eq('id', bond.booking_id)
    .single()

  if (bookingErr || !booking) {
    console.error(
      '[resolveIndemnityToken] booking lookup failed — bond', bond.id, 'booking_id', bond.booking_id, '—',
      bookingErr ? bookingErr.message : 'no matching booking row',
    )
    return { ok: false, status: 404, error: 'Booking not found for this link.' }
  }

  return { ok: true, bond: bond as IndemnityBondRow, booking: booking as BookingSummary }
}
