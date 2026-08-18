import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireSkybirdAuth, SKYBIRD_SOURCE, SKYBIRD_PARTNER_NAME } from '@/lib/skybird-auth'
import { sendInquiryNotification } from '@/lib/email'
import { sendNewInquiryWhatsApp } from '@/lib/new-inquiry-notification'
import { sendLeadAcknowledgment } from '@/lib/lead-acknowledgment'
import { parseStoredPhone } from '@/lib/phone-format'
import { TITLE_OPTIONS, DEFAULT_TITLE, type TitleId } from '@/lib/constants'
import { nextTrackingId, nextLeadNumber } from '@/lib/number-series'

// ============================================================================
// SKYBIRD PARTNER DASHBOARD — scoped leads API
// ============================================================================
// Intentionally a SEPARATE route from /api/admin/leads (not a shared handler)
// so that changes here can never regress the existing, already-working
// BagDrop Admin leads flow. Business logic (lead numbering, booking
// auto-creation, notification sending) mirrors /api/admin/leads/route.ts —
// keep the two in sync if the shared creation flow changes.
//
// Every inquiry created here is force-tagged server-side with
// source='skybird' and partner_name='Skybird USA', regardless of what the
// client sends — Skybird agents can never spoof or see these fields.
// Every read here is scoped to source='skybird' only — a Skybird agent can
// never see another partner's or BagDrop's own direct inquiries.
// ============================================================================

// Explicit row shape for the leads SELECT below. supabaseAdmin (lib/supabase.ts)
// is created without a `Database` generic, so supabase-js falls back to
// parsing the raw select-string at the TYPE level to infer the row shape —
// a fragile mechanism (breaks on string concatenation, hoisting into a
// variable, etc. — see prior commits on this file) that isn't worth fighting.
// Casting explicitly to this interface sidesteps it entirely.
interface SkybirdLeadRow {
  id: string
  lead_number: string | null
  title: string | null
  name: string
  phone: string
  email: string | null
  service_interest: string | null
  service_type: string | null
  from_city: string | null
  to_city: string | null
  travel_date: string | null
  pickup_date: string | null
  delivery_date: string | null
  pickup_time: string | null
  bags_count: number
  pnr: string | null
  flight_number: string | null
  flight_time: string | null
  pickup_address: string | null
  drop_address: string | null
  status: string
  notes: string | null
  created_at: string
  booking_id: string | null
  zoho_estimate_number: string | null
  quote_discount_pct: number | null
  quote_discount_amt: number | null
}

export async function GET(req: NextRequest) {
  if (!requireSkybirdAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const status  = searchParams.get('status')
  const search  = searchParams.get('search')
  const page    = parseInt(searchParams.get('page') ?? '1', 10)
  const limit   = parseInt(searchParams.get('limit') ?? '50', 10)
  const offset  = (page - 1) * limit

  // Deliberately narrow select — no internal-only fields. Note: does NOT use
  // a PostgREST nested embed for the linked booking (e.g. `bookings(...)`)
  // — that requires PostgREST to resolve the leads→bookings FK relationship
  // at query time, which errors the ENTIRE query if the relationship isn't
  // in its schema cache (a way this list silently came back empty before).
  // Instead, booking info is fetched separately below and merged manually —
  // matching how other admin routes in this codebase already do this
  // (see /api/admin/leads GET's separate `bookings` lookup for exclude_status).
  // Result is cast to SkybirdLeadRow (defined above) rather than relying on
  // supabase-js's select-string type inference — see that interface's
  // comment for why.

  let query = supabaseAdmin
    .from('leads')
    .select(
      'id, lead_number, title, name, phone, email, service_interest, service_type, from_city, to_city, travel_date, pickup_date, delivery_date, pickup_time, bags_count, pnr, flight_number, flight_time, pickup_address, drop_address, status, notes, created_at, booking_id, zoho_estimate_number, quote_discount_pct, quote_discount_amt',
      { count: 'exact' }
    )
    .eq('source', SKYBIRD_SOURCE)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }
  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`)
  }

  let { data, error, count } = await query

  // Defensive fallback if deleted_at column isn't present yet (matches the
  // same fallback pattern used in /api/admin/leads/route.ts).
  if (error && error.message?.includes('deleted_at')) {
    let fallback = supabaseAdmin
      .from('leads')
      .select(
        'id, lead_number, title, name, phone, email, service_interest, service_type, from_city, to_city, travel_date, pickup_date, delivery_date, pickup_time, bags_count, pnr, flight_number, flight_time, pickup_address, drop_address, status, notes, created_at, booking_id, zoho_estimate_number, quote_discount_pct, quote_discount_amt',
        { count: 'exact' }
      )
      .eq('source', SKYBIRD_SOURCE)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (status && status !== 'all') fallback = fallback.eq('status', status)
    if (search) fallback = fallback.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`)
    const { data: fd, error: fe, count: fc } = await fallback
    if (fe) return NextResponse.json({ error: fe.message }, { status: 500 })
    data = fd; count = fc; error = null
  }

  if (error) {
    console.error('[skybird/leads GET] query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Explicit cast — see SkybirdLeadRow's comment above for why this
  // doesn't rely on supabase-js's select-string type inference.
  const leadRows = (data ?? []) as unknown as SkybirdLeadRow[]

  // ── Attach linked booking info (tracking ID, status, amount) ──────────
  // Fetched separately (not embedded) — see note above.
  const bookingIds = leadRows.map(l => l.booking_id).filter((id): id is string => !!id)
  let bookingsById: Record<string, { tracking_id: string; status: string; total_amount: number | null; payment_status: string | null }> = {}
  if (bookingIds.length > 0) {
    const { data: bookingRows, error: bookingsErr } = await supabaseAdmin
      .from('bookings')
      .select('id, tracking_id, status, total_amount, payment_status')
      .in('id', bookingIds)
    if (bookingsErr) {
      console.error('[skybird/leads GET] booking lookup failed (non-fatal):', bookingsErr.message)
    } else {
      bookingsById = Object.fromEntries(
        (bookingRows ?? []).map(b => [b.id, {
          tracking_id: b.tracking_id, status: b.status,
          total_amount: b.total_amount, payment_status: b.payment_status,
        }])
      )
    }
  }

  const leadsWithBooking = leadRows.map(l => ({
    ...l,
    bookings: l.booking_id ? (bookingsById[l.booking_id] ?? null) : null,
  }))

  return NextResponse.json({ leads: leadsWithBooking, total: count, page, limit })
}

export async function POST(req: NextRequest) {
  if (!requireSkybirdAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)

  if (!body?.name || !body?.phone) {
    return NextResponse.json({ error: 'name and phone are required' }, { status: 400 })
  }

  const bodyTitle: TitleId = TITLE_OPTIONS.includes(body.title) ? body.title : DEFAULT_TITLE

  const serviceVal = (body.service_interest || body.service_type || '').trim() || null
  const nullDate = (v: unknown) => (typeof v === 'string' ? v.trim() : '') || null
  const needsFlight = [
    'airport-to-door', 'door-to-airport', 'airport-to-doorstep', 'doorstep-to-airport',
  ].includes(serviceVal ?? '')

  // Phone must come in already as a full international number (e.g.
  // "+14155550100") from the Skybird dashboard's PhoneInput — no country
  // guessing here since Skybird's whole purpose is NRI/international
  // customers.
  const normPhone = (body.phone as string).trim()
  if (!normPhone.startsWith('+')) {
    return NextResponse.json(
      { error: 'phone must be a full international number, e.g. +14155550100' },
      { status: 400 }
    )
  }

  const phoneParsed = parseStoredPhone(normPhone)
  const phoneCountryCode = body.phone_country_code || phoneParsed.iso2
  const phoneNational    = body.phone_national     || phoneParsed.nationalNumber

  // Lead number generation — same shared, atomic BDL-YYYY-NNNN sequence
  // used by /api/admin/leads/route.ts (lib/number-series.ts). Was a
  // "SELECT MAX ... +1" query, not safe against two near-simultaneous
  // submissions (same class of bug already fixed in admin/leads/route.ts).
  const leadNumber = await nextLeadNumber()

  const serviceLabelMap: Record<string, string> = {
    'airport-to-doorstep':  'Airport → Doorstep',
    'airport-to-door':      'Airport → Doorstep',
    'doorstep-to-airport':  'Doorstep → Airport',
    'door-to-airport':      'Doorstep → Airport',
    'doorstep-to-doorstep': 'Doorstep → Doorstep',
    'airport-to-airport':   'Airport → Airport',
  }

  // Duplicate phone guard (same as admin route) — force_duplicate not
  // exposed to Skybird agents; if it's a genuine repeat customer, BagDrop
  // admin can merge/review manually.
  const { data: dupeLead } = await supabaseAdmin
    .from('leads')
    .select('id, lead_number, name, status')
    .eq('phone', normPhone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (dupeLead) {
    return NextResponse.json(
      {
        error: 'An inquiry already exists for this phone number.',
        duplicate_lead: {
          id: dupeLead.id, lead_number: dupeLead.lead_number,
          name: dupeLead.name, status: dupeLead.status,
        },
        code: 'DUPLICATE_PHONE',
      },
      { status: 409 }
    )
  }

  // Independently-sequenced atomic BDA- tracking ID (was derived from the
  // lead number by string substitution — the exact bug already root-
  // caused and fixed in /api/admin/leads/route.ts, since a booking is
  // conceptually a different record from its lead and deserves its own
  // number, not a borrowed one).
  const trackingId = await nextTrackingId()

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
    flight_number:  needsFlight ? (body.flight_number?.trim() || null) : null,
    notes:          body.notes?.trim() || null,
    status:         'inquiry',
    partner_name:   SKYBIRD_PARTNER_NAME, // hidden/internal — admin-only visibility
    status_history: [{
      from: null, to: 'inquiry', timestamp: new Date().toISOString(),
      changed_by: 'skybird', note: `Auto-created from Skybird inquiry ${leadNumber}`,
    }],
  }

  const { data: newBooking, error: bookingErr } = await supabaseAdmin
    .from('bookings')
    .insert(bookingPayload)
    .select('id, tracking_id')
    .single()

  let booking: { id: string; tracking_id: string } | null = newBooking ?? null
  if (bookingErr) {
    console.error('[skybird/leads POST] booking insert failed:', bookingErr.message)
    const { data: existingByTracking } = await supabaseAdmin
      .from('bookings').select('id, tracking_id').eq('tracking_id', trackingId).maybeSingle()
    if (existingByTracking) booking = existingByTracking
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

      // Force-tagged, never trusted from the client.
      source:       SKYBIRD_SOURCE,
      partner_name: SKYBIRD_PARTNER_NAME,

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
      pnr:           needsFlight ? body.pnr?.trim() || null : null,
      flight_number: needsFlight ? body.flight_number?.trim() || null : null,
      flight_time:   needsFlight ? nullDate(body.flight_time) : null,
      notes: body.notes?.trim() || null,
      status: 'new',
      booking_id: booking?.id ?? null,
    })
    .select()
    .single()

  if (leadErr) {
    console.error('[skybird/leads POST] lead insert failed:', leadErr.message)
    return NextResponse.json({ error: leadErr.message }, { status: 500 })
  }

  // Same notification pipeline as the admin-created flow — awaited so
  // Vercel doesn't tear the function down mid-send.
  const inquiryData = {
    inquiryNumber: leadNumber,
    source: 'Skybird USA (Partner)',
    customerTitle: lead.title,
    customerName: lead.name, customerPhone: lead.phone, customerEmail: lead.email,
    serviceType: lead.service_interest, fromCity: lead.from_city, toCity: lead.to_city,
    pickupAddress: lead.pickup_address, deliveryAddress: lead.drop_address,
    bagsCount: lead.bags_count, travelDate: lead.travel_date,
    pickupDate: lead.pickup_date, deliveryDate: lead.delivery_date,
    flightNumber: lead.flight_number, pnr: lead.pnr, notes: lead.notes,
    submittedAt: lead.created_at ?? new Date().toISOString(),
  }

  await Promise.allSettled([
    sendInquiryNotification(inquiryData),
    // Internal ops WhatsApp ping — mirrors the admin email above. See
    // lib/new-inquiry-notification.ts.
    sendNewInquiryWhatsApp(inquiryData),
    sendLeadAcknowledgment({ id: lead.id, title: lead.title, name: lead.name, phone: lead.phone, email: lead.email }),
  ]).catch(err => console.error('[skybird/leads POST] notification error:', err))

  return NextResponse.json(
    { lead, lead_number: leadNumber, tracking_id: booking?.tracking_id ?? null },
    { status: 201 }
  )
}
