import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { sendInquiryNotification } from '@/lib/email'
import { sendLeadAcknowledgment } from '@/lib/lead-acknowledgment'

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const status        = searchParams.get('status')
  const excludeStatus = searchParams.get('exclude_status')
  const search        = searchParams.get('search')
  const deleted       = searchParams.get('deleted') === 'true'
  const page          = parseInt(searchParams.get('page') ?? '1', 10)
  const limit         = parseInt(searchParams.get('limit') ?? '50', 10)
  const offset        = (page - 1) * limit

  // ── Build excluded booking IDs for status filter ─────────────────────────
  let excludedBookingIds: string[] = []
  if (!deleted && excludeStatus) {
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

  if (deleted) {
    // Show only soft-deleted leads (for the "Deleted Leads" view)
    query = query.not('deleted_at', 'is', null)
  } else {
    // Default: exclude soft-deleted leads
    query = query.is('deleted_at', null)
  }

  if (!deleted && status && status !== 'all') {
    query = query.eq('status', status)
  }

  // FIX: PostgreSQL NULL trap — `NOT IN (...)` also excludes rows where booking_id IS NULL.
  // Use `or(booking_id.is.null,booking_id.not.in.(...))` to keep null-booking-id leads visible.
  if (excludedBookingIds.length > 0) {
    query = query.or(
      `booking_id.is.null,booking_id.not.in.(${excludedBookingIds.join(',')})`
    )
  }

  if (search) {
    query = query.or(
      `name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`
    )
  }

  let { data, error, count } = await query

  // ── Defensive fallback: deleted_at column may not exist yet (migration not run) ──
  // If the query fails because deleted_at doesn't exist, retry without that filter.
  // This lets the leads page show data even before SOFT_DELETE_MIGRATION.sql is run.
  if (error && error.message?.includes('deleted_at')) {
    console.warn('[leads GET] deleted_at column missing — falling back to unfiltered query. Run SOFT_DELETE_MIGRATION.sql.')
    let fallbackQuery = supabaseAdmin
      .from('leads')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (!deleted && status && status !== 'all') {
      fallbackQuery = fallbackQuery.eq('status', status)
    }
    if (excludedBookingIds.length > 0) {
      fallbackQuery = fallbackQuery.or(
        `booking_id.is.null,booking_id.not.in.(${excludedBookingIds.join(',')})`
      )
    }
    if (search) {
      fallbackQuery = fallbackQuery.or(
        `name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`
      )
    }
    const { data: fd, error: fe, count: fc } = await fallbackQuery
    if (fe) return NextResponse.json({ error: fe.message }, { status: 500 })
    data = fd; count = fc; error = null
  }

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

  // Generate Lead Number
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

  // Duplicate phone guard: prevent creating a duplicate lead for the same phone
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

  // Check for existing website booking for this phone (BD-XXXX only, not BDA-)
  // Note: .is('lead_id', null) omitted — lead_id column may not exist in all DB schemas
  const { data: existingWebBooking } = await supabaseAdmin
    .from('bookings')
    .select('id, tracking_id, status, status_history')
    .eq('customer_phone', normPhone)
    .like('tracking_id', 'BD-%')
    .not('tracking_id', 'like', 'BDA-%')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let booking: { id: string; tracking_id: string } | null = null

  if (existingWebBooking) {
    // Reuse existing website booking
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
        status_history: history,
      })
      .eq('id', existingWebBooking.id)
      .select('id, tracking_id')
      .single()

    if (updateErr) {
      console.error('[leads POST] existing booking update failed (non-fatal):', updateErr.message)
    }
    booking = updated ?? { id: existingWebBooking.id, tracking_id: existingWebBooking.tracking_id }

  } else {
    // No existing booking — create a new BDA- booking derived from lead number.
    // BDL-2026-0001 → BDA-2026-0001 (guaranteed unique, no race conditions)
    const trackingId = leadNumber.replace(/^BDL-/, 'BDA-')

    const bookingPayload = {
      tracking_id:    trackingId,
      customer_name:  body.name.trim(),
      customer_phone: normPhone,
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
      status_history: [{
        from:       null,
        to:         'inquiry',
        timestamp:  new Date().toISOString(),
        changed_by: 'system',
        note:       `Auto-created from lead ${leadNumber}`,
      }],
    }

    const { data: newBooking, error: bookingErr } = await supabaseAdmin
      .from('bookings')
      .insert(bookingPayload)
      .select('id, tracking_id')
      .single()

    if (bookingErr) {
      console.error('[leads POST] booking insert failed:', bookingErr.message)
      // Fallback: try to find an existing booking for this tracking_id (race/retry)
      const { data: existingByTracking } = await supabaseAdmin
        .from('bookings')
        .select('id, tracking_id')
        .eq('tracking_id', trackingId)
        .maybeSingle()
      if (existingByTracking) {
        console.log('[leads POST] Recovered existing booking for', trackingId)
        booking = existingByTracking
      }
      // If still null, the lead is created without a booking — admin can repair via
      // /api/admin/repair/create-booking-for-lead
    } else {
      booking = newBooking ?? null
    }
  }

  // Create Lead and link it to the booking
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from('leads')
    .insert({
      lead_number: leadNumber,

      name:  body.name.trim(),
      phone: normPhone,
      email: body.email?.trim()?.toLowerCase() || null,

      source: body.source ?? 'admin',

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

  // Note: lead_id on bookings is omitted (column may not exist in all DB schemas).
  // The relationship is maintained via leads.booking_id only.

  // Send inquiry notification + customer acknowledgment. Awaited (not
  // fire-and-forget) so Vercel doesn't tear the function down mid-send.
  await Promise.allSettled([
    sendInquiryNotification({
      inquiryNumber:   leadNumber,
      source:          body.source ?? 'admin',
      customerName:    lead.name,
      customerPhone:   lead.phone,
      customerEmail:   lead.email,
      serviceType:     lead.service_interest,
      fromCity:        lead.from_city,
      toCity:          lead.to_city,
      pickupAddress:   lead.pickup_address,
      deliveryAddress: lead.drop_address,
      bagsCount:       lead.bags_count,
      travelDate:      lead.travel_date,
      pickupDate:      lead.pickup_date,
      deliveryDate:    lead.delivery_date,
      flightNumber:    lead.flight_number,
      pnr:             lead.pnr,
      notes:           lead.notes,
      submittedAt:     lead.created_at ?? new Date().toISOString(),
    }),
    // Customer acknowledgment (email + WhatsApp) — covers manual creation,
    // the admin mobile app, and any partner/API integration that creates
    // leads through this endpoint. See lib/lead-acknowledgment.ts.
    sendLeadAcknowledgment({
      id:    lead.id,
      name:  lead.name,
      phone: lead.phone,
      email: lead.email,
    }),
  ]).catch(err => console.error('[leads POST] email notification error:', err))

  return NextResponse.json(
    { lead, lead_number: leadNumber, tracking_id: booking?.tracking_id ?? null },
    { status: 201 }
  )
}
