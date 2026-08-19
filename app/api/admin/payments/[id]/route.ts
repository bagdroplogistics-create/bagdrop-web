import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAdminRole } from '@/lib/admin-auth'
import { sendLifecycleWhatsApp, isForwardMove } from '@/lib/lifecycle-notifications'
import { recomputeBookingPaymentStatus } from '@/lib/payment-status'

// Booking statuses from which an approved payment verification should
// auto-advance the workflow to 'confirmed'. Matches the gate the Payment
// Proof & Verification card itself uses in the Booking Workflow page
// (atStatus('payment_received', 'payment_approved')) — those are the only
// two statuses where a payment can be pending verification in the first
// place, so they're the only two this ever fires from.
const AUTO_CONFIRM_FROM_STATUSES = ['payment_received', 'payment_approved']

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!getAdminRole(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const { data, error } = await supabaseAdmin.from('payments').select('*').eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  // Enrichment for the Payment Receipt detail view (Zoho Books "Payments
  // Received" receipt layout — see app/(admin)/admin/payments/page.tsx's
  // PaymentReceiptPanel): the invoice this payment was applied against (if
  // any, resolved via booking_id — same reliable link GET /api/admin/
  // payments's list already uses for its Invoice#/Unused Amount columns),
  // plus the customer's billing address for the "Received From" block
  // (invoice.customer_address first, falling back to the booking's pickup
  // address — a payment row itself has no address field of its own).
  type LinkedInvoice = { invoice_number: string; invoice_date: string | null; total_amount: number; customer_address: string | null }
  let invoice: LinkedInvoice | null = null
  let bookingPickupAddress: string | null = null
  if (data.booking_id) {
    const [{ data: inv }, { data: booking }] = await Promise.all([
      supabaseAdmin
        .from('invoices')
        .select('invoice_number, invoice_date, total_amount, customer_address')
        .eq('booking_id', data.booking_id)
        .maybeSingle(),
      supabaseAdmin
        .from('bookings')
        .select('pickup_address')
        .eq('id', data.booking_id)
        .maybeSingle(),
    ])
    invoice = (inv as LinkedInvoice | null) ?? null
    bookingPickupAddress = booking?.pickup_address ?? null
  }

  // Same unused-amount definition as the list route: no invoice yet = the
  // whole payment is unused; invoice exists and covers it = fully applied;
  // invoice exists but is smaller than the payment = the difference.
  const unused_amount = !invoice
    ? Number(data.amount)
    : Math.max(0, Number(data.amount) - Number(invoice.total_amount))

  return NextResponse.json({
    payment: data,
    invoice,
    customer_address: invoice?.customer_address ?? bookingPickupAddress ?? null,
    unused_amount,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = getAdminRole(req)
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body   = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const allowed = ['payment_status', 'payment_method', 'payment_reference', 'notes', 'refund_amount', 'refund_reason']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (body.payment_status === 'paid') {
    updates.verified_by = role
    updates.verified_at = new Date().toISOString()
  }
  if (body.payment_status === 'refunded') {
    updates.refunded_at = new Date().toISOString()
  }

  const { data, error } = await supabaseAdmin.from('payments').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Recompute the booking's aggregate payment_status from the full ledger
  // (Total Paid vs Total Amount — lib/payment-status.ts) rather than blindly
  // copying this one payment row's own status onto the booking. That old
  // behavior broke multi-payment accounting: approving payment #2 of 3 used
  // to set the booking straight to 'paid' even though a balance remained,
  // and rejecting/refunding one payment on a booking with other approved
  // payments used to wipe those out too. This is also what the
  // email-based Accounts approval link (app/api/payment-verification/
  // [token]/route.ts) goes through, since it PATCHes this same endpoint.
  if (data.booking_id && body.payment_status) {
    await recomputeBookingPaymentStatus(data.booking_id)
  }

  // ── Payment Verification sync ─────────────────────────────────────
  // Only touches bookings.payment_verification_status when this payment
  // is the one the booking is actually tracking as its pending-verification
  // proof (payment_verification_payment_id === this payment's id) — so an
  // unrelated older/rejected payment row for the same booking can't
  // clobber a newer upload's verification state. 'paid' here means
  // Accounts approved the uploaded proof; it deliberately does NOT touch
  // bookings.status (the Booking Workflow step machine) or reuse the
  // existing 'payment_approved' status, which already means something
  // different (admin bypass / Pay Later) — see
  // supabase/migrations/20260813_payment_verification.sql.
  if (data.booking_id && body.payment_status) {
    const { data: bk } = await supabaseAdmin
      .from('bookings')
      .select('payment_verification_payment_id')
      .eq('id', data.booking_id)
      .maybeSingle()

    if (bk?.payment_verification_payment_id === data.id) {
      const verificationStatus =
        body.payment_status === 'paid'     ? 'verified' :
        body.payment_status === 'rejected' ? 'rejected' :
        body.payment_status === 'pending_verification' ? 'pending_verification' :
        null
      if (verificationStatus) {
        await supabaseAdmin
          .from('bookings')
          .update({ payment_verification_status: verificationStatus })
          .eq('id', data.booking_id)
      }

      // ── Auto-advance Booking Workflow on payment approval ─────────
      // Once Accounts approves the tracked payment ('verified'), move the
      // booking straight to 'confirmed' — no separate manual "Confirm
      // Booking" click needed. Only fires if the booking is still sitting
      // at payment_received/payment_approved (never moves it backward, and
      // re-approving an already-confirmed booking's old payment is a safe
      // no-op). Mirrors the same status_history + notified_statuses +
      // sendLifecycleWhatsApp pattern app/api/admin/trip-sheets/[id]/
      // route.ts already uses to sync a status change into bookings from
      // outside the main bookings PATCH route — deliberately does NOT
      // duplicate that route's Google Calendar / ops-reminders sync, same
      // as the Trip Sheet sync path never has either.
      if (verificationStatus === 'verified') {
        let notifiedStatusesSupported = true
        let bookingRes = await supabaseAdmin
          .from('bookings')
          .select('id, status, status_history, notified_statuses, tracking_id, customer_name, customer_phone, from_city, to_city, total_bags, total_amount, pickup_date, drop_address, service_label, service_type')
          .eq('id', data.booking_id)
          .maybeSingle()
        if (bookingRes.error?.message?.includes('notified_statuses')) {
          notifiedStatusesSupported = false
          bookingRes = await supabaseAdmin
            .from('bookings')
            .select('id, status, status_history, tracking_id, customer_name, customer_phone, from_city, to_city, total_bags, total_amount, pickup_date, drop_address, service_label, service_type')
            .eq('id', data.booking_id)
            .maybeSingle()
        }
        const bookingNow = bookingRes.data

        if (bookingNow && AUTO_CONFIRM_FROM_STATUSES.includes(bookingNow.status)) {
          const history = Array.isArray(bookingNow.status_history) ? bookingNow.status_history as object[] : []
          history.push({
            from:       bookingNow.status,
            to:         'confirmed',
            timestamp:  new Date().toISOString(),
            changed_by: 'system',
            note:       `Auto-confirmed — Accounts approved payment verification (Payment ID: ${data.payment_id})`,
          })

          const prevNotified      = Array.isArray((bookingNow as { notified_statuses?: unknown }).notified_statuses)
            ? (bookingNow as { notified_statuses?: string[] }).notified_statuses as string[]
            : []
          const alreadyNotified   = prevNotified.includes('confirmed')
          const shouldNotifyCustomer = isForwardMove(bookingNow.status, 'confirmed') && !alreadyNotified

          const bookingUpdate: Record<string, unknown> = { status: 'confirmed', status_history: history }
          if (shouldNotifyCustomer && notifiedStatusesSupported) {
            bookingUpdate.notified_statuses = [...prevNotified, 'confirmed']
          }

          const { data: updatedBooking } = await supabaseAdmin
            .from('bookings')
            .update(bookingUpdate)
            .eq('id', data.booking_id)
            .select()
            .single()

          // Fires the normal "Booking Confirmed" customer WhatsApp — this is
          // a genuine forward workflow step (Accounts Approves → Booking
          // Confirmed per the spec's workflow diagram), not a silent Admin
          // Approve move, so the customer is meant to hear about it. Never
          // throws.
          if (shouldNotifyCustomer && updatedBooking) {
            await sendLifecycleWhatsApp('confirmed', updatedBooking)
          }
        }
      }
    }
  }

  return NextResponse.json({ payment: data })
}
