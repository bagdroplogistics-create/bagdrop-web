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
// Two entry points, both produce the exact same trip_sheets row shape:
//  (a) booking_id provided  — auto-fills customer/route fields from the
//      linked booking (original behavior), and advances that booking's
//      status to trip_created.
//  (b) manual: true         — no booking/lead exists yet for this trip
//      (e.g. an ad-hoc job, a corrigendum, a customer handled entirely
//      offline). Customer/route fields come straight from the request body
//      instead. booking_id/quote_id stay null — the trip_sheets.booking_id
//      column is nullable (ON DELETE SET NULL) specifically to support this.
//      No booking exists, so there's nothing to advance to trip_created.
export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.booking_id && !body?.manual) {
    return NextResponse.json({ error: 'booking_id is required (or set manual: true for a manual entry)' }, { status: 400 })
  }

  let booking: Record<string, unknown> | null = null
  let quote:   { id: string; total_amount: number | null } | null = null
  let quoteAmount = 0

  if (body.booking_id) {
    // Fetch the confirmed booking to auto-fill fields
    const { data: bk, error: bookingErr } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .eq('id', body.booking_id)
      .single()

    if (bookingErr || !bk) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }
    booking = bk

    // Fetch linked quote for quote_id and quote_amount
    const { data: q } = await supabaseAdmin
      .from('quotes')
      .select('id, total_amount, quote_number')
      .eq('booking_id', body.booking_id)
      .maybeSingle()
    quote = q
    quoteAmount = quote?.total_amount ?? Number(booking.total_amount ?? 0)
  } else {
    // Manual entry — no booking/lead backing this trip at all.
    if (!body.customer_name?.trim() || !body.customer_phone?.trim()) {
      return NextResponse.json({ error: 'Customer name and phone are required for a manual trip sheet' }, { status: 400 })
    }
    quoteAmount = Number(body.quote_amount) || 0
  }

  const tripNumber = await nextTripNumber()

  const { data: sheet, error } = await supabaseAdmin
    .from('trip_sheets')
    .insert({
      trip_number: tripNumber,

      booking_id:  booking?.id ?? null,
      quote_id:    quote?.id   ?? null,

      // Auto-filled from booking, or straight from the request body for a
      // manual entry — either way these are the same plain columns.
      customer_name:   booking ? booking.customer_name  : body.customer_name.trim(),
      customer_phone:  booking ? booking.customer_phone : body.customer_phone.trim(),
      customer_email:  booking ? (booking.customer_email ?? null) : (body.customer_email?.trim() || null),
      service_type:    booking ? booking.service_type  : (body.service_type  || null),
      service_label:   booking ? (booking.service_label ?? booking.service_type) : (body.service_label || body.service_type || null),
      from_city:       booking ? booking.from_city : (body.from_city || null),
      to_city:         booking ? booking.to_city   : (body.to_city   || null),
      pickup_address:  booking ? (booking.pickup_address ?? null) : (body.pickup_address || null),
      drop_address:    booking ? (booking.drop_address   ?? null) : (body.drop_address   || null),
      pickup_date:     booking ? (booking.pickup_date    ?? null) : (body.pickup_date    || null),
      delivery_date:   booking ? (booking.delivery_date  ?? null) : (body.delivery_date  || null),
      total_bags:      booking ? (booking.total_bags     ?? 1)    : (Number(body.total_bags) || 1),
      quote_amount:    quoteAmount,
      payment_status:  booking ? (booking.payment_status ?? null) : (body.payment_status || null),

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
        note:       booking
          ? `Trip sheet created for booking ${(booking as { tracking_id?: string }).tracking_id ?? body.booking_id}`
          : `Trip sheet created manually (no linked booking)`,
      }],
      created_by: 'admin',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Advance booking status to trip_created if it's at confirmed — only
  // applies when this trip sheet is actually linked to a booking.
  if (booking && ['confirmed', 'payment_approved'].includes(booking.status as string)) {
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
      .eq('id', booking.id as string)
  }

  return NextResponse.json({ trip_sheet: sheet, trip_number: tripNumber }, { status: 201 })
}
