import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin, getAdminRole } from '@/lib/admin-auth'
import { recomputeBookingPaymentStatus } from '@/lib/payment-status'
import { resolveCustomerTitle, DEFAULT_TITLE } from '@/lib/constants'
import { nextPaymentId } from '@/lib/number-series'

// BAGDROP — one-time bulk backfill tool (2026-09-28)
//
// Founder-confirmed root cause of the Payments tab's inflated Pending
// totals for July/August 2026: the team's real-world process is "collect
// payment at the moment the inquiry/booking is confirmed" — but that
// payment was never individually logged via Record Payment / Mark Payment
// Received for a large batch of bookings, so they've been sitting as
// synthetic "From Booking / no payment logged yet" rows (see GET /api/
// admin/payments's fetchUnloggedBookingPayments) ever since, permanently
// inflating Pending every time the page is viewed. Founder explicitly
// confirmed (2026-09-28): "Mr. Nikhil Gupta and Mr. Anjna Desai payment is
// pending only... otherwise all the customers payment is received in
// august month" — i.e. this is a logging gap, not real unpaid revenue,
// for every OTHER synthetic-pending row.
//
// Founder also confirmed they don't know each individual payment date, but
// stated the real-world rule: payment came in "when we confirmed the
// inquiry" — a timestamp that already exists in bookings.status_history
// (written by lib/lifecycle-notifications.ts / lib/backdated-inquiry.ts
// etc. as {from, to, timestamp, changed_by, note}) rather than being
// invented. This endpoint uses that real timestamp instead of guessing.
//
// Safety guards (deliberately conservative — this writes real financial
// records for real bookings):
//   1. Caller must explicitly pass which booking_ids to log (never "log
//      everything pending" implicitly) — the admin UI only offers this for
//      rows the founder has actually reviewed.
//   2. Skips any booking whose payment_status is 'approved_pending' — that
//      status means "explicitly approved WITHOUT payment" (the Skybird
//      no-payment-required path, see app/api/admin/payments/route.ts's own
//      PAID_WITHOWT_LEDGER_ROW_STATUSES comment) and must never be
//      silently flipped to Paid.
//   3. Re-checks for a real `payments` row for the booking at write time
//      (not just trusting the client's synthetic-row snapshot) — if one
//      now exists, skips rather than risking a duplicate.
//   4. Deliberately does NOT call sendPaymentReceiptAcknowledgment. These
//      are backdated bookkeeping corrections for money already collected
//      weeks/months ago, not new payment events — sending a customer a
//      "we received your payment" WhatsApp/email today for a July
//      transaction would be confusing, not helpful.
export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized — full admin key required' }, { status: 401 })
  }
  const role = getAdminRole(req)

  const body = await req.json().catch(() => null)
  const bookingIds: string[] = Array.isArray(body?.booking_ids) ? body.booking_ids.filter((x: unknown) => typeof x === 'string') : []
  if (bookingIds.length === 0) {
    return NextResponse.json({ error: 'booking_ids (non-empty array) is required' }, { status: 400 })
  }

  const logged: { booking_id: string; tracking_id: string; amount: number; payment_date: string; date_source: string }[] = []
  const skipped: { booking_id: string; tracking_id: string | null; reason: string }[] = []

  for (const bookingId of bookingIds) {
    const { data: booking, error: bErr } = await supabaseAdmin
      .from('bookings')
      .select('id, tracking_id, title, customer_name, customer_phone, total_amount, payment_status, payment_method, pickup_date, created_at, status_history, is_test')
      .eq('id', bookingId)
      .maybeSingle()

    if (bErr || !booking) { skipped.push({ booking_id: bookingId, tracking_id: null, reason: 'Booking not found' }); continue }
    if (booking.is_test) { skipped.push({ booking_id: bookingId, tracking_id: booking.tracking_id, reason: 'Test Mode booking — never logged' }); continue }
    if (booking.payment_status === 'approved_pending') {
      skipped.push({ booking_id: bookingId, tracking_id: booking.tracking_id, reason: "Approved without payment (Skybird no-payment-required) — not eligible for this bulk action" })
      continue
    }

    const { data: existingPayments } = await supabaseAdmin
      .from('payments')
      .select('id')
      .eq('booking_id', bookingId)
      .limit(1)
    if (existingPayments && existingPayments.length > 0) {
      skipped.push({ booking_id: bookingId, tracking_id: booking.tracking_id, reason: 'A real payment row already exists for this booking' })
      continue
    }

    // Resolve the real "payment happened here" timestamp from status_history
    // — first occurrence of the booking reaching 'confirmed'. Falls back
    // through progressively less-precise real data if 'confirmed' was never
    // logged as its own status_history entry (older bookings, or ones that
    // skipped straight to a later status) — never falls back to "today",
    // since that would misfile the payment into the wrong month exactly
    // like the bug this whole investigation started from.
    type HistoryEntry = { to?: string; timestamp?: string }
    const history = Array.isArray(booking.status_history) ? (booking.status_history as HistoryEntry[]) : []
    const findEarliest = (statusName: string) =>
      history
        .filter(h => h.to === statusName && h.timestamp)
        .sort((a, b) => new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime())[0]?.timestamp

    let paymentDate: string = booking.created_at
    let dateSource: string = "booking's created_at (no status_history or pickup_date found)"
    const confirmedTs = findEarliest('confirmed')
    const paymentReceivedTs = findEarliest('payment_received')
    const paymentApprovedTs = findEarliest('payment_approved')
    if (confirmedTs) { paymentDate = confirmedTs; dateSource = 'booking confirmed (status_history)' }
    else if (paymentReceivedTs) { paymentDate = paymentReceivedTs; dateSource = 'payment_received status (status_history)' }
    else if (paymentApprovedTs) { paymentDate = paymentApprovedTs; dateSource = 'payment_approved status (status_history)' }
    else if (booking.pickup_date) { paymentDate = new Date(booking.pickup_date + 'T12:00:00').toISOString(); dateSource = "booking's pickup date (no status_history entry found)" }

    const resolvedTitleRaw = resolveCustomerTitle(booking.title, booking.customer_name)
    const resolvedTitle = resolvedTitleRaw === 'M/S' ? DEFAULT_TITLE : resolvedTitleRaw
    const paymentId = await nextPaymentId()

    const { data: inserted, error: insErr } = await supabaseAdmin.from('payments').insert({
      payment_id:        paymentId,
      booking_id:        booking.id,
      title:             resolvedTitle,
      customer_name:     booking.customer_name ?? 'Unknown',
      customer_phone:    booking.customer_phone ?? '',
      amount:            Number(booking.total_amount) || 0,
      payment_method:    booking.payment_method ?? 'upi',
      payment_status:    'paid',
      payment_reference: null,
      notes:             `Bulk-logged ${new Date().toLocaleDateString('en-IN')} — Founder-confirmed payment was collected at booking confirmation, never individually logged. Payment date backdated to ${dateSource}.`,
      payment_date:       paymentDate,
      created_at:         paymentDate,
      bank_charges:       0,
      tds_deducted:       false,
      tds_amount:         null,
      verified_by:        role,
      verified_at:        new Date().toISOString(),
    }).select().single()

    if (insErr || !inserted) {
      skipped.push({ booking_id: bookingId, tracking_id: booking.tracking_id, reason: insErr?.message ?? 'Insert failed' })
      continue
    }

    await recomputeBookingPaymentStatus(booking.id)
    logged.push({
      booking_id: booking.id,
      tracking_id: booking.tracking_id,
      amount: Number(booking.total_amount) || 0,
      payment_date: paymentDate,
      date_source: dateSource,
    })
  }

  return NextResponse.json({ logged, skipped, loggedCount: logged.length, skippedCount: skipped.length })
}
