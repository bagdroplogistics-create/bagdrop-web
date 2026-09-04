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

// Permanent delete — ONLY for Test Mode bookings (is_test = true). Every
// other booking in this system is soft-delete-only by design (see the
// house convention throughout: leads.deleted_at, group_guests.deleted_at,
// group_bags.deleted_at); this is a deliberate, narrow exception so a
// Group Booking created purely to test the flow on production can be
// fully cleaned up afterward, per founder request. Refuses outright if
// is_test isn't true — this can never be used to delete a real booking.
//
// group_booking_details/group_guests/group_bags all cascade automatically
// via their ON DELETE CASCADE FK to bookings (see supabase/migrations/
// 20260904_group_bookings.sql). leads/payments/lrs/trip_sheets/invoices
// are ON DELETE SET NULL instead (see their own migrations) — deleted
// explicitly here first so testing a full quote→payment→LR→invoice cycle
// doesn't leave orphaned rows behind.
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await context.params

  const { data: booking, error: fetchErr } = await supabaseAdmin
    .from('bookings').select('id, is_test, booking_type').eq('id', id).maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!booking) return NextResponse.json({ error: 'Group booking not found' }, { status: 404 })
  if (booking.booking_type !== 'group') return NextResponse.json({ error: 'Not a group booking' }, { status: 400 })
  if (!booking.is_test) {
    return NextResponse.json(
      { error: 'This is not a Test Mode booking. Only bookings created with Test Mode enabled can be permanently deleted here.' },
      { status: 403 }
    )
  }

  // Trip expenses hang off trip_sheets.id, not booking_id directly.
  const { data: tripSheets } = await supabaseAdmin.from('trip_sheets').select('id').eq('booking_id', id)
  const tripSheetIds = (tripSheets ?? []).map(t => t.id)
  if (tripSheetIds.length > 0) {
    await supabaseAdmin.from('trip_expenses').delete().in('trip_sheet_id', tripSheetIds)
  }

  await Promise.all([
    supabaseAdmin.from('trip_sheets').delete().eq('booking_id', id),
    supabaseAdmin.from('lrs').delete().eq('booking_id', id),
    supabaseAdmin.from('payments').delete().eq('booking_id', id),
    supabaseAdmin.from('invoices').delete().eq('booking_id', id),
  ])
  await supabaseAdmin.from('leads').delete().eq('booking_id', id)

  // group_booking_details/group_guests/group_bags cascade with this.
  const { error: deleteErr } = await supabaseAdmin.from('bookings').delete().eq('id', id)
  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
