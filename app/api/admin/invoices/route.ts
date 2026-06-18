import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status')
  const search = searchParams.get('search')
  const page   = parseInt(searchParams.get('page') ?? '1', 10)
  const limit  = parseInt(searchParams.get('limit') ?? '50', 10)
  const offset = (page - 1) * limit

  let query = supabaseAdmin
    .from('invoices')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status && status !== 'all') query = query.eq('payment_status', status)
  if (search) query = query.or(`customer_name.ilike.%${search}%,invoice_number.ilike.%${search}%,customer_phone.ilike.%${search}%`)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoices: data, total: count, page, limit })
}

// POST /api/admin/invoices — manually generate invoice from a booking_id
export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })

  const bookingId = body.booking_id

  // Fetch full booking
  const { data: booking, error: bErr } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single()

  if (bErr || !booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  // Check for existing invoice
  const { data: existingInv } = await supabaseAdmin
    .from('invoices')
    .select('id, total_amount, invoice_number')
    .eq('booking_id', bookingId)
    .maybeSingle()

  const total   = Number(booking.total_amount ?? 0)
  const baseAmt = parseFloat((total / 1.05).toFixed(2))
  const cgst    = parseFloat((baseAmt * 0.025).toFixed(2))
  const sgst    = parseFloat((baseAmt * 0.025).toFixed(2))

  const payload = {
    customer_name:     booking.customer_name,
    customer_phone:    booking.customer_phone,
    customer_email:    booking.customer_email ?? null,
    service_type:      booking.service_type ?? null,
    from_city:         booking.from_city,
    to_city:           booking.to_city,
    total_bags:        Number(booking.total_bags ?? 1),
    base_amount:       baseAmt,
    cgst,
    sgst,
    total_amount:      total,
    payment_status:    booking.payment_status ?? 'paid',
    payment_method:    booking.payment_method ?? null,
    payment_reference: booking.payment_reference ?? null,
    invoice_date:      new Date().toISOString().split('T')[0],
  }

  if (existingInv) {
    const { data: updated, error: uErr } = await supabaseAdmin
      .from('invoices')
      .update(payload)
      .eq('id', existingInv.id)
      .select()
      .single()
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
    return NextResponse.json({ invoice: updated, action: 'updated' })
  }

  const year = new Date().getFullYear()
  const { count } = await supabaseAdmin
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .like('invoice_number', `BDI-${year}-%`)

  const invNum = `BDI-${year}-${String((count ?? 0) + 1).padStart(4, '0')}`

  const { data: created, error: cErr } = await supabaseAdmin
    .from('invoices')
    .insert({ invoice_number: invNum, booking_id: bookingId, ...payload })
    .select()
    .single()

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
  return NextResponse.json({ invoice: created, action: 'created' })
}
