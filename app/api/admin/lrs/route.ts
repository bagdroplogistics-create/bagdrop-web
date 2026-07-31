import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { findRouteMatch } from '@/lib/city-normalize'
import { computeLrCharges } from '@/lib/lr-constants'

export const runtime = 'nodejs'

// ── LR number generator: BDLR-YYYY-NNNN ─────────────────────
async function nextLrNumber(): Promise<string> {
  const year   = new Date().getFullYear()
  const prefix = `BDLR-${year}-`

  const { data } = await supabaseAdmin
    .from('lrs')
    .select('lr_number')
    .like('lr_number', `${prefix}%`)
    .order('lr_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  let nextSeq = 1
  if (data?.lr_number) {
    const last = parseInt(data.lr_number.split('-').pop() ?? '0', 10)
    if (!isNaN(last)) nextSeq = last + 1
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`
}

// ── GET /api/admin/lrs ────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status')
  const search = searchParams.get('search')
  const page   = parseInt(searchParams.get('page')  ?? '1',  10)
  const limit  = parseInt(searchParams.get('limit') ?? '50', 10)
  const offset = (page - 1) * limit

  let query = supabaseAdmin
    .from('lrs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status && status !== 'all') query = query.eq('status', status)
  if (search) {
    query = query.or(
      `lr_number.ilike.%${search}%,consignor_name.ilike.%${search}%,consignee_name.ilike.%${search}%,vehicle_number.ilike.%${search}%,eway_bill_number.ilike.%${search}%`
    )
  }

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ lrs: data ?? [], total: count, page, limit })
}

// ── POST /api/admin/lrs ───────────────────────────────────────
// Two entry points, same convention as trip_sheets:
//  (a) booking_id provided — auto-fills consignor/consignee/route/package
//      fields from the linked booking (the primary flow, used by the
//      "Generate LR" button on the Booking Workflow).
//  (b) manual: true — no booking exists yet; all fields come from the body.
export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.booking_id && !body?.manual) {
    return NextResponse.json({ error: 'booking_id is required (or set manual: true for a manual LR)' }, { status: 400 })
  }

  let booking: Record<string, unknown> | null = null

  if (body.booking_id) {
    const { data: bk, error: bookingErr } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .eq('id', body.booking_id)
      .single()

    if (bookingErr || !bk) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }
    booking = bk
  } else if (!body.consignor_name?.trim() || !body.consignee_name?.trim()) {
    return NextResponse.json({ error: 'Consignor and consignee name are required for a manual LR' }, { status: 400 })
  }

  const fromCity = booking ? (booking.from_city as string) : (body.from_city || null)
  const toCity   = booking ? (booking.to_city   as string) : (body.to_city   || null)

  // Match against Route Master to pick up booking office + GST treatment.
  let route: { id: string; from_branch_code: string | null; to_branch_code: string | null; gst_type: string } | null = null
  if (fromCity && toCity) {
    const { data: routes } = await supabaseAdmin
      .from('lr_routes')
      .select('id, from_city, to_city, from_branch_code, to_branch_code, gst_type')
      .eq('is_active', true)
    route = findRouteMatch(routes ?? [], fromCity, toCity)
  }
  const gstType = (route?.gst_type as 'intrastate' | 'interstate') ?? 'intrastate'

  const charges = {
    freight:       Number(body.freight)        || 0,
    surcharge:     Number(body.surcharge)      || 0,
    local_cartage: Number(body.local_cartage)  || 0,
    last_mile_frt: Number(body.last_mile_frt)  || 0,
    fov:           Number(body.fov)            || 0,
    loading_chg:   Number(body.loading_chg)    || 0,
    unloading_chg: Number(body.unloading_chg)  || 0,
    handling_chg:  Number(body.handling_chg)   || 0,
    gc_charge:     Number(body.gc_charge)      || 0,
    other_charge:  Number(body.other_charge)   || 0,
    eway_bill_chg: Number(body.eway_bill_chg)  || 0,
    aoc:           Number(body.aoc)            || 0,
  }
  const totals = computeLrCharges(charges, gstType)

  const lrNumber = await nextLrNumber()

  const consignorName    = booking ? (booking.customer_name  as string) : body.consignor_name.trim()
  const consignorMobile  = booking ? (booking.customer_phone as string) : (body.consignor_mobile?.trim() || null)
  const consignorEmail   = booking ? ((booking.customer_email as string) ?? null) : (body.consignor_email?.trim() || null)
  const consignorAddress = booking ? ((booking.pickup_address as string) ?? null) : (body.consignor_address?.trim() || null)

  const consigneeName    = booking ? (booking.customer_name  as string) : body.consignee_name.trim()
  const consigneeMobile  = booking ? (booking.customer_phone as string) : (body.consignee_mobile?.trim() || null)
  const consigneeAddress = booking ? ((booking.drop_address as string) ?? null) : (body.consignee_address?.trim() || null)

  const insertPayload = {
    lr_number:      lrNumber,
    booking_id:     booking?.id ?? null,
    route_id:       route?.id   ?? null,

    lr_date:        body.lr_date || new Date().toISOString().split('T')[0],
    booking_office: body.booking_office || route?.from_branch_code || null,
    vehicle_number: body.vehicle_number || null,
    from_city:      fromCity,
    to_city:        toCity,
    mode:           body.mode || 'Air',

    consignor_name:    consignorName,
    consignor_address: consignorAddress,
    consignor_mobile:  consignorMobile,
    consignor_email:   consignorEmail,
    consignor_gstin:   body.consignor_gstin?.trim() || null,

    consignee_name:    consigneeName,
    consignee_address: consigneeAddress,
    consignee_mobile:  consigneeMobile,
    consignee_gstin:   body.consignee_gstin?.trim() || null,

    billed_to_name:    body.billed_to_name?.trim()  || consignorName,
    billed_to_gstin:   body.billed_to_gstin?.trim() || null,
    delivery_address:  body.delivery_address?.trim() || consigneeAddress,

    invoice_number: body.invoice_number?.trim() || null,
    invoice_value:  body.invoice_value != null ? Number(body.invoice_value) : null,
    eway_bill_number: body.eway_bill_number?.trim() || null,

    total_bags:          booking ? Number(booking.total_bags ?? 1) : (Number(body.total_bags) || 1),
    content_description: body.content_description?.trim() || 'HOUSEHOLD BAGGAGE',
    actual_weight:       body.actual_weight     != null ? Number(body.actual_weight)     : null,
    chargeable_weight:   body.chargeable_weight != null ? Number(body.chargeable_weight) : null,
    size_l:              body.size_l != null ? Number(body.size_l) : null,
    size_w:              body.size_w != null ? Number(body.size_w) : null,
    size_h:              body.size_h != null ? Number(body.size_h) : null,
    private_mark:        body.private_mark?.trim() || null,

    ...charges,
    ...totals,

    insurance_by_customer: !!body.insurance_by_customer,
    gst_payable_by:        body.gst_payable_by || 'Consignor',
    payment_terms:          body.payment_terms  || 'To Pay',
    lr_type:                body.lr_type        || 'At Branch',
    delivery_at:             body.delivery_at    || 'Door Dly',
    remarks:                 body.remarks?.trim() || null,
    prepared_by:              body.prepared_by   || 'admin',

    flight_number: body.flight_number?.trim() || null,
    airline:       body.airline?.trim()       || null,
    arrival_date:  body.arrival_date          || null,
    arrival_time:  body.arrival_time          || null,

    driver_name:   body.driver_name?.trim()   || (booking ? ((booking.driver_name as string) ?? null) : null),
    driver_mobile: body.driver_mobile?.trim() || (booking ? ((booking.driver_phone as string) ?? null) : null),
    vehicle_type:  body.vehicle_type?.trim()  || (booking ? ((booking.vehicle_type as string) ?? null) : null),

    status: 'generated',
    status_history: [{
      from: null, to: 'generated',
      timestamp: new Date().toISOString(),
      changed_by: 'admin',
      note: booking
        ? `LR generated for booking ${(booking as { tracking_id?: string }).tracking_id ?? body.booking_id}`
        : 'LR created manually (no linked booking)',
    }],
    created_by: 'admin',
  }

  const { data: lr, error } = await supabaseAdmin
    .from('lrs')
    .insert(insertPayload)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lr, lr_number: lrNumber }, { status: 201 })
}
