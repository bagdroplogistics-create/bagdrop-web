import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; guestId: string }> }
) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id, guestId } = await context.params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const EDITABLE = ['guest_name', 'mobile_number', 'email', 'hotel_name', 'room_number', 'delivery_location', 'remarks'] as const
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of EDITABLE) if (key in body) updates[key] = body[key]

  const { data, error } = await supabaseAdmin
    .from('group_guests')
    .update(updates)
    .eq('id', guestId)
    .eq('booking_id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ guest: data })
}

// Soft-delete only — the guest's bag numbers must never be reissued. Also
// cascades to soft-delete that guest's still-active bags (a removed guest
// has no remaining reason to keep bags "in" the manifest); the bag_number
// itself is preserved forever on the row, just marked deleted_at.
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string; guestId: string }> }
) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id, guestId } = await context.params
  const now = new Date().toISOString()

  const { error: bagsErr } = await supabaseAdmin
    .from('group_bags')
    .update({ deleted_at: now, updated_at: now })
    .eq('guest_id', guestId)
    .eq('booking_id', id)
    .is('deleted_at', null)
  if (bagsErr) return NextResponse.json({ error: bagsErr.message }, { status: 500 })

  const { error } = await supabaseAdmin
    .from('group_guests')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', guestId)
    .eq('booking_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
