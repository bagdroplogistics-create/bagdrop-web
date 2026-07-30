import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAdminRole, requireAdminAuth } from '@/lib/admin-auth'
import { notifyBookingStatus } from '@/lib/notifications'
import { sendDriverDetails } from '@/lib/driver-details'
import { sendLifecycleWhatsApp, isForwardMove, STATUS_ORDER } from '@/lib/lifecycle-notifications'
import { upsertBookingCalendarEvent, deleteBookingCalendarEvent } from '@/lib/google-calendar'
import type { BookingStatus } from '@/lib/supabase'

// STATUS_ORDER / isForwardMove now live in lib/lifecycle-notifications.ts —
// shared with app/api/admin/trip-sheets/[id]/route.ts, which needed the same
// forward/backward check when it was found to be syncing booking status
// without ever firing the lifecycle WhatsApp send (picked_up/in_transit/
// out_for_delivery/delivered are normally advanced from the Trip Sheet, not
// this route, which is why those messages were missing/delayed).

// Same "confirmed onward" definition used by the Operations Center report —
// any status at/after 'confirmed' in the canonical lifecycle. Bookings in
// this range get a Google Calendar event; anything earlier (still just an
// inquiry/quote) or cancelled/rejected does not.
const CONFIRMED_ONWARD_STATUSES = STATUS_ORDER.slice(STATUS_ORDER.indexOf('confirmed'))

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await context.params

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ booking: data })
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const role = getAdminRole(req)
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const body   = await req.json().catch(() => ({}))

  const {
    status, notes, customer_name, customer_phone, customer_phone_country_code, customer_phone_national, customer_email,
    total_bags, total_amount, pickup_date, pickup_address, drop_address,
    payment_status, payment_method, payment_reference,
    approved_without_payment, delivery_date,
    rejection_reason, rejection_comment,
    reason,   // status-change reason (goes only into history, not booking notes)
    // Driver Details Shared (Airport Delivery only) — see the special-case
    // block below for validation, scheduling, and send logic.
    driver_name, driver_phone, driver_phone_country_code, driver_phone_national,
    vehicle_number, vehicle_type, airport_location,
    pickup_instructions, flight_datetime,
    // Historical / data-migration completion — see the mark_historical
    // branch below. Jumps status straight to its target with zero customer
    // notifications, for bookings fulfilled before this workflow existed.
    mark_historical,
  } = body

  if (approved_without_payment && role !== 'admin') {
    return NextResponse.json({ error: 'Only admin can approve without payment' }, { status: 403 })
  }

  if (mark_historical === true) {
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Only admin can mark a booking as historically completed' }, { status: 403 })
    }
    if (!status) {
      return NextResponse.json({ error: 'status is required with mark_historical' }, { status: 400 })
    }
  }

  const updates: Record<string, unknown> = {}

  if (total_amount         !== undefined) updates.total_amount         = Number(total_amount)
  if (customer_name        !== undefined) updates.customer_name        = customer_name.trim()
  if (customer_phone       !== undefined) {
    // The Booking Edit modal now sends a proper dial-code-prefixed
    // international number (e.g. "+14155550100") via PhoneInput — this used
    // to hardcode +91 onto whatever digits arrived, silently corrupting any
    // non-Indian number regardless of what the admin actually selected.
    // Bare-digit input (no leading "+") still assumed India for compatibility.
    const trimmed = customer_phone.trim()
    updates.customer_phone = trimmed.startsWith('+')
      ? trimmed
      : (() => { const raw = trimmed.replace(/\D/g, ''); return raw ? '+91' + raw.replace(/^91/, '') : '' })()
    updates.customer_phone_country_code = customer_phone_country_code || null
    updates.customer_phone_national     = customer_phone_national     || null
  }
  if (customer_email       !== undefined) updates.customer_email       = customer_email.trim().toLowerCase()
  if (total_bags           !== undefined) updates.total_bags           = Number(total_bags)
  if (pickup_date          !== undefined) updates.pickup_date          = pickup_date || null
  if (delivery_date        !== undefined) updates.delivery_date        = delivery_date || null
  if (pickup_address       !== undefined) updates.pickup_address       = pickup_address.trim() || null
  if (drop_address         !== undefined) updates.drop_address         = drop_address.trim() || null
  if (notes                !== undefined) updates.notes                = notes.trim() || null
  if (payment_status       !== undefined) updates.payment_status       = payment_status
  if (payment_method       !== undefined) updates.payment_method       = payment_method
  if (payment_reference    !== undefined) updates.payment_reference    = payment_reference?.trim() || null
  if (approved_without_payment !== undefined) {
    updates.approved_without_payment = approved_without_payment
    updates.approved_by = 'admin'
    if (approved_without_payment) updates.payment_status = 'approved_pending'
  }
  if (rejection_reason  !== undefined) updates.rejection_reason  = rejection_reason
  if (rejection_comment !== undefined) updates.rejection_comment = rejection_comment ?? null
  if (status === 'rejected' && !updates.rejected_at) updates.rejected_at = new Date().toISOString()
  if (driver_name          !== undefined) updates.driver_name          = driver_name?.trim() || null
  if (driver_phone         !== undefined) updates.driver_phone         = driver_phone?.trim() || null
  if (driver_phone_country_code !== undefined) updates.driver_phone_country_code = driver_phone_country_code || null
  if (driver_phone_national     !== undefined) updates.driver_phone_national     = driver_phone_national     || null
  if (vehicle_number       !== undefined) updates.vehicle_number       = vehicle_number?.trim() || null
  if (vehicle_type         !== undefined) updates.vehicle_type         = vehicle_type?.trim() || null
  if (airport_location     !== undefined) updates.airport_location     = airport_location?.trim() || null
  if (pickup_instructions  !== undefined) updates.pickup_instructions  = pickup_instructions?.trim() || null
  if (flight_datetime      !== undefined) updates.flight_datetime      = flight_datetime || null

  // ── Driver Details Shared — Airport Delivery only ──────────────────
  // Simplified: only driver name + phone are required. No flight-time
  // scheduling window — sending happens immediately when the admin clicks
  // Share. The generic status-change block below still handles the
  // history entry + customer status notification for this status like
  // any other.
  let sendDriverDetailsNow = false
  if (status === 'driver_details_shared' && mark_historical !== true) {
    const { data: bk } = await supabaseAdmin
      .from('bookings')
      .select('service_type, driver_name, driver_phone, driver_details_sent_at')
      .eq('id', id)
      .single()

    if (!bk) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }
    // Matches every airport-involving service_type value used across the
    // codebase: the public booking form uses 'airport-delivery', while
    // admin-created quotes use 'airport-to-doorstep' / 'airport-to-door' /
    // 'doorstep-to-airport' / 'door-to-airport'. All contain "airport".
    if (!/airport/i.test(bk.service_type ?? '')) {
      return NextResponse.json({ error: '"Driver Details Shared" is only available for Airport Delivery bookings' }, { status: 400 })
    }
    if (bk.driver_details_sent_at) {
      return NextResponse.json({ error: `Driver details were already sent for this booking at ${bk.driver_details_sent_at}` }, { status: 409 })
    }

    const finalDriverName  = (updates.driver_name  as string | null) ?? bk.driver_name
    const finalDriverPhone = (updates.driver_phone as string | null) ?? bk.driver_phone
    if (!finalDriverName || !finalDriverPhone) {
      return NextResponse.json({ error: 'Please assign a driver before sharing driver details with the customer.' }, { status: 400 })
    }

    // Sends right away — no scheduling window.
    updates.driver_details_scheduled_at = null
    sendDriverDetailsNow = true
  }

  // ── Special: send quote email to customer (side-effect, status still updates) ──
  if (body.send_quote_email) {
    const { data: bk } = await supabaseAdmin
      .from('bookings')
      .select('customer_email, customer_name, total_amount, tracking_id, from_city, to_city, service_type, service_label, total_bags, pickup_date')
      .eq('id', id)
      .single()

    if (bk?.customer_email) {
      const { data: lead } = await supabaseAdmin
        .from('leads')
        .select('quote_number, quote_total, quote_subtotal, quote_tax, quote_notes, name, bags_count')
        .eq('booking_id', id)
        .maybeSingle()

      const totalAmount = Number(lead?.quote_total ?? bk.total_amount ?? 0)
      const baseAmount  = parseFloat((lead?.quote_subtotal ?? totalAmount / 1.05).toFixed(2))
      const taxAmount   = parseFloat((lead?.quote_tax      ?? totalAmount - baseAmount).toFixed(2))
      const cgst        = parseFloat((taxAmount / 2).toFixed(2))
      const sgst        = parseFloat((taxAmount / 2).toFixed(2))

      await sendQuoteEmail({
        to:           bk.customer_email,
        customerName: bk.customer_name ?? lead?.name ?? 'Customer',
        quoteNumber:  lead?.quote_number ?? bk.tracking_id ?? '',
        serviceType:  (bk.service_label ?? bk.service_type ?? 'Baggage Delivery') as string,
        fromCity:     (bk.from_city ?? '') as string,
        toCity:       (bk.to_city   ?? '') as string,
        pickupDate:   (bk.pickup_date ?? null) as string | null,
        totalBags:    Number(bk.total_bags ?? lead?.bags_count ?? 1),
        basePrice:    baseAmount,
        cgst, sgst, totalAmount,
        notes:        (lead?.quote_notes ?? null) as string | null,
      })
    }
    // Don't return early — let status update to quote_sent continue below
  }

  // ── Special: send payment request email to customer ──────────────
  // NOTE: this used to return early with { sent: true } unconditionally,
  // which meant that when the Booking Workflow's "Send Payment Request"
  // button called this with BOTH `status: 'payment_pending'` AND
  // `send_payment_email: true` in the same request, the status update was
  // NEVER applied — the function returned before reaching the status-update
  // block below, so the booking stayed on its old status in the DB,
  // notifyBookingStatus never ran, and (once added) sendLifecycleWhatsApp
  // never ran either. The customer only ever got the payment request EMAIL,
  // never a WhatsApp message, no matter how many times the button was
  // clicked. Fixed to only short-circuit when this is a bare resend with no
  // status change (e.g. the admin Dashboard's "Email Payment Request"
  // button, which intentionally sends only { send_payment_email: true } and
  // expects just an email + { sent: true } — that behavior is preserved
  // below). When status IS present, fall through so the status update +
  // lifecycle WhatsApp send still happen, matching the send_quote_email
  // pattern above.
  if (body.send_payment_email) {
    const { data: bk } = await supabaseAdmin.from('bookings').select('*').eq('id', id).single()
    if (bk && bk.customer_email) {
      const { data: cfg } = await supabaseAdmin.from('settings').select('value').eq('key', 'payment_upi').maybeSingle()
      const upiId  = cfg?.value ?? ''
      const amount = Number(bk.total_amount ?? 0)
      await sendPaymentRequestEmail({ booking: bk, upiId, amount })
    }
    if (!status) {
      return NextResponse.json({ sent: true })
    }
    // Don't return early — let status update to payment_pending continue below
  }

  if (Object.keys(updates).length === 0 && !status) {
    return NextResponse.json({ error: 'No fields provided to update' }, { status: 400 })
  }

  let shouldSendLifecycleWhatsApp = false

  if (status) {
    // LOCK: completed bookings cannot have status changed
    const { data: currentBooking } = await supabaseAdmin
      .from('bookings').select('status').eq('id', id).single()
    if (currentBooking?.status === 'completed') {
      return NextResponse.json({ error: 'Booking is completed and cannot be modified' }, { status: 403 })
    }

    updates.status = status

    const { data: existing } = await supabaseAdmin
      .from('bookings')
      .select('status, status_history, customer_name, customer_phone, customer_email, tracking_id, from_city, to_city, total_amount, total_bags, payment_status, payment_method, payment_reference, service_type')
      .eq('id', id)
      .single()

    if (mark_historical === true) {
      // ── Historical / data-migration completion ──────────────────────
      // For bookings fulfilled before this workflow (and its WhatsApp/email
      // notifications) existed. Jumping straight to a terminal status must
      // NOT replay every notification the customer would have gotten if
      // they'd been moved through each step live — they already have their
      // bags. Backfill status_history with one entry per skipped step (so
      // the workflow timeline still shows the full path, just dated "now"
      // and clearly tagged historical) and send nothing whatsoever.
      const history  = Array.isArray(existing?.status_history) ? existing!.status_history : []
      const fromIdx  = STATUS_ORDER.indexOf(existing?.status ?? 'inquiry')
      const toIdx    = STATUS_ORDER.indexOf(status)
      const skipped  = toIdx >= 0 ? STATUS_ORDER.slice(Math.max(fromIdx, 0) + 1, toIdx + 1) : [status]
      const steps    = skipped.length > 0 ? skipped : [status]
      const now      = new Date().toISOString()

      let prevStep: string | null = existing?.status ?? null
      steps.forEach((step, i) => {
        const isLast = i === steps.length - 1
        history.push({
          from:       prevStep,
          to:         step,
          timestamp:  now,
          changed_by: role,
          note:       isLast
            ? `Marked as Completed — historical booking, backfilled by admin${reason ? ': ' + reason : ''}. No WhatsApp/email/SMS sent to customer.`
            : 'Historical booking — step backfilled by admin, no customer notification sent.',
        })
        prevStep = step
      })
      updates.status_history = history

      // Still create the invoice record for bookkeeping if this jump passes
      // through (or lands on) 'delivered' — matches what a normal delivery
      // would do — but this never contacts the customer either way.
      const deliveredIdx = STATUS_ORDER.indexOf('delivered')
      if (existing && deliveredIdx !== -1 && toIdx >= deliveredIdx) {
        await autoCreateInvoice(id, existing)
      }

      // Deliberately skipped for this path: notifyBookingStatus,
      // sendLifecycleWhatsApp (shouldSendLifecycleWhatsApp stays false),
      // autoCreateDraftQuote — nothing here may ever reach the customer.
    } else {
      // Lifecycle WhatsApp templates (Fast2SMS) only fire on genuine forward
      // progress — never when an admin uses "Previous Step" to revert a
      // booking, so reverting-and-readvancing can't spam the customer.
      shouldSendLifecycleWhatsApp = isForwardMove(existing?.status, status)

      const history = existing?.status_history ?? []
      history.push({
        from:       existing?.status ?? null,
        to:         status,
        timestamp:  new Date().toISOString(),
        changed_by: role,
        note:       reason ?? notes ?? null,   // reason takes priority; falls back to notes
      })
      updates.status_history = history

      if (status === 'delivered' && existing) {
        await autoCreateInvoice(id, existing)
      }

      // Auto-create a draft quote when booking is accepted (so it appears in Quotes tab)
      if (status === 'accepted' && existing) {
        autoCreateDraftQuote(id, existing).catch(err =>
          console.error('[booking patch] draft quote auto-create error:', err)
        )
      }

      if (existing) {
        notifyBookingStatus({
          customerName:  existing.customer_name,
          customerPhone: existing.customer_phone,
          customerEmail: existing.customer_email ?? '',
          trackingId:    existing.tracking_id,
          status:        status as BookingStatus,
          fromCity:      existing.from_city,
          toCity:        existing.to_city,
        }).catch(err => console.error('[booking patch] notification error:', err))
      }
    }
  }

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Awaited (not fire-and-forget) so Vercel doesn't tear down the function
  // before the send completes — mirrors sendLeadAcknowledgment's approach.
  // Never throws, so it can't turn a successful status update into a
  // failed request even if email/WhatsApp both fail.
  if (sendDriverDetailsNow) {
    await sendDriverDetails(id)
  }

  // Fast2SMS lifecycle WhatsApp — additive, alongside all existing
  // notification behavior (wa.me links, payment emails, etc.). `data` is the
  // just-updated row (select() with no args returns every column), so it has
  // everything sendLifecycleWhatsApp needs. Never throws.
  if (shouldSendLifecycleWhatsApp && status && data) {
    await sendLifecycleWhatsApp(status, data)
  }

  // Google Calendar sync — keeps the shared "Bagdrop Ops" calendar in step
  // with every booking change, not just status changes (a reschedule that
  // only edits pickup_date/address should move the calendar event too).
  // Skipped entirely for mark_historical: those bookings were already
  // fulfilled before this feature existed, so there's nothing to schedule.
  // Never throws — a calendar failure must not fail the booking update.
  if (mark_historical !== true && data) {
    const bookingStatus = data.status as string
    const isCancelledOrRejected = bookingStatus === 'cancelled' || bookingStatus === 'rejected'
    const isConfirmedOnward = CONFIRMED_ONWARD_STATUSES.includes(bookingStatus)

    if (isConfirmedOnward && !isCancelledOrRejected) {
      await upsertBookingCalendarEvent(data)
    } else if (data.google_calendar_event_id) {
      // Cancelled/rejected, or reverted back before 'confirmed' via
      // Previous Step — remove the stale event rather than leave it dangling.
      await deleteBookingCalendarEvent(data)
    }
  }

  return NextResponse.json({ booking: data })
}

// ── Auto-create (or fix ₹0) invoice on delivery ──────────────────
async function autoCreateInvoice(bookingId: string, booking: Record<string, unknown>) {
  const total   = Number(booking.total_amount ?? 0)
  const baseAmt = parseFloat((total / 1.05).toFixed(2))
  const cgst    = parseFloat((baseAmt * 0.025).toFixed(2))
  const sgst    = parseFloat((baseAmt * 0.025).toFixed(2))

  const invoicePayload = {
    booking_id:        bookingId,
    customer_name:     booking.customer_name as string,
    customer_phone:    booking.customer_phone as string,
    customer_email:    (booking.customer_email as string) ?? null,
    service_type:      (booking.service_type as string) ?? null,
    from_city:         booking.from_city as string,
    to_city:           booking.to_city as string,
    total_bags:        Number(booking.total_bags ?? 1),
    base_amount:       baseAmt,
    cgst,
    sgst,
    total_amount:      total,
    payment_status:    (booking.payment_status as string) ?? 'paid',
    payment_method:    (booking.payment_method as string) ?? null,
    payment_reference: (booking.payment_reference as string) ?? null,
    invoice_date:      new Date().toISOString().split('T')[0],
  }

  // Check if invoice already exists for this booking
  const { data: existingInv } = await supabaseAdmin
    .from('invoices')
    .select('id, total_amount')
    .eq('booking_id', bookingId)
    .maybeSingle()

  if (existingInv) {
    // If existing invoice has correct amount, skip
    if (Number(existingInv.total_amount) > 0) {
      console.log(`[autoCreateInvoice] invoice already exists for booking ${bookingId}, skipping`)
      return
    }
    // Existing invoice has ₹0 (created by old buggy code) — update it with correct amounts
    const { error } = await supabaseAdmin
      .from('invoices')
      .update({ base_amount: baseAmt, cgst, sgst, total_amount: total, payment_status: invoicePayload.payment_status })
      .eq('id', existingInv.id)
    if (error) console.error('[autoCreateInvoice] update failed:', error.message)
    else console.log(`[autoCreateInvoice] updated ₹0 invoice for booking ${bookingId} → ₹${total}`)
    return
  }

  // No invoice yet — create one
  const year = new Date().getFullYear()
  const { count } = await supabaseAdmin
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .like('invoice_number', `BDI-${year}-%`)

  const seq    = String((count ?? 0) + 1).padStart(4, '0')
  const invNum = `BDI-${year}-${seq}`

  const { error } = await supabaseAdmin
    .from('invoices')
    .insert({ invoice_number: invNum, ...invoicePayload })

  if (error) console.error('[autoCreateInvoice] insert failed:', error.message)
  else console.log(`[autoCreateInvoice] created ${invNum} for booking ${bookingId} — ₹${total}`)
}

// ── Auto-create draft quote when booking is accepted ──────────────
async function autoCreateDraftQuote(bookingId: string, booking: Record<string, unknown>) {
  // Skip if quote already exists for this booking
  const { data: existing } = await supabaseAdmin
    .from('quotes')
    .select('id')
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (existing) return

  const year   = new Date().getFullYear()
  const prefix = `BDQ-${year}-`
  const { count } = await supabaseAdmin
    .from('quotes')
    .select('*', { count: 'exact', head: true })
    .like('quote_number', `${prefix}%`)

  const seq         = String((count ?? 0) + 1).padStart(4, '0')
  const quoteNumber = `${prefix}${seq}`

  const { error } = await supabaseAdmin.from('quotes').insert({
    quote_number:   quoteNumber,
    booking_id:     bookingId,
    customer_name:  booking.customer_name  as string,
    customer_phone: booking.customer_phone as string,
    customer_email: (booking.customer_email as string) ?? null,
    service_type:   ((booking.service_label || booking.service_type || 'Baggage Delivery') as string),
    from_city:      booking.from_city as string,
    to_city:        booking.to_city   as string,
    pickup_date:    (booking.pickup_date as string) ?? null,
    total_bags:     Number(booking.total_bags ?? 1),
    base_price:     0,
    cgst:           0,
    sgst:           0,
    total_amount:   0,
    status:         'draft',
    version:        1,
  })

  if (error) console.error('[autoCreateDraftQuote] failed:', error.message)
  else console.log(`[autoCreateDraftQuote] created ${quoteNumber} for booking ${bookingId}`)
}

// ── Send payment request email to customer ────────────────────────
async function sendPaymentRequestEmail(p: {
  booking: Record<string, unknown>; upiId: string; amount: number
}) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || !p.booking.customer_email) return

  const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 })
  const upiLink = `upi://pay?pa=${p.upiId}&pn=Bagdrop&am=${p.amount}&cu=INR&tn=${p.booking.tracking_id}`
  const qrUrl   = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiLink)}`

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);max-width:580px">
<tr><td style="background:#FF6300;padding:28px 32px">
  <p style="margin:0;font-size:26px;font-weight:700;color:#fff">Bagdrop</p>
  <p style="margin:4px 0 0;font-size:13px;color:#ffe0cc">Baggage Delivered. Journey Simplified.</p>
</td></tr>
<tr><td style="padding:32px">
  <p style="margin:0 0 8px;font-size:15px;color:#374151">Hi <strong>${p.booking.customer_name}</strong>,</p>
  <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6">
    Your Bagdrop quote for <strong>${p.booking.from_city} → ${p.booking.to_city}</strong> has been prepared.
    Please complete your payment to confirm the booking.
  </p>
  <div style="background:#fff7f0;border:2px solid #ffedd5;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9a3412">Amount to Pay</p>
    <p style="margin:0 0 20px;font-size:36px;font-weight:700;color:#FF6300">${fmt(p.amount)}</p>
    ${p.upiId ? `<img src="${qrUrl}" alt="UPI QR Code" width="180" height="180" style="border-radius:8px;border:1px solid #e5e7eb;margin-bottom:14px" />
    <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#374151">Scan & Pay via UPI</p>
    <p style="margin:0 0 4px;font-size:14px;font-family:monospace;font-weight:700;color:#FF6300">${p.upiId}</p>
    <p style="margin:0;font-size:11px;color:#9ca3af">Reference: ${p.booking.tracking_id}</p>` : ''}
  </div>
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin-bottom:24px">
    <p style="margin:0;font-size:13px;color:#15803d;line-height:1.65">
      After payment, please <strong>share the UTR / transaction ID</strong> on WhatsApp or reply to this email.
      Your booking will be confirmed within minutes.
    </p>
  </div>
  <p style="margin:0;font-size:14px;color:#374151">
    📞 <a href="tel:+916357115711" style="color:#FF6300;text-decoration:none">+91 63571 15711</a> &nbsp;
    📧 <a href="mailto:info@bagdrop.co" style="color:#FF6300;text-decoration:none">info@bagdrop.co</a>
  </p>
</td></tr>
<tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:18px 32px;text-align:center">
  <p style="margin:0;font-size:12px;color:#9ca3af">© ${new Date().getFullYear()} Bagdrop Logistics Solutions Pvt. Ltd.</p>
</td></tr>
</table></td></tr></table>
</body></html>`

  try {
    await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    'Bagdrop <info@bagdrop.co>',
        to:      p.booking.customer_email as string,
        subject: `Complete Your Payment — ${fmt(p.amount)} | Bagdrop Booking ${p.booking.tracking_id}`,
        html,
      }),
    })
  } catch (e) { console.error('[sendPaymentRequestEmail]', e) }
}

// ── Send quote email via Resend ────────────────────────────────────────────────
async function sendQuoteEmail(p: {
  to: string; customerName: string; quoteNumber: string; serviceType: string
  fromCity: string; toCity: string; pickupDate: string | null; totalBags: number
  basePrice: number; cgst: number; sgst: number; totalAmount: number; notes: string | null
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) { console.warn('[bookings] RESEND_API_KEY not set'); return }

  const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 })
  const pickupLine = p.pickupDate
    ? new Date(p.pickupDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'To be confirmed'

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);max-width:580px">
<tr><td style="background:#FF6300;padding:28px 32px">
  <p style="margin:0;font-size:26px;font-weight:700;color:#fff">Bagdrop</p>
  <p style="margin:4px 0 0;font-size:13px;color:#ffe0cc">Baggage Delivered. Journey Simplified.</p>
</td></tr>
<tr><td style="padding:32px">
  <p style="margin:0 0 8px;font-size:15px;color:#374151">Hi <strong>${p.customerName}</strong>,</p>
  <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6">
    Thank you for choosing Bagdrop! Your quote for <strong>${p.fromCity} → ${p.toCity}</strong> is ready.
  </p>
  <div style="background:#fff7f0;border:2px solid #ffedd5;border-radius:12px;padding:20px;margin-bottom:24px">
    <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9a3412">Quote Summary</p>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="font-size:13px;color:#6b7280;padding:3px 0">Customer</td><td align="right" style="font-size:14px;font-weight:800;color:#111827">${p.customerName}</td></tr>
      <tr><td style="font-size:13px;color:#6b7280;padding:3px 0">Quote No.</td><td align="right" style="font-size:13px;font-weight:700;color:#111827">${p.quoteNumber}</td></tr>
      <tr><td style="font-size:13px;color:#6b7280;padding:3px 0">Service</td><td align="right" style="font-size:13px;color:#111827">${p.serviceType}</td></tr>
      <tr><td style="font-size:13px;color:#6b7280;padding:3px 0">Route</td><td align="right" style="font-size:13px;color:#111827">${p.fromCity} → ${p.toCity}</td></tr>
      <tr><td style="font-size:13px;color:#6b7280;padding:3px 0">Pickup Date</td><td align="right" style="font-size:13px;color:#111827">${pickupLine}</td></tr>
      <tr><td style="font-size:13px;color:#6b7280;padding:3px 0">Bags</td><td align="right" style="font-size:13px;color:#111827">${p.totalBags}</td></tr>
      <tr><td colspan="2" style="border-top:1px solid #e5e7eb;padding-top:10px"></td></tr>
      <tr><td style="font-size:13px;color:#6b7280;padding:3px 0">Base Amount</td><td align="right" style="font-size:13px;color:#111827">${fmt(p.basePrice)}</td></tr>
      <tr><td style="font-size:13px;color:#6b7280;padding:3px 0">CGST (2.5%)</td><td align="right" style="font-size:13px;color:#111827">${fmt(p.cgst)}</td></tr>
      <tr><td style="font-size:13px;color:#6b7280;padding:3px 0">SGST (2.5%)</td><td align="right" style="font-size:13px;color:#111827">${fmt(p.sgst)}</td></tr>
      <tr><td style="font-size:15px;font-weight:700;color:#111827;padding:8px 0 0">Total</td><td align="right" style="font-size:18px;font-weight:700;color:#FF6300;padding-top:8px">${fmt(p.totalAmount)}</td></tr>
    </table>
  </div>
  ${p.notes ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin-bottom:24px"><p style="margin:0;font-size:13px;color:#15803d">${p.notes}</p></div>` : ''}
  <p style="margin:0 0 8px;font-size:14px;color:#374151">To confirm your booking, please reply to this email or contact us:</p>
  <p style="margin:0;font-size:14px;color:#374151">
    📞 <a href="tel:+916357115711" style="color:#FF6300;text-decoration:none">+91 63571 15711</a> &nbsp;
    📧 <a href="mailto:info@bagdrop.co" style="color:#FF6300;text-decoration:none">info@bagdrop.co</a>
  </p>
</td></tr>
<tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:18px 32px;text-align:center">
  <p style="margin:0;font-size:12px;color:#9ca3af">© ${new Date().getFullYear()} Bagdrop Logistics Solutions Pvt. Ltd.</p>
</td></tr>
</table></td></tr></table>
</body></html>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    'Bagdrop <info@bagdrop.co>',
        to:      p.to,
        subject: `Your Bagdrop Quote ${p.quoteNumber} — ${p.fromCity} → ${p.toCity} | ${fmt(p.totalAmount)}`,
        html,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('[sendQuoteEmail] Resend error:', err)
    } else {
      console.log('[sendQuoteEmail] sent to', p.to)
    }
  } catch (e) { console.error('[sendQuoteEmail]', e) }
}
