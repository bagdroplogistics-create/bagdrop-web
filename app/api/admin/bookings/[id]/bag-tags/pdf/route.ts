// BAGDROP — Operational Baggage Tag System (Phase 1)
//
// "Download PDF" for bag tags — Print All (no ?bag_ids), Print Selected /
// Reprint (?bag_ids=id1,id2,...). Works for both Individual and Group
// bookings off the same booking_id, same pattern as the generic GET in
// ../route.ts.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { buildBagTagsPdfBuffer, type BagTagInput } from '@/lib/bag-tags-pdf'
import { formatCustomerName } from '@/lib/constants'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await context.params
  const bagIdsParam = req.nextUrl.searchParams.get('bag_ids')
  const selectedIds = bagIdsParam ? bagIdsParam.split(',').filter(Boolean) : null

  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from('bookings')
    .select('id, tracking_id, booking_type, title, customer_name, from_city, to_city, service_label, service_type, pickup_date, drop_address')
    .eq('id', id)
    .maybeSingle()
  if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 500 })
  if (!booking)    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const isGroup = booking.booking_type === 'group'

  let groupDetails: { group_booking_number: string; pickup_city: string | null; delivery_city: string | null; pickup_window_start: string | null } | null = null
  let guestsById = new Map<string, { guest_name: string }>()
  if (isGroup) {
    const [{ data: gd }, { data: guests }] = await Promise.all([
      supabaseAdmin.from('group_booking_details').select('group_booking_number, pickup_city, delivery_city, pickup_window_start').eq('booking_id', id).maybeSingle(),
      supabaseAdmin.from('group_guests').select('id, guest_name').eq('booking_id', id).is('deleted_at', null),
    ])
    groupDetails = gd
    guestsById = new Map((guests ?? []).map(g => [g.id, g]))
  }

  let bagsQuery = supabaseAdmin
    .from('group_bags')
    .select('id, guest_id, bag_label, delivery_location')
    .eq('booking_id', id)
    .is('deleted_at', null)
    .not('bag_label', 'is', null)
    .order('created_at', { ascending: true })
  if (selectedIds) bagsQuery = bagsQuery.in('id', selectedIds)

  const { data: bags, error: bagsErr } = await bagsQuery
  if (bagsErr) return NextResponse.json({ error: bagsErr.message }, { status: 500 })
  if (!bags || bags.length === 0) return NextResponse.json({ error: 'No generated tags found to download' }, { status: 404 })

  // Bag N / Total reflects the FULL manifest (not just the selected/
  // filtered subset being downloaded) — so a "Reprint" of bag #23 still
  // correctly shows "23 / 150", not "1 / 1".
  const { count: totalCount } = await supabaseAdmin
    .from('group_bags').select('id', { count: 'exact', head: true }).eq('booking_id', id).is('deleted_at', null).not('bag_label', 'is', null)
  const bagTotal = totalCount ?? bags.length

  const bookingIdentifier = isGroup ? (groupDetails?.group_booking_number ?? booking.tracking_id) : booking.tracking_id
  const route = isGroup
    ? [groupDetails?.pickup_city, groupDetails?.delivery_city].filter(Boolean).join(' → ')
    : [booking.from_city, booking.to_city].filter(Boolean).join(' → ')
  const pickupDate = isGroup ? (groupDetails?.pickup_window_start ?? null) : booking.pickup_date
  const serviceLabel = booking.service_label || booking.service_type || (isGroup ? 'Group / Wedding Booking' : 'Baggage Delivery')

  const tagInputs: BagTagInput[] = bags.map((b, i) => ({
    bagLabel:        b.bag_label as string,
    customerName:    isGroup ? (b.guest_id && guestsById.get(b.guest_id)?.guest_name) || 'Guest' : (formatCustomerName(booking.title, booking.customer_name) || booking.customer_name || 'Customer'),
    bookingId:       bookingIdentifier,
    route,
    serviceLabel,
    bagNumber:       Number((b.bag_label as string).split('-').pop()) || i + 1,
    bagTotal,
    pickupDate,
    deliveryLocation: b.delivery_location || booking.drop_address || null,
  }))

  const buffer = await buildBagTagsPdfBuffer(tagInputs)
  const filename = `${bookingIdentifier.replace(/\//g, '-')}-bag-tags.pdf`

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
