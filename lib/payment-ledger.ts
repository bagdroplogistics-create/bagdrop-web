// BAGDROP — "counts toward Total Paid" predicate.
//
// Kept in its own file (no Supabase import) specifically so it's safe to
// import from BOTH server routes/lib (lib/payment-status.ts) AND client
// components (app/(admin)/admin/quotes/view/[lead_id]/page.tsx, app/
// (admin)/admin/payments/page.tsx) without dragging supabaseAdmin — which
// reads the service_role key at module scope — into a browser bundle.
//
// Founder spec, 2026-08-24: a payment-proof screenshot upload (payment_
// method === 'upload', created by app/api/admin/bookings/[id]/payment-proof/
// route.ts) is a VERIFICATION record only — proof that a payment already
// confirmed elsewhere (Mark Payment Received, or the Accounts payment-
// verification email) actually happened. It must never itself add to Total
// Paid, even after Accounts approves it (payment_status flips to 'paid').
// Approving/rejecting it still updates payment_verification_status on the
// booking (the audit trail), it just no longer feeds the ledger sum.
//
// This was the real root cause of a booking showing Paid ₹10,500 against a
// ₹5,250 quote (BDA-2026-0124, 2026-08-24): Mark Payment Received logged
// the real ₹5,250 payment, then a proof screenshot was uploaded and
// approved for the SAME payment, adding a second, redundant ₹5,250 'paid'
// row. Every place that sums "Total Paid" across a payments ledger must use
// this predicate instead of a bare `payment_status === 'paid'` check.
export function countsTowardTotalPaid(p: { payment_status: string; payment_method?: string | null }): boolean {
  return p.payment_status === 'paid' && p.payment_method !== 'upload'
}
