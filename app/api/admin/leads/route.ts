import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { sendInquiryNotification } from '@/lib/email'

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const status        = searchParams.get('status')
  const excludeStatus = searchParams.get('exclude_status') // booking status to exclude linked leads for
  const search        = searchParams.get('search')
  const page          = parseInt(searchParams.get('page') ?? '1', 10)
  const limit         = parseInt(searchParams.get('limit') ?? '50', 10)
  const offset        = (page - 1) * limit

  // If excluding cancelled: first find all cancelled booking IDs to filter out linked leads
  let excludedBookingIds: string[] | null = null
  if (excludeStatus) {
    const { data: cancelledBookings } = await supabaseAdmin
      .from('bookings')
      .select('id')
      .eq('status', excludeStatus)
    excludedBookingIds = (cancelledBookings ?? []).map(b => b.id)
  }

  let query = supabaseAdmin
    .from('leads')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  // Exclude leads whose linked booking is cancelled
  if (excludedBookingIds && excludedBookingIds.length > 0) {
    query = query.not('booking_id', 'in', `(${excludedBookingIds.join(',')})`)
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

  const serviceLabelMap: Record<string, string> = {
    'airport-to-doorstep':  'Airport → Doorstep',
    'airport-to-door':      'Airport → Doorstep',
    'doorstep-to-airport':  'Doorstep → Airport',
    'door-to-airport':      'Doorstep → Airport',
    'doorstep-to-doorstep': 'Doorstep → Doorstep',
    'airport-to-airport':   'Airport → Airport',
  }

  // ── Duplicate phone guard ─────────────────────────────────────────────────────
  // Prevent creating a duplicate lead for a phone number that already has one.
  // (allow override via body.force_duplicate = true)
  if (!body.force_duplicate) {
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
          error: `A lead already exists for this phone number.`,
          duplicate_lead: {
            id:          dupeLead.id,
            lead_number: dupeLead.lead_number,
            name:        dupeLead.name,
            status:      dupeLead.status,
          },
          code: 'DUPLICATE_PHONE',
        },
        { status: 409 }
      )
    }
  }

  // ── Check for existing website booking for this phone ────────────────────────
  // If a website booking (BD- prefix) already exists for this phone, reuse it
  // instead of creating a duplicate BDA- booking in the dashboard.
  const { data: existingWebBooking } = await supabaseAdmin
    .from('bookings')
    .select('id, tracking_id, status, status_history')
    .eq('customer_phone', normPhone)
    .like('tracking_id', 'BD-%')
    .is('lead_id', null)                          // not yet linked to a lead
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let booking: { id: string; tracking_id: string } | null = null

  if (existingWebBooking) {
    // ── Reuse existing website booking ─────────────────────────────────────────
    // Update it with any new details from the admin form and advance status to inquiry
    const history = existingWebBooking.status_history ?? []
    history.push({
      from:       existingWebBooking.status,
      to:         'inquiry',
      timestamp:  new Date().toISOString(),
      changed_by: 'admin',
      note:       `Linked to admin lead ${leadNumber} — existing website booking reused`,
    })

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('bookings')
      .update({
        customer_name:  body.name.trim(),
        customer_email: body.email?.trim()?.toLowerCase() || null,
        service_type:   serviceVal || null,
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
        status_history: history,
      })
      .eq('id', existingWebBooking.id)
      .select('id, tracking_id')
      .single()

    if (updateErr) {
      console.error('[leads POST] existing booking update failed (non-fatal):', updateErr.message)
    }
    booking = updated ?? { id: existingWebBooking.id, tracking_id: existingWebBooking.tracking_id }
    console.log(`[leads POST] Reused existing website booking ${existingWebBooking.tracking_id} for lead ${leadNumber}`)

  } else {
    // ── No existing booking — create a new BDA- booking ────────────────────────
    // Derive tracking ID from lead number to guarantee uniqueness and cross-referencing:
    // BDL-2026-0001 → BDA-2026-0001
    const trackingId = leadNumber.replace(/^BDL-/, 'BDA-')

    const { data: newBooking, error: bookingErr } = await supabaseAdmin
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
      .select('id, tracking_id')
      .single()

    if (bookingErr) {
      console.error('[leads POST] booking insert failed (non-fatal):', bookingErr.message)
    }
    booking = newBooking ?? null
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

  // ── Send inquiry notification email (fire-and-forget, non-blocking) ──
  Promise.allSettled([
    sendInquiryNotification({
      inquiryNumber:   leadNumber,
      source:          body.source ?? 'admin',
      customerName:    lead.name,
      customerPhone:   lead.phone,
      customerEmail:   lead.email,
      serviceType:     lead.service_interest,
      fromCity:        lead.from_city,
      to