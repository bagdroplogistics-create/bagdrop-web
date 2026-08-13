// BAGDROP — lib/payment-verification-token.ts
//
// Secure, single-use-in-practice token that lets the Account Department
// approve or reject a payment verification request directly from the
// notification email — no admin dashboard login needed. Same security
// model as lib/indemnity-token.ts: an unguessable random token stored on
// the row itself (payments.verification_token), resolved here so
// "invalid link" / "expired link" are handled identically everywhere
// instead of re-implemented per route.
//
// This resolver only validates the TOKEN (exists, not expired) — it
// deliberately does not care whether the payment has already been
// approved/rejected. That's a separate, action-time concern handled by
// the route that actually performs the approve/reject (see
// app/api/payment-verification/[token]/route.ts), so the read-only GET
// can still show "this was already approved on ..." instead of a generic
// error when someone re-opens an old email.

import crypto from 'crypto'
import { supabaseAdmin } from './supabase'

export function generateVerificationToken(): string {
  return crypto.randomBytes(24).toString('base64url')
}

// Payment verification links are meant to be actioned within days of the
// upload, not weeks — 30 days is generous headroom, not a target. Not
// currently exposed as a Settings toggle (unlike indemnity's expiry) to
// keep this feature's first version small; easy to move to `settings` the
// same way later if Accounts needs a different window.
export const VERIFICATION_TOKEN_VALID_DAYS = 30

export interface PaymentVerificationRow {
  id:              string
  payment_id:      string
  booking_id:      string | null
  customer_name:   string
  customer_phone:  string
  amount:          number
  payment_status:  string
  proof_url:       string | null
  proof_type:      string | null
  created_at:       string
  verification_token_expires_at: string | null
}

export interface PaymentVerificationBookingSummary {
  id:              string
  tracking_id:     string
  from_city:       string | null
  to_city:         string | null
}

type TokenLookupResult =
  | { ok: true; payment: PaymentVerificationRow; booking: PaymentVerificationBookingSummary | null; inquiryId: string | null }
  | { ok: false; status: number; error: string }

/**
 * Looks up the payment by its verification token and validates the LINK
 * itself is still usable (exists, not expired). Every public
 * payment-verification route should call this first and return its error
 * as-is on failure. Does not check payment_status — see file header.
 */
export async function resolvePaymentVerificationToken(token: string): Promise<TokenLookupResult> {
  if (!token) return { ok: false, status: 400, error: 'Missing token' }

  const { data: payment, error } = await supabaseAdmin
    .from('payments')
    .select('id, payment_id, booking_id, customer_name, customer_phone, amount, payment_status, proof_url, proof_type, created_at, verification_token_expires_at')
    .eq('verification_token', token)
    .maybeSingle()

  if (error || !payment) {
    if (error) console.error('[resolvePaymentVerificationToken] lookup failed for token', token, '—', error.message)
    return { ok: false, status: 404, error: 'This link is invalid. Please check the Booking Workflow in the admin dashboard instead.' }
  }

  if (payment.verification_token_expires_at && new Date(payment.verification_token_expires_at).getTime() < Date.now()) {
    return { ok: false, status: 410, error: 'This link has expired. Please review this payment from the admin dashboard instead.' }
  }

  let booking: PaymentVerificationBookingSummary | null = null
  if (payment.booking_id) {
    const { data: bk } = await supabaseAdmin
      .from('bookings')
      .select('id, tracking_id, from_city, to_city')
      .eq('id', payment.booking_id)
      .maybeSingle()
    booking = (bk as PaymentVerificationBookingSummary) ?? null
  }

  let inquiryId: string | null = null
  if (payment.booking_id) {
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('lead_number')
      .eq('booking_id', payment.booking_id)
      .maybeSingle()
    inquiryId = lead?.lead_number ?? null
  }

  return { ok: true, payment: payment as PaymentVerificationRow, booking, inquiryId }
}
