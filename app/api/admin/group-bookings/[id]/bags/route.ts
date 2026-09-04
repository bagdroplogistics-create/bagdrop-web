import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { nextBagId } from '@/lib/number-series'

// Manually add ONE bag (guest_id optional — a bag can exist before it's
// assigned to a guest; the manifest UI can reassign it later). For adding
// several bags at once for a known guest, use POST .../guests instead
// (bags_count auto-creates them together).
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await context.params
  const body = await req.json().catch(() => ({}))

  const { data: booking } = await supabaseAdmin.from('bookings').select('id').eq('id', id).eq('booking_type', 'group').maybeSingle()
  if (!booking) return NextResponse.json({ error: 'Group booking not found' }, { status: 404 })

  if (body.guest_id) {
    const { data: guest } = await supabaseAdmin.from('group_guests').select('id').eq('id', body.guest_id).eq('booking_id', id).is('deleted_at', null).maybeSingle()
    if (!guest) return NextResponse.json({ error: 'Guest not found in this group booking' }, { status: 400 })
  }

  const nullStr = (v: unknown) => (typeof v === 'string' ? v.trim() : '') || null

  let bagNumber: string
  try {
    bagNumber = await nextBagId()
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not generate a Bag ID' }, { status: 500 })
  }

  const { data, error } = await supabaseAdmin
    .from('group_bags')
    .insert({
      booking_id:        id,
      guest_id:          body.guest_id || null,
      bag_number:        bagNumber,
      status:            'pending',
      pickup_location:   nullStr(body.pickup_location),
      delivery_location: nullStr(body.delivery_location),
      hotel_name:        nullStr(body.hotel_name),
      room_number:       nullStr(body.room_number),
      remarks:           nullStr(body.remarks),
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bag: data }, { status: 201 })
}
