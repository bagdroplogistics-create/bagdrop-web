// BAGDROP — lib/vendor-notifications.ts
//
// Automatic vendor operational notifications, per the founder's spec
// (BAGDROP-VENDOR-AUTOMATION-001, 2026-09-12). Two responsibilities, split
// across two entry points — deliberately the SAME shape as
// lib/ops-reminders.ts, which this is modeled directly on:
//
//   1. syncExpenseVendorNotifications(expense) — called whenever a trip
//      expense's vendor_id/operational_date/operation_category changes
//      (see app/api/admin/trip-sheets/[id]/expenses/*). Upserts one
//      `vendor_notifications` row per applicable channel (WhatsApp always,
//      Email only if the vendor has one on file), and cancels/resets them
//      when the vendor is removed or the operational date genuinely
//      changes. Never throws.
//
//   2. sendDueVendorNotifications() — called from the cron route
//      (app/api/cron/send-vendor-notifications/route.ts). Finds rows whose
//      operational_date has arrived (at/after the configured default
//      notification time), atomically claims each one, sends it, and logs
//      the outcome. Never throws.
//
// Explicitly OUT of scope, per the founder's spec: this never touches
// Payment Verification / Accounts Approval / Payment Receipt / Customer
// Payment Acknowledgement in any way.
//
// WhatsApp uses ONE shared, generic, Meta-approved template (fixed
// structure — see WHATSAPP_TEMPLATE_ENV below) reused for every operation
// category, rather than 5 separate templates — vendors are external
// numbers that haven't necessarily messaged Bagdrop's WhatsApp number
// first, so (same as every other outbound business-initiated WhatsApp in
// this codebase) an approved template is required; one shared template
// means only one Meta approval to wait on before this goes live. Email has
// no such platform restriction, so its wording is fully admin-editable per
// category via `vendor_notification_templates` (see Settings → Vendor
// Notification Templates).

import { supabaseAdmin } from './supabase'
import { sendEmail } from './email'
import { sendWhatsAppTemplate } from './notifications'

export type OperationCategory = 'pickup' | 'middle_mile' | 'delivery' | 'handling' | 'airport_delivery' | 'other'

const CATEGORY_LABEL: Record<OperationCategory, string> = {
  pickup:           'Pickup',
  middle_mile:      'Middle Mile Movement',
  delivery:         'Delivery',
  handling:         'Handling',
  airport_delivery: 'Airport Delivery',
  other:            'Operation',
}

// Set once the generic "vendor operational notice" template is submitted
// to and approved by Meta (see .env.example for the exact spec to submit).
// No-ops (logs and returns) until then, matching every other
// not-yet-approved-template feature in this codebase.
const WHATSAPP_TEMPLATE_ENV = 'FAST2SMS_VENDOR_NOTIFICATION_TEMPLATE_NAME'

type Channel = 'whatsapp' | 'email'
const CHANNELS: Channel[] = ['whatsapp', 'email']

function fmtDate(d: string | null): string {
  if (!d) return 'TBC'
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

// 'YYYY-MM-DD' today, in IST — same manual-offset convention used by
// lib/ops-reminders.ts (no dependency on the server's own timezone).
function todayIstDateStr(): string {
  const IST_OFFSET_MS = (5 * 60 + 30) * 60000
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

/** 'YYYY-MM-DD' + 'HH:MM' interpreted as IST (UTC+5:30, no DST) -> UTC Date. */
function istDateTimeToUtc(dateStr: string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const midnightUtcMs = Date.parse(`${dateStr}T00:00:00.000Z`)
  const istOffsetMs   = (5 * 60 + 30) * 60000
  return new Date(midnightUtcMs + ((h || 0) * 60 + (m || 0)) * 60000 - istOffsetMs)
}

async function getVendorNotificationTime(): Promise<string> {
  const { data } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'vendor_notification_time')
    .maybeSingle()
  return data?.value || '08:00'
}

// ── Recompute the Trip Expenses table's single-glance status cache ─────
async function recalcExpenseNotificationStatus(expenseId: string): Promise<void> {
  const { data: rows } = await supabaseAdmin
    .from('vendor_notifications')
    .select('status')
    .eq('trip_expense_id', expenseId)
    .neq('status', 'cancelled')

  let status: string
  if (!rows || rows.length === 0)              status = 'not_applicable'
  else if (rows.some(r => r.status === 'failed')) status = 'failed'
  else if (rows.every(r => r.status === 'sent'))  status = 'sent'
  else if (rows.some(r => r.status === 'sent'))   status = 'partially_sent'
  else                                             status = 'pending'

  await supabaseAdmin.from('trip_expenses').update({ notification_status: status }).eq('id', expenseId)
}

export interface ExpenseForVendorSync {
  id:                 string
  trip_sheet_id:      string
  expense_type:       string | null
  vendor_id:          string | null
  operational_date:   string | null
  operation_category: OperationCategory | null
}

/**
 * Schedules, reschedules, or cancels this expense's vendor notification
 * row(s) based on its current vendor_id/operational_date. Safe to call on
 * every trip-expense create/update. A no-op reschedule (nothing that
 * matters changed) just re-upserts the same snapshot data; changing the
 * assigned vendor or the operational date on an ALREADY-sent notification
 * resets it back to 'pending' (same "a genuine reschedule deserves a fresh
 * send" rule as lib/ops-reminders.ts), rather than silently leaving the
 * vendor never told about the new plan.
 */
export async function syncExpenseVendorNotifications(expense: ExpenseForVendorSync): Promise<void> {
  if (!expense?.id) return
  try {
    if (!expense.vendor_id) {
      // No vendor assigned (in-house, or cleared) — never notify. Cancel
      // anything still pending from a PREVIOUSLY assigned vendor.
      await supabaseAdmin
        .from('vendor_notifications')
        .update({ status: 'cancelled' })
        .eq('trip_expense_id', expense.id)
        .eq('status', 'pending')
      await supabaseAdmin.from('trip_expenses').update({ notification_status: 'not_applicable' }).eq('id', expense.id)
      return
    }

    const { data: vendor } = await supabaseAdmin
      .from('vendors')
      .select('id, vendor_name, mobile, email')
      .eq('id', expense.vendor_id)
      .maybeSingle()
    if (!vendor) return

    const { data: sheet } = await supabaseAdmin
      .from('trip_sheets')
      .select('id, booking_id, trip_number, customer_name')
      .eq('id', expense.trip_sheet_id)
      .maybeSingle()
    if (!sheet) return

    // trip_sheets has no tracking_id column of its own — the customer-facing
    // ID (e.g. "BDA-2026-0166") lives on the linked booking. Fall back to
    // the trip sheet's own trip_number (e.g. "BDT-2026-0001") on the rare
    // trip sheet with no linked booking, so a notification is never sent
    // with a blank ID.
    let trackingId: string | null = sheet.trip_number ?? null
    if (sheet.booking_id) {
      const { data: booking } = await supabaseAdmin
        .from('bookings')
        .select('tracking_id')
        .eq('id', sheet.booking_id)
        .maybeSingle()
      trackingId = booking?.tracking_id ?? trackingId
    }

    const category = expense.operation_category ?? 'other'
    const recipients: Partial<Record<Channel, string>> = { whatsapp: vendor.mobile || undefined, email: vendor.email || undefined }

    for (const channel of CHANNELS) {
      const recipient = recipients[channel]
      if (!recipient) continue // no mobile (shouldn't happen — required field) or vendor has no email on file

      const snapshot = {
        trip_expense_id:    expense.id,
        channel,
        trip_sheet_id:      sheet.id,
        booking_id:         sheet.booking_id,
        vendor_id:          vendor.id,
        tracking_id:        trackingId,
        customer_name:      sheet.customer_name,
        vendor_name:        vendor.vendor_name,
        expense_mode:       expense.expense_type,
        operation_category: category,
        operational_date:   expense.operational_date,
        recipient_mobile:   channel === 'whatsapp' ? recipient : null,
        recipient_email:    channel === 'email'    ? recipient : null,
        template:           category,
      }

      const { data: existing } = await supabaseAdmin
        .from('vendor_notifications')
        .select('id, status, vendor_id, operational_date')
        .eq('trip_expense_id', expense.id)
        .eq('channel', channel)
        .maybeSingle()

      if (!existing) {
        await supabaseAdmin.from('vendor_notifications').insert({ ...snapshot, status: 'pending' })
        continue
      }

      const vendorChanged = existing.vendor_id !== vendor.id
      const dateChanged   = (existing.operational_date ?? null) !== (expense.operational_date ?? null)
      // Only force back to 'pending' if it wasn't already pending AND
      // something that actually matters to the vendor changed — a no-op
      // save (e.g. editing an unrelated field on the same expense) must
      // never re-queue an already-sent notification.
      const shouldReset = existing.status !== 'pending' && (vendorChanged || dateChanged)

      await supabaseAdmin
        .from('vendor_notifications')
        .update({
          ...snapshot,
          ...(shouldReset ? { status: 'pending', sent_at: null, failure_reason: null, provider_message_id: null } : {}),
        })
        .eq('id', existing.id)
    }

    await recalcExpenseNotificationStatus(expense.id)
  } catch (err) {
    console.error('[vendor-notifications] syncExpenseVendorNotifications error (non-fatal):', err)
  }
}

interface DueRow {
  id:                  string
  trip_expense_id:     string
  channel:              Channel
  vendor_name:          string | null
  tracking_id:          string | null
  customer_name:        string | null
  expense_mode:         string | null
  operation_category:   OperationCategory | null
  operational_date:     string | null
  recipient_mobile:     string | null
  recipient_email:      string | null
}

interface ExpenseSnapshot {
  from_location:  string | null
  to_location:    string | null
  total_bags?:    number | null
  operational_time: string | null
}

async function sendOneNotification(row: DueRow): Promise<{ success: boolean; error?: string; messageId?: string }> {
  const { data: exp } = await supabaseAdmin
    .from('trip_expenses')
    .select('from_location, to_location, operational_time, trip_sheet_id')
    .eq('id', row.trip_expense_id)
    .maybeSingle()
  const e = (exp ?? {}) as ExpenseSnapshot & { trip_sheet_id?: string }

  let bags = '—'
  if (e.trip_sheet_id) {
    const { data: sheet } = await supabaseAdmin
      .from('trip_sheets')
      .select('total_bags')
      .eq('id', e.trip_sheet_id)
      .maybeSingle()
    bags = String(sheet?.total_bags ?? '—')
  }

  const from = e.from_location || '—'
  const to   = e.to_location   || '—'
  const dateStr = fmtDate(row.operational_date)
  const timeStr = e.operational_time || '—'
  const category = row.operation_category ?? 'other'
  const label = CATEGORY_LABEL[category]

  if (row.channel === 'whatsapp') {
    const templateName = process.env[WHATSAPP_TEMPLATE_ENV]
    if (!templateName) return { success: false, error: `WhatsApp skipped — template not configured (${WHATSAPP_TEMPLATE_ENV})` }
    if (!row.recipient_mobile) return { success: false, error: 'No vendor mobile number' }
    const variables = [
      row.vendor_name ?? 'Vendor',                 // {{1}} Vendor Name
      label,                                       // {{2}} Operation (e.g. "Pickup")
      row.customer_name ?? 'Customer',              // {{3}} Customer Name
      row.tracking_id ?? '—',                       // {{4}} Booking / Tracking ID
      bags,                                         // {{5}} Number of Bags
      from,                                         // {{6}} From
      to,                                           // {{7}} To
      dateStr,                                      // {{8}} Date
      timeStr,                                      // {{9}} Time
    ]
    const result = await sendWhatsAppTemplate(row.recipient_mobile, templateName, variables)
    return { success: result.success, error: result.error, messageId: result.requestId }
  }

  // ── Email — fully admin-editable per category ──
  if (!row.recipient_email) return { success: false, error: 'No vendor email on file' }
  const { data: tpl } = await supabaseAdmin
    .from('vendor_notification_templates')
    .select('email_subject, email_body')
    .eq('category', category)
    .maybeSingle()
  const fallbackSubject = `Bagdrop ${label} Scheduled – ${row.tracking_id ?? ''} – ${row.customer_name ?? ''}`
  const fallbackBody    = `Hello ${row.vendor_name ?? 'Vendor'},\n\nToday's Bagdrop ${label.toLowerCase()} is scheduled.\n\nCustomer: ${row.customer_name ?? '—'}\nTracking ID: ${row.tracking_id ?? '—'}\nBags: ${bags}\nFrom: ${from}\nTo: ${to}\nDate: ${dateStr}\n\nThank you,\nBagdrop Operations`

  const vars: Record<string, string> = {
    vendor_name:      row.vendor_name ?? 'Vendor',
    customer_name:    row.customer_name ?? '—',
    tracking_id:      row.tracking_id ?? '—',
    bags,
    from,
    to,
    operational_date: dateStr,
    operational_time: timeStr,
    expense_mode:     row.expense_mode ?? label,
  }
  const fill = (text: string) => text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')

  const subject = fill(tpl?.email_subject || fallbackSubject)
  const body     = fill(tpl?.email_body    || fallbackBody)
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;white-space:pre-wrap;font-size:14px;color:#1f2937;line-height:1.6">${body.replace(/\n/g, '<br>')}</div>`

  const result = await sendEmail(row.recipient_email, subject, html, `vendor-notification-${category}`)
  return { success: result.success, error: result.error, messageId: result.id }
}

/**
 * Finds every vendor_notifications row whose operational_date has arrived
 * (today's date, once the configured default time has passed, or any
 * earlier date that was somehow missed), atomically claims and sends each
 * one, and logs the outcome. Called by the cron route on a poll interval.
 * Never throws.
 */
export async function sendDueVendorNotifications(): Promise<{ processed: number }> {
  let processed = 0
  try {
    const today = todayIstDateStr()
    const notifyTime = await getVendorNotificationTime()
    const now = new Date()

    // Capped at 25/tick — same bounded-work-per-cron-tick reasoning as
    // lib/ops-reminders.ts / lib/sales-followup-reminders.ts.
    const { data: due, error } = await supabaseAdmin
      .from('vendor_notifications')
      .select('id, trip_expense_id, channel, vendor_name, tracking_id, customer_name, expense_mode, operation_category, operational_date, recipient_mobile, recipient_email')
      .eq('status', 'pending')
      .not('operational_date', 'is', null)
      .lte('operational_date', today)
      .limit(25)

    if (error) {
      console.error('[vendor-notifications] due-query failed:', error.message)
      return { processed: 0 }
    }

    for (const row of (due ?? []) as DueRow[]) {
      // Anything with operational_date strictly before today is due
      // regardless of time-of-day (it's already overdue). For TODAY's
      // date specifically, wait until the configured default time.
      if (row.operational_date === today) {
        const threshold = istDateTimeToUtc(today, notifyTime)
        if (threshold > now) continue
      }

      // Atomic claim — same pattern as lib/ops-reminders.ts: the
      // WHERE status='pending' makes this row itself the lock, so an
      // overlapping cron tick that races here simply affects 0 rows.
      const { data: claimed } = await supabaseAdmin
        .from('vendor_notifications')
        .update({ status: 'sent', sent_at: now.toISOString() })
        .eq('id', row.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()
      if (!claimed) continue
      processed++

      const result = await sendOneNotification(row)
      if (!result.success) {
        await supabaseAdmin.from('vendor_notifications')
          .update({ status: 'failed', sent_at: null, failure_reason: result.error ?? 'Unknown error' })
          .eq('id', row.id)
      } else if (result.messageId) {
        await supabaseAdmin.from('vendor_notifications')
          .update({ provider_message_id: result.messageId })
          .eq('id', row.id)
      }
      await recalcExpenseNotificationStatus(row.trip_expense_id)
    }
  } catch (err) {
    console.error('[vendor-notifications] sendDueVendorNotifications error:', err)
  }
  return { processed }
}

/**
 * Manually retries a single FAILED channel for one expense (Trip Expenses
 * UI's "Retry" action). Re-claims atomically the same way the cron does
 * (WHERE status='failed'), so retrying twice in a row (double-click, two
 * admins) can't send twice — the second call simply finds 0 rows to claim.
 * Never resends an already-successful notification: only a row currently
 * sitting at 'failed' can be retried at all.
 */
export async function retryVendorNotification(notificationId: string): Promise<{ success: boolean; error?: string }> {
  const { data: claimed } = await supabaseAdmin
    .from('vendor_notifications')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('status', 'failed')
    .select('id, trip_expense_id, channel, vendor_name, tracking_id, customer_name, expense_mode, operation_category, operational_date, recipient_mobile, recipient_email')
    .maybeSingle()

  if (!claimed) return { success: false, error: 'Nothing to retry — this notification is not currently marked Failed (it may already be sending, or already sent).' }

  const row = claimed as unknown as DueRow
  const result = await sendOneNotification(row)
  if (!result.success) {
    await supabaseAdmin.from('vendor_notifications')
      .update({ status: 'failed', sent_at: null, failure_reason: result.error ?? 'Unknown error' })
      .eq('id', notificationId)
  } else if (result.messageId) {
    await supabaseAdmin.from('vendor_notifications')
      .update({ provider_message_id: result.messageId })
      .eq('id', notificationId)
  }
  await recalcExpenseNotificationStatus(row.trip_expense_id)
  return result.success ? { success: true } : { success: false, error: result.error }
}
