import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

// PATCH /api/admin/route-pricing/[id]  — update a route
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (body.from_city    != null) updates.from_city    = String(body.from_city).toLowerCase().trim()
  if (body.to_city      != null) updates.to_city      = String(body.to_city).toLowerCase().trim()
  if (body.base_price   != null) updates.base_price   = Number(body.base_price)
  if (body.per_bag_rate != null) updates.per_bag_rate = Number(body.per_bag_rate)
  if (body.is_active    != null) updates.is_active    = Boolean(body.is_active)

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('route_pricing')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505')
      return NextResponse.json({ error: 'Route already exists with those cities.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ route: data })
}

// DELETE /api/admin/route-pricing/[id]  — delete a route
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { error } = await supabaseAdmin.from('route_pricing').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
