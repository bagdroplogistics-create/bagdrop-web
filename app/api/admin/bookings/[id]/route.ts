import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAdminRole, requireAdminAuth } from '@/lib/admin-auth'
import { notifyBookingStatus } from '@/lib/notifications'
import { sendDriverDetails } from '@/lib/driver-details'
import { shouldShowDriverDetailsStep } from '@/lib/service-type'
import { sendLifecycleWhatsApp, isForwardMove, STATUS_ORDER } from '@/lib/lifecycle-notifications'
import { upsertBookingCalendarEvent, deleteBookingCalendarEvent } from '@/lib/google-calendar'
import { syncBookingReminders } from '@/lib/ops-reminders'
import { recomputeBookingPaymentStatus } from '@/lib/payment-status'
import { createOrGetLrForBooking } from '@/lib/lr-auto-create'
import type { BookingStatus } from '@/lib/supabase'
import { TITLE_OPTIONS, DEFAULT_TITLE, formatCustomerName } from '@/lib/constants'
import { buildQuotePdfBuffer, quotePdfFilename, type LeadRowForPdf } from '@/lib/quote-pdf'

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
    status, notes, title, customer_name, customer_phone, customer_phone_country_code, customer_phone_national, customer_email,
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
    // Admin Approve — moves the booking to `status` (any workflow step)
    // WITHOUT sending the customer any WhatsApp/email for it, e.g. because
    // they were already told over a call, or the admin is correcting a
    // step. Unlike mark_historical, this only skips notification for THIS
    // one status change — status_history still records it normally (not
    // "historical/backfilled"), and it works for any single forward move,
    // not just a jump-to-terminal-status data-migration case. See the
    // shouldNotifyCustomer computation below.
    admin_approve,
    // Manual correction for which calendar month a completed booking
    // reports under in Dashboard Analytics — see
    // COMPLETED_MONTH_OVERRIDE_MIGRATION.sql and
    // app/api/admin/dashboard-analytics/route.ts's module comment. Sent
    // without `status`, so it's never blocked by the completed-booking
    // lock below (that lock only guards status transitions).
    completed_month_override,
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
  // Declared at function scope (not inside `if (status)` below) so the
  // auto-confirm block further down — which runs after that block has
  // already closed — can still read it. See its own comment there.
  let notifiedStatusesSupported = true

  if (title !== undefined) {
    if (!TITLE_OPTIONS.includes(title)) {
      return NextResponse.json({ error: 'title must be one of Mr., Mrs., Ms.' }, { status: 400 })
    }
    updates.title = title
  }
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
  if (completed_month_override !== undefined) updates.completed_month_override = completed_month_override || null
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
    // payment_status is no longer hand-set here — it's derived from the
    // payments ledger + this flag by recomputeBookingPaymentStatus(), called
    // after the update below. That also correctly handles VIP + a later
    // partial payment (spec §9): approved_without_payment=true does NOT
    // force 'approved_pending' once real money has come in.
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

  // ── Driver Details Shared — destination-airport service types only ──
  // (Doorstep→Airport, Airport→Airport — founder spec 2026-08-22; see
  // lib/service-type.ts's shouldShowDriverDetailsStep() for the exact
  // service_type values this checks, shared with the client-side gating in
  // app/(admin)/admin/quotes/view/[lead_id]/page.tsx so the UI and this
  // server-side validation can never drift apart).
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
    if (!shouldShowDriverDetailsStep(bk.service_type)) {
      return NextResponse.json({ error: '"Driver Details Shared" is only available for Doorstep→Airport and Airport→Airport bookings' }, { status: 400 })
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
      .select('customer_email, customer_name, title, total_amount, tracking_id, from_city, to_city, service_type, service_label, total_bags, pickup_date')
      .eq('id', id)
      .single()

    if (bk?.customer_email) {
      // Full row (not just the handful of fields this email's own HTML
      // needs) — the Quote PDF attachment below (2026-08-24 — "quote pdf
      // will also send with message template") needs everything QuotePDF.tsx
      // renders: line items, terms, journey details, etc.
      const { data: lead } = await supabaseAdmin
        .from('leads')
        .select('*')
        .eq('booking_id', id)
        .maybeSingle()

      const totalAmount = Number(lead?.quote_total ?? bk.total_amount ?? 0)
      const baseAmount  = parseFloat((lead?.quote_subtotal ?? totalAmount / 1.05).toFixed(2))
      const taxAmount   = parseFloat((lead?.quote_tax      ?? totalAmount - baseAmount).toFixed(2))
      const cgst        = parseFloat((taxAmount / 2).toFixed(2))
      const sgst        = parseFloat((taxAmount / 2).toFixed(2))

      // Generate the same Quote PDF the "Download PDF" button produces and
      // attach it — best-effort: a PDF failure should never block the
      // email itself from going out (the customer already gets the full
      // quote in the HTML body either way).
      let attachment: { filename: string; content: string } | undefined
      if (lead) {
        try {
          const buf = await buildQuotePdfBuffer(lead as LeadRowForPdf)
          attachment = { filename: quotePdfFilename(lead as LeadRowForPdf), content: buf.toString('base64') }
        } catch (err) {
          console.error('[send_quote_email] PDF attachment generation failed (non-fatal):', err)
        }
      }

      await sendQuoteEmail({
        to:           bk.customer_email,
        customerName: formatCustomerName(bk.title ?? lead?.title, bk.customer_name ?? lead?.name) || (bk.customer_name ?? lead?.name ?? 'Customer'),
        quoteNumber:  lead?.quote_number ?? bk.tracking_id ?? '',
        serviceType:  (bk.service_label ?? bk.service_type ?? 'Baggage Delivery') as string,
        fromCity:     (bk.from_city ?? '') as string,
        toCity:       (bk.to_city   ?? '') as string,
        pickupDate:   (bk.pickup_date ?? null) as string | null,
        totalBags:    Number(bk.total_bags ?? lead?.bags_count ?? 1),
        basePrice:    baseAmount,
        cgst, sgst, totalAmount,
        notes:        (lead?.quote_notes ?? null) as string | null,
        attachment,
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

    // notified_statuses may not exist yet if supabase/migrations/
    // 20260812_notified_statuses.sql hasn't been run against this database
    // — falls back to a select without it rather than letting the whole
    // query fail, which would otherwise silently zero out `existing` below
    // and WIPE status_history (history = existing?.status_history ?? [])
    // instead of appending to it. Same fallback pattern as
    // deletedAtSupported in app/api/admin/dashboard-analytics/route.ts.
    let existingRes = await supabaseAdmin
      .from('bookings')
      .select('status, status_history, notified_statuses, title, customer_name, customer_phone, customer_email, tracking_id, from_city, to_city, total_amount, total_bags, payment_status, payment_method, payment_reference, service_type')
      .eq('id', id)
      .single()
    if (existingRes.error?.message?.includes('notified_statuses')) {
      notifiedStatusesSupported = false
      existingRes = await supabaseAdmin
        .from('bookings')
        .select('status, status_history, title, customer_name, customer_phone, customer_email, tracking_id, from_city, to_city, total_amount, total_bags, payment_status, payment_method, payment_reference, service_type')
        .eq('id', id)
        .single()
    }
    const existing = existingRes.data

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

      // NOTE: this used to also auto-create a local, non-Zoho invoice
      // (autoCreateInvoice) the moment a jump passed through 'delivered'.
      // Removed — invoice generation is now exclusively the explicit
      // "Generate Invoice" action after 'completed' (Step 17 in the
      // Booking Workflow), which calls Zoho Books for a real invoice
      // number. Auto-creating one here first, with a fake local number,
      // would permanently block that later Zoho call from ever running
      // for this booking (POST /api/admin/invoices only calls Zoho when
      // no invoice row exists yet for the booking).

      // Deliberately skipped for this path: notifyBookingStatus,
      // sendLifecycleWhatsApp (shouldSendLifecycleWhatsApp stays false),
      // autoCreateDraftQuote — nothing here may ever reach the customer.
    } else {
      // Customer notifications (both the Fast2SMS lifecycle WhatsApp
      // template AND the separate Resend-email/Meta-WhatsApp channel) only
      // fire on genuine forward progress to a status this booking hasn't
      // already notified the customer about — never when an admin uses
      // "Previous Step" to revert a booking, and never again if the
      // booking is later reverted-and-readvanced back through a status it
      // already sent for (e.g. after editing a quote on an already-paid
      // booking to add a bag — see supabase/migrations/
      // 20260812_notified_statuses.sql for the full story). notified_statuses
      // is the persistent per-booking record of exactly which statuses
      // have already triggered a customer notification; isForwardMove
      // alone only compared the current status column and missed the
      // revert-then-readvance case.
      const alreadyNotified = Array.isArray(existing?.notified_statuses)
        && (existing!.notified_statuses as string[]).includes(status)
      // admin_approve forces this to false regardless of forward-move/
      // already-notified — an explicit "workflow update only, don't
      // contact the customer" request from the admin for this one change.
      const shouldNotifyCustomer = admin_approve === true
        ? false
        : isForwardMove(existing?.status, status) && !alreadyNotified
      shouldSendLifecycleWhatsApp = shouldNotifyCustomer

      // Admin Approve also marks the status as "already notified" even
      // though nothing was sent — same as if it had gone out normally —
      // so a later natural status change can't accidentally re-fire a
      // notification for a step the admin explicitly chose to skip.
      if ((shouldNotifyCustomer || admin_approve === true) && notifiedStatusesSupported) {
        const prevNotified = Array.isArray(existing?.notified_statuses)
          ? existing!.notified_statuses as string[]
          : []
        if (!prevNotified.includes(status)) {
          updates.notified_statuses = [...prevNotified, status]
        }
      }

      const history = existing?.status_history ?? []
      history.push({
        from:       existing?.status ?? null,
        to:         status,
        timestamp:  new Date().toISOString(),
        changed_by: role,
        note:       admin_approve === true
          ? `Admin Approve — moved to ${status} without customer notification${reason ? ': ' + reason : ''}`
          : (reason ?? notes ?? null),   // reason takes priority; falls back to notes
      })
      updates.status_history = history

      // (autoCreateInvoice call removed here too — see the matching note
      // in the historical-jump branch above for why.)

      // Auto-create a draft quote when booking is accepted (so it appears in Quotes tab)
      if (status === 'accepted' && existing) {
        autoCreateDraftQuote(id, existing).catch(err =>
          console.error('[booking patch] draft quote auto-create error:', err)
        )
      }

      // Auto-create an LR the moment a booking reaches Payment Received —
      // founder spec 2026-08-21 (Lead → Payment Received → LR → Tripsheet
      // → Invoice → Completed). Also fires on 'payment_approved', the
      // VIP/Admin-Approve-Pay-Later bypass (adminApprovePayLater() /
      // doAdminApprove() set this status DIRECTLY, never passing through
      // literal 'payment_received' — skipping it here would silently
      // leave every VIP booking without an LR). Idempotent by
      // construction: createOrGetLrForBooking() returns the existing LR
      // untouched if one already exists for this booking_id, so
      // re-triggering either status (e.g. an admin correction) can never
      // create a duplicate. LR date is always the booking's own
      // pickup_date — never today's date — see lib/lr-auto-create.ts.
      if ((status === 'payment_received' || status === 'payment_approved') && existing) {
        createOrGetLrForBooking(id).then(result => {
          if (result.error) console.error('[booking patch] auto-create LR error:', result.error)
          else if (result.created) console.log(`[booking patch] auto-created LR for booking ${id}`)
        }).catch(err => console.error('[booking patch] auto-create LR error:', err))
      }

      if (existing && shouldNotifyCustomer) {
        notifyBookingStatus({
          customerTitle: existing.title,
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

  // Recompute the derived payment_status whenever something that feeds its
  // calculation changed: the VIP/Admin-Approve flag, or the booking's total
  // (which shifts the partially_paid/paid boundary). Best-effort — a
  // recompute failure must never turn an otherwise-successful status update
  // into a failed request; `data` still reflects the write above either way.
  if (!error && (approved_without_payment !== undefined || total_amount !== undefined)) {
    try {
      const recomputed = await recomputeBookingPaymentStatus(id)
      if (recomputed) data.payment_status = recomputed.status
    } catch (err) {
      console.error('[bookings PATCH] payment-status recompute failed (non-fatal):', err)
    }
  }

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

  // ── Auto-advance to Confirmed — Admin Approve (VIP/Credit) only ──
  // Founder request (2026-08-24) originally auto-confirmed on BOTH
  // 'payment_received' and 'payment_approved'. Narrowed (2026-09-02) to
  // 'payment_approved' only: auto-confirming on plain 'payment_received'
  // (Step 6, "Mark Payment Received" — a self-reported UTR, no proof)
  // meant the booking jumped straight to Confirmed in the very same
  // request, before the Account Department's "Payment Proof &
  // Verification" card (app/(admin)/admin/quotes/view/[lead_id]/page.tsx,
  // added 2026-08-13 — shows only while status is exactly
  // 'payment_received'/'payment_approved') ever had a chance to render.
  // That silently skipped Accounts review on every self-reported payment
  // since 24 Aug. 'payment_approved' (the Admin Approve — Pay Later
  // VIP/Credit bypass) still auto-confirms immediately here, since there's
  // no payment to verify in that path. A plain 'payment_received' booking
  // now stops there — the Account Department card can act on it, and
  // Accounts' own approval still auto-confirms it via the identical
  // AUTO_CONFIRM_FROM_STATUSES pattern in app/api/admin/payments/[id]/
  // route.ts (unchanged) — or the manual "Confirm Booking" button (Step 7
  // in the Booking Workflow UI) is available as a fallback the moment
  // status reaches 'payment_received', exactly as it did before 24 Aug.
  if (data && status === 'payment_approved') {
    const confirmHistory = Array.isArray(data.status_history) ? data.status_history as object[] : []
    confirmHistory.push({
      from:       data.status,
      to:         'confirmed',
      timestamp:  new Date().toISOString(),
      changed_by: 'system',
      note:       'Auto-confirmed — Admin Approved (VIP/Credit, no payment verification required)',
    })

    const prevConfirmNotified = Array.isArray((data as { notified_statuses?: unknown }).notified_statuses)
      ? (data as { notified_statuses?: string[] }).notified_statuses as string[]
      : []
    const alreadyConfirmNotified = prevConfirmNotified.includes('confirmed')
    const shouldNotifyConfirm    = isForwardMove(data.status, 'confirmed') && !alreadyConfirmNotified

    const confirmUpdate: Record<string, unknown> = { status: 'confirmed', status_history: confirmHistory }
    if (shouldNotifyConfirm && notifiedStatusesSupported) {
      confirmUpdate.notified_statuses = [...prevConfirmNotified, 'confirmed']
    }

    const { data: confirmedBooking, error: confirmErr } = await supabaseAdmin
      .from('bookings')
      .update(confirmUpdate)
      .eq('id', id)
      .select()
      .single()

    if (confirmErr) {
      console.error('[booking patch] auto-confirm error:', confirmErr.message)
    } else if (confirmedBooking) {
      // Downstream Calendar/ops-reminders sync below must see the booking
      // as 'confirmed', not the now-stale 'payment_received'/'payment_approved'.
      Object.assign(data, confirmedBooking)
      if (shouldNotifyConfirm) {
        await sendLifecycleWhatsApp('confirmed', confirmedBooking)
      }
    }
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

  // Internal Ops WhatsApp pickup reminders — fully independent of the
  // customer notification pipeline above (never touches notifyBookingStatus
  // / sendLifecycleWhatsApp, never sends to the customer). Runs on every
  // successful update, not just status changes, so a reschedule (pickup
  // date/time edited without a status change) also updates the reminder
  // schedule, per spec. Skipped for mark_historical for the same reason as
  // the calendar sync above. Never throws.
  if (mark_historical !== true && data) {
    await syncBookingReminders({
      id:              data.id,
      status:          data.status,
      pickup_date:     data.pickup_date,
      flight_datetime: data.flight_datetime,
    })
  }

  return NextResponse.json({ booking: data })
}

// autoCreateInvoice() removed — see the two removal notes above. Invoice
// creation now happens exclusively via POST /api/admin/invoices (Step 17,
// after 'completed'), which sources the real invoice number from Zoho
// Books instead of a local BDI-{year}-{seq} counter.

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
    title:          (booking.title as string) ?? DEFAULT_TITLE,
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
  const displayName = formatCustomerName(p.booking.title as string | null, p.booking.customer_name as string) || (p.booking.customer_name as string)

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
  <p style="margin:0 0 8px;font-size:15px;color:#374151">Hi <strong>${displayName}</strong>,</p>
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
  // Real PDF attachment (2026-08-24) — see the buildQuotePdfBuffer() call
  // at this function's one call site above. Optional/best-effort: if PDF
  // generation failed, the email still sends without it rather than not
  // sending at all.
  attachment?: { filename: string; content: string } // content = base64
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
        // Resend's attachments API — content must be base64. Omitted
        // entirely (not sent as an empty array) when PDF generation failed
        // upstream, rather than sending a broken/empty attachment.
        ...(p.attachment ? { attachments: [{ filename: p.attachment.filename, content: p.attachment.content }] } : {}),
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('[sendQuoteEmail] Resend error:', err)
    } else {
      console.log('[sendQuoteEmail] sent to', p.to, p.attachment ? '(with PDF attachment)' : '(no PDF attachment)')
    }
  } catch (e) { console.error('[sendQuoteEmail]', e) }
}
