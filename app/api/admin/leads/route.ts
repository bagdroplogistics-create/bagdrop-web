import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status')
  const search = searchParams.get('search')
  const page   = parseInt(searchParams.get('page') ?? '1', 10)
  const limit  = parseInt(searchParams.get('limit') ?? '50', 10)
  const offset = (page - 1) * limit

  let query = supabaseAdmin
    .from('leads')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  if (search) {
    query = query.or(
      `name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`
    )
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ leads: data, total: count, page, limit })
}

export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.name || !body?.phone) {
    return NextResponse.json({ error: 'name and phone are required' }, { status: 400 })
  }

  // Normalise service type
  const serviceVal = (body.service_interest || body.service_type || '').trim() || null

  // Helper: empty string → null for date/optional DB columns
  const nullDate = (v: unknown) => (typeof v === 'string' ? v.trim() : '') || null

  // Flight fields only apply to airport-linked service types
  const needsFlight = [
    'airport-to-door', 'door-to-airport',
    'airport-to-doorstep', 'doorstep-to-airport',
  ].includes(serviceVal ?? '')

  // Normalise phone: ensure +91 prefix
  const rawPhone   = body.phone.replace(/\D/g, '')
  const normPhone  = rawPhone ? '+91' + rawPhone.replace(/^91/, '') : body.phone.trim()

  // ── Step 1: Generate lead number BDL-YYYY-NNNN ───────────────────
  const year = new Date().getFullYear()
  const { count: leadCount } = await supabaseAdmin
    .from('leads')
    .select('*', { count: 'exact', head: true })
  const leadSeq    = String((leadCount ?? 0) + 1).padStart(4, '0')
  const leadNumber = `BDL-${year}-${leadSeq}`

  // ── Step 2: Generate tracking ID for the linked booking ──────────
  // Admin-origin bookings use BDA- prefix to distinguish from website bookings (BD-)
  const trackingId = 'BDA-' + Math.random().toString(36).toUpperCase().slice(2, 8)

  const serviceLabelMap: Record<string, string> = {
    'airport-to-doorstep':  'Airport → Doorstep',
    'airport-to-door':      'Airport → Doorstep',
    'doorstep-to-airport':  'Doorstep → Airport',
    'door-to-airport':      'Doorstep → Airport',
    'doorstep-to-doorstep': 'Doorstep → Doorstep',
    'airport-to-airport':   'Airport → Airport',
    'intercity':            'Intercity',
  }
  const serviceLabel = serviceVal ? (serviceLabelMap[serviceVal] ?? serviceVal) : 'Not Specified'

  // ── Step 3: INSERT booking first ─────────────────────────────────
  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from('bookings')
    .insert({
      tracking_id:    trackingId,
      status:         'inquiry',
      customer_name:  body.name.trim(),
      customer_phone: normPhone,
      customer_email: body.email?.trim().toLowerCase() || null,
      service_type:   serviceVal ?? '',
      service_label:  serviceLabel,
      from_city:      body.from_city?.trim() || null,
      to_city:        body.to_city?.trim() || null,
      pickup_date:    nullDate(body.pickup_date),
      time_slot:      body.pickup_time?.trim() || null,
      total_bags:     Number(body.bags_count) || 1,
      total_amount:   0,
      currency:       'INR',
      payment_status: 'pending',
      status_history: [{ status: 'inquiry', timestamp: new Date().toISOString(), note: `Lead #${leadNumber}` }],
    })
    .select()
    .single()

  if (bookingErr || !booking) {
    console.error('[leads POST] booking insert failed:', bookingErr?.message)
    return NextResponse.json({ error: bookingErr?.message ?? 'Failed to create booking' }, { status: 500 })
  }

  // ── Step 4: INSERT lead linked to that booking ────────────────────
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from('leads')
    .insert({
      lead_number:      leadNumber,
      name:             body.name.trim(),
      phone:            normPhone,
      email:            body.email?.trim().toLowerCase() || null,
      source:           body.source ?? 'admin',
      service_interest: serviceVal,
      service_type:     serviceVal,
      from_city:        body.from_city?.trim() || null,
      to_city:          body.to_city?.trim() || null,
      travel_date:      nullDate(body.travel_date),
      pickup_date:      nullDate(body.pickup_date),
      delivery_date:    nullDate(body.delivery_date),
      pickup_time:      body.pickup_time?.trim() || null,
      bags_count:       Number(body.bags_count) || 1,
      pnr:              needsFlight ? (body.pnr?.trim() || null)           : null,
      flight_number:    needsFlight ? (body.flight_number?.trim() || null) : null,
      flight_time:      needsFlight ? nullDate(body.flight_time)           : null,
      notes:            body.notes?.trim() || null,
      status:           'new',
      booking_id:       booking.id,
    })
    .select()
    .single()

  if (leadErr) {
    // Rollback — delete the booking we just created
    await supabaseAdmin.from('bookings').delete().eq('id', booking.id)
    console.error('[leads POST] lead insert failed (booking rolled back):', leadErr.message)
    return NextResponse.json({ error: leadErr.message }, { status: 500 })
  }

  return NextResponse.json(
    { lead, booking, lead_number: leadNumber, tracking_id: trackingId },
    { status: 201 }
  )
}
null,
      flight_time:       needsFlight ? nullDate(body.flight_time) : null,
      flight_ticket_url: needsFlight ? (body.flight_ticket_url?.trim() || null) : null,
    })
    .select()
    .single()

  if (leadErr) {
    // Roll back the booking we just created to avoid orphans
    await supabaseAdmin.from('bookings').delete().eq('id', booking.id)
    console.error('[leads POST] lead insert failed:', leadErr.message)
    return NextResponse.json({ error: 'Failed to create lead: ' + leadErr.message }, { status: 500 })
  }

  return NextResponse.json({ lead, booking, lead_number: leadNumber, tracking_id: trackingId }, { status: 201 })
}
