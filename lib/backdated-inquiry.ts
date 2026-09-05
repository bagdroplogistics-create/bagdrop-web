// BAGDROP — Backdated Inquiry creation (founder request, 2026-09-05)
//
// Lets an admin manually record ONE inquiry that genuinely happened in a
// PAST month (e.g. an August inquiry the admin is only now getting around
// to entering, even though today is in September) — as its OWN, fully
// independent creation path, deliberately kept 100% separate from the
// normal POST /api/admin/leads flow (app/api/admin/leads/route.ts /
// nextInquiryNumberPair()) so nothing about how a normal, current-month
// inquiry is created/numbered/notified is touched by this file at all.
//
// ── Why this can't just call nextInquiryNumberPair() ──────────────────
// lib/number-series.ts's next_series_number() is a single counter per
// (series, year) — NOT per month. It always hands out "whatever's next"
// relative to real time, in strict creation order; it has no concept of
// "the next number after August" once September has already started
// minting. So "continue the August sequence" can only mean one specific
// thing: find the highest lead_number actually used by a real August
// inquiry, and manually claim the very next number as a literal string —
// WITHOUT ever calling next_series_number() (which would just hand back
// whatever September is currently at, not August+1) and WITHOUT touching
// bagdrop_number_counters at all (so the live September counter is left
// exactly where real September inquiries are already using it).
//
// ── Why this can genuinely fail ─────────────────────────────────────────
// If ANY inquiry has already been created after August's last one (which,
// realistically, is true the moment September starts) then "August's last
// number + 1" is ALREADY a real, permanently-issued September number —
// there is no free slot sitting between the two months waiting to be
// claimed. This module detects that collision and refuses cleanly with the
// specific conflicting record named, rather than silently reusing a number
// (which would corrupt two different records sharing one tracking ID) or
// silently picking some other, unrelated free number (which would not
// actually "continue the August sequence" the way the request means it).
import { supabaseAdmin } from './supabase'
import { TITLE_OPTIONS, DEFAULT_TITLE, type TitleId } from './constants'
import { parseStoredPhone } from './phone-format'

export interface BackdatedInquiryInput {
  inquiry_date: string // "YYYY-MM-DD" — the real (past) date this inquiry happened
  title?: string
  name: string
  phone: string
  phone_country_code?: string
  phone_national?: string
  email?: string
  source?: string
  service_interest?: string
  service_type?: string
  from_city?: string
  to_city?: string
  pickup_address?: string
  drop_address?: string
  travel_date?: string
  pickup_date?: string
  delivery_date?: string
  pickup_time?: string
  bags_count?: number | string
  pnr?: string
  flight_number?: string
  flight_time?: string
  flight_ticket_url?: string
  notes?: string
}

export interface BackdatedInquiryConflict {
  conflict: true
  message: string
  attempted_number: string
  conflicting_record: { type: 'lead' | 'booking'; id: string; number: string; customer_name: string | null; created_at: string }
}

export interface BackdatedInquiryResult {
  conflict?: false
  lead: Record<string, unknown>
  lead_number: string
  tracking_id: string
}

const needsFlight = (service: string | null | undefined) => [
  'airport-to-door', 'door-to-airport', 'airport-to-doorstep', 'doorstep-to-airport',
].includes(service ?? '')

const serviceLabelMap: Record<string, string> = {
  'airport-to-doorstep':  'Airport → Doorstep',
  'airport-to-door':      'Airport → Doorstep',
  'doorstep-to-airport':  'Doorstep → Airport',
  'door-to-airport':      'Doorstep → Airport',
  'doorstep-to-doorstep': 'Doorstep → Doorstep',
  'airport-to-airport':   'Airport → Airport',
}

function nullDate(v: unknown): string | null {
  return (typeof v === 'string' ? v.trim() : '') || null
}

/**
 * Finds the next lead_number/tracking_id that would continue the inquiry
 * sequence for the calendar month `inquiry_date` falls in, by locating the
 * most-recently-created real lead in that month and incrementing its
 * numeric suffix by one. Returns a conflict (never throws, never mutates
 * anything) if that exact number already belongs to a real record —
 * almost certainly a genuine, already-created inquiry from the following
 * month, per this file's module comment.
 */
type NumberResult =
  | { kind: 'ok'; leadNumber: string; trackingId: string }
  | { kind: 'error'; error: string }
  | { kind: 'conflict'; conflict: BackdatedInquiryConflict }

async function computeNextNumberForMonth(inquiryDate: Date): Promise<NumberResult> {
  const year  = inquiryDate.getFullYear()
  const month = inquiryDate.getMonth()
  const monthStart = new Date(year, month, 1).toISOString()
  const monthEnd   = new Date(year, month + 1, 1).toISOString()
  const monthLabel = inquiryDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  const { data: lastOfMonth, error: lookupErr } = await supabaseAdmin
    .from('leads')
    .select('lead_number, created_at')
    .gte('created_at', monthStart)
    .lt('created_at', monthEnd)
    .not('lead_number', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lookupErr) return { kind: 'error', error: `Could not look up ${monthLabel}'s inquiries: ${lookupErr.message}` }
  if (!lastOfMonth?.lead_number) {
    return { kind: 'error', error: `No existing inquiries found in ${monthLabel} to continue the sequence from. This tool only continues an existing month's numbering — it can't start a brand-new sequence.` }
  }

  const match = (lastOfMonth.lead_number as string).match(/^BDL-(\d{4})-(\d+)$/)
  if (!match) {
    return { kind: 'error', error: `${monthLabel}'s last inquiry has an unexpected lead_number format ("${lastOfMonth.lead_number}") — can't safely compute the next number from it.` }
  }
  const [, seriesYear, digits] = match
  const nextSeq = parseInt(digits, 10) + 1
  const width   = digits.length
  const seqStr  = String(nextSeq).padStart(width, '0')
  const leadNumber   = `BDL-${seriesYear}-${seqStr}`
  const trackingId   = `BDA-${seriesYear}-${seqStr}`

  // Collision check — see module comment for why this is the realistic
  // outcome once any inquiry exists after the target month.
  const [{ data: leadConflict }, { data: bookingConflict }] = await Promise.all([
    supabaseAdmin.from('leads').select('id, lead_number, name, created_at').eq('lead_number', leadNumber).maybeSingle(),
    supabaseAdmin.from('bookings').select('id, tracking_id, customer_name, created_at').eq('tracking_id', trackingId).maybeSingle(),
  ])

  if (leadConflict) {
    return {
      kind: 'conflict',
      conflict: {
        conflict: true,
        message: `${leadNumber} is already in use — it can't be reused for this backdated ${monthLabel} inquiry. This means at least one inquiry has already been created since ${monthLabel} ended, so there's no free number left between ${monthLabel}'s last inquiry and today's sequence.`,
        attempted_number: leadNumber,
        conflicting_record: { type: 'lead', id: leadConflict.id as string, number: leadConflict.lead_number as string, customer_name: leadConflict.name as string | null, created_at: leadConflict.created_at as string },
      },
    }
  }
  if (bookingConflict) {
    return {
      kind: 'conflict',
      conflict: {
        conflict: true,
        message: `${trackingId} is already in use — it can't be reused for this backdated ${monthLabel} inquiry. This means at least one inquiry has already been created since ${monthLabel} ended, so there's no free number left between ${monthLabel}'s last inquiry and today's sequence.`,
        attempted_number: trackingId,
        conflicting_record: { type: 'booking', id: bookingConflict.id as string, number: bookingConflict.tracking_id as string, customer_name: bookingConflict.customer_name as string | null, created_at: bookingConflict.created_at as string },
      },
    }
  }

  return { kind: 'ok', leadNumber, trackingId }
}

export async function createBackdatedInquiry(
  body: BackdatedInquiryInput
): Promise<{ status: number; body: BackdatedInquiryResult | BackdatedInquiryConflict | { error: string } }> {
  if (!body?.name?.trim() || !body?.phone?.trim()) {
    return { status: 400, body: { error: 'name and phone are required' } }
  }
  if (!body?.inquiry_date?.trim()) {
    return { status: 400, body: { error: 'inquiry_date is required (the real, past date this inquiry happened)' } }
  }

  // Noon on the given date — same "avoid midnight-boundary timezone drift"
  // convention already used for payment_date elsewhere in this codebase
  // (see app/api/admin/payments/route.ts).
  const inquiryDate = new Date(body.inquiry_date.trim() + 'T12:00:00')
  if (isNaN(inquiryDate.getTime())) {
    return { status: 400, body: { error: `Invalid inquiry_date "${body.inquiry_date}"` } }
  }
  if (inquiryDate.getTime() > Date.now()) {
    return { status: 400, body: { error: 'inquiry_date is in the future — this tool is only for backdating a genuinely past inquiry.' } }
  }
  const backdatedIso = inquiryDate.toISOString()

  const numberResult = await computeNextNumberForMonth(inquiryDate)
  if (numberResult.kind === 'conflict') return { status: 409, body: numberResult.conflict }
  if (numberResult.kind === 'error')    return { status: 422, body: { error: numberResult.error } }
  const { leadNumber, trackingId } = numberResult

  const bodyTitle: TitleId = TITLE_OPTIONS.includes(body.title as never) ? (body.title as TitleId) : DEFAULT_TITLE
  const normPhone = body.phone.trim().startsWith('+')
    ? body.phone.trim()
    : (() => {
        const digits = body.phone.replace(/\D/g, '')
        return digits ? '+91' + digits.replace(/^91/, '') : body.phone.trim()
      })()
  const phoneParsed = parseStoredPhone(normPhone)
  const phoneCountryCode = body.phone_country_code || phoneParsed.iso2
  const phoneNational    = body.phone_national     || phoneParsed.nationalNumber
  const serviceVal = (body.service_interest || body.service_type || '').trim() || null
  const flightNeeded = needsFlight(serviceVal)

  const bookingPayload = {
    tracking_id:    trackingId,
    title:          bodyTitle,
    customer_name:  body.name.trim(),
    customer_phone: normPhone,
    customer_phone_country_code: phoneCountryCode,
    customer_phone_national:     phoneNational,
    customer_email: body.email?.trim()?.toLowerCase() || '',
    service_type:   serviceVal || '',
    service_label:  serviceVal ? (serviceLabelMap[serviceVal] ?? serviceVal) : '',
    from_city:      body.from_city?.trim() || '',
    to_city:        body.to_city?.trim() || '',
    pickup_date:    nullDate(body.pickup_date),
    delivery_date:  nullDate(body.delivery_date),
    time_slot:      body.pickup_time?.trim() || null,
    pickup_address: body.pickup_address?.trim() || null,
    drop_address:   body.drop_address?.trim() || null,
    total_bags:     Number(body.bags_count) || 1,
    flight_number:  flightNeeded ? (body.flight_number?.trim() || null) : null,
    notes:          body.notes?.trim() || null,
    status:         'inquiry',
    created_at:     backdatedIso,
    status_history: [{
      from: null, to: 'inquiry', timestamp: backdatedIso, changed_by: 'admin',
      note: `Backdated inquiry — manually recorded ${new Date().toLocaleDateString('en-IN')} for an inquiry dated ${inquiryDate.toLocaleDateString('en-IN')} (${leadNumber})`,
    }],
  }

  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from('bookings').insert(bookingPayload).select('id, tracking_id').single()
  if (bookingErr || !booking) {
    return { status: 500, body: { error: `Could not create the backdated booking record: ${bookingErr?.message ?? 'unknown error'}` } }
  }

  const { data: lead, error: leadErr } = await supabaseAdmin
    .from('leads')
    .insert({
      lead_number: leadNumber,
      title: bodyTitle,
      name:  body.name.trim(),
      phone: normPhone,
      phone_country_code: phoneCountryCode,
      phone_national:     phoneNational,
      email: body.email?.trim()?.toLowerCase() || null,
      source: body.source ?? 'manual',
      service_interest: serviceVal,
      service_type:     serviceVal,
      from_city: body.from_city?.trim() || null,
      to_city:   body.to_city?.trim() || null,
      travel_date:   nullDate(body.travel_date),
      pickup_date:   nullDate(body.pickup_date),
      delivery_date: nullDate(body.delivery_date),
      pickup_time: body.pickup_time?.trim() || null,
      pickup_address: body.pickup_address?.trim() || null,
      drop_address:   body.drop_address?.trim() || null,
      bags_count: Number(body.bags_count) || 1,
      pnr:               flightNeeded ? (body.pnr?.trim() || null) : null,
      flight_number:     flightNeeded ? (body.flight_number?.trim() || null) : null,
      flight_time:       flightNeeded ? nullDate(body.flight_time) : null,
      flight_ticket_url: flightNeeded ? (body.flight_ticket_url?.trim() || null) : null,
      notes: body.notes?.trim() || null,
      status: 'new',
      booking_id: booking.id,
      created_at: backdatedIso,
    })
    .select()
    .single()

  if (leadErr || !lead) {
    // Same rollback discipline as the normal creation path (app/api/admin/
    // leads/route.ts) — a failed lead insert must never leave an orphaned
    // booking permanently holding a real tracking number with nothing
    // pointing to it.
    await supabaseAdmin.from('bookings').delete().eq('id', booking.id)
    return { status: 500, body: { error: `Could not create the backdated lead record (booking rolled back): ${leadErr?.message ?? 'unknown error'}` } }
  }

  // Deliberately NO sendInquiryNotification / sendNewInquiryWhatsApp /
  // sendLeadAcknowledgment here — those all announce "a new inquiry just
  // came in," which would be actively misleading for a record that's
  // actually weeks old. A backdated entry is silent by design.

  return { status: 201, body: { lead, lead_number: leadNumber, tracking_id: trackingId } }
}
