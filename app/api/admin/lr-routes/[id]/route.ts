import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export const runtime = 'nodejs'

// PATCH /api/admin/lr-routes/[id] — update a Route Master entry
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (body.from_city            != null) updates.from_city            = String(body.from_city).trim()
  if (body.to_city              != null) updates.to_city              = String(body.to_city).trim()
  if (body.from_branch_code     != null) updates.from_branch_code     = body.from_branch_code?.trim() || null
  if (body.to_branch_code       != null) updates.to_branch_code       = body.to_branch_code?.trim()   || null
  if (body.gst_type             != null) updates.gst_type             = body.gst_type === 'interstate' ? 'interstate' : 'intrastate'
  if (body.default_vehicle_type != null) updates.default_vehicle_type = body.default_vehicle_type?.trim() || null
  if (body.standard_transit_days!= null) updates.standard_transit_days= Number(body.standard_transit_days)
  if (body.distance_km          != null) updates.distance_km          = Number(body.distance_km)
  if (body.notes                != null) updates.notes                = body.notes?.trim() || null
  if (body.is_active            != null) updates.is_active            = Boolean(body.is_active)

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('lr_routes')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ route: data })
}

// DELETE /api/admin/lr-routes/[id] — delete a Route Master entry
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { error } = await supabaseAdmin.from('lr_routes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
