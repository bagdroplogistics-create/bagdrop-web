import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export const runtime = 'nodejs'

// ── Trip number generator: BDT-YYYY-NNNN ────────────────────
async function nextTripNumber(): Promise<string> {
  const year   = new Date().getFullYear()
  const prefix = `BDT-${year}-`

  const { data } = await supabaseAdmin
    .from('trip_sheets')
    .select('trip_number')
    .like('trip_number', `${prefix}%`)
    .order('trip_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  let nextSeq = 1
  if (data?.trip_number) {
    const last = parseInt(data.trip_number.split('-').pop() ?? '0', 10)
    if (!isNaN(last)) nextSeq = last + 1
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`
}

// ── GET /api/admin/trip-sheets ───────────────────────────────
export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status  = searchParams.get('status')
  const vendor  = searchParams.get('vendor')
  const search  = searchParams.get('search')
  const page    = parseInt(searchParams.get('page') ?? '1', 10)
  const limit   = parseInt(searchParams.get('limit') ?? '50', 10)
  const offset  = (page - 1) * limit

  let query = supabaseAdmin
    .from('trip_sheets')
    .select('*, trip_expenses(id, actual_cost)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status && status !== 'all') query = query.eq('status', status)
  if (vendor)  query = query.ilike('vendor', `%${vendor}%`)
  if (search) {
    query = query.or(
      `customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,trip_number.ilike.%${search}%,driver_name.ilike.%${search}%`
    )
  }

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Compute totals for each sheet from its expenses
  const sheets = (data ?? []).map(s => ({
    ...s,
    total_expense: s.trip_expenses?.reduce((sum: number, e: { actual_cost: number }) => sum + (e.actual_cost || 0), 0) ?? s.total_expense,
  }))

  return NextResponse.json({ trip_sheets: sheets, total: count, page, limit })
}

// ── POST /api/admin/trip-sheets ──────────────────────────────
export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.booking_id) {
    return NextResponse.json({ error: 'booking_id is required' }, { status: 400 })
  }

  // Fetch the confirmed booking to auto-fill fields
  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('id', body.booking_id)
    .single()

  if (bookingErr || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  // Fetch linked quote for quote_id and quote_amount
  const { data: quote } = await supabaseAdmin
    .from('quotes')
    .select('id, total_amount, quote_number')
    .eq('booking_id', body.booking_id)
    .maybeSingle()

  const tripNumber = await nextTripNumber()
  const quoteAmount = quote?.total_amount ?? booking.total_amount ?? 0

  const { data: sheet, error } = await supabaseAdmin
    .from('trip_sheets')
    .insert({
      trip_number: tripNumber,

      booking_id:  booking.id,
      quote_id:    quote?.id ?? null,

      // Auto-filled from booking
      customer_name:   booking.customer_name,
      customer_phone:  booking.customer_phone,
      customer_email:  booking.customer_email ?? null,
      service_type:    booking.service_type,
      service_label:   booking.service_label ?? booking.service_type,
      from_city:       booking.from_city,
      to_city:         booking.to_city,
      pickup_address:  booking.pickup_address ?? null,
      drop_address:    booking.drop_address   ?? null,
      pickup_date:     booking.pickup_date    ?? null,
      delivery_date:   booking.delivery_date  ?? null,
      total_bags:      booking.total_bags     ?? 1,
      quote_amount:    quoteAmount,
      payment_status:  booking.payment_status ?? null,

      // Operational fields (from body if provided)
      vendor:             body.vendor             ?? null,
      driver_name:        body.driver_name        ?? null,
      vehicle_number:     body.vehicle_number     ?? null,
      consignment_number: body.consignment_number ?? null,
      luggage_code:       body.luggage_code       ?? null,
      cloak_room_number:  body.cloak_room_number  ?? null,
      pickup_person:      body.pickup_person      ?? null,
      pickup_contact:     body.pickup_contact     ?? null,
      delivery_person:    body.delivery_person    ?? null,
      delivery_contact:   body.delivery_contact   ?? null,
      notes:              body.notes              ?? null,
      remarks:            body.remarks            ?? null,

      // Income
      additional_charges: Number(body.additional_charges) || 0,
      discount:           Number(body.discount)           || 0,
      tax_amount:         Number(body.tax_amount)         || 0,
      total_income:       quoteAmount + (Number(body.additional_charges) || 0)
                          - (Number(body.discount) || 0) + (Number(body.tax_amount) || 0),
      total_expense:      0,
      net_profit:         quoteAmount + (Number(body.additional_charges) || 0)
                          - (Number(body.discount) || 0) + (Number(body.tax_amount) || 0),

      status: 'created',
      status_history: [{
        from:       null,
        to:         'created',
        timestamp:  new Date().toISOString(),
        changed_by: 'admin',
        note:       `Trip sheet created for booking ${booking.tracking_id}`,
      }],
      created_by: 'admin',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Advance booking status to trip_created if it's at confirmed
  if (['confirmed', 'payment_approved'].includes(booking.status)) {
    const history = (booking.status_history ?? []) as object[]
    history.push({
      from:       booking.status,
      to:         'trip_created',
      timestamp:  new Date().toISOString(),
      changed_by: 'system',
      note:       `Trip sheet ${tripNumber} created`,
    })
    await supabaseAdmin
      .from('bookings')
      .update({ status: 'trip_created', status_history: history })
      .eq('id', booking.id)
  }

  return NextResponse.json({ trip_sheet: sheet, trip_number: tripNumber }, { status: 201 })
}
