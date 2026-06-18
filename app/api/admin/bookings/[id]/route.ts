import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import type { BookingStatus } from '@/lib/supabase'

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params

  const body = await req.json()
  const {
    status,
    notes,
    customer_name,
    customer_phone,
    customer_email,
    total_bags,
    pickup_date,
    pickup_address,
    drop_address,
  } = body as {
    status?:          BookingStatus
    notes?:           string
    customer_name?:   string
    customer_phone?:  string
    customer_email?:  string
    total_bags?:      number
    pickup_date?:     string
    pickup_address?:  string
    drop_address?:    string
  }

  // At least one field must be provided
  if (!status && !notes && !customer_name && !customer_phone
      && !customer_email && !total_bags && !pickup_date
      && !pickup_address && !drop_address) {
    return NextResponse.json(
      { error: 'No fields provided to update' },
      { status: 400 }
    )
  }

  // Build the update object dynamically
  const updates: Record<string, unknown> = {}

  if (customer_name  !== undefined) updates.customer_name  = customer_name.trim()
  if (customer_phone !== undefined) {
    const raw = customer_phone.replace(/\D/g, '')
    updates.customer_phone = raw ? ('+91' + raw.replace(/^91/, '')) : ''
  }
  if (customer_email !== undefined) updates.customer_email = customer_email.trim().toLowerCase()
  if (total_bags     !== undefined) updates.total_bags     = Number(total_bags)
  if (pickup_date    !== undefined) updates.pickup_date    = pickup_date || null
  if (pickup_address !== undefined) updates.pickup_address = pickup_address.trim() || null
  if (drop_address   !== undefined) updates.drop_address   = drop_address.trim() || null
  if (notes          !== undefined) updates.notes          = notes.trim() || null

  // Status change — append to history
  if (status) {
    updates.status = status

    const { data: existing } = await supabaseAdmin
      .from('bookings')
      .select('status_history')
      .eq('id', id)
      .single()

    const history = existing?.status_history ?? []
    history.push({
      status,
      timestamp: new Date().toISOString(),
      note:      notes ?? null,
    })
    updates.status_history = history
  }

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ booking: data })
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ booking: data })
}
