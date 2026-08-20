// BAGDROP — lib/confirmed-ongoing-summary.ts
//
// Automated "Confirmed & Ongoing Inquiry" WhatsApp summary. Twice a day
// (9:00 AM and 6:00 PM IST), sends the fixed internal ops WhatsApp numbers
// (see lib/internal-whatsapp-recipients.ts) a report listing EVERY booking
// currently at 'confirmed' or one of the operational "ongoing" statuses —
// so a confirmed pickup/delivery never gets missed just because nobody
// opened the admin dashboard.
//
// ── Critical design constraint (per founder spec, 2026-08-18) ──────────
// Each booking is its own row in the report. NEVER grouped/deduped by
// customer, never LIMIT 1, never DISTINCT ON(customer). A customer with 3
// separate confirmed bookings must see all 3 listed separately. The query
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
// deliberately excluded — matches the spec's explicit exclusion list.
// This is an assumption (the spec describes "Confirmed"/"Ongoing" as
// business concepts, not raw DB status values) — flagged here since it's
// the one interpretive judgment call in an otherwise literal spec.
//
// ── WhatsApp template constraint ────────────────────────────────────────
// Fast2SMS (Meta-approved WABA) requires a pre-approved, FIXED-shape
// template for any business-initiated message — see the "Fast2SMS
// WhatsApp Template Sender" comment in lib/notifications.ts. A template
// cannot have a variable number of placeholders, so an arbitrary-length
// multi-inquiry report can't be one template with "one slot per inquiry."
// Instead this uses ONE simple template with a single {{1}} variable
// holding the full pre-rendered report chunk, wrapped in fixed intro/outro
// sentences (see buildReportChunks() below and FAST2SMS_TEMPLATES.md §12
// for the exact template text). Originally tried 2 variables ({{1}} short
// header, {{2}} body) with almost no surrounding fixed text — Fast2SMS/
// Meta rejected that as "too many variables for its length" (their
// approval check requires enough static template text relative to
// variable count). Down to 1 variable + real fixed sentences fixes it.
// New template, not yet approved — see FAST2SMS_TEMPLATES.md §12 and the
// FAST2SMS_CONFIRMED_ONGOING_SUMMARY_MESSAGE_ID env var. Until that env
// var is set, sends safely no-op (logged, not thrown) — same fallback
// convention as every other Fast2SMS-dependent cron in this app (see
// ops_pickup_reminder's note).
//
// ── Idempotency ──────────────────────────────────────────────────────────
// See supabase/migrations/20260818d_confirmed_ongoing_summary.sql's
// comment for the full claim mechanism. Short version: report_key
// 'YYYY-MM-DD_morning'/'_evening' (IST date), claimed via
// INSERT ... ON CONFLICT DO NOTHING before any work happens — a second
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
const ACCEPTED_IDX = STATUS_ORDER.indexOf('accepted')

// Meta's hard template-body cap is 1024 characters for the whole rendered
// message. This budgets only the {{1}} variable's contribution, leaving
// headroom (~400 chars) for the fixed intro/outro sentences now baked into
// the template itself (see FAST2SMS_TEMPLATES.md §12). Conservative on
// purpose — better to split one message earlier than to have Fast2SMS/
// Meta silently truncate or reject an oversized send.
const BODY_CHAR_BUDGET = 550

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
}

const BOOKING_SELECT = 'id, tracking_id, status, title, customer_name, customer_phone, from_city, to_city, pickup_address, drop_address, pickup_date, delivery_date, time_slot, total_bags, payment_status, created_at'

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

/** Inquiry ID (lead_number) for each booking, resolved via leads.booking_id — batched, not per-row. */
async function fetchInquiryIdsByBooking(bookingIds: string[]): Promise<Record<string, string>> {
  if (bookingIds.length === 0) return {}
  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('booking_id, lead_number')
    .in('booking_id', bookingIds)
  if (error) {
    console.warn('[confirmed-ongoing-summary] leads lookup failed (non-fatal, Inquiry ID will show as —):', error.message)
    return {}
  }
  const map: Record<string, string> = {}
  for (const row of (data ?? []) as unknown as { booking_id: string | null; lead_number: string | null }[]) {
    if (row.booking_id && row.lead_number) map[row.booking_id] = row.lead_number
  }
  return map
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
function bucketLabel(status: string): 'Confirmed' | 'Ongoing' {
  return status === CONFIRMED_STATUS ? 'Confirmed' : 'Ongoing'
}
function bucketEmoji(status: string): string {
  return status === CONFIRMED_STATUS ? '🔵' : '🟢'
}

interface ReportEntry { n: number; text: string }

function buildEntry(n: number, b: BookingSummaryRow, inquiryId: string | undefined): string {
  const name       = formatCustomerName(b.title, b.customer_name) || b.customer_name || 'Customer'
  const route      = [b.from_city, b.to_city].filter(Boolean).join(' → ') || '—'
  const quoteStatus = STATUS_ORDER.indexOf(b.status) >= ACCEPTED_IDX && STATUS_ORDER.indexOf(b.status) !== -1 ? 'Accepted' : 'Pending'
  return [
    `${n}. ${name}`,
    `🆔 Inquiry: ${inquiryId ?? '—'}`,
    `📦 Tracking: ${b.tracking_id}`,
    `📍 Route: ${route}`,
    `📅 Pickup: ${fmtDate(b.pickup_date)}${b.time_slot ? ', ' + b.time_slot : ''}`,
    b.delivery_date ? `🚚 Delivery: ${fmtDate(b.delivery_date)}` : null,
    `🧳 Bags: ${b.total_bags ?? '—'}`,
    `📱 Mobile: ${b.customer_phone || '—'}`,
    `💰 Payment: ${fmtPaymentLabel(b.payment_status)}`,
    `📝 Quote: ${quoteStatus}`,
    `${bucketEmoji(b.status)} Status: ${fmtStatusLabel(b.status)}`,
    '━━━━━━━━━━━━━━',
  ].filter((l): l is string => l !== null).join('\n')
}

/**
 * Splits the full inquiry list into WhatsApp-template-safe chunks (each
 * chunk under BODY_CHAR_BUDGET characters), preserving inquiry order and
 * using CONTINUOUS numbering across chunks (1..N overall, not reset per
 * chunk) — matches the spec's "Part 1/3, Part 2/3" example. Returns one
 * plain string per chunk — the single {{1}} template variable value (see
 * the file-header comment on why this is 1 variable, not 2: Fast2SMS/Meta
 * rejected a 2-variable version as "too many variables for its length"
 * since there was almost no fixed template text around them — the fixed
 * "Please review..."/intro wording now lives in the template body itself,
 * not in this variable). Always returns at least one chunk (the "0
 * confirmed/ongoing" case still needs to send a heartbeat message — spec
 * item 8).
 */
function buildReportChunks(
  bookings: BookingSummaryRow[],
  inquiryIds: Record<string, string>,
  reportType: ReportType,
  now: Date
): string[] {
  const dateLabel = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
  const timeLabel = REPORT_TIME_LABEL[reportType]
  const confirmedCount = bookings.filter(b => b.status === CONFIRMED_STATUS).length
  const ongoingCount   = bookings.length - confirmedCount

  const summaryBlock = [
    'SUMMARY',
    `✅ Confirmed: ${confirmedCount}`,
    `🟢 Ongoing: ${ongoingCount}`,
    `📦 Total: ${bookings.length}`,
    '━━━━━━━━━━━━━━',
  ].join('\n')

  if (bookings.length === 0) {
    return [`Date: ${dateLabel} · Report: ${timeLabel}\n\n${summaryBlock}\nNo confirmed or ongoing inquiries at this time.`]
  }

  const entries: ReportEntry[] = bookings.map((b, i) => ({ n: i + 1, text: buildEntry(i + 1, b, inquiryIds[b.id]) }))

  // First pass: greedily pack entries into chunks under the char budget
  // (summary block only counted against the first chunk's budget).
  const chunkEntryGroups: ReportEntry[][] = []
  let current: ReportEntry[] = []
  let currentLen = summaryBlock.length
  for (const entry of entries) {
    const entryLen = entry.text.length + 1
    if (current.length > 0 && currentLen + entryLen > BODY_CHAR_BUDGET) {
      chunkEntryGroups.push(current)
      current = []
      currentLen = 0
    }
    current.push(entry)
    currentLen += entryLen
  }
  if (current.length > 0) chunkEntryGroups.push(current)

  const totalParts = chunkEntryGroups.length
  return chunkEntryGroups.map((group, idx) => {
    const partSuffix = totalParts > 1 ? ` (Part ${idx + 1}/${totalParts})` : ''
    const rangeLabel = group.length > 1 ? `Inquiries ${group[0].n}–${group[group.length - 1].n}` : `Inquiry ${group[0].n}`
    const lines: string[] = [`Date: ${dateLabel} · Report: ${timeLabel}${partSuffix}`, '']
    if (idx === 0) lines.push(summaryBlock)
    if (totalParts > 1) lines.push(rangeLabel + '\n━━━━━━━━━━━━━━')
    lines.push(...group.map(e => e.text))
    return lines.join('\n')
  })
}

interface RunResult {
  skipped: boolean
  reason?: string
  reportKey: string
  inquiryCount: number
  confirmedCount: number
  ongoingCount: number
  messageParts: number
  recipients: string[]
  success: boolean
  chunks: string[]
  fastResults: FanOutResult[]
}

/** IST date string (YYYY-MM-DD) for a given instant, independent of server/Vercel TZ. */
function istDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) // en-CA locale = YYYY-MM-DD
}

/**
 * Runs (or dry-runs) one report send. `manual` sends use a report_key that
 * can never collide with a real scheduled day's key (see migration
 * comment), so testing is always allowed to run regardless of whether
 * today's real report has already gone out — and never consumes/blocks the
 * real slot. `dryRun` builds and returns the message content without
 * calling Fast2SMS or writing a run row at all, for previewing in tests.
 */
export async function runScheduledSummary(
  reportType: ReportType,
  opts: { manual?: boolean; dryRun?: boolean } = {}
): Promise<RunResult> {
  const now = new Date()
  const dateStr = istDateStr(now)
  const reportKey = opts.manual ? `test_${Date.now()}_${reportType}` : `${dateStr}_${reportType}`

  const bookings = await fetchConfirmedOngoingBookings()
  const inquiryIds = await fetchInquiryIdsByBooking(bookings.map(b => b.id))
  const chunks = buildReportChunks(bookings, inquiryIds, reportType, now)
  const confirmedCount = bookings.filter(b => b.status === CONFIRMED_STATUS).length
  const ongoingCount   = bookings.length - confirmedCount

  if (opts.dryRun) {
    return {
      skipped: false, reportKey, inquiryCount: bookings.length, confirmedCount, ongoingCount,
      messageParts: chunks.length, recipients: [], success: true, chunks, fastResults: [],
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
      messageParts: chunks.length, recipients: [], success: false, chunks, fastResults: [],
    }
  }

  const { data: settingsRows } = await supabaseAdmin
    .from('settings').select('key, value').eq('key', 'confirmed_ongoing_summary_whatsapp')
  const recipients = parseWhatsAppRecipients(settingsRows?.[0]?.value as string | undefined)

  const templateId = process.env.FAST2SMS_CONFIRMED_ONGOING_SUMMARY_MESSAGE_ID ?? ''
  const fastResults: FanOutResult[] = []
  for (const chunk of chunks) {
    const result = await sendToAllRecipients(recipients, templateId, [chunk])
    fastResults.push(result)
  }
  const success = fastResults.length > 0 && fastResults.every(r => r.anySuccess)

  await supabaseAdmin
    .from('scheduled_report_runs')
    .update({
      inquiry_count: bookings.length, confirmed_count: confirmedCount, ongoing_count: ongoingCount,
      message_parts: chunks.length, recipients,
      fast2sms_response: fastResults,
      success,
      error: success ? null : fastResults.map(r => r.summary).join(' | ') || 'No template configured (FAST2SMS_CONFIRMED_ONGOING_SUMMARY_MESSAGE_ID unset)',
      completed_at: new Date().toISOString(),
    })
    .eq('id', claimed.id)

  return {
    skipped: false, reportKey, inquiryCount: bookings.length, confirmedCount, ongoingCount,
    messageParts: chunks.length, recipients, success, chunks, fastResults,
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
