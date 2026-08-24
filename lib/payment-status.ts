import { supabaseAdmin } from '@/lib/supabase'
import { countsTowardTotalPaid } from '@/lib/payment-ledger'

// ── Payment Status engine (Full / Partial / VIP / Verification) ────────────
// Founder spec, 2026-08-19: booking-workflow status (Pending/Admin Approved/
// Confirmed/Ongoing/Completed) and payment status must always stay
// independent. bookings.payment_status is no longer hand-set by whichever
// action last touched the booking — it is a DERIVED value, recomputed from
// the real `payments` ledger every time a payment is created, approved,
// rejected, or refunded, or the booking's VIP-approval flag changes.
//
// The one deliberate exception is the "correct" control in the Booking
// Workflow page (app/(admin)/admin/quotes/view/[lead_id]/page.tsx) — a
// manual, one-off override for fixing stale/incorrect historical data. That
// control writes bookings.payment_status directly and does NOT call this
// function, by design.
//
// Precedence (highest to lowest) — matches every worked example in the
// spec, including VIP + a later partial payment (§9), and a payment sitting
// Under Verification alongside other already-Approved payments (§7, where
// the booking still reads "Partially Paid", not "Under Verification"):
//   1. Total Approved Paid >= Total Amount   → 'paid'
//   2. Total Approved Paid > 0               → 'partially_paid'
//   3. Any payment row Under Verification    → 'pending_verification'
//   4. approved_without_payment (VIP/Admin)  → 'approved_pending'
//   5. otherwise                             → 'pending'
//
// Only payments.payment_status === 'paid' rows count toward Total Paid —
// pending, pending_verification, rejected, failed, and refunded rows never
// do (spec §2, §13). A refunded payment therefore stops counting the moment
// it's refunded, which is correct: the money is no longer with Bagdrop.

export type BookingPaymentStatus =
  | 'pending'
  | 'partially_paid'
  | 'pending_verification'
  | 'paid'
  | 'approved_pending'

export interface PaymentStatusResult {
  status:     BookingPaymentStatus
  totalPaid:  number
  balanceDue: number
}

// "Counts toward Total Paid" — see lib/payment-ledger.ts (kept dependency-
// free there so client components can import the same predicate without
// pulling in supabaseAdmin). Re-exported here so existing server-side
// imports of `{ countsTowardTotalPaid } from '@/lib/payment-status'` keep
// working.
export { countsTowardTotalPaid } from '@/lib/payment-ledger'

export async function recomputeBookingPaymentStatus(bookingId: string): Promise<PaymentStatusResult | null> {
  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('total_amount, approved_without_payment')
    .eq('id', bookingId)
    .maybeSingle()
  if (!booking) return null

  const { data: paymentsRows } = await supabaseAdmin
    .from('payments')
    .select('amount, payment_status, payment_method')
    .eq('booking_id', bookingId)

  const rows = (paymentsRows ?? []) as { amount: number; payment_status: string; payment_method: string | null }[]
  const totalPaid = rows
    .filter(countsTowardTotalPaid)
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const hasPendingVerification = rows.some(p => p.payment_status === 'pending_verification')

  const totalAmount = Number(booking.total_amount) || 0
  const balanceDue  = Math.max(0, totalAmount - totalPaid)

  let status: BookingPaymentStatus
  if (totalAmount > 0 && totalPaid >= totalAmount)  status = 'paid'
  else if (totalPaid > 0)                           status = 'partially_paid'
  else if (hasPendingVerification)                  status = 'pending_verification'
  else if (booking.approved_without_payment)        status = 'approved_pending'
  else                                               status = 'pending'

  await supabaseAdmin.from('bookings').update({ payment_status: status }).eq('id', bookingId)

  // Keep any already-generated invoice for this booking in sync too.
  // invoices.payment_status is its OWN column (supabase/migrations/
  // 20260618_payments_invoices_settings.sql) — set once, as a snapshot of
  // bookings.payment_status, at the moment the invoice is generated
  // (app/api/admin/invoices/route.ts) and never touched again after that.
  // Before this, if a payment was approved AFTER the invoice already
  // existed, the invoice row stayed frozen at whatever status it had at
  // creation — the Invoices tab kept showing "Pending" / a nonzero Balance
  // Due forever, even though the booking and Payments tab both correctly
  // showed Paid (the bug reported 2026-08-21 for invoice BLS2600068).
  //
  // The Invoices list's own status model is deliberately binary (paid vs.
  // everything else = full balance still due — see balanceDue() in
  // app/(admin)/admin/invoices/page.tsx, which has no partial-payment
  // display), so this collapses the richer booking-level status the same
  // way: only an exact 'paid' booking flips the invoice to 'paid';
  // anything else (partially_paid/pending_verification/approved_pending/
  // pending) maps to invoice 'pending'. No-op if no invoice exists yet for
  // this booking.
  await supabaseAdmin
    .from('invoices')
    .update({ payment_status: status === 'paid' ? 'paid' : 'pending' })
    .eq('booking_id', bookingId)

  return { status, totalPaid, balanceDue }
}
