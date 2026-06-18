import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

async function nextPaymentId(): Promise<string> {
  const year = new Date().getFullYear()
  const { count } = await supabaseAdmin
    .from('payments')
    .select('*', { count: 'exact', head: true })
    .like('payment_id', `BDP-${year}-%`)
  return `BDP-${year}-${String((count ?? 0) + 1).padStart(4, '0')}`
}

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status')
  const search = searchParams.get('search')
  const page   = parseInt(searchParams.get('page') ?? '1', 10)
  const limit  = parseInt(searchParams.get('limit') ?? '50', 10)
  const offset = (page - 1) * limit

  let query = supabaseAdmin
    .from('payments')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status && status !== 'all') query = query.eq('payment_status', status)
  if (search) query = query.or(`customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,payment_id.ilike.%${search}%`)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ payments: data, total: count, page, limit })
}

export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.customer_name || !body?.amount) {
    return NextResponse.json({ error: 'customer_name and amount required' }, { status: 400 })
  }

  const paymentId = await nextPaymentId()

  // Convert empty strings to null for UUID columns — PostgreSQL rejects ""
  const bookingId = (body.booking_id ?? '').toString().trim() || null

  const { data, error } = await supabaseAdmin.from('payments').insert({
    payment_id:        paymentId,
    booking_id:        bookingId,
    customer_name:     body.customer_name.trim(),
    customer_phone:    body.customer_phone?.trim() ?? '',
    amount:            Number(body.amount),
    payment_method:    body.payment_method ?? 'upi',
    payment_status:    body.payment_status ?? 'pending',
    payment_reference: body.payment_reference?.trim() || null,
    notes:             body.notes?.trim() || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Link payment status back to booking if provided
  if (bookingId && data) {
    await supabaseAdmin.from('bookings').update({
      payment_status:    body.payment_status ?? 'pending',
      payment_method:    body.payment_method ?? 'upi',
      payment_reference: body.payment_reference?.trim() || null,
    }).eq('id', bookingId)
  }

  return NextResponse.json({ payment: data }, { status: 201 })
}
