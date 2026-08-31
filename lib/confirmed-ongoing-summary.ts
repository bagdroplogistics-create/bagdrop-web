// BAGDROP — lib/confirmed-ongoing-summary.ts
//
// Automated "Confirmed & Ongoing Booking" WhatsApp report. Twice a day
// (9:00 AM and 6:00 PM IST), sends the fixed internal ops WhatsApp numbers
// (see lib/internal-whatsapp-recipients.ts) ONE MESSAGE PER BOOKING
// currently at 'confirmed' or one of the operational "ongoing" statuses —
// so a confirmed pickup/delivery never gets missed just because nobody
// opened the admin dashboard. Every message carries the run's summary
// counts (Confirmed/Ongoing/Total) at the top AND that one booking's full
// detail below — a single template, reused once per booking.
//
// ── 2026-08-25 redesign: real fields, one template ──────────────────────
// v1 packed every booking into a single WhatsApp template variable
// ({{1}}) as one long pre-rendered block of text with real line breaks
// between fields. WhatsApp Business API silently flattens any line break
// INSIDE a single template variable's value before delivery — see
// lib/notifications.ts's sendWhatsAppTemplateFast2SMS, which has always
// had to replace \n with " • " before sending for exactly this reason —
// so the "vertical" report actually always arrived as one run-on line.
//
// v2 split this into a separate summary message (5 variables) plus one
// per-booking message (14 variables), mirroring the working
// "NEW BAGDROP INQUIRY" template (lib/new-inquiry-notification.ts), which
// renders perfectly vertical because it uses one variable PER FIELD with
// the line breaks baked into the template's own static body.
//
// v3 (per founder request 2026-08-25 "add template 2 in template 1")
// merged those two templates back into ONE — every message carries both
// the run's summary line AND one booking's full detail, so only a single
// Fast2SMS/Meta template needs to be created and approved. Still one
// WhatsApp message per booking (a variable-length list still can't be one
// fixed-shape template), just no separate summary-only message anymore.
//
// v4 (this version) — that 18-variable merged template was REJECTED by
// Fast2SMS/Meta at submission: "This template has too many variables for
// its length. Reduce the number of variables or increase the message
// length." Dropped Tracking ID, Inquiry ID, and Service (the 3 fields
// with the shortest static label text relative to their values) to bring
// it down to 15 variables — same approval-ratio issue already documented
// in this file's history (see the old §12 "too many variables" note).
// Tracking ID/Inquiry ID/Service are still tracked internally (visible on
// the admin dashboard) — they just aren't in this particular WhatsApp
// message anymore.
//
// v5 — dropping to 13 variables STILL got the same "too many variables
// for its length" rejection. Deleting a field removes both a variable and
// its ~1-word label, which barely moves the static-text-to-variable ratio
// Meta actually checks (per Meta's published template guidance: static
// text needs to scale with variable count, not just exist). Rather than
// keep cutting fields the founder wants kept, this version keeps all 15
// variables and instead adds real static wording: a longer title, a full
// sentence around the booking-index variables, and a closing sentence —
// mirroring the already-approved `new_inquiry_notification` template's
// proven label+sentence density (lib/new-inquiry-notification.ts, 10
// variables, live and working). v5's title line lived as the first line
// of the template BODY: "Confirmed & Ongoing Bookings Report for Bagdrop
// Operations".
//
// v6 (this version) — approved, then the founder added a WhatsApp
// template HEADER component ("Confirmed & Ongoing Bookings Report") on
// top of that same body, which duplicated the title 2-3x in the delivered
// message (Header + the body's own title line). The title now lives ONLY
// in the template's Header field; the body's static title line is
// removed and the body starts directly at "Report Date: {{1}}". This
// file's buildSummaryVariables()/buildBookingVariables() are UNCHANGED by
// this version (same 15 values, same order) — only the static wrapper
// text (now split Header/Body instead of one Body block) changed. The
// actual template body lives on Fast2SMS's dashboard, not in this file —
// see FAST2SMS_TEMPLATES.md §12 for the exact text to submit.
// FAST2SMS_CONFIRMED_ONGOING_MESSAGE_ID below; until set, sends safely
// no-op (logged, not thrown) — same fallback convention as every other
// Fast2SMS-dependent cron in this app.
//
// ── Critical design constraint (per founder spec, 2026-08-18) ──────────
// Each booking is its own message. NEVER grouped/deduped by customer,
// never LIMIT 1, never DISTINCT ON(customer). A customer with 3 separate
// confirmed bookings must see all 3 sent as 3 separate messages. The query
// below selects plain rows from `bookings` filtered by status only — no
// customer-keyed aggregation anywhere in this file.
//
// ── What counts as "Confirmed" vs "Ongoing" ─────────────────────────────
// Reuses the existing STATUS_ORDER sequence (lib/lifecycle-notifications.ts,
// already the single source of truth for booking-status ordering elsewhere
// in this app — see app/api/admin/reports/operations/route.ts's
// CONFIRMED_ONWARD_STATUSES for the same reuse pattern):
//   Confirmed = status === 'confirmed' exactly.
//   Ongoing   = every status strictly between 'confirmed' and 'delivered'
//               (indemnity_bond_sent, indemnity_bond_signed,
//               invoice_generated, invoice_sent, pickup_scheduled,
//               picked_up, in_transit, out_for_delivery,
//               driver_details_shared).
// 'delivered', 'trip_created', 'completed', 'cancelled', 'rejected', and
// everything before 'confirmed' (inquiry/quote/payment stages) are
// deliberately excluded.
//
// ── Zero-bookings case ───────────────────────────────────────────────────
// Spec item 8 requires a heartbeat even when nothing is confirmed/ongoing,
// so nobody wonders if the report silently stopped running. When there are
// no bookings, exactly ONE message still goes out — same template, summary
// counts all 0, booking half filled with "0 of 0" / "—" placeholders (see
// ZERO_BOOKING_PLACEHOLDER below).
//
// ── Idempotency ──────────────────────────────────────────────────────────
// See supabase/migrations/20260818d_confirmed_ongoing_summary.sql's
// comment for the full claim mechanism (unchanged by this redesign). Short
// version: report_key 'YYYY-MM-DD_morning'/'_evening' (IST date), claimed
// via INSERT ... ON CONFLICT DO NOTHING before any work happens — a second
// concurrent/retried invocation for the same key gets 0 inserted rows and
// no-ops immediately, however many times cron-job.org or Vercel retries it.

import { supabaseAdmin } from './supabase'
import { STATUS_ORDER } from './lifecycle-notifications'
import { formatCustomerName } from './constants'
import { parseWhatsAppRecipients, sendToAllRecipients, type FanOutResult } from './internal-whatsapp-recipients'

export type ReportType = 'morning' | 'evening'

const REPORT_TIME_LABEL: Record<ReportType, string> = { morning: '9:00 AM', evening: '6:00 PM' }
const REPORT_SCHEDULED_TIME: Record<ReportType, string> = { morning: '09:00', evening: '18:00' }

const CONFIRMED_STATUS = 'confirmed'
const ONGOING_STATUSES = STATUS_ORDER.slice(STATUS_ORDER.indexOf('confirmed') + 1, STATUS_ORDER.indexOf('delivered'))
const INCLUDED_STATUSES = [CONFIRMED_STATUS, ...ONGOING_STATUSES]

interface BookingSummaryRow {
  id: string
  tracking_id: string
  status: string
  title: string | null
  customer_name: string | null
  customer_phone: string | null
  from_city: string | null
  to_city: string | null
  pickup_address: string | null
  drop_address: string | null
  pickup_date: string | null
  delivery_date: string | null
  time_slot: string | null
  total_bags: number | null
  payment_status: string | null
  created_at: string
  service_type: string | null
  service_label: string | null
  driver_name: string | null
  vehicle_number: string | null
}

const BOOKING_SELECT = 'id, tracking_id, status, title, customer_name, customer_phone, from_city, to_city, pickup_address, drop_address, pickup_date, delivery_date, time_slot, total_bags, payment_status, created_at, service_type, service_label, driver_name, vehicle_number'

/**
 * Every booking currently Confirmed or Ongoing — one row per booking, no
 * grouping/dedup by customer, no LIMIT 1. The 1000 cap is a hard safety
 * ceiling (this app has never had anywhere near that many simultaneously
 * active bookings), not a business-logic truncation.
 */
async function fetchConfirmedOngoingBookings(): Promise<BookingSummaryRow[]> {
  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select(BOOKING_SELECT)
    .in('status', INCLUDED_STATUSES)
    .order('pickup_date', { ascending: true, nullsFirst: false })
    .limit(1000)
  if (error) {
    console.error('[confirmed-ongoing-summary] bookings query failed:', error.message)
    return []
  }
  return (data ?? []) as unknown as BookingSummaryRow[]
}

function fmtDate(d: string | null): string {
  if (!d) return 'TBC'
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
function fmtStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
function fmtPaymentLabel(status: string | null): string {
  if (!status) return 'Pending'
  if (status === 'paid') return 'Received'
  return fmtStatusLabel(status)
}

// 5 fixed fields — the summary half of the merged template (variables
// {{1}}-{{5}}). Identical across every message sent in one run.
function buildSummaryVariables(confirmedCount: number, ongoingCount: number, totalCount: number, reportType: ReportType, now: Date): string[] {
  const dateLabel = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
  return [
    dateLabel,                       // {{1}} Date
    REPORT_TIME_LABEL[reportType],   // {{2}} Report Time
    String(confirmedCount),          // {{3}} Confirmed
    String(ongoingCount),            // {{4}} Ongoing
    String(totalCount),              // {{5}} Total
  ]
}

// 10 fixed fields — the booking half of the merged template (variables
// {{6}}-{{15}}). Tracking ID, Inquiry ID, and Service were dropped here
// 2026-08-26 to fix a Meta "too many variables for its length" rejection
// at 18 variables — see file-header comment. Every value here is a SINGLE
// line (no \n) since each one becomes its own WhatsApp template variable
// — the line breaks between fields live in the template's static body,
// not in these values (this is the whole fix for the original problem —
// see file-header comment). Missing values always render as "—", never
// blank, both for a consistent look and because some WhatsApp template
// configs reject an empty variable value outright.
function buildBookingVariables(idx: number, total: number, b: BookingSummaryRow): string[] {
  const name     = formatCustomerName(b.title, b.customer_name) || b.customer_name || '—'
  const route    = [b.from_city, b.to_city].filter(Boolean).join(' -> ') || '—'
  const pickup   = b.pickup_date ? `${fmtDate(b.pickup_date)}${b.time_slot ? ', ' + b.time_slot : ''}` : '—'
  const delivery = b.delivery_date ? fmtDate(b.delivery_date) : '—'

  return [
    String(idx),                                          // {{6}}  Booking N
    String(total),                                         // {{7}}  of Total
    name,                                                   // {{8}}  Customer
    b.customer_phone || '—',                                // {{9}}  Contact
    route,                                                   // {{10}} Route
    pickup,                                                  // {{11}} Pickup
    delivery,                                                // {{12}} Delivery
    b.total_bags != null ? String(b.total_bags) : '—',      // {{13}} Bags
    fmtStatusLabel(b.status),                                // {{14}} Status
    fmtPaymentLabel(b.payment_status),                       // {{15}} Payment
  ]
}

/** Placeholder booking half used for the single zero-bookings heartbeat message — see file-header comment. */
const ZERO_BOOKING_PLACEHOLDER: string[] = ['0', '0', '—', '—', '—', '—', '—', '—', '—', '—']

/**
 * Human-readable reconstruction of one merged message — dry-run/test
 * preview only, never what's actually transmitted (that's the raw
 * variables[] array sent to Fast2SMS; the wrapper wording below lives in
 * Fast2SMS's approved template Header/Body, not in this file). Mirrors
 * the v6 shape — see file-header comment: the title now lives ONLY in the
 * template's Header component ("Confirmed & Ongoing Bookings Report"),
 * so it's NOT repeated here as a body line anymore (v5 had it as the
 * body's first line too, which — once the founder also added the Header
 * component — showed the title 2-3x in the delivered message).
 */
function previewMergedText(vars: string[]): string {
  const [
    dateLabel, timeLabel, confirmed, ongoing, total,
    idx, ofTotal, name, contact, route, pickup, delivery, bags, status, payment,
  ] = vars
  return [
    `Report Date: ${dateLabel}`,
    `Report Time: ${timeLabel}`,
    `Total Confirmed Bookings: ${confirmed}`,
    `Total Ongoing Bookings: ${ongoing}`,
    `Total Bookings Listed: ${total}`,
    '',
    `This message covers booking number ${idx} out of ${ofTotal} total bookings in this report.`,
    '',
    `Customer Name: ${name}`,
    `Customer Contact Number: ${contact}`,
    `Pickup to Delivery Route: ${route}`,
    `Scheduled Pickup: ${pickup}`,
    `Scheduled Delivery: ${delivery}`,
    `Number of Bags: ${bags}`,
    `Current Booking Status: ${status}`,
    `Payment Status: ${payment}`,
    '',
    'Please review this booking and take any necessary action.',
  ].join('\n')
}

interface RunResult {
  skipped: boolean
  reason?: string
  reportKey: string
  inquiryCount: number
  confirmedCount: number
  ongoingCount: number
  /** Total WhatsApp messages this run sends: one per booking, or exactly 1 heartbeat message when there are none. */
  messageParts: number
  recipients: string[]
  success: boolean
  /** Human-readable preview of every message this run sends, in order — for dry-run/test eyeballing only. */
  chunks: string[]
  fastResults: FanOutResult[]
}

/** IST date string (YYYY-MM-DD) for a given instant, independent of server/Vercel TZ. */
function istDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) // en-CA locale = YYYY-MM-DD
}

/**
 * Runs (or dry-runs) one report send: one WhatsApp message per confirmed/
 * ongoing booking (or one heartbeat message if there are none), each
 * carrying both the run's summary counts and that booking's full detail
 * via a single merged template (see file-header comment). `manual` sends
 * use a report_key that can never collide with a real scheduled day's key,
 * so testing is always allowed regardless of whether today's real report
 * has already gone out. `dryRun` builds and returns the message previews
 * without calling Fast2SMS or writing a run row at all.
 */
export async function runScheduledSummary(
  reportType: ReportType,
  opts: { manual?: boolean; dryRun?: boolean } = {}
): Promise<RunResult> {
  const now = new Date()
  const dateStr = istDateStr(now)
  const reportKey = opts.manual ? `test_${Date.now()}_${reportType}` : `${dateStr}_${reportType}`

  const bookings = await fetchConfirmedOngoingBookings()
  const confirmedCount = bookings.filter(b => b.status === CONFIRMED_STATUS).length
  const ongoingCount   = bookings.length - confirmedCount

  const summaryVars = buildSummaryVariables(confirmedCount, ongoingCount, bookings.length, reportType, now)
  const bookingHalves = bookings.length > 0
    ? bookings.map((b, i) => buildBookingVariables(i + 1, bookings.length, b))
    : [ZERO_BOOKING_PLACEHOLDER]
  const messages = bookingHalves.map(bookingVars => [...summaryVars, ...bookingVars])
  const chunks = messages.map(previewMergedText)
  const messageParts = messages.length

  if (opts.dryRun) {
    return {
      skipped: false, reportKey, inquiryCount: bookings.length, confirmedCount, ongoingCount,
      messageParts, recipients: [], success: true, chunks, fastResults: [],
    }
  }

  // ── Atomic claim — the INSERT itself is the lock. 0 rows back means
  // someone else (a retry, a double-invocation, an overlapping poll tick)
  // already claimed this exact report_key; no-op rather than double-send. ──
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from('scheduled_report_runs')
    .insert({
      report_key: reportKey, report_type: reportType, report_date: dateStr,
      scheduled_time: REPORT_SCHEDULED_TIME[reportType], is_test: !!opts.manual,
    })
    .select('id')
    .maybeSingle()

  if (claimErr || !claimed) {
    return {
      skipped: true, reason: claimErr ? `claim insert failed: ${claimErr.message}` : 'already sent (report_key already claimed)',
      reportKey, inquiryCount: bookings.length, confirmedCount, ongoingCount,
      messageParts, recipients: [], success: false, chunks, fastResults: [],
    }
  }

  const { data: settingsRows } = await supabaseAdmin
    .from('settings').select('key, value').eq('key', 'confirmed_ongoing_summary_whatsapp')
  const recipients = parseWhatsAppRecipients(settingsRows?.[0]?.value as string | undefined)

  const templateId = process.env.FAST2SMS_CONFIRMED_ONGOING_MESSAGE_ID ?? ''
  const fastResults: FanOutResult[] = []

  if (templateId) {
    for (const vars of messages) {
      fastResults.push(await sendToAllRecipients(recipients, templateId, vars))
    }
  } else {
    console.log('[confirmed-ongoing-summary] skipped: FAST2SMS_CONFIRMED_ONGOING_MESSAGE_ID not set')
  }

  const success = fastResults.length > 0 && fastResults.every(r => r.anySuccess)

  await supabaseAdmin
    .from('scheduled_report_runs')
    .update({
      inquiry_count: bookings.length, confirmed_count: confirmedCount, ongoing_count: ongoingCount,
      message_parts: messageParts, recipients,
      fast2sms_response: fastResults,
      success,
      error: success ? null : (fastResults.length === 0
        ? 'No template configured (FAST2SMS_CONFIRMED_ONGOING_MESSAGE_ID unset)'
        : fastResults.map(r => r.summary).join(' | ')),
      completed_at: new Date().toISOString(),
    })
    .eq('id', claimed.id)

  return {
    skipped: false, reportKey, inquiryCount: bookings.length, confirmedCount, ongoingCount,
    messageParts, recipients, success, chunks, fastResults,
  }
}

/**
 * Which report (if any) is due right now, in IST. Windows are deliberately
 * wide (30 min) to absorb external-scheduler jitter/downtime — the
 * report_key claim above still guarantees at-most-once even if this
 * returns 'morning' on five consecutive poll ticks in a row.
 */
export function determineDueReportType(now: Date = new Date()): ReportType | null {
  // formatToParts (not two separate toLocaleString calls) so hour and
  // minute come from the exact same Intl evaluation — avoids any edge-case
  // mismatch (e.g. a tick landing exactly on a minute boundary between the
  // two calls) and ICU's midnight-hour quirk (some implementations return
  // "24" instead of "00" for hour12:false at local midnight).
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? '0')
  const hour = get('hour') % 24
  const istMinutes = hour * 60 + get('minute')

  const inWindow = (startH: number, startM: number, endH: number, endM: number) =>
    istMinutes >= startH * 60 + startM && istMinutes <= endH * 60 + endM
  if (inWindow(8, 55, 9, 25)) return 'morning'
  if (inWindow(17, 55, 18, 25)) return 'evening'
  return null
}
