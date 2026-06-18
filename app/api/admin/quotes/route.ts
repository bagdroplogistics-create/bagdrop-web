import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

// Generate next quote number: BDQ-YYYY-NNNN
async function nextQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `BDQ-${year}-`

  const { count } = await supabaseAdmin
    .from('quotes')
    .select('*', { count: 'exact', head: true })
    .like('quote_number', `${prefix}%`)

  const seq = String((count ?? 0) + 1).padStart(4, '0')
  return `${prefix}${seq}`
}

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
    .from('quotes')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  if (search) {
    query = query.or(
      `customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,quote_number.ilike.%${search}%`
    )
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ quotes: data, total: count, page, limit })
}

export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.customer_name || !body?.customer_phone || !body?.service_type || !body?.from_city || !body?.to_city) {
    return NextResponse.json(
      { error: 'customer_name, customer_phone, service_type, from_city, to_city are required' },
      { status: 400 }
    )
  }

  const basePrice   = Number(body.base_price) || 0
  const cgst        = parseFloat((basePrice * 0.025).toFixed(2))
  const sgst        = parseFloat((basePrice * 0.025).toFixed(2))
  const totalAmount = parseFloat((basePrice + cgst + sgst).toFixed(2))

  const quoteNumber = await nextQuoteNumber()

  const { data, error } = await supabaseAdmin
    .from('quotes')
    .insert({
      quote_number:   quoteNumber,
      lead_id:        body.lead_id ?? null,
      customer_name:  body.customer_name.trim(),
      customer_phone: body.customer_phone.trim(),
      customer_email: body.customer_email?.trim() || null,
      service_type:   body.service_type,
      from_city:      body.from_city,
      to_city:        body.to_city,
      pickup_date:    body.pickup_date ?? null,
      time_slot:      body.time_slot ?? null,
      total_bags:     Number(body.total_bags) || 1,
      base_price:     basePrice,
      cgst,
      sgst,
      total_amount:   totalAmount,
      status:         body.status ?? 'draft',
      valid_until:    body.valid_until ?? null,
      notes:          body.notes?.trim() || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ quote: data }, { status: 201 })
}
