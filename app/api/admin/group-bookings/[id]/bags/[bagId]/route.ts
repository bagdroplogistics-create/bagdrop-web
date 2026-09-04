import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { syncBagCountToBooking } from '@/lib/group-booking'

const VALID_STATUSES = [
  'pending', 'picked_up', 'received', 'tagged', 'in_transit', 'out_for_delivery', 'delivered',
  'missing', 'damaged', 'delivery_issue', 'returned',
]

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; bagId: string }> }
) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id, bagId } = await context.params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { data: current, error: fetchErr } = await supabaseAdmin
    .from('group_bags').select('*').eq('id', bagId).eq('booking_id', id).maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!current) return NextResponse.json({ error: 'Bag not found' }, { status: 404 })

  const EDITABLE = ['guest_id', 'pickup_location', 'delivery_location', 'hotel_name', 'room_number', 'remarks'] as const
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of EDITABLE) if (key in body) updates[key] = body[key]

  // Manual status edit (e.g. correcting a mis-scan, or admin override before
  // the Phase 2 scanning workflow exists) — appended to status_history the
  // same way every other status column in this codebase records changes
  // (bookings.status_history, lrs.status_history).
  if (body.status && body.status !== current.status) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 })
    }
    updates.status = body.status
    updates.status_history = [
      ...(current.status_history ?? []),
      { from: current.status, to: body.status, timestamp: new Date().toISOString(), changed_by: 'admin', note: body.status_note ?? null },
    ]
  }

  const { data, error } = await supabaseAdmin
    .from('group_bags')
    .update(updates)
    .eq('id', bagId)
    .eq('booking_id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bag: data })
}

// Soft-delete only — bag_number is never reissued (spec: "Removed Bag IDs
// must never be reused").
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string; bagId: string }> }
) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id, bagId } = await context.params
  const { error } = await supabaseAdmin
    .from('group_bags')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', bagId)
    .eq('booking_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await syncBagCountToBooking(id)
  return NextResponse.json({ success: true })
}
