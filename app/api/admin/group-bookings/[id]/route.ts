import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

// `id` here is the SAME id as the underlying bookings.id (see the schema
// comment in supabase/migrations/20260904_group_bookings.sql — group_
// booking_details.booking_id is its primary key, not a separate uuid).

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await context.params

  const { data: details, error } = await supabaseAdmin
    .from('group_booking_details')
    .select('*, booking:bookings(*)')
    .eq('booking_id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!details) return NextResponse.json({ error: 'Group booking not found' }, { status: 404 })

  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('booking_id', id)
    .maybeSingle()

  const [{ data: guests }, { data: bags }] = await Promise.all([
    supabaseAdmin.from('group_guests').select('*').eq('booking_id', id).is('deleted_at', null).order('created_at', { ascending: true }),
    supabaseAdmin.from('group_bags').select('*').eq('booking_id', id).is('deleted_at', null).order('created_at', { ascending: true }),
  ])

  return NextResponse.json({
    group_booking: details,
    lead: lead ?? null,
    guests: guests ?? [],
    bags: bags ?? [],
  })
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await context.params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  // Only Group/Event Details fields are editable here — status/payment/
  // quote fields are all owned by the existing bookings/leads/payments
  // routes, deliberately untouched by this one (no duplicate status logic).
  const EDITABLE = [
    'event_name', 'event_type', 'primary_contact_name', 'primary_contact_number', 'primary_contact_email',
    'event_date', 'pickup_city', 'pickup_address', 'delivery_city', 'delivery_address', 'hotel_name',
    'estimated_total_bags', 'final_total_bags', 'pickup_window_start', 'pickup_window_end',
    'special_instructions', 'remarks',
  ] as const

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of EDITABLE) {
    if (key in body) updates[key] = body[key]
  }

  const { data, error } = await supabaseAdmin
    .from('group_booking_details')
    .update(updates)
    .eq('booking_id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Keep bookings.total_bags in sync when final_total_bags changes — this
  // is the same field the existing quote engine, LR, Tripsheet, and
  // Invoice modules all already read, so a Group Booking's bag count
  // updates flow through unchanged.
  if ('final_total_bags' in body && body.final_total_bags) {
    await supabaseAdmin.from('bookings').update({ total_bags: Number(body.final_total_bags) }).eq('id', id)
    await supabaseAdmin.from('leads').update({ bags_count: Number(body.final_total_bags) }).eq('booking_id', id)
  }

  return NextResponse.json({ group_booking: data })
}
