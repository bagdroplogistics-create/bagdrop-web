import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ lead: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const allowed = [
    'name', 'phone', 'email', 'source', 'service_interest', 'service_type',
    'from_city', 'to_city', 'travel_date', 'pickup_date', 'delivery_date',
    'pickup_time', 'bags_count', 'status', 'notes', 'assigned_to',
    'converted_booking_id', 'pnr', 'flight_number', 'flight_time', 'flight_ticket_url',
  ]

  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  // Convert empty strings to null for date/optional fields
  const nullableFields = [
    'travel_date', 'pickup_date', 'delivery_date', 'flight_time',
    'email', 'from_city', 'to_city', 'notes', 'assigned_to',
    'converted_booking_id', 'pnr', 'flight_number', 'flight_ticket_url', 'pickup_time',
  ]
  for (const f of nullableFields) {
    if (f in updates && (updates[f] === '' || updates[f] === null)) updates[f] = null
  }

  // Keep service_interest and service_type in sync
  if ('service_interest' in updates) updates.service_type = updates.service_interest
  if ('service_type' in updates && !('service_interest' in updates)) updates.service_interest = updates.service_type

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lead: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  const { error } = await supabaseAdmin
    .from('leads')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
