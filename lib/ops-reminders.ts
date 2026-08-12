// BAGDROP — lib/ops-reminders.ts
//
// Internal Ops WhatsApp pickup reminders. Entirely separate from the
// customer notification pipeline (lib/notifications.ts,
// lib/lifecycle-notifications.ts) — this never contacts a customer, only
// the fixed internal number in settings.ops_reminder_whatsapp (default
// +91 63571 15711, editable from Settings → Notifications).
//
// Two responsibilities, split across two entry points:
//   1. syncBookingReminders(booking) — called from every successful booking
//      PATCH (app/api/admin/bookings/[id]/route.ts). Schedules/reschedules
//      the three reminder rows (two_days_before, day_before, day_of) for
//      confirmed-onward bookings, and cancels them the moment a booking is
//      cancelled/rejected/reverted before 'confirmed'. Never throws.
//   2. sendDueReminders() — called from the cron route
//      (app/api/cron/send-ops-reminders/route.ts). Finds rows whose
//      scheduled_for has arrived, atomically claims each one, sends via
//      Fast2SMS WhatsApp template, and logs the outcome.
//
// Dedup / at-most-once: booking_reminders has UNIQUE(booking_id,
// reminder_type) — scheduling always upserts onto that constraint (one row
// per type per booking, ever), and the cron claim is an atomic
// UPDATE ... WHERE status = 'pending' so concurrent cron ticks can't
// double-send. See supabase/migrations/20260730_ops_pickup_reminders.sql
// and supabase/migrations/20260813_pickup_reminder_2_days_before.sql (adds
// the two_days_before tier + its CHECK-constraint value).
//
// Timing: pickup_date is the only reliably structured date on every
// booking; time_slot is free text (see lib/google-calendar.ts's comment —
// same conclusion reached there) so it is deliberately not parsed here
// either. flight_datetime IS a real timestamptz, but only populated for
// airport-delivery bookings — when present, the day-of reminder is
// computed as "N hours before the flight" instead of the generic default
// clock time. two_days_before/day_before/day_of clock times and the
// flight buffer are all configurable via the settings table, not hardcoded.
//
// All three tiers use the SAME already-approved `ops_pickup_reminder`
// Fast2SMS template (FAST2SMS_OPS_REMINDER_MESSAGE_ID, 12 variables) — the
// template's own content ("Dear Bagdrop Team", Status/Driver/Special
// Instructions fields) is internal-only by design, so every tier sends to
// settings.ops_reminder_whatsapp only, never to the customer.

import { supabaseAdmin } from './supabase'
import { STATUS_ORDER } from './lifecycle-notifications'
import { sendWhatsAppTemplateFast2SMS } from './notifications'

const CONFIRMED_ONWARD_STATUSES = STATUS_ORDER.slice(STATUS_ORDER.indexOf('confirmed'))
const REMINDER_TYPES = ['two_days_before', 'day_before', 'day_of'] as const
type ReminderType = typeof REMINDER_TYPES[number]

const REMINDER_TYPE_LABEL: Record<ReminderType, string> = {
  two_days_before: '2-days-before',
  day_before:       'Day-before',
  day_of:           'Day-of',
}

interface ReminderSettings {
  enabled: boolean
  whatsapp: string
  twoDaysBeforeTime: string    // 'HH:MM', IST
  dayBeforeTime: string        // 'HH:MM', IST
  dayOfTime: string            // 'HH:MM', IST
  hoursBeforeFlight: number
}

interface BookingForReminders {
  id: string
  status: string
  pickup_date: string | null
  flight_datetime: string | null
}

async function getReminderSettings(): Promise<ReminderSettings> {
  const { data } = await supabaseAdmin
    .from('settings')
    .select('key, value')
    .in('key', [
      'ops_reminder_enabled', 'ops_reminder_whatsapp',
      'ops_reminder_two_days_before_time', 'ops_reminder_day_before_time',
      'ops_reminder_day_of_time', 'ops_reminder_hours_before_flight',
    ])
  const map = Object.fromEntries((data ?? []).map(r => [r.key, r.value as string]))
  return {
    enabled:           map.ops_reminder_enabled !== 'false',      // default on
    whatsapp:          map.ops_reminder_whatsapp || '+916357115711',
    twoDaysBeforeTime: map.ops_reminder_two_days_before_time || '18:00',
    dayBeforeTime:     map.ops_reminder_day_before_time || '18:00',
    dayOfTime:         map.ops_reminder_day_of_time || '08:00',
    hoursBeforeFlight: Number(map.ops_reminder_hours_before_flight) || 4,
  }
}

/** 'YYYY-MM-DD' + 'HH:MM' interpreted as IST (UTC+5:30, no DST) -> UTC Date. */
function istDateTimeToUtc(dateStr: string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const midnightUtcMs = Date.parse(`${dateStr}T00:00:00.000Z`)
  const istOffsetMs   = (5 * 60 + 30) * 60000
  return new Date(midnightUtcMs + ((h || 0) * 60 + (m || 0)) * 60000 - istOffsetMs)
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Computes when each reminder should fire, or null if there's nothing
 * meaningful left to schedule (the moment has already passed). day_of gets
 * one exception: if its default time has already passed but the pickup
 * itself is still today or later, it's clamped to "a couple of minutes
 * from now" so a same-day confirmation still gets a single catch-up
 * reminder instead of silently getting none. two_days_before and
 * day_before both just get dropped (null) once their moment has passed —
 * no catch-up clamp, since being told 2 days before that pickup is "1 day
 * away" would be actively wrong, not just late.
 */
function computeTargets(booking: BookingForReminders, settings: ReminderSettings): Record<ReminderType, Date | null> {
  const now = new Date()
  if (!booking.pickup_date) return { two_days_before: null, day_before: null, day_of: null }

  let twoDaysBefore: Date | null = istDateTimeToUtc(addDaysToDateStr(booking.pickup_date, -2), settings.twoDaysBeforeTime)
  if (twoDaysBefore <= now) twoDaysBefore = null

  let dayBefore: Date | null = istDateTimeToUtc(addDaysToDateStr(booking.pickup_date, -1), settings.dayBeforeTime)
  if (dayBefore <= now) dayBefore = null

  let dayOf: Date | null
  const flightDt = booking.flight_datetime ? new Date(booking.flight_datetime) : null
  if (flightDt && !isNaN(flightDt.getTime())) {
    dayOf = new Date(flightDt.getTime() - settings.hoursBeforeFlight * 3600000)
  } else {
    dayOf = istDateTimeToUtc(booking.pickup_date, settings.dayOfTime)
  }
  if (dayOf <= now) {
    const endOfPickupDay = istDateTimeToUtc(booking.pickup_date, '23:59')
    dayOf = now < endOfPickupDay ? new Date(now.getTime() + 2 * 60000) : null
  }

  return { two_days_before: twoDaysBefore, day_before: dayBefore, day_of: dayOf }
}

/**
 * Schedules, reschedules, or cancels this booking's two reminders based on
 * its current status/pickup_date/flight_datetime. Safe to call on every
 * booking PATCH — a no-op reschedule (same date/time) just re-upserts the
 * same scheduled_for. Deliberately resets an already-`sent` row back to
 * `pending` on a genuine reschedule: once the pickup date/time changes, the
 * earlier send described the wrong time, so Ops should get a fresh one
 * rather than none at all. Never throws.
 */
export async function syncBookingReminders(booking: BookingForReminders): Promise<void> {
  if (!booking?.id) return
  try {
    const settings = await getReminderSettings()
    const isConfirmedOnward = CONFIRMED_ONWARD_STATUSES.includes(booking.status)
    const isTerminal        = booking.status === 'cancelled' || booking.status === 'rejected'

    if (!settings.enabled || !isConfirmedOnward || isTerminal) {
      await supabaseAdmin
        .from('booking_reminders')
        .update({ status: 'cancelled', detail: 'Cancelled — booking is no longer an upcoming confirmed pickup' })
        .eq('booking_id', booking.id)
        .eq('status', 'pending')
      return
    }

    const targets = computeTargets(booking, settings)

    for (const type of REMINDER_TYPES) {
      const target = targets[type]
      if (!target) {
        await supabaseAdmin
          .from('booking_reminders')
          .update({ status: 'cancelled', detail: 'Skipped — computed reminder time already passed' })
          .eq('booking_id', booking.id)
          .eq('reminder_type', type)
          .eq('status', 'pending')
        continue
      }
      await supabaseAdmin
        .from('booking_reminders')
        .upsert(
          {
            booking_id:      booking.id,
            reminder_type:   type,
            scheduled_for:   target.toISOString(),
            status:          'pending',
            sent_at:         null,
            delivery_status: null,
            channel:         'whatsapp',
            recipient:       settings.whatsapp,
            detail:          null,
          },
          { onConflict: 'booking_id,reminder_type' }
        )
    }
  } catch (err) {
    console.error('[ops-reminders] syncBookingReminders error (non-fatal):', err)
  }
}

interface DueReminderRow {
  id: string
  booking_id: string
  reminder_type: ReminderType
}

interface BookingSnapshot {
  id: string; tracking_id: string; status: string
  customer_name: string | null; customer_phone: string | null
  service_type: string | null; service_label: string | null
  from_city: string | null; to_city: string | null
  pickup_date: string | null; time_slot: string | null
  pickup_address: string | null; drop_address: string | null
  total_bags: number | null
  driver_name: string | null; driver_phone: string | null
  pickup_instructions: string | null; notes: string | null
}

const BOOKING_SNAPSHOT_SELECT = 'id, tracking_id, status, customer_name, customer_phone, service_type, service_label, from_city, to_city, pickup_date, time_slot, pickup_address, drop_address, total_bags, driver_name, driver_phone, pickup_instructions, notes'

function fmtLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function fmtDate(d: string | null): string {
  if (!d) return 'TBC'
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/**
 * Builds the 12 positional variables for the ops_pickup_reminder Fast2SMS
 * template (see FAST2SMS_TEMPLATES.md) — order must match the approved
 * template exactly, Fast2SMS substitutes {{1}}..{{12}} positionally.
 */
function buildReminderVariables(b: BookingSnapshot): string[] {
  const route      = [b.from_city, b.to_city].filter(Boolean).join(' → ') || '—'
  const pickupWhen = `${fmtDate(b.pickup_date)}${b.time_slot ? ', ' + b.time_slot : ''}`
  const driver      = b.driver_name ? `${b.driver_name}${b.driver_phone ? ' (' + b.driver_phone + ')' : ''}` : 'Not assigned yet'
  const instructions = (b.pickup_instructions || b.notes || 'None') as string

  return [
    b.customer_name ?? 'Customer',                                   // {{1}} Customer Name
    b.tracking_id,                                                   // {{2}} Booking ID
    b.service_label ?? b.service_type ?? 'Baggage Delivery',         // {{3}} Service Type
    pickupWhen,                                                      // {{4}} Pickup Date & Time
    b.pickup_address || '—',                                         // {{5}} Pickup Address
    b.drop_address || '—',                                           // {{6}} Delivery Address
    route,                                                           // {{7}} Route
    String(b.total_bags ?? '—'),                                     // {{8}} Number of Bags
    b.customer_phone || '—',                                         // {{9}} Customer Mobile Number
    fmtLabel(b.status),                                              // {{10}} Current Booking Status
    driver,                                                          // {{11}} Driver Name + Mobile
    instructions,                                                    // {{12}} Special Instructions
  ]
}

/**
 * Finds every reminder whose scheduled_for has arrived, atomically claims
 * and sends each one, and logs the outcome both on the reminder row and on
 * the booking's own status_history (same convention as
 * lib/driver-details.ts, so it's visible in the existing Booking Workflow
 * timeline too). Called by the cron route on a poll interval. Never throws.
 */
export async function sendDueReminders(): Promise<{ processed: number }> {
  const nowIso = new Date().toISOString()
  let processed = 0

  try {
    // Capped at 25/tick (was 200) — see matching comment in
    // lib/sales-followup-reminders.ts's sendDuePending(). Same fix, same
    // reasoning: bound each cron tick's total work so it can't stall out
    // and get killed as a timeout.
    const { data: due, error } = await supabaseAdmin
      .from('booking_reminders')
      .select('id, booking_id, reminder_type')
      .eq('status', 'pending')
      .lte('scheduled_for', nowIso)
      .limit(25)

    if (error) {
      console.error('[ops-reminders] due-query failed:', error.message)
      return { processed: 0 }
    }

    for (const row of (due ?? []) as DueReminderRow[]) {
      // Atomic claim — the WHERE status='pending' makes this row itself the
      // lock, so an overlapping cron tick that races here simply affects 0
      // rows and skips, exactly like lib/driver-details.ts's claim pattern.
      const { data: claimed } = await supabaseAdmin
        .from('booking_reminders')
        .update({ status: 'sent', sent_at: nowIso })
        .eq('id', row.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()
      if (!claimed) continue

      processed++

      const { data: bk } = await supabaseAdmin
        .from('bookings')
        .select(BOOKING_SNAPSHOT_SELECT)
        .eq('id', row.booking_id)
        .maybeSingle()

      if (!bk) {
        await supabaseAdmin.from('booking_reminders')
          .update({ status: 'failed', delivery_status: null, detail: 'Booking no longer exists' })
          .eq('id', row.id)
        continue
      }
      const booking = bk as unknown as BookingSnapshot

      // Booking may have been cancelled/rejected between scheduling and
      // this tick — don't send a reminder for a pickup that's off.
      if (booking.status === 'cancelled' || booking.status === 'rejected') {
        await supabaseAdmin.from('booking_reminders')
          .update({ status: 'cancelled', detail: `Skipped at send time — booking is now ${booking.status}` })
          .eq('id', row.id)
        continue
      }

      const settings = await getReminderSettings()
      const templateId = process.env.FAST2SMS_OPS_REMINDER_MESSAGE_ID ?? ''
      const result = await sendWhatsAppTemplateFast2SMS(settings.whatsapp, templateId, buildReminderVariables(booking))

      await supabaseAdmin.from('booking_reminders')
        .update({
          status:          result.success ? 'sent' : 'failed',
          delivery_status: result.success ? (result.requestId ?? 'sent') : (result.error ?? 'Unknown error'),
          channel:         'whatsapp',
          recipient:       settings.whatsapp,
          detail:          `${REMINDER_TYPE_LABEL[row.reminder_type]} pickup reminder for ${booking.tracking_id}`,
        })
        .eq('id', row.id)

      // Mirror onto the booking's own activity log — same pattern as
      // driver-details.ts — so it's visible from the Booking Workflow page
      // without needing to open Supabase or a dedicated reminders UI.
      const { data: histRow } = await supabaseAdmin.from('bookings').select('status_history').eq('id', booking.id).maybeSingle()
      const history = Array.isArray(histRow?.status_history) ? histRow!.status_history : []
      history.push({
        from: booking.status, to: booking.status, timestamp: nowIso, changed_by: 'system',
        note: `Ops ${REMINDER_TYPE_LABEL[row.reminder_type].toLowerCase()} pickup reminder ${result.success ? 'sent' : 'failed'} to ${settings.whatsapp}` +
              (result.success ? '' : ` — ${result.error ?? 'unknown error'}`),
      })
      await supabaseAdmin.from('bookings').update({ status_history: history }).eq('id', booking.id)
    }
  } catch (err) {
    console.error('[ops-reminders] sendDueReminders error (non-fatal):', err)
  }

  return { processed }
}
