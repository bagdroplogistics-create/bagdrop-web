// BAGDROP — Operational Baggage Tag System (Phase 1)
//
// Per-bag edit endpoint — airline info fields + manual status change,
// generic across Individual and Group bookings (booking_id is enough to
// scope it either way). Deliberately separate from the older, group-
// specific app/api/admin/group-bookings/[id]/bags/[bagId]/route.ts
// (which still owns pickup_location/delivery_location/hotel_name/
// room_number/guest_id editing for the manifest) — this route only
// touches the new Bag Tag System fields, so neither route can clobber
// the other's writes.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { BAG_STATUSES, trackBagEvent } from '@/lib/bag-tags'

// Airline info is explicitly SEPARATE from BagDrop's own Bag ID/QR
// (bag_number/bag_label) — staff transcribes these from the physical
// airline tag/boarding pass; this system never generates or validates
// them.
const AIRLINE_FIELDS = ['airline_name', 'flight_number', 'pnr', 'passenger_name', 'airline_tag_number', 'airline_barcode'] as const

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
    .from('group_bags').select('id, status').eq('id', bagId).eq('booking_id', id).maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!current)  return NextResponse.json({ error: 'Bag not found' }, { status: 404 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of AIRLINE_FIELDS) {
    if (key in body) updates[key] = (typeof body[key] === 'string' ? body[key].trim() : '') || null
  }

  let statusChanged = false
  if (body.status && body.status !== current.status) {
    if (!(BAG_STATUSES as readonly string[]).includes(body.status)) {
      return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 })
    }
    updates.status = body.status
    statusChanged = true
  }

  const { data, error } = await supabaseAdmin
    .from('group_bags')
    .update(updates)
    .eq('id', bagId)
    .eq('booking_id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (statusChanged) {
    await trackBagEvent(bagId, body.status, { note: body.status_note ?? undefined, changedBy: 'admin' })
  }

  return NextResponse.json({ bag: data })
}
