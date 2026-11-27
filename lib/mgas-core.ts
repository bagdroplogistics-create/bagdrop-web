// BAGDROP — lib/mgas-core.ts
//
// PURE logic for the MGAS baggage-code request workflow (no database, no
// network, no env access) so eligibility, scheduling, batching and code
// parsing can be unit-tested in isolation. DB + sending live in lib/mgas.ts.
//
// Terminal is NOT a structured column on `bookings`. It is read from:
//   1. the from_city label ("Mumbai Airport (T2)" / "Mumbai Airport T2") —
//      treated as STRUCTURED, auto-eligible;
//   2. free text in pickup_address ("Mumbai T2 Terminal") with from_city just
//      "Mumbai" — NEVER auto-trusted: goes to an admin review queue and is only
//      eligible after an admin explicitly approves it.
// Arrival date = bookings.pickup_date (the airport pickup day of an
// Airport -> Doorstep booking), per founder decision 2026-11-27.

import { ACTIVE_BOOKING_STATUSES } from './booking-status'
import { citiesEqual } from './city-normalize'
import { formatCustomerName } from './constants'
import { createHash } from 'crypto'

/** Number of CALENDAR days before arrival that the request is due. */
export const MGAS_LEAD_DAYS = 2
/** Max characters of the single template variable per WhatsApp message (Meta limit is 1024; keep headroom). */
export const MGAS_MAX_VARIABLE_CHARS = 900

/** "Confirmed" = the app-wide definition (Payment Received … before Completed), minus statuses past the airport hand-over. */
export const MGAS_CONFIRMED_STATUSES: string[] =
  ACTIVE_BOOKING_STATUSES.filter(s => s !== 'delivered' && s !== 'trip_created')

export interface MgasBooking {
  id: string
  tracking_id: string
  status: string
  title: string | null
  customer_name: string | null
  customer_phone: string | null
  from_city: string | null
  to_city: string | null
  pickup_address: string | null
  pickup_date: string | null
  flight_number: string | null
  flight_datetime: string | null
  total_bags: number | null
  service_type: string | null
  service_label: string | null
  is_test?: boolean | null
}

export type Eligibility =
  | { state: 'eligible' }
  | { state: 'review'; reason: string }     // might be T2 arrival; admin must approve
  | { state: 'excluded'; reason: string }   // never shown / never sent

const ARRIVAL_SERVICES = ['airport-to-doorstep', 'airport-to-door']
const DEPARTURE_SERVICES = ['doorstep-to-airport', 'door-to-airport']

function serviceKind(b: Pick<MgasBooking, 'service_type' | 'service_label'>): 'arrival' | 'departure' | 'other' {
  const t = (b.service_type ?? '').toLowerCase().trim().replace(/_/g, '-')
  if (ARRIVAL_SERVICES.includes(t)) return 'arrival'
  if (DEPARTURE_SERVICES.includes(t)) return 'departure'
  if (t) return 'other'
  const l = (b.service_label ?? '').toLowerCase()
  if (/airport\s*(→|->|to)\s*door/.test(l)) return 'arrival'
  if (/door\w*\s*(→|->|to)\s*airport/.test(l)) return 'departure'
  return 'other'
}

const T2_LABEL = /^mumbai\s+airport\s*\(?\s*(t2|terminal\s*2)\s*\)?$/
const T1_LABEL = /(\bt[\s-]?1\b|terminal[\s-]*(no\.?\s*)?(1|i|one)\b)/i
// Matches T2, T-2, Terminal 2, Terminal-2, Terminal No. 2, Terminal II, Terminal Two, including inside
// "Chhatrapati Shivaji Maharaj International Airport Terminal 2" (CSMIA).
const T2_TEXT = /(\bt[\s-]?2\b|terminal[\s-]*(no\.?\s*)?(2|ii|two)\b)/i

export function normalizeLabel(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Strict, deterministic eligibility. Same function runs in the UI list AND immediately before every send. */
export function classifyEligibility(b: MgasBooking): Eligibility {
  if (b.is_test) return { state: 'excluded', reason: 'Test booking' }
  if (!MGAS_CONFIRMED_STATUSES.includes(b.status)) return { state: 'excluded', reason: 'Not a confirmed booking' }

  const kind = serviceKind(b)
  if (kind === 'departure') return { state: 'excluded', reason: 'Departure booking' }
  if (kind !== 'arrival') return { state: 'excluded', reason: 'Not an airport arrival service' }

  if (!citiesEqual(b.from_city, 'mumbai')) return { state: 'excluded', reason: 'Arrival airport is not Mumbai' }

  const from = normalizeLabel(b.from_city)
  const addr = b.pickup_address ?? ''
  const t2 = T2_LABEL.test(from) || T2_TEXT.test(from) || T2_TEXT.test(addr)
  const t1 = T1_LABEL.test(from) || T1_LABEL.test(addr.toLowerCase())

  // Bagdrop always writes "Mumbai T2 Terminal" into the pickup address of
  // Mumbai-origin bookings, so that text IS the T2 signal (founder 2026-11-27).
  if (t1 && t2) return { state: 'review', reason: 'Both T1 and T2 mentioned' }
  if (t1) return { state: 'excluded', reason: 'Mumbai Terminal 1 (not T2)' }
  if (!t2) return { state: 'review', reason: 'Terminal not specified' }

  if (!b.pickup_date || !/^\d{4}-\d{2}-\d{2}$/.test(b.pickup_date)) return { state: 'review', reason: 'Arrival date missing' }
  if (!b.total_bags || b.total_bags < 1) return { state: 'review', reason: 'Number of bags missing' }
  return { state: 'eligible' }
}

/** Review-queue bookings can still need arrival/bag data even after approval — returns a blocking reason or null. */
export function dataBlocker(b: MgasBooking): string | null {
  if (!b.pickup_date || !/^\d{4}-\d{2}-\d{2}$/.test(b.pickup_date)) return 'Arrival date missing'
  if (!b.total_bags || b.total_bags < 1) return 'Number of bags missing'
  return null
}

// ── Dates (all calendar-date arithmetic, Asia/Kolkata "today") ─────────────

export function istDateStr(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now) // YYYY-MM-DD
}

export function addDays(date: string, n: number): string {
  const t = new Date(`${date}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

/** Calendar date on which the request is due: arrival date minus 2 calendar days. */
export function requestDueDate(arrivalDate: string): string {
  return addDays(arrivalDate, -MGAS_LEAD_DAYS)
}

export type DueState = 'future' | 'due_today' | 'late' | 'past_arrival'

/** Where `today` sits relative to a booking's request schedule. */
export function dueState(arrivalDate: string, today: string): DueState {
  const due = requestDueDate(arrivalDate)
  if (arrivalDate < today) return 'past_arrival'
  if (due > today) return 'future'
  if (due === today) return 'due_today'
  return 'late' // due date already passed but the flight has not arrived yet
}

export function fmtDate(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

// ── Message building ───────────────────────────────────────────────────────

export function customerDisplayName(b: Pick<MgasBooking, 'title' | 'customer_name'>): string {
  return formatCustomerName(b.title, b.customer_name) || b.customer_name || 'Customer'
}

function cleanText(s: string): string {
  return s.replace(/[\r\n\t|]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

export function buildBookingLine(index: number, b: MgasBooking): string {
  const bags = b.total_bags ?? 0
  return cleanText(`${index}. ${customerDisplayName(b)} - ${b.tracking_id} - ${bags} bag${bags === 1 ? '' : 's'} - Arrival ${fmtDate(b.pickup_date as string)}`)
}

export interface MgasBatch { bookings: MgasBooking[]; text: string }

/** Sort deterministically (arrival date, then booking id) and split into batches that fit the template-variable limit. Never drops or duplicates a booking. */
export function buildBatches(bookings: MgasBooking[], maxChars: number = MGAS_MAX_VARIABLE_CHARS): MgasBatch[] {
  const sorted = [...bookings].sort((a, b) =>
    (a.pickup_date ?? '').localeCompare(b.pickup_date ?? '') || a.tracking_id.localeCompare(b.tracking_id))
  const batches: MgasBatch[] = []
  let cur: MgasBooking[] = []
  let lines: string[] = []
  const SEP = ' • '
  const flush = () => { if (cur.length) { batches.push({ bookings: cur, text: lines.join(SEP) }); cur = []; lines = [] } }
  for (const b of sorted) {
    const line = buildBookingLine(cur.length + 1, b)
    const projected = [...lines, line].join(SEP).length
    if (cur.length > 0 && projected > maxChars) {
      flush()
      const first = buildBookingLine(1, b)
      cur.push(b); lines.push(first)
    } else {
      cur.push(b); lines.push(line)
    }
  }
  flush()
  return batches
}

/** Idempotency key for one batch: same trigger + same IST day + same booking set => same key. */
export function batchKey(trigger: string, istDay: string, bookingIds: string[]): string {
  const h = createHash('sha1').update([...bookingIds].sort().join(',')).digest('hex').slice(0, 16)
  return `${trigger}:${istDay}:${h}`
}

/** "95032 50997" / "+91 95032-50997" / "09503250997" -> "+919503250997". null if not a valid Indian mobile. */
export function normalizeIndianMobile(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  const ten = digits.length === 10 ? digits : digits.length === 11 && digits.startsWith('0') ? digits.slice(1)
    : digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : null
  return ten && /^[6-9]\d{9}$/.test(ten) ? `+91${ten}` : null
}

// ── MGAS code parsing (never invents codes — only expands what admin typed) ──

export interface ParsedCodes { codes: string[]; count: number | null; error?: string }

/** "MG338 to MG340" -> [MG338,MG339,MG340]; "MG338, MG340" -> 2 codes; "MG338-MG340" also accepted. */
export function parseMgasCodes(input: string): ParsedCodes {
  const text = (input ?? '').trim()
  if (!text) return { codes: [], count: null, error: 'No codes entered' }
  const codes: string[] = []
  const range = /([A-Za-z]+)\s*(\d+)\s*(?:to|-|–|—)\s*(?:[A-Za-z]+)?\s*(\d+)/gi
  let rest = text
  let m: RegExpExecArray | null
  while ((m = range.exec(text)) !== null) {
    const prefix = m[1].toUpperCase(); const a = Number(m[2]); const b = Number(m[3]); const width = m[2].length
    if (b < a) return { codes: [], count: null, error: `Range "${m[0]}" is reversed` }
    if (b - a > 200) return { codes: [], count: null, error: `Range "${m[0]}" is too large` }
    for (let n = a; n <= b; n++) codes.push(prefix + String(n).padStart(width, '0'))
    rest = rest.replace(m[0], ' ')
  }
  for (const tok of rest.split(/[\s,;]+/).filter(Boolean)) {
    if (/^[A-Za-z]+\d+$/.test(tok)) codes.push(tok.toUpperCase())
    else if (!/^(to|and|&)$/i.test(tok)) return { codes: [], count: null, error: `Cannot read "${tok}" as a code` }
  }
  const unique = Array.from(new Set(codes))
  if (unique.length !== codes.length) return { codes: unique, count: unique.length, error: 'Duplicate codes in entry' }
  return { codes: unique, count: unique.length }
}

// ── Scheduling decision (pure; used by the daily cron AND the simulator) ────

export type PlanAction = 'send' | 'wait' | 'review' | 'late_review' | 'exclude'
export interface Plan { action: PlanAction; reason: string; arrivalDate: string | null; requestDate: string | null }

/**
 * What should happen to this booking on IST day `today`?
 *  send         -> due exactly today (arrival - 2 calendar days)
 *  wait         -> due date is still in the future
 *  late_review  -> due date already passed but arrival not yet: NEVER auto-sent, admin decides
 *  review       -> eligibility unclear and not yet approved by an admin
 *  exclude      -> never eligible (departure, T1, other airport, cancelled, past arrival ...)
 * `approvedReview` = an admin approved this booking's terminal/data in the review queue.
 */
export function planBooking(b: MgasBooking, today: string, approvedReview = false): Plan {
  const e = classifyEligibility(b)
  const arrival = b.pickup_date && /^\d{4}-\d{2}-\d{2}$/.test(b.pickup_date) ? b.pickup_date : null
  const reqDate = arrival ? requestDueDate(arrival) : null
  const out = (action: PlanAction, reason: string): Plan => ({ action, reason, arrivalDate: arrival, requestDate: reqDate })
  if (e.state === 'excluded') return out('exclude', e.reason)
  if (e.state === 'review' && !approvedReview) return out('review', e.reason)
  const blocker = dataBlocker(b)
  if (blocker) return out('review', blocker)
  const st = dueState(arrival as string, today)
  if (st === 'past_arrival') return out('exclude', 'Arrival date has passed')
  if (st === 'late') return out('late_review', `Request date ${requestDueDate(arrival as string)} already passed — confirm manually`)
  if (st === 'due_today') return out('send', 'Due today')
  return out('wait', `Due ${requestDueDate(arrival as string)}`)
}

/** Builds the dry-run / real message body for the template variable list. */
export function buildMessage(bookings: MgasBooking[]): MgasBatch[] { return buildBatches(bookings) }
