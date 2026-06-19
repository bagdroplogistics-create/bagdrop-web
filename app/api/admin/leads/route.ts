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

  // service_interest and service_type are kept in sync — accept either field name
  const serviceVal = (body.service_interest || body.service_type || '').trim() || null

  // Convert empty strings to null for date/optional columns — PostgreSQL rejects ""
  const nullDate = (v: unknown) => (typeof v === 'string' ? v.trim() : '') || null

  // Flight fields are only relevant for airport-related service types
  const needsFlight = ['airport-to-door', 'door-to-airport', 'airport-to-doorstep', 'doorstep-to-airport'].includes(serviceVal ?? '')

  const { data, error } = await supabaseAdmin
    .from('leads')
    .insert({
      name:             body.name.trim(),
      phone:            body.phone.trim(),
      email:            body.email?.trim() || null,
      source:           body.source ?? 'manual',
      service_interest: serviceVal,
      service_type:     serviceVal,
      from_city:        body.from_city?.trim() || null,
      to_city:          body.to_city?.trim() || null,
      travel_date:      nullDate(body.travel_date),
      pickup_date:      nullDate(body.pickup_date),
      delivery_date:    nullDate(body.delivery_date),
      pickup_time:      body.pickup_time?.trim() || null,
      bags_count:       Number(body.bags_count) || 1,
      status:           body.status ?? 'new',
      notes:            body.notes?.trim() || null,
      assigned_to:      body.assigned_to?.trim() || null,
      // Flight fields — only store if service type requires them
      pnr:              needsFlight ? (body.pnr?.trim() || null) : null,
      flight_number:    needsFlight ? (body.flight_number?.trim() || null) : null,
      flight_time:      needsFlight ? nullDate(body.flight_time) : null,
      flight_ticket_url: needsFlight ? (body.flight_ticket_url?.trim() || null) : null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ lead: data }, { status: 201 })
}
