import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { syncBagCountToBooking, mintBagIds } from '@/lib/group-booking'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await context.params
  const { data, error } = await supabaseAdmin
    .from('group_guests')
    .select('*')
    .eq('booking_id', id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ guests: data ?? [] })
}

// Add a guest — and, per spec section 8 ("Automatically Create Bags for
// Guests"), automatically create `bags_count` group_bags rows linked to
// them in the same request. Admin can still add/remove individual bags
// afterward via the bags endpoints below.
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await context.params
  const body = await req.json().catch(() => null)

  if (!body?.guest_name?.trim()) {
    return NextResponse.json({ error: 'Guest name is required' }, { status: 400 })
  }

  // Confirm the group booking actually exists before attaching a guest to it.
  const { data: booking } = await supabaseAdmin.from('bookings').select('id').eq('id', id).eq('booking_type', 'group').maybeSingle()
  if (!booking) return NextResponse.json({ error: 'Group booking not found' }, { status: 404 })

  const nullStr = (v: unknown) => (typeof v === 'string' ? v.trim() : '') || null

  const { data: guest, error: guestErr } = await supabaseAdmin
    .from('group_guests')
    .insert({
      booking_id:        id,
      guest_name:        body.guest_name.trim(),
      mobile_number:     nullStr(body.mobile_number),
      email:             nullStr(body.email),
      hotel_name:        nullStr(body.hotel_name),
      room_number:       nullStr(body.room_number),
      delivery_location: nullStr(body.delivery_location),
      remarks:           nullStr(body.remarks),
    })
    .select('*')
    .single()

  if (guestErr || !guest) {
    return NextResponse.json({ error: guestErr?.message ?? 'Could not create guest' }, { status: 500 })
  }

  const bagsCount = Math.max(0, Number(body.bags_count) || 0)
  let bags: unknown[] = []
  if (bagsCount > 0) {
    try {
      const bagNumbers = await mintBagIds(bagsCount)
      const { data: newBags, error: bagsErr } = await supabaseAdmin
        .from('group_bags')
        .insert(bagNumbers.map(bag_number => ({
          booking_id:        id,
          guest_id:          guest.id,
          bag_number,
          status:            'pending',
          hotel_name:        nullStr(body.hotel_name),
          room_number:       nullStr(body.room_number),
          delivery_location: nullStr(body.delivery_location),
        })))
        .select('*')
      if (bagsErr) {
        // Guest was created but its bags failed — surface this clearly so
        // the admin can retry adding bags rather than silently ending up
        // with a guest that has fewer bags than expected.
        return NextResponse.json({
          guest, bags: [],
          error: `Guest created, but bag creation failed: ${bagsErr.message}. Add bags manually for this guest.`,
        }, { status: 207 })
      }
      bags = newBags ?? []
      // Keep the linked lead/booking's bag count (what the quote builder
      // actually prices off) in sync with the manifest — see lib/
      // group-booking.ts's doc comment.
      await syncBagCountToBooking(id)
    } catch (err) {
      return NextResponse.json({
        guest, bags: [],
        error: `Guest created, but bag ID generation failed: ${err instanceof Error ? err.message : 'unknown error'}.`,
      }, { status: 207 })
    }
  }

  return NextResponse.json({ guest, bags }, { status: 201 })
}
