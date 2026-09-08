// BAGDROP — lib/inquiry-status-email-report.ts
//
// Automatic Inquiry Status Email Reports (founder spec, 2026-09-08). One
// internal-ops email, once daily (9:00 AM IST) to info@bagdrop.co, with two
// clearly separated sections:
//
//   1. CONFIRMED & ONGOING INQUIRIES — every booking currently at
//      'confirmed' or one of the operational "ongoing" statuses (same
//      range already used by lib/confirmed-ongoing-summary.ts's WhatsApp
//      report — reused here rather than inventing a second, possibly
//      conflicting definition of "confirmed and ongoing").
//   2. NEW INQUIRIES — QUOTATION PENDING — every booking still at
//      'inquiry' (no quote created yet). Per spec: "Do not include
//      inquiries where a quote has already been created, sent, rejected,
//      confirmed, cancelled, or expired" — every one of those is a
//      DIFFERENT status than 'inquiry' in this app's own STATUS_ORDER
//      (lib/booking-status.ts), so filtering on status === 'inquiry' alone
//      already satisfies this with no separate quotes-table join needed —
//      one less place for the two systems to drift apart.
//
// Purely additive / read-only reporting: every query below is a plain
// SELECT against `bookings`. Nothing here ever inserts/updates/deletes a
// booking, lead, quote, or payment row — this file's only write is its own
// idempotency-claim row in inquiry_status_email_runs (see that migration's
// comment for why it's a separate table from scheduled_report_runs).
//
// Test Mode bookings (is_test) are excluded from both sections — same rule
// every other automated notifier in this codebase already follows.

import { supabaseAdmin } from './supabase'
import { sendEmail } from './email'
import { formatCustomerName } from './constants'
import { STATUS_ORDER } from './booking-status'

const REPORT_RECIPIENTS = ['info@bagdrop.co']

const CONFIRMED_STATUS = 'confirmed'
const ONGOING_STATUSES = STATUS_ORDER.slice(STATUS_ORDER.indexOf('confirmed') + 1, STATUS_ORDER.indexOf('delivered'))
const CONFIRMED_ONGOING_STATUSES = [CONFIRMED_STATUS, ...ONGOING_STATUSES]

// Mirrors PRE_QUOTE_STATUSES in app/(admin)/admin/page.tsx / the Skybird
// dashboard's local copy — 'inquiry' is the real, current value; 'pending'
// is kept for parity with those same lists in case any legacy row still
// carries it.
const QUOTE_PENDING_STATUSES = ['inquiry', 'pending']

const BOOKING_SELECT =
  'id, tracking_id, status, title, customer_name, customer_phone, customer_email, ' +
  'from_city, to_city, pickup_date, delivery_date, total_bags, total_amount, ' +
  'payment_status, service_type, service_label, driver_name, created_at, updated_at, is_test'

interface ReportBookingRow {
  id: string
  tracking_id: string
  status: string
  title: string | null
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  from_city: string | null
  to_city: string | null
  pickup_date: string | null
  delivery_date: string | null
  total_bags: number | null
  total_amount: number | null
  payment_status: string | null
  service_type: string | null
  service_label: string | null
  driver_name: string | null
  created_at: string
  updated_at: string | null
  is_test: boolean | null
}

async function fetchConfirmedOngoing(): Promise<ReportBookingRow[]> {
  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select(BOOKING_SELECT)
    .in('status', CONFIRMED_ONGOING_STATUSES)
    .eq('is_test', false)
    .order('pickup_date', { ascending: true, nullsFirst: false })
    .limit(2000) // safety ceiling, not a business truncation — see file header
  if (error) {
    console.error('[inquiry-status-email-report] confirmed/ongoing query failed:', error.message)
    return []
  }
  return (data ?? []) as unknown as ReportBookingRow[]
}

async function fetchQuotePending(): Promise<ReportBookingRow[]> {
  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select(BOOKING_SELECT)
    .in('status', QUOTE_PENDING_STATUSES)
    .eq('is_test', false)
    .order('created_at', { ascending: true }) // oldest/most-overdue inquiry first
    .limit(2000)
  if (error) {
    console.error('[inquiry-status-email-report] quote-pending query failed:', error.message)
    return []
  }
  return (data ?? []) as unknown as ReportBookingRow[]
}

// ── Labels/colors — kept in sync via comment with STATUS_CONFIG in
// app/(admin)/admin/page.tsx (the canonical Bagdrop Admin Dashboard status
// vocabulary) and its local copy in app/(skybird)/skybird/page.tsx. Only
// the statuses this report can actually show are listed here.
const STATUS_LABELS: Record<string, string> = {
  inquiry:               'New Inquiry',
  pending:                'New Inquiry',
  confirmed:             'Booking Confirmed',
  indemnity_bond_sent:   'Indemnity Bond Sent',
  indemnity_bond_signed: 'Indemnity Bond Signed',
  invoice_generated:     'Invoice Generated',
  invoice_sent:          'Invoice Sent',
  pickup_scheduled:      'Pickup Scheduled',
  picked_up:             'Bags Picked Up',
  in_transit:            'In Transit',
  out_for_delivery:      'Out for Delivery',
  driver_details_shared: 'Driver Details Shared',
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function paymentLabel(status: string | null): string {
  if (!status) return 'Pending'
  if (status === 'paid') return 'Paid'
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Needs a driver assigned once a booking has actually reached the pickup/
// transit phase — before that (Confirmed, Indemnity, Invoice stages) no
// driver is expected yet, so an empty driver_name there isn't a problem to
// flag.
const DRIVER_REQUIRED_STATUSES = ['pickup_scheduled', 'picked_up', 'in_transit', 'out_for_delivery', 'driver_details_shared']

// One pending-action sentence per operational status — the whole point of
// this report ("help the team quickly see... which actions are pending").
// Falls back to a generic prompt for any status not explicitly listed here
// (e.g. if a new status is added to STATUS_ORDER later) rather than
// silently showing nothing.
const FOLLOWUP_BY_STATUS: Record<string, string> = {
  confirmed:             'Send indemnity bond / schedule pickup',
  indemnity_bond_sent:   'Awaiting signed indemnity bond from customer',
  indemnity_bond_signed: 'Generate invoice',
  invoice_generated:     'Send invoice to customer',
  invoice_sent:          'Schedule pickup',
  pickup_scheduled:      'Confirm pickup has been completed',
  picked_up:             'Update to In Transit once dispatched',
  in_transit:            'Track delivery progress',
  out_for_delivery:      'Confirm delivery completion',
  driver_details_shared: 'Awaiting delivery confirmation',
}

function followUpAction(b: ReportBookingRow): { text: string; urgent: boolean } {
  const parts: string[] = []
  let urgent = false

  if (DRIVER_REQUIRED_STATUSES.includes(b.status) && !b.driver_name) {
    parts.push('Assign a driver')
    urgent = true
  }
  if (b.payment_status && b.payment_status !== 'paid' && b.status !== 'confirmed') {
    // A non-paid payment status past Confirmed is unusual (VIP/credit
    // bookings aside) and worth a human look — flagged, not blocking.
    parts.push('Follow up on payment status')
  }
  parts.push(FOLLOWUP_BY_STATUS[b.status] ?? 'Review booking and confirm next step')

  return { text: parts.join(' + '), urgent }
}

function fmtDate(d: string | null): string {
  if (!d) return 'TBC'
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function fmtDateTime(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
}

function fmtRupees(n: number | null): string {
  if (n == null) return '—'
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** "3h 20m ago" / "2d 4h ago" / "Just now" — how long since an inquiry came in. */
function timeSince(fromISO: string, now: Date): { text: string; overdue: boolean } {
  const ms = now.getTime() - new Date(fromISO).getTime()
  const mins = Math.max(0, Math.floor(ms / 60000))
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)

  let text: string
  if (days > 0) text = `${days}d ${hours % 24}h ago`
  else if (hours > 0) text = `${hours}h ${mins % 60}m ago`
  else if (mins > 0) text = `${mins}m ago`
  else text = 'Just now'

  // Flagged overdue past 24h with no quote yet — matches the "identify
  // inquiries that require follow-up" framing in the spec.
  return { text, overdue: hours >= 24 }
}

function route(b: ReportBookingRow): string {
  return [b.from_city, b.to_city].filter(Boolean).join(' → ') || '—'
}

// Humanizes a raw service_type slug when service_label wasn't stored —
// same small map as lib/payment-receipt-notification.ts's SERVICE_TYPE_LABELS
// (kept as a local copy rather than a shared import to avoid coupling two
// otherwise-independent reporting features; keep both in sync if a new
// service type is added).
const SERVICE_TYPE_LABELS: Record<string, string> = {
  'airport-to-doorstep': 'Airport to Doorstep',
  'airport-to-door':     'Airport to Doorstep',
  'doorstep-to-airport': 'Doorstep to Airport',
  'door-to-airport':     'Doorstep to Airport',
  'doorstep-to-doorstep':'Doorstep to Doorstep',
  'airport-to-airport':  'Airport to Airport',
  intercity:             'Intercity Baggage Delivery',
}

function serviceLabel(b: ReportBookingRow): string {
  if (b.service_label) return b.service_label
  if (b.service_type) return SERVICE_TYPE_LABELS[b.service_type] ?? b.service_type
  return '—'
}

function customerName(b: ReportBookingRow): string {
  return formatCustomerName(b.title, b.customer_name) || b.customer_name || '—'
}

// ── HTML builders — deliberately NOT lib/email.ts's baseTemplate(), which
// wraps a narrow 580px single-column card meant for a customer-facing
// message. This is a wide, data-table-heavy internal ops report, so it
// gets its own (still Bagdrop-branded) wrapper sized for that.
function badge(text: string, bg: string, fg: string): string {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;background:${bg};color:${fg};">${escapeHtml(text)}</span>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const STATUS_BADGE_COLORS: Record<string, [string, string]> = {
  confirmed:             ['#dbeafe', '#1e40af'],
  indemnity_bond_sent:   ['#fef3c7', '#92400e'],
  indemnity_bond_signed: ['#ecfccb', '#3f6212'],
  invoice_generated:     ['#ede9fe', '#5b21b6'],
  invoice_sent:          ['#ede9fe', '#5b21b6'],
  pickup_scheduled:      ['#ede9fe', '#5b21b6'],
  picked_up:             ['#ede9fe', '#5b21b6'],
  in_transit:            ['#cffafe', '#155e75'],
  out_for_delivery:      ['#ffedd5', '#9a3412'],
  driver_details_shared: ['#e0f2fe', '#075985'],
  inquiry:               ['#fef3c7', '#92400e'],
  pending:                ['#fef3c7', '#92400e'],
}

function statusBadge(status: string): string {
  const [bg, fg] = STATUS_BADGE_COLORS[status] ?? ['#f3f4f6', '#374151']
  return badge(statusLabel(status), bg, fg)
}

function paymentBadge(status: string | null): string {
  const paid = status === 'paid'
  return badge(paymentLabel(status), paid ? '#d1fae5' : '#fee2e2', paid ? '#065f46' : '#991b1b')
}

function th(label: string): string {
  return `<th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.4px;color:#6b7280;background:#f9fafb;border-bottom:2px solid #e5e7eb;white-space:nowrap;">${escapeHtml(label)}</th>`
}
function td(html: string, opts: { nowrap?: boolean } = {}): string {
  return `<td style="padding:8px 10px;font-size:12px;color:#111827;border-bottom:1px solid #f1f1f1;vertical-align:top;${opts.nowrap ? 'white-space:nowrap;' : ''}">${html}</td>`
}

function buildConfirmedOngoingTable(rows: ReportBookingRow[]): string {
  if (rows.length === 0) {
    return '<p style="font-size:13px;color:#6b7280;margin:0 0 24px;">No confirmed or ongoing bookings right now.</p>'
  }
  const body = rows.map(b => {
    const fu = followUpAction(b)
    return '<tr>' +
      td(`<div style="font-weight:600;">${escapeHtml(customerName(b))}</div><div style="color:#6b7280;font-size:11px;">${escapeHtml(b.customer_phone ?? '—')}</div>`) +
      td(`<span style="font-family:monospace;">${escapeHtml(b.tracking_id)}</span>`, { nowrap: true }) +
      td(escapeHtml(serviceLabel(b))) +
      td(fmtDate(b.pickup_date), { nowrap: true }) +
      td(fmtDate(b.delivery_date), { nowrap: true }) +
      td(escapeHtml(route(b))) +
      td(fmtRupees(b.total_amount), { nowrap: true }) +
      td(paymentBadge(b.payment_status), { nowrap: true }) +
      td(statusBadge(b.status), { nowrap: true }) +
      td(escapeHtml(b.driver_name || (DRIVER_REQUIRED_STATUSES.includes(b.status) ? 'Not assigned' : '—'))) +
      td(fu.urgent ? badge(fu.text, '#fee2e2', '#991b1b') : escapeHtml(fu.text)) +
      td(fmtDateTime(b.updated_at), { nowrap: true }) +
      '</tr>'
  }).join('')

  return `<table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
    <thead><tr>
      ${th('Customer')}${th('Tracking ID')}${th('Service')}${th('Pickup')}${th('Delivery')}${th('Route')}${th('Quote Amount')}${th('Payment')}${th('Status')}${th('Driver')}${th('Follow-up / Pending Action')}${th('Last Updated')}
    </tr></thead>
    <tbody>${body}</tbody>
  </table>`
}

function buildQuotePendingTable(rows: ReportBookingRow[], now: Date): string {
  if (rows.length === 0) {
    return '<p style="font-size:13px;color:#6b7280;margin:0;">No inquiries waiting on a quote right now.</p>'
  }
  const body = rows.map(b => {
    const since = timeSince(b.created_at, now)
    return '<tr>' +
      td(`<div style="font-weight:600;">${escapeHtml(customerName(b))}</div>`) +
      td(`<span style="font-family:monospace;">${escapeHtml(b.tracking_id)}</span>`, { nowrap: true }) +
      td(escapeHtml(b.customer_phone ?? '—'), { nowrap: true }) +
      td(escapeHtml(serviceLabel(b))) +
      td(fmtDate(b.pickup_date), { nowrap: true }) +
      td(fmtDate(b.delivery_date), { nowrap: true }) +
      td(escapeHtml(route(b))) +
      td(b.total_bags != null ? String(b.total_bags) : '—') +
      td(fmtDate(b.created_at.slice(0, 10)), { nowrap: true }) +
      td(statusBadge(b.status), { nowrap: true }) +
      td(since.overdue ? badge(since.text, '#fee2e2', '#991b1b') : escapeHtml(since.text), { nowrap: true }) +
      td(since.overdue ? badge('URGENT — Create & send quotation', '#fee2e2', '#991b1b') : escapeHtml('Create & send quotation')) +
      '</tr>'
  }).join('')

  return `<table style="width:100%;border-collapse:collapse;">
    <thead><tr>
      ${th('Customer')}${th('Tracking ID')}${th('Contact')}${th('Service')}${th('Pickup')}${th('Delivery')}${th('Route')}${th('Bags')}${th('Inquiry Date')}${th('Status')}${th('Time Since Received')}${th('Action Required')}
    </tr></thead>
    <tbody>${body}</tbody>
  </table>`
}

function buildReportHtml(confirmedOngoing: ReportBookingRow[], quotePending: ReportBookingRow[], now: Date): string {
  const confirmedCount = confirmedOngoing.filter(b => b.status === CONFIRMED_STATUS).length
  const ongoingCount   = confirmedOngoing.length - confirmedCount
  const dateLabel = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Bagdrop Inquiry Status Report</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
<tr><td align="center">
<table width="1080" cellpadding="0" cellspacing="0" style="max-width:1080px;width:96%;background:#fff;border-radius:12px;overflow:hidden;">
  <tr><td style="background:#FF6300;padding:20px 28px;">
    <span style="font-size:20px;font-weight:900;color:#fff;letter-spacing:-0.5px;">BAGDROP</span>
    <span style="font-size:9px;font-weight:600;color:rgba(255,255,255,0.75);letter-spacing:2px;margin-left:10px;vertical-align:middle;">INQUIRY STATUS REPORT</span>
    <div style="color:#ffe4cc;font-size:12px;margin-top:4px;">${escapeHtml(dateLabel)}</div>
  </td></tr>
  <tr><td style="padding:20px 28px 6px;">
    <!-- Plain inline-block spans, not flexbox — Outlook/Word's rendering
         engine ignores display:flex entirely, and these badges already
         wrap fine on their own as inline-block elements. -->
    <div style="font-size:12px;">
      <span style="margin-right:8px;display:inline-block;">${badge(`${confirmedCount} Confirmed`, '#dbeafe', '#1e40af')}</span>
      <span style="margin-right:8px;display:inline-block;">${badge(`${ongoingCount} Ongoing`, '#ede9fe', '#5b21b6')}</span>
      <span style="display:inline-block;">${badge(`${quotePending.length} Quote Pending`, '#fef3c7', '#92400e')}</span>
    </div>
  </td></tr>
  <tr><td style="padding:8px 28px 4px;">
    <h2 style="margin:16px 0 10px;font-size:14px;color:#111827;letter-spacing:0.3px;">CONFIRMED &amp; ONGOING INQUIRIES</h2>
    ${buildConfirmedOngoingTable(confirmedOngoing)}
    <h2 style="margin:8px 0 10px;font-size:14px;color:#111827;letter-spacing:0.3px;">NEW INQUIRIES — QUOTATION PENDING</h2>
    ${buildQuotePendingTable(quotePending, now)}
  </td></tr>
  <tr><td style="padding:18px 28px;text-align:center;background:#fafafa;">
    <p style="margin:0;font-size:11px;color:#aaa;">Bagdrop · Automated Inquiry Status Report · Generated from live data at send time<br/>
    <a href="https://www.bagdrop.co" style="color:#FF6300;text-decoration:none;">www.bagdrop.co</a> ·
    <a href="mailto:info@bagdrop.co" style="color:#FF6300;text-decoration:none;">info@bagdrop.co</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
}

interface RunResult {
  skipped: boolean
  reason?: string
  reportKey: string
  confirmedCount: number
  ongoingCount: number
  quotePendingCount: number
  recipients: string[]
  success: boolean
  html?: string // present for dryRun previews only
}

function istDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

/**
 * Runs (or dry-runs) one Inquiry Status Report send. `manual` uses a
 * report_key that can never collide with a real scheduled day's key, so
 * testing is always allowed regardless of whether today's real report
 * already went out. `dryRun` builds and returns the HTML without sending
 * via Resend or writing an inquiry_status_email_runs row at all.
 */
export async function runInquiryStatusEmailReport(
  opts: { manual?: boolean; dryRun?: boolean } = {}
): Promise<RunResult> {
  const now = new Date()
  const dateStr = istDateStr(now)
  const reportKey = opts.manual ? `test_${Date.now()}` : dateStr

  const [confirmedOngoing, quotePending] = await Promise.all([
    fetchConfirmedOngoing(),
    fetchQuotePending(),
  ])
  const confirmedCount = confirmedOngoing.filter(b => b.status === CONFIRMED_STATUS).length
  const ongoingCount   = confirmedOngoing.length - confirmedCount

  const html = buildReportHtml(confirmedOngoing, quotePending, now)

  if (opts.dryRun) {
    return {
      skipped: false, reportKey, confirmedCount, ongoingCount,
      quotePendingCount: quotePending.length, recipients: [], success: true, html,
    }
  }

  // ── Atomic claim — same "the INSERT itself is the lock" pattern as
  // runScheduledSummary in lib/confirmed-ongoing-summary.ts. ──────────────
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from('inquiry_status_email_runs')
    .insert({
      report_key: reportKey, report_date: dateStr, is_test: !!opts.manual,
    })
    .select('id')
    .maybeSingle()

  if (claimErr || !claimed) {
    return {
      skipped: true,
      reason: claimErr ? `claim insert failed: ${claimErr.message}` : 'already sent (report_key already claimed)',
      reportKey, confirmedCount, ongoingCount, quotePendingCount: quotePending.length,
      recipients: [], success: false,
    }
  }

  const subject = `Bagdrop Inquiry Status Report — ${now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}`
  const result = await sendEmail(REPORT_RECIPIENTS, subject, html, 'inquiry-status-report:' + reportKey)

  await supabaseAdmin
    .from('inquiry_status_email_runs')
    .update({
      confirmed_count: confirmedCount, ongoing_count: ongoingCount, quote_pending_count: quotePending.length,
      recipients: REPORT_RECIPIENTS,
      resend_response: result,
      success: result.success,
      error: result.success ? null : (result.error ?? 'Unknown error'),
      completed_at: new Date().toISOString(),
    })
    .eq('id', claimed.id)

  return {
    skipped: false, reportKey, confirmedCount, ongoingCount,
    quotePendingCount: quotePending.length, recipients: REPORT_RECIPIENTS, success: result.success,
  }
}

/**
 * Is the daily report due right now, in IST? Wide 30-minute window (8:55–
 * 9:25 AM) to absorb external-scheduler polling jitter — the report_key
 * claim above still guarantees at-most-once even if this returns true on
 * several consecutive poll ticks in a row. Mirrors
 * lib/confirmed-ongoing-summary.ts's determineDueReportType.
 */
export function isReportDueNow(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? '0')
  const hour = get('hour') % 24
  const istMinutes = hour * 60 + get('minute')
  return istMinutes >= 8 * 60 + 55 && istMinutes <= 9 * 60 + 25
}
