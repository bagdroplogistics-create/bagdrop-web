import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

// GET /api/admin/route-pricing  — list all routes
export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('route_pricing')
    .select('*')
    .order('from_city')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ routes: data })
}

// POST /api/admin/route-pricing  — create a new route
export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { from_city, to_city, base_price, per_bag_rate } = body
  if (!from_city || !to_city || base_price == null || per_bag_rate == null)
    return NextResponse.json({ error: 'from_city, to_city, base_price and per_bag_rate are required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('route_pricing')
    .insert({
      from_city:    String(from_city).toLowerCase().trim(),
      to_city:      String(to_city).toLowerCase().trim(),
      base_price:   Number(base_price),
      per_bag_rate: Number(per_bag_rate),
      is_active:    body.is_active !== false,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505')
      return NextResponse.json({ error: 'Route already exists. Use edit to update it.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ route: data }, { status: 201 })
}
