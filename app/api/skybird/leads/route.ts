import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireSkybirdAuth, SKYBIRD_SOURCE, SKYBIRD_PARTNER_NAME } from '@/lib/skybird-auth'
import { sendInquiryNotification } from '@/lib/email'
import { sendLeadAcknowledgment } from '@/lib/lead-acknowledgment'
import { parseStoredPhone } from '@/lib/phone-format'

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

  let query = supabaseAdmin
    .from('leads')
    .select(
      // Deliberately narrow select — no internal-only fields (assigned_to,
      // internal notes are on the booking, not the lead, but we still keep
      // this explicit rather than `select('*')`).
      'id, lead_number, name, phone, email, service_interest, service_type, ' +
      'from_city, to_city, travel_date, pickup_date, delivery_date, pickup_time, ' +
      'bags_count, pnr, flight_number, flight_time, pickup_address, drop_address, ' +
      'status, notes, created_at, booking_id, zoho_estimate_number, quote_discount_pct, quote_discount_amt, ' +
      'bookings(tracking_id, status, total_amount, payment_status)',
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
        'id, lead_number, name, phone, email, service_interest, service_type, ' +
        'from_city, to_city, travel_date, pickup_date, delivery_date, pickup_time, ' +
        'bags_count, pnr, flight_number, flight_time, pickup_address, drop_address, ' +
        'status, notes, created_at, booking_id, zoho_estimate_number, quote_discount_pct, quote_discount_amt, ' +
        'bookings(tracking_id, status, total_amount, payment_status)',
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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ leads: data, total: count, page, limit })
}

export async function POST(req: NextRequest) {
  if (!requireSkybirdAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)

  if (!body?.name || !body?.phone) {
    return NextResponse.json({ error: 'name and phone are required' }, { status: 400 })
  }

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

  // Lead number generation — same global BDL-YYYY-#### sequence used by
  // /api/admin/leads/route.ts (shared table, must not collide).
  const year = new Date().getFullYear()
  const { data: lastLead } = await supabaseAdmin
    .from('leads')
    .select('lead_number')
    .like('lead_number', `BDL-${year}-%`)
    .order('lead_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  let nextSeq = 1
  if (lastLead?.lead_number) {
    const parts = lastLead.lead_number.split('-')
    const last = parseInt(parts[parts.length - 1], 10)
    if (!isNaN(last)) nextSeq = last + 1
  }
  const leadNumber = `BDL-${year}-${String(nextSeq).padStart(4, '0')}`

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

  const trackingId = leadNumber.replace(/^BDL-/, 'BDA-')

  const bookingPayload = {
    tracking_id:    trackingId,
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
  await Promise.allSettled([
    sendInquiryNotification({
      inquiryNumber: leadNumber,
      source: 'Skybird USA (Partner)',
      customerName: lead.name, customerPhone: lead.phone, customerEmail: lead.email,
      serviceType: lead.service_interest, fromCity: lead.from_city, toCity: lead.to_city,
      pickupAddress: lead.pickup_address, deliveryAddress: lead.drop_address,
      bagsCount: lead.bags_count, travelDate: lead.travel_date,
      pickupDate: lead.pickup_date, deliveryDate: lead.delivery_date,
      flightNumber: lead.flight_number, pnr: lead.pnr, notes: lead.notes,
      submittedAt: lead.created_at ?? new Date().toISOString(),
    }),
    sendLeadAcknowledgment({ id: lead.id, name: lead.name, phone: lead.phone, email: lead.email }),
  ]).catch(err => console.error('[skybird/leads POST] notification error:', err))

  return NextResponse.json(
    { lead, lead_number: leadNumber, tracking_id: booking?.tracking_id ?? null },
    { status: 201 }
  )
}
