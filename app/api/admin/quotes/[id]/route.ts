import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth, requireAdmin } from '@/lib/admin-auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('quotes')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ quote: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const allowed = [
    'customer_name', 'customer_phone', 'customer_email',
    'service_type', 'from_city', 'to_city', 'pickup_date', 'time_slot',
    'total_bags', 'base_price', 'status', 'valid_until', 'notes',
    'lead_id', 'converted_booking_id',
  ]

  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if ('base_price' in updates) {
    const base = Number(updates.base_price) || 0
    updates.cgst         = parseFloat((base * 0.025).toFixed(2))
    updates.sgst         = parseFloat((base * 0.025).toFixed(2))
    updates.total_amount = parseFloat((base + (updates.cgst as number) + (updates.sgst as number)).toFixed(2))
  }

  // Convert empty strings to null for date/optional columns — PostgreSQL rejects ""
  const nullableFields = ['pickup_date', 'valid_until', 'customer_email', 'time_slot', 'notes', 'lead_id', 'converted_booking_id']
  for (const f of nullableFields) {
    if (f in updates && updates[f] === '') updates[f] = null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // Fetch current version for version tracking
  const { data: current } = await supabaseAdmin
    .from('quotes')
    .select('version')
    .eq('id', id)
    .single()

  updates.version = ((current?.version ?? 1) as number) + 1

  const { data, error } = await supabaseAdmin
    .from('quotes')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ quote: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Only admins can delete quotes
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'Admin access required to delete quotes' }, { status: 403 })
  }
  const { id } = await params

  const { error } = await supabaseAdmin
    .from('quotes')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
