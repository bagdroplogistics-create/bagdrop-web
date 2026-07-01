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
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const limit = parseInt(searchParams.get('limit') ?? '50', 10)
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

  return NextResponse.json({
    leads: data,
    total: count,
    page,
    limit,
  })
}

export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)

  if (!body?.name || !body?.phone) {
    return NextResponse.json(
      { error: 'name and phone are required' },
      { status: 400 }
    )
  }

  const serviceVal =
    (body.service_interest || body.service_type || '').trim() || null

  const nullDate = (v: unknown) =>
    (typeof v === 'string' ? v.trim() : '') || null

  const needsFlight = [
    'airport-to-door',
    'door-to-airport',
    'airport-to-doorstep',
    'doorstep-to-airport',
  ].includes(serviceVal ?? '')

  const rawPhone = body.phone.replace(/\D/g, '')
  const normPhone = rawPhone
    ? '+91' + rawPhone.replace(/^91/, '')
    : body.phone.trim()

  // Generate Lead Number — use max existing to avoid collision when records are deleted
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

  // ── Generate Tracking ID for the linked booking (BDA- prefix = admin/lead origin) ──
  const { data: lastBooking } = await supabaseAdmin
    .from('bookings')
    .select('tracking_id')
    .like('tracking_id', 'BDA-%')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let bookingSeq = 1
  if (lastBooking?.tracking_id) {
    const parts = lastBooking.tracking_id.split('-')
    const last = parseInt(parts[parts.length - 1], 10)
    if (!isNaN(last)) bookingSeq = last + 1
  }
  const trackingId = `BDA-${String(bookingSeq).padStart(4, '0')}`

  const serviceLabelMap: Record<string, string> = {
    'airport-to-doorstep':  'Airport → Doorstep',
    'airport-to-door':      'Airport → Doorstep',
    'doorstep-to-airport':  'Doorstep → Airport',
    'door-to-airport':      'Doorstep → Airport',
    'doorstep-to-doorstep': 'Doorstep → Doorstep',
    'airport-to-airport':   'Airport → Airport',
  }

  // ── Auto-create linked booking so it appears in Dashboard and Bookings tab ──
  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from('bookings')
    .insert({
      tracking_id:    trackingId,
      customer_name:  body.name.trim(),
      customer_phone: normPhone,
      customer_email: body.email?.trim()?.toLowerCase() || null,
      service_type:   serviceVal,
      service_label:  serviceVal ? (serviceLabelMap[serviceVal] ?? serviceVal) : null,
      from_city:      body.from_city?.trim() || null,
      to_city:        body.to_city?.trim() || null,
      pickup_date:    nullDate(body.pickup_date),
      delivery_date:  nullDate(body.delivery_date),
      time_slot:      body.pickup_time?.trim() || null,
      pickup_address: body.pickup_address?.trim() || null,
      drop_address:   body.drop_address?.trim() || null,
      total_bags:     Number(body.bags_count) || 1,
      flight_number:  needsFlight ? (body.flight_number?.trim() || null) : null,
      notes:          body.notes?.trim() || null,
      status:         'inquiry',
      status_history: [{
        from:       null,
        to:         'inquiry',
        timestamp:  new Date().toISOString(),
        changed_by: 'system',
        note:       `Auto-created from lead ${leadNumber}`,
      }],
    })
    .select()
    .single()

  if (bookingErr) {
    console.error('[leads POST] booking insert failed (non-fatal):', bookingErr.message)
  }

  // ── Create Lead and link it to the booking ──
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from('leads')
    .insert({
      lead_number: leadNumber,

      name: body.name.trim(),
      phone: normPhone,
      email: body.email?.trim()?.toLowerCase() || null,

      source: body.source ?? 'admin',

      service_interest: serviceVal,
      service_type: serviceVal,

      from_city: body.from_city?.trim() || null,
      to_city: body.to_city?.trim() || null,

      travel_date: nullDate(body.travel_date),
      pickup_date: nullDate(body.pickup_date),
      delivery_date: nullDate(body.delivery_date),

      pickup_time: body.pickup_time?.trim() || null,

      pickup_address: body.pickup_address?.trim() || null,
      drop_address:   body.drop_address?.trim() || null,

      bags_count: Number(body.bags_count) || 1,

      pnr: needsFlight
        ? body.pnr?.trim() || null
        : null,

      flight_number: needsFlight
        ? body.flight_number?.trim() || null
        : null,

      flight_time: needsFlight
        ? nullDate(body.flight_time)
        : null,

      flight_ticket_url: needsFlight
        ? body.flight_ticket_url?.trim() || null
        : null,

      notes: body.notes?.trim() || null,

      status: 'new',

      // Link to the auto-created booking
      booking_id: booking?.id ?? null,
    })
    .select()
    .single()

  if (leadErr) {
    console.error('[leads POST] lead insert failed:', leadErr.message)
    return NextResponse.json({ error: leadErr.message }, { status: 500 })
  }

  // Back-link booking → lead
  if (booking?.id) {
    await supabaseAdmin
      .from('bookings')
      .update({ lead_id: lead.id })
      .eq('id', booking.id)
  }

  return NextResponse.json(
    { lead, lead_number: leadNumber, tracking_id: trackingId },
    { status: 201 }
  )
}
