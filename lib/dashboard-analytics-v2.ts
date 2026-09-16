// BAGDROP — lib/dashboard-analytics-v2.ts
//
// Founder request, 2026-09-16: full redesign of the admin Dashboard's
// analytics. Read-only — this file never writes to the database, it only
// aggregates what's already there.
//
// WHY A NEW FILE INSTEAD OF EDITING THE OLD ONES:
// The old Dashboard read from FOUR independent endpoints (dashboard-
// analytics, crm-stats, sales-followup-summary, trip-sheets) that were never
// reconciled with each other — e.g. crm-stats computed "Revenue" two
// different ways in the same file (revenue_this_month vs
// revenue_period_amount), and dashboard-analytics defined "Total Inquiries"
// as "every lead EXCEPT rejected/closed/lost", which is why it could show
// Total Inquiries=74 and Total Rejected=82 at the same time (82 wasn't a bug
// — the two cards are disjoint partitions of the same ~156 leads, see the
// module comment in app/api/admin/dashboard-analytics/route.ts). That old
// endpoint is left completely untouched here — it's still consumed by the
// separate mobile admin-app client (admin-app/src/lib/api.ts) and must keep
// working unmodified.
//
// This file is the new single source of truth: one fetch of each underlying
// table per request, shared across every section below, with every figure
// using the BUSINESS date the founder's spec calls for (not a blanket
// `created_at`):
//   Inquiry date     → leads.created_at (no dedicated inquiry_date column
//                       exists in this schema — created_at IS when the
//                       inquiry record was made, so it's the correct field,
//                       not a substitute for a missing one).
//   Quote date       → leads.quote_sent_at, falling back to leads.quote_date
//                       for any quote created before quote_sent_at existed
//                       (added 20260909_quote_sent_at.sql).
//   Payment date     → payments.payment_date (added 20260818b — a real,
//                       admin-entered date distinct from created_at). The
//                       OLD crm-stats revenue-period logic used created_at
//                       here, which this file deliberately corrects.
//   Booking/Confirm date → the real timestamp from bookings.status_history
//                       (every status transition is logged there with a
//                       timestamp — see app/api/admin/bookings/[id]/
//                       route.ts) of the first transition that reached the
//                       relevant stage, falling back to bookings.created_at
//                       only when no matching history entry exists (older
//                       rows predating status_history logging).
//   Operations date  → bookings.pickup_date / trip_sheets.pickup_date.
//   Completion date  → bookings.completed_month_override ?? pickup_date —
//                       the exact rule already proven correct and documented
//                       at length in dashboard-analytics/route.ts; reused
//                       verbatim, not reinvented.
//
// Two sections are deliberately treated as LIVE SNAPSHOTS rather than
// date-range-filtered: Outstanding and Pending Verification. Both describe
// "what is unresolved right now" — an unpaid balance or an unreviewed proof
// doesn't belong to the month the booking happened to be created in, it's a
// standing balance that exists today regardless of the dashboard's selected
// period. Logistics Performance bag counts ARE date-filtered, by the linked
// booking's pickup_date, since bag movement is inherently operational.
//
// Reused, not reinvented, from existing single-source-of-truth modules:
//   - STATUS_ORDER / ACTIVE_BOOKING_STATUSES  → lib/booking-status.ts
//   - countsTowardTotalPaid                   → lib/payment-ledger.ts
//   - resolveSource / SOURCE_LABELS           → lib/lead-source.ts
//   - the payments-ledger + synthetic-entry Revenue formula → ported from
//     app/api/admin/crm-stats/route.ts's revenue_period_amount logic
//     (proven correct there), with its one real bug fixed (payment_date
//     instead of created_at for the real-payments half).

import { supabaseAdmin } from '@/lib/supabase'
import { STATUS_ORDER, ACTIVE_BOOKING_STATUSES } from '@/lib/booking-status'
import { countsTowardTotalPaid } from '@/lib/payment-ledger'
import { resolveSource, SOURCE_LABELS } from '@/lib/lead-source'

// ── Date range resolution — single shared implementation for every section ──

// Founder request, 2026-09-16: "total inquiries coming from website,
// contact or manually added any inquiry from june month to till now" —
// added as an explicit 'all_time' preset (since real records only start
// where the company began using this software) rather than relying on
// 'this_year' happening to cover it, which would silently stop working
// come January.
export type DashboardRangePreset = 'today' | 'this_week' | 'this_month' | 'last_month' | 'this_year' | 'all_time' | 'custom'

export interface ResolvedRange {
  preset:      DashboardRangePreset
  from:        Date     // inclusive
  toExclusive: Date     // exclusive upper bound — for TIMESTAMPTZ comparisons
  fromStr:     string   // 'YYYY-MM-DD', inclusive — for DATE-column string comparisons
  toStr:       string   // 'YYYY-MM-DD', inclusive
}

function pad2(n: number) { return String(n).padStart(2, '0') }

// Server runs in UTC (Vercel/Node), but every date on this dashboard means
// an IST calendar day to the person looking at it. Computing "today"/"this
// week"/"this month" from a plain `new Date()` and its LOCAL getFullYear/
// getMonth/getDate (server-local = UTC in production) silently shifts every
// boundary by 5.5 hours — an inquiry created at 1am IST lands in
// "yesterday," and near a week/month edge a whole day's worth of real
// inquiries can drop out of the selected range entirely (founder-reported
// 2026-09-16: Total Inquiries didn't match the real count). This codebase
// already hit and fixed the identical bug once, in app/api/admin/
// sales-followup-summary/route.ts (IST_OFFSET_MS) — same fix, reused here.
//
// All calendar math below works in plain (year, month, day) triples —
// never round-tripping through a Date object's LOCAL getters, which would
// silently reintroduce the same server-timezone bug when converting back to
// a "YYYY-MM-DD" string. `ymd()` normalizes an out-of-range triple (day 0,
// day 32, month -1, etc.) using Date.UTC/getUTC* only, which is pure
// calendar arithmetic with zero timezone involvement.
const IST_OFFSET_MS = (5 * 60 + 30) * 60000

function ymd(y: number, m: number, d: number): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(y, m, d))
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() }
}
function ymdStr(y: number, m: number, d: number): string {
  const n = ymd(y, m, d)
  return `${n.y}-${pad2(n.m + 1)}-${pad2(n.d)}`
}
// Real UTC instant for a given IST calendar day at 00:00 IST.
function istMidnightUtc(y: number, m: number, d: number): Date {
  const n = ymd(y, m, d)
  return new Date(Date.UTC(n.y, n.m, n.d) - IST_OFFSET_MS)
}
// Today's IST calendar date, and IST day-of-week (0=Sun..6=Sat) — derived by
// shifting the current UTC instant forward by the IST offset and reading
// its UTC parts, which is exactly today's IST wall-clock date.
function todayIst(): { y: number; m: number; d: number; dow: number } {
  const shifted = new Date(Date.now() + IST_OFFSET_MS)
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), d: shifted.getUTCDate(), dow: shifted.getUTCDay() }
}

// DATE columns (pickup_date, quote_date, payment_date, completed_month_
// override) are plain "YYYY-MM-DD" strings with no time/timezone component
// — the calendar day the admin picked, IST by convention throughout this
// app. Comparing them as STRINGS (not Date objects) is the same zero-
// timezone-risk approach dashboard-analytics/route.ts already uses for
// exactly this reason — do not change to Date-object comparison.
export function resolveDashboardRange(
  preset: DashboardRangePreset,
  customFrom?: string | null,
  customTo?: string | null,
): ResolvedRange {
  const { y, m, d, dow } = todayIst()
  let fromY: number, fromM: number, fromD: number
  let lastY: number, lastM: number, lastD: number // last INCLUDED day

  switch (preset) {
    case 'today': {
      fromY = y; fromM = m; fromD = d
      lastY = y; lastM = m; lastD = d
      break
    }
    case 'this_week': {
      const mondayOffset = dow === 0 ? -6 : 1 - dow
      const monday = ymd(y, m, d + mondayOffset)
      fromY = monday.y; fromM = monday.m; fromD = monday.d
      const sunday = ymd(monday.y, monday.m, monday.d + 6)
      lastY = sunday.y; lastM = sunday.m; lastD = sunday.d
      break
    }
    case 'last_month': {
      fromY = y; fromM = m - 1; fromD = 1
      const lastDay = ymd(y, m, 0) // day 0 of this month = last day of last month
      lastY = lastDay.y; lastM = lastDay.m; lastD = lastDay.d
      break
    }
    case 'this_year': {
      fromY = y; fromM = 0; fromD = 1
      lastY = y; lastM = 11; lastD = 31
      break
    }
    case 'all_time': {
      // Well before this system's earliest possible real record — a fixed
      // floor rather than a live MIN(created_at) query, since it only
      // needs to be safely earlier than any real data, not exact.
      fromY = 2020; fromM = 0; fromD = 1
      lastY = y; lastM = m; lastD = d
      break
    }
    case 'custom': {
      if (customFrom) { const [cy, cm, cd] = customFrom.split('-').map(Number); fromY = cy; fromM = cm - 1; fromD = cd }
      else { fromY = y; fromM = m; fromD = 1 }
      if (customTo) { const [cy, cm, cd] = customTo.split('-').map(Number); lastY = cy; lastM = cm - 1; lastD = cd }
      else { lastY = y; lastM = m; lastD = d }
      break
    }
    case 'this_month':
    default: {
      fromY = y; fromM = m; fromD = 1
      const lastDay = ymd(y, m + 1, 0) // day 0 of next month = last day of this month
      lastY = lastDay.y; lastM = lastDay.m; lastD = lastDay.d
      break
    }
  }

  const from = istMidnightUtc(fromY, fromM, fromD)
  const toExclusive = istMidnightUtc(lastY, lastM, lastD + 1)
  return { preset, from, toExclusive, fromStr: ymdStr(fromY, fromM, fromD), toStr: ymdStr(lastY, lastM, lastD) }
}

function inTs(iso: string | null | undefined, r: ResolvedRange): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return t >= r.from.getTime() && t < r.toExclusive.getTime()
}
function inDateStr(s: string | null | undefined, r: ResolvedRange): boolean {
  if (!s) return false
  const d = s.slice(0, 10)
  return d >= r.fromStr && d <= r.toStr
}

// ── Row shapes (loosely typed — supabaseAdmin has no Database generic in
// this codebase, see the type-inference note in app/api/admin/reports/
// operations/route.ts; every field actually used is listed explicitly) ──

interface LeadRow {
  id: string
  created_at: string
  booking_id: string | null
  quote_number: string | null
  quote_date: string | null
  quote_sent_at: string | null
  customer_responded_at: string | null
  status: string | null
  source: string | null
  booking_type: string | null
}

interface BookingRow {
  id: string
  status: string
  status_history: unknown
  payment_status: string | null
  total_amount: number | null
  pickup_date: string | null
  delivery_date: string | null
  completed_month_override: string | null
  created_at: string
  is_test: boolean
  service_type: string | null
  service_label: string | null
  customer_name: string | null
  tracking_id: string | null
  from_city: string | null
  to_city: string | null
  total_bags: number | null
  driver_name: string | null
  booking_type: string | null
  approved_without_payment: boolean | null
  billing_type: string | null
}

interface PaymentRow {
  id: string
  booking_id: string | null
  amount: number | null
  payment_status: string
  payment_method: string | null
  payment_date: string | null
  created_at: string
  refund_amount: number | null
  refunded_at: string | null
}

interface TripSheetRow {
  id: string
  booking_id: string | null
  status: string
  pickup_date: string | null
  delivery_date: string | null
  total_bags: number | null
  total_income: number | null
  total_expense: number | null
  trip_expenses?: { actual_cost: number | null }[] | null
}

interface GroupBagRow {
  id: string
  booking_id: string | null
  status: string
  deleted_at: string | null
}

function idxOf(status: string | null | undefined): number {
  return STATUS_ORDER.indexOf(status ?? '')
}

// True when `booking` is CURRENTLY at or past `thresholdIdx` in STATUS_ORDER,
// OR ever passed through it before landing on a terminal branch (rejected/
// closed/cancelled — none of which are in STATUS_ORDER, so idxOf returns -1
// for them). Checked against the real logged status_history rather than
// guessed, so a booking that had its quote sent and was THEN rejected still
// correctly counts as "quote sent" for funnel purposes.
function everReachedStage(booking: BookingRow | null | undefined, thresholdIdx: number): boolean {
  if (!booking) return false
  const curIdx = idxOf(booking.status)
  if (curIdx !== -1 && curIdx >= thresholdIdx) return true
  const history = Array.isArray(booking.status_history) ? booking.status_history as { to?: string; timestamp?: string }[] : []
  return history.some(h => { const i = idxOf(h?.to); return i !== -1 && i >= thresholdIdx })
}

// Earliest real timestamp (from status_history) at which `booking` reached
// `thresholdIdx` or later. Falls back to booking.created_at only when no
// history entry matches (older rows predating status_history logging) —
// flagged inline everywhere it's used, per the "never invent data" rule.
function firstReachedTimestamp(booking: BookingRow | null | undefined, thresholdIdx: number): string | null {
  if (!booking) return null
  const history = Array.isArray(booking.status_history) ? booking.status_history as { to?: string; timestamp?: string }[] : []
  const matches = history
    .filter(h => { const i = idxOf(h?.to); return i !== -1 && i >= thresholdIdx })
    .map(h => h.timestamp)
    .filter((t): t is string => !!t)
    .sort()
  if (matches.length > 0) return matches[0]
  const curIdx = idxOf(booking.status)
  if (curIdx !== -1 && curIdx >= thresholdIdx) return booking.created_at // assumption: no history logged, best available proxy
  return null
}

const QUOTE_SENT_IDX       = STATUS_ORDER.indexOf('quote_sent')
const ACCEPTED_IDX         = STATUS_ORDER.indexOf('accepted')
const PAYMENT_RECEIVED_IDX = STATUS_ORDER.indexOf('payment_received')
const ACTIVE_STATUS_SET    = new Set(ACTIVE_BOOKING_STATUSES)

function quoteDateOf(l: LeadRow): { iso: string | null; isTs: boolean } {
  if (l.quote_sent_at) return { iso: l.quote_sent_at, isTs: true }
  if (l.quote_date)    return { iso: l.quote_date, isTs: false }
  return { iso: null, isTs: false }
}
function quoteInRange(l: LeadRow, r: ResolvedRange): boolean {
  const { iso, isTs } = quoteDateOf(l)
  if (!iso) return false
  return isTs ? inTs(iso, r) : inDateStr(iso, r)
}

export interface DashboardData {
  range: { preset: DashboardRangePreset; from: string; to: string }
  business_overview: {
    total_inquiries: number
    quotes_sent: number
    confirmed_bookings: number
    payments_received_count: number
    payments_received_amount: number
    outstanding_amount: number
    revenue: number
  }
  funnel: {
    stages: {
      total_inquiries: number
      quotes_generated: number
      quotes_sent: number
      accepted: number
      payment_received: number
      confirmed: number
      completed: number
    }
    status_counts: {
      new_inquiries: number
      pending_inquiries: number
      quotes_pending: number
      quote_sent: number
      waiting_customer_approval: number
      quote_rejected: number
      cancelled: number
      confirmed: number
      completed: number
    }
  }
  revenue_collection: {
    revenue: number
    payments_received_amount: number
    payments_received_count: number
    outstanding: number
    pending_verification: number
    refunds: number
    net_revenue: number
  }
  logistics: {
    total_bags_handled: number
    picked_up: number
    in_transit: number
    airport_handover: number
    delivered: number
    pending: number
    exceptions: number
    group_booking_count: number
    group_booking_bag_count: number
  }
  trip_profitability: {
    total_trips: number
    active_trips: number
    completed_trips: number
    delivered_trips: number
    total_income: number
    total_expense: number
    net_profit: number
    avg_revenue_per_trip: number
    avg_expense_per_trip: number
    profit_margin: number
  }
  service_types: { service_label: string; bookings: number; bags: number; revenue: number }[]
  sources: { source: string; label: string; inquiries: number; quotes: number; confirmed: number; completed: number; revenue: number }[]
  debug: {
    leads_fetched: number
    bookings_fetched: number
    payments_fetched: number
    trip_sheets_fetched: number
    group_bags_fetched: number
    is_test_supported: boolean
    completed_override_supported: boolean
  }
}

export async function getDashboardData(
  preset: DashboardRangePreset,
  customFrom?: string | null,
  customTo?: string | null,
): Promise<DashboardData> {
  const range = resolveDashboardRange(preset, customFrom, customTo)

  // ── Fetch every underlying table ONCE, share across every section below —
  // avoids the old Dashboard's pattern of five separate endpoints each
  // re-querying overlapping data. Capped at 20000 rows, matching the
  // existing convention in dashboard-analytics/route.ts; true DB-side
  // aggregation (a Postgres RPC/materialized view) is the right next step
  // once real volume exceeds that, per the founder spec's performance
  // section — flagged as a suggested improvement, not built here.
  let isTestSupported = true
  let leadsRes = await supabaseAdmin
    .from('leads')
    .select('id, created_at, booking_id, quote_number, quote_date, quote_sent_at, customer_responded_at, status, source, booking_type')
    .is('deleted_at', null)
    .eq('is_test', false)
    .limit(20000)
  if (leadsRes.error?.message?.includes('is_test')) {
    isTestSupported = false
    leadsRes = await supabaseAdmin
      .from('leads')
      .select('id, created_at, booking_id, quote_number, quote_date, quote_sent_at, customer_responded_at, status, source, booking_type')
      .is('deleted_at', null)
      .limit(20000)
  }
  if (leadsRes.error) throw new Error('leads query failed: ' + leadsRes.error.message)
  const leads = (leadsRes.data ?? []) as unknown as LeadRow[]

  let completedOverrideSupported = true
  const BOOKING_SELECT = 'id, status, status_history, payment_status, total_amount, pickup_date, delivery_date, completed_month_override, created_at, is_test, service_type, service_label, customer_name, tracking_id, from_city, to_city, total_bags, driver_name, booking_type, approved_without_payment, billing_type'
  const BOOKING_SELECT_NO_OVERRIDE = 'id, status, status_history, payment_status, total_amount, pickup_date, delivery_date, created_at, is_test, service_type, service_label, customer_name, tracking_id, from_city, to_city, total_bags, driver_name, booking_type, approved_without_payment, billing_type'
  let bookings: BookingRow[]
  {
    const primary = await supabaseAdmin.from('bookings').select(BOOKING_SELECT).not('tracking_id', 'is', null).limit(20000)
    if (primary.error?.message?.includes('completed_month_override')) {
      completedOverrideSupported = false
      const fallback = await supabaseAdmin.from('bookings').select(BOOKING_SELECT_NO_OVERRIDE).not('tracking_id', 'is', null).limit(20000)
      if (fallback.error) throw new Error('bookings query failed: ' + fallback.error.message)
      bookings = (fallback.data ?? []).map(b => ({ ...b, completed_month_override: null })) as unknown as BookingRow[]
    } else {
      if (primary.error) throw new Error('bookings query failed: ' + primary.error.message)
      bookings = (primary.data ?? []) as unknown as BookingRow[]
    }
  }
  const bookingsById = new Map(bookings.map(b => [b.id, b]))

  const paymentsRes = await supabaseAdmin
    .from('payments')
    .select('id, booking_id, amount, payment_status, payment_method, payment_date, created_at, refund_amount, refunded_at')
    .limit(20000)
  if (paymentsRes.error) throw new Error('payments query failed: ' + paymentsRes.error.message)
  const payments = (paymentsRes.data ?? []) as unknown as PaymentRow[]

  const tripSheetsRes = await supabaseAdmin
    .from('trip_sheets')
    .select('id, booking_id, status, pickup_date, delivery_date, total_bags, total_income, total_expense, trip_expenses(actual_cost)')
    .limit(20000)
  if (tripSheetsRes.error) throw new Error('trip_sheets query failed: ' + tripSheetsRes.error.message)
  const tripSheetsRaw = (tripSheetsRes.data ?? []) as unknown as TripSheetRow[]

  // group_bags is optional — table exists per 20260904/20260905 migrations,
  // but treated defensively (empty array) in case a database hasn't run them
  // yet, same pattern as every other optional-column probe in this file.
  const groupBagsRes = await supabaseAdmin
    .from('group_bags')
    .select('id, booking_id, status, deleted_at')
    .is('deleted_at', null)
    .limit(20000)
  const groupBags = (groupBagsRes.error ? [] : (groupBagsRes.data ?? [])) as unknown as GroupBagRow[]

  // ── Shared derived maps ──────────────────────────────────────────────
  const testBookingIds = new Set(bookings.filter(b => b.is_test).map(b => b.id))

  const tripSheets = tripSheetsRaw
    .filter(s => !s.booking_id || !testBookingIds.has(s.booking_id))
    .map(s => ({
      ...s,
      total_expense: (s.trip_expenses ?? []).length > 0
        ? (s.trip_expenses ?? []).reduce((sum, e) => sum + (Number(e.actual_cost) || 0), 0)
        : (Number(s.total_expense) || 0),
    }))

  const totalPaidByBooking = new Map<string, number>()
  const earliestPaidDateByBooking = new Map<string, string>()
  for (const p of payments) {
    if (!countsTowardTotalPaid(p)) continue
    if (!p.booking_id) continue
    if (testBookingIds.has(p.booking_id)) continue
    totalPaidByBooking.set(p.booking_id, (totalPaidByBooking.get(p.booking_id) ?? 0) + (Number(p.amount) || 0))
    const d = p.payment_date || (p.created_at ? p.created_at.slice(0, 10) : null)
    if (d) {
      const cur = earliestPaidDateByBooking.get(p.booking_id)
      if (!cur || d < cur) earliestPaidDateByBooking.set(p.booking_id, d)
    }
  }

  // Real money collected for this booking so far — actual ledger total if
  // any real payment exists, else the full total_amount ONLY if the
  // booking's derived payment_status is already 'paid' (the "synthetic"
  // case: paid via Mark Payment Received / VIP approval with no logged
  // payments row — see lib/payment-status.ts). Never invents a number for
  // a booking that hasn't actually been marked paid.
  function revenueForBooking(b: BookingRow): number {
    const ledgerPaid = totalPaidByBooking.get(b.id) ?? 0
    if (ledgerPaid > 0) return ledgerPaid
    if (b.payment_status === 'paid') return Number(b.total_amount) || 0
    return 0
  }

  // ── Business Overview + Funnel "stages" (period-activity: each metric
  // uses ITS OWN business date, per founder spec §5) ──────────────────────
  const totalInquiries = leads.filter(l => inTs(l.created_at, range)).length

  const quotesGenerated = leads.filter(l => l.quote_number && quoteInRange(l, range)).length

  const quotesSent = leads.filter(l => {
    if (!l.quote_number) return false
    const b = l.booking_id ? bookingsById.get(l.booking_id) : null
    return everReachedStage(b, QUOTE_SENT_IDX) && quoteInRange(l, range)
  }).length

  const accepted = leads.filter(l => {
    const b = l.booking_id ? bookingsById.get(l.booking_id) : null
    if (!everReachedStage(b, ACCEPTED_IDX)) return false
    // customer_responded_at is the real, dedicated timestamp for this event
    // (see app/api/admin/sales-followup-summary/route.ts) — falls back to
    // the quote date only when it's missing (older rows).
    if (l.customer_responded_at) return inTs(l.customer_responded_at, range)
    return quoteInRange(l, range)
  }).length

  const paymentReceivedStage = leads.filter(l => {
    const b = l.booking_id ? bookingsById.get(l.booking_id) : null
    if (!b || !everReachedStage(b, PAYMENT_RECEIVED_IDX)) return false
    const d = earliestPaidDateByBooking.get(b.id)
    return d ? inDateStr(d, range) : false
  }).length

  // "Confirmed" — same definition as the legacy Dashboard's proven-correct
  // "Total Confirmed Bookings" (ACTIVE_BOOKING_STATUSES + must have a real
  // quote), now date-scoped by the real status_history timestamp of the
  // first transition into that range instead of being all-time.
  function isConfirmed(b: BookingRow | undefined | null, hasQuote: boolean): boolean {
    return !!b && ACTIVE_STATUS_SET.has(b.status) && hasQuote
  }
  const confirmedBookingsInRange = bookings.filter(b => {
    if (b.is_test) return false
    if (!isConfirmed(b, leads.some(l => l.booking_id === b.id && !!l.quote_number))) return false
    const ts = firstReachedTimestamp(b, STATUS_ORDER.indexOf('payment_received'))
    return ts ? inTs(ts, range) : false
  })

  const completedInRange = bookings.filter(b => {
    if (b.is_test || b.status !== 'completed') return false
    const d = b.completed_month_override || b.pickup_date
    return d ? inDateStr(d, range) : false
  })

  // ── Payments received / Outstanding / Pending verification / Refunds ──
  const paymentsInRange = payments.filter(p =>
    countsTowardTotalPaid(p) &&
    (!p.booking_id || !testBookingIds.has(p.booking_id)) &&
    inDateStr(p.payment_date || p.created_at?.slice(0, 10), range)
  )
  const paymentsReceivedCount  = paymentsInRange.length
  const paymentsReceivedAmount = paymentsInRange.reduce((s, p) => s + (Number(p.amount) || 0), 0)

  // Live snapshot — not date-filtered, see module comment.
  //
  // Founder-reported 2026-09-16, round 2: an earlier version scoped this to
  // "every accepted-or-later booking's total_amount minus its real payments-
  // ledger total" — which silently treated any booking marked paid via Mark
  // Payment Received / VIP approval with NO row ever logged in `payments`
  // (exactly the case app/api/admin/payments/route.ts's
  // fetchUnloggedBookingPayments exists to handle) as if it had collected
  // ₹0, counting its FULL total_amount as still outstanding even though the
  // booking's own payment_status already says 'paid'. That's what produced
  // ₹11,37,272 "Outstanding" against a real Payments-tab Pending of
  // ₹36,750 (screenshot, Payments page: 53 transactions, ₹4,10,025
  // collected, ₹36,750 pending, spanning June–September 2026).
  //
  // Fix: stop deriving a second, independent "balance due" formula and
  // instead reproduce the Payments page's own Total/Collected/Pending cards
  // EXACTLY (down to the rupee) — same real-payments-ledger half, same
  // synthetic-row half for confirmed-or-paid bookings with no logged
  // payment at all — computed here from the SAME bookings/payments arrays
  // already fetched above, no extra query needed. See app/api/admin/
  // payments/route.ts's fetchUnloggedBookingPayments() and its frontend
  // totalPending calculation (app/(admin)/admin/payments/page.tsx) — this
  // is a deliberate line-for-line port of that already-trusted logic, not
  // a new definition.
  const CONFIRMED_ONWARD_IDX = STATUS_ORDER.indexOf('confirmed')
  const PAID_WITHOUT_LEDGER_ROW_STATUSES = new Set(['paid', 'approved_pending'])

  // Every booking that has AT LEAST ONE real `payments` row, regardless of
  // that row's own status — matches existingBookingIds in payments/
  // route.ts, which is what fetchUnloggedBookingPayments uses to avoid
  // synthesizing a second "no payment logged" line for a booking that
  // actually already has one (even a still-pending one).
  const bookingsWithAnyRealPayment = new Set(
    payments.filter(p => p.booking_id && !testBookingIds.has(p.booking_id)).map(p => p.booking_id as string)
  )

  const realOutstanding = payments
    .filter(p =>
      p.payment_method !== 'upload' &&
      p.payment_status !== 'paid' &&
      p.payment_status !== 'refunded' &&
      (!p.booking_id || !testBookingIds.has(p.booking_id))
    )
    .reduce((s, p) => s + (Number(p.amount) || 0), 0)

  const syntheticOutstanding = bookings
    .filter(b => {
      if (b.is_test) return false
      if (bookingsWithAnyRealPayment.has(b.id)) return false // already counted in realOutstanding, or already paid
      const i = idxOf(b.status)
      const reachedConfirmed = i !== -1 && i >= CONFIRMED_ONWARD_IDX
      const paidWithoutLedger = PAID_WITHOUT_LEDGER_ROW_STATUSES.has(b.payment_status ?? '')
      if (!reachedConfirmed && !paidWithoutLedger) return false
      return b.payment_status !== 'paid' // a synthetic 'paid' row (e.g. FOC-adjacent) owes nothing
    })
    .reduce((s, b) => s + (Number(b.total_amount) || 0), 0)

  const outstandingAmount = realOutstanding + syntheticOutstanding

  const pendingVerificationAmount = payments
    .filter(p => p.payment_status === 'pending_verification' && (!p.booking_id || !testBookingIds.has(p.booking_id)))
    .reduce((s, p) => s + (Number(p.amount) || 0), 0)

  const refundsInRange = payments.filter(p => {
    if (!p.refund_amount || Number(p.refund_amount) <= 0) return false
    if (p.booking_id && testBookingIds.has(p.booking_id)) return false
    const d = p.refunded_at || p.created_at
    return inTs(d, range)
  })
  const refundsAmount = refundsInRange.reduce((s, p) => s + (Number(p.refund_amount) || 0), 0)

  // ── Revenue — ported from crm-stats's proven-correct ledger + synthetic-
  // entry formula (see module comment), with created_at→payment_date fixed
  // for the real-payments half. ──────────────────────────────────────────
  const realRevenueEntries = payments
    .filter(p => countsTowardTotalPaid(p) && (!p.booking_id || !testBookingIds.has(p.booking_id)))
    .map(p => ({ amount: Number(p.amount) || 0, dateStr: p.payment_date || p.created_at?.slice(0, 10) || null }))
  const bookingIdsWithRealPayment = new Set(
    payments.filter(p => countsTowardTotalPaid(p) && p.booking_id).map(p => p.booking_id as string)
  )
  const syntheticRevenueEntries = bookings
    .filter(b => !b.is_test && b.payment_status === 'paid' && !bookingIdsWithRealPayment.has(b.id))
    .map(b => ({ amount: Number(b.total_amount) || 0, dateStr: b.completed_month_override || b.pickup_date || b.created_at?.slice(0, 10) || null }))
  const revenue = [...realRevenueEntries, ...syntheticRevenueEntries]
    .filter(e => inDateStr(e.dateStr, range))
    .reduce((s, e) => s + e.amount, 0)

  // ── Funnel status_counts — cohort view: of the inquiries CREATED in this
  // period, where do they currently stand? (Different question from
  // `stages` above, which is "how many of each dated event happened in this
  // period" — both are useful, per founder spec §3.) ─────────────────────
  const cohort = leads.filter(l => inTs(l.created_at, range))
  const statusCounts = {
    new_inquiries: cohort.filter(l => l.status === 'new').length,
    pending_inquiries: cohort.filter(l => {
      if (l.status === 'lost') return false
      const b = l.booking_id ? bookingsById.get(l.booking_id) : null
      if (!b) return true
      return idxOf(b.status) !== -1 && idxOf(b.status) < PAYMENT_RECEIVED_IDX
    }).length,
    quotes_pending: cohort.filter(l => l.status !== 'lost' && !l.quote_number).length,
    quote_sent: cohort.filter(l => {
      const b = l.booking_id ? bookingsById.get(l.booking_id) : null
      return everReachedStage(b, QUOTE_SENT_IDX) && !everReachedStage(b, ACCEPTED_IDX)
    }).length,
    waiting_customer_approval: cohort.filter(l => {
      const b = l.booking_id ? bookingsById.get(l.booking_id) : null
      return !!b && everReachedStage(b, QUOTE_SENT_IDX) && b.status !== 'rejected' && b.status !== 'closed' && !l.customer_responded_at
    }).length,
    quote_rejected: cohort.filter(l => {
      const b = l.booking_id ? bookingsById.get(l.booking_id) : null
      return !!b && (b.status === 'rejected' || b.status === 'closed')
    }).length,
    cancelled: cohort.filter(l => {
      const b = l.booking_id ? bookingsById.get(l.booking_id) : null
      return l.status === 'lost' || b?.status === 'cancelled'
    }).length,
    confirmed: cohort.filter(l => {
      const b = l.booking_id ? bookingsById.get(l.booking_id) : null
      return isConfirmed(b, !!l.quote_number)
    }).length,
    completed: cohort.filter(l => {
      const b = l.booking_id ? bookingsById.get(l.booking_id) : null
      return b?.status === 'completed'
    }).length,
  }

  // ── Logistics Performance — bag-level, from group_bags (the universal
  // per-bag tag table for BOTH individual and group bookings, see 20260905_
  // bagdrop_bag_tags.sql). Date-filtered by the linked booking's pickup_date
  // — bag movement is inherently operational. ────────────────────────────
  const bagsInRange = groupBags.filter(bag => {
    if (!bag.booking_id) return false
    if (testBookingIds.has(bag.booking_id)) return false
    const b = bookingsById.get(bag.booking_id)
    return !!b && inDateStr(b.pickup_date, range)
  })
  const EARLY_BAG_STATUSES = new Set(['tag_generated', 'tag_printed', 'pickup_pending'])
  const logistics = {
    total_bags_handled: bagsInRange.length,
    picked_up:        bagsInRange.filter(b => b.status === 'picked_up').length,
    in_transit:       bagsInRange.filter(b => b.status === 'in_transit').length,
    airport_handover: bagsInRange.filter(b => b.status === 'airport_handover').length,
    delivered:        bagsInRange.filter(b => b.status === 'delivered').length,
    pending:          bagsInRange.filter(b => EARLY_BAG_STATUSES.has(b.status)).length,
    exceptions:       bagsInRange.filter(b => b.status === 'delivery_exception').length,
    group_booking_count: new Set(
      bookings.filter(b => !b.is_test && b.booking_type === 'group' && inDateStr(b.pickup_date, range)).map(b => b.id)
    ).size,
    group_booking_bag_count: bagsInRange.filter(bag => {
      const b = bag.booking_id ? bookingsById.get(bag.booking_id) : null
      return b?.booking_type === 'group'
    }).length,
  }

  // ── Trip Operations & Profitability — from trip_sheets, date-filtered by
  // pickup_date (operations date). ───────────────────────────────────────
  const tripsInRange = tripSheets.filter(s => inDateStr(s.pickup_date, range))
  const tripIncome  = tripsInRange.reduce((s, t) => s + (Number(t.total_income) || 0), 0)
  const tripExpense = tripsInRange.reduce((s, t) => s + (Number(t.total_expense) || 0), 0)
  const tripCount   = tripsInRange.length
  const tripProfitability = {
    total_trips:     tripCount,
    active_trips:    tripsInRange.filter(t => !['completed', 'cancelled', 'delivered'].includes(t.status)).length,
    completed_trips: tripsInRange.filter(t => t.status === 'completed').length,
    delivered_trips: tripsInRange.filter(t => ['delivered', 'completed'].includes(t.status)).length,
    total_income:  tripIncome,
    total_expense: tripExpense,
    net_profit:    tripIncome - tripExpense,
    avg_revenue_per_trip: tripCount > 0 ? tripIncome / tripCount : 0,
    avg_expense_per_trip: tripCount > 0 ? tripExpense / tripCount : 0,
    profit_margin: tripIncome > 0 ? ((tripIncome - tripExpense) / tripIncome) * 100 : 0,
  }

  // ── Bookings by Service Type ──────────────────────────────────────────
  // Founder request, 2026-09-16: a standalone card, NOT tied to the
  // Business Overview date-range buttons above it — "this card shows from
  // our all completed inquiry total bags transferred with service type."
  // Deliberately ignores `range` entirely: scoped to every real (non-test)
  // booking that actually reached 'completed' — a bag genuinely moved end
  // to end — across all time, so it never changes when the admin clicks
  // Today/This Week/etc. for the rest of the dashboard.
  //
  // Label normalization: bookings.service_type/service_label come from two
  // different creation paths that were never unified (see lib/
  // service-type.ts's header comment) — admin-created quotes store a
  // directional pair ('doorstep-to-airport'), the public booking form
  // stores a non-directional category id from lib/constants.ts SERVICE_
  // TYPES ('airport-delivery', 'excess-baggage', ...), and some historical
  // rows have a free-typed service_label ("Doorstep to Airport" — no
  // arrow, different casing) that's really the same thing as the mapped
  // "Doorstep → Airport" label. Without normalizing, the exact same real
  // service type fragments into multiple rows (as seen in the founder's
  // screenshot: "Doorstep → Airport", "airport-delivery", and "Doorstep to
  // Airport" all showing up separately). canonicalServiceLabel() below
  // resolves any of these spellings to ONE consistent display label.
  const SERVICE_TYPE_LABELS: Record<string, string> = {
    'doorstep-to-airport':  'Doorstep → Airport',
    'door-to-airport':      'Doorstep → Airport',
    'airport-to-doorstep':  'Airport → Doorstep',
    'airport-to-door':      'Airport → Doorstep',
    'doorstep-to-doorstep': 'Doorstep → Doorstep',
    'door-to-door':         'Doorstep → Doorstep',
    'airport-to-airport':   'Airport → Airport',
    'airport-delivery':     'Airport Delivery',
    'excess-baggage':       'Excess Baggage',
    'destination-weddings': 'Destination Weddings',
    'corporate-travel':     'Corporate Travel',
    'student-relocation':   'Student Relocation',
  }
  const normalizeServiceKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '-')
  const titleCaseFallback = (s: string) =>
    s.split(/[-_\s]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
  function canonicalServiceLabel(rawLabel: string | null, rawType: string | null): string {
    for (const candidate of [rawLabel, rawType]) {
      if (!candidate || !candidate.trim()) continue
      const mapped = SERVICE_TYPE_LABELS[normalizeServiceKey(candidate)]
      if (mapped) return mapped
    }
    const first = (rawLabel && rawLabel.trim()) || (rawType && rawType.trim()) || null
    if (!first) return 'Unspecified'
    // Already looks like a proper display label (has an arrow, or mixed
    // case with spaces) — use as-is rather than re-title-casing it.
    if (/→/.test(first) || /\s/.test(first)) return first
    return titleCaseFallback(first)
  }

  const completedBookings = bookings.filter(b => !b.is_test && b.status === 'completed')
  const serviceTypeMap = new Map<string, { service_label: string; bookings: number; bags: number; revenue: number }>()
  for (const b of completedBookings) {
    const label = canonicalServiceLabel(b.service_label, b.service_type)
    const entry = serviceTypeMap.get(label) ?? { service_label: label, bookings: 0, bags: 0, revenue: 0 }
    entry.bookings += 1
    entry.bags += Number(b.total_bags) || 0
    entry.revenue += revenueForBooking(b)
    serviceTypeMap.set(label, entry)
  }
  const serviceTypes = [...serviceTypeMap.values()].sort((a, b) => b.bags - a.bags)

  // ── Inquiry Source Analytics — Inquiries dated by lead.created_at, Quotes
  // by quote date, Confirmed/Completed/Revenue by the same rules as above,
  // all scoped to the dashboard's selected range on each metric's own date. ─
  const sourceKeys = new Set(leads.map(l => l.source || 'manual'))
  const sources = [...sourceKeys].map(source => {
    const leadsForSource = leads.filter(l => (l.source || 'manual') === source)
    const inquiries = leadsForSource.filter(l => inTs(l.created_at, range)).length
    const quotes = leadsForSource.filter(l => l.quote_number && quoteInRange(l, range)).length
    const confirmedCount = leadsForSource.filter(l => {
      const b = l.booking_id ? bookingsById.get(l.booking_id) : null
      if (!isConfirmed(b, !!l.quote_number)) return false
      const ts = firstReachedTimestamp(b, PAYMENT_RECEIVED_IDX)
      return ts ? inTs(ts, range) : false
    }).length
    const completedCount = leadsForSource.filter(l => {
      const b = l.booking_id ? bookingsById.get(l.booking_id) : null
      if (!b || b.status !== 'completed') return false
      const d = b.completed_month_override || b.pickup_date
      return d ? inDateStr(d, range) : false
    }).length
    const revenueForSource = leadsForSource.reduce((s, l) => {
      const b = l.booking_id ? bookingsById.get(l.booking_id) : null
      if (!b || b.is_test) return s
      // Real ledger payment date if one exists; otherwise (a booking paid
      // via Mark Payment Received / VIP approval with no logged payments
      // row — the same "synthetic" case the Revenue formula above handles)
      // fall back to the same completed_month_override ?? pickup_date ??
      // created_at proxy, so a source's revenue total isn't silently
      // missing its VIP-approved bookings.
      const d = earliestPaidDateByBooking.get(b.id)
        ?? (b.payment_status === 'paid' ? (b.completed_month_override || b.pickup_date || b.created_at?.slice(0, 10) || null) : null)
      if (!d || !inDateStr(d, range)) return s
      return s + revenueForBooking(b)
    }, 0)
    return {
      source,
      label: resolveSource(source).label,
      inquiries, quotes,
      confirmed: confirmedCount,
      completed: completedCount,
      revenue: revenueForSource,
    }
  }).sort((a, b) => b.inquiries - a.inquiries)

  return {
    range: { preset: range.preset, from: range.fromStr, to: range.toStr },
    business_overview: {
      total_inquiries: totalInquiries,
      quotes_sent: quotesSent,
      confirmed_bookings: confirmedBookingsInRange.length,
      payments_received_count: paymentsReceivedCount,
      payments_received_amount: paymentsReceivedAmount,
      outstanding_amount: outstandingAmount,
      revenue,
    },
    funnel: {
      stages: {
        total_inquiries: totalInquiries,
        quotes_generated: quotesGenerated,
        quotes_sent: quotesSent,
        accepted,
        payment_received: paymentReceivedStage,
        confirmed: confirmedBookingsInRange.length,
        completed: completedInRange.length,
      },
      status_counts: statusCounts,
    },
    revenue_collection: {
      revenue,
      payments_received_amount: paymentsReceivedAmount,
      payments_received_count: paymentsReceivedCount,
      outstanding: outstandingAmount,
      pending_verification: pendingVerificationAmount,
      refunds: refundsAmount,
      net_revenue: revenue - refundsAmount,
    },
    logistics,
    trip_profitability: tripProfitability,
    service_types: serviceTypes,
    sources,
    debug: {
      leads_fetched: leads.length,
      bookings_fetched: bookings.length,
      payments_fetched: payments.length,
      trip_sheets_fetched: tripSheets.length,
      group_bags_fetched: groupBags.length,
      is_test_supported: isTestSupported,
      completed_override_supported: completedOverrideSupported,
    },
  }
}

export { SOURCE_LABELS }
