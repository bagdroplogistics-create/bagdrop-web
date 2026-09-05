// BAGDROP — Operational Baggage Tag System (Phase 1)
//
// Generic Bag Tags endpoint — works for BOTH Individual and Group
// bookings, keyed purely by booking_id (group_bags.booking_id already
// covers either type — see lib/bag-tags.ts's module comment). This is
// the ONE route both the Individual booking tags page
// (app/(admin)/admin/bookings/[id]/bag-tags/page.tsx) and the Group
// booking tags page (app/(admin)/admin/group-bookings/[id]/tags/page.tsx)
// call — no duplicated booking/bag-fetching logic between them.
//
// GET   — booking + bags (+ guests, for group bookings) + whether tags
//         can be generated yet.
// POST  — "Generate Tags": Individual bookings create their bag rows
//         here (via ensureBagsForBooking) if they somehow don't exist yet
//         (the normal path is the auto-hook on booking confirm — this is
//         a manual fallback for bookings confirmed before this feature
//         shipped); Group bookings just stamp tag_generated_at on bags
//         that don't have one yet. Refuses outright unless the booking is
//         confirmed or later (spec: "Only generate baggage tags after a
//         booking is confirmed").
// PATCH — bulk "mark printed" (Print/Reprint) for a set of bag ids.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { ensureBagsForBooking, trackBagEvent } from '@/lib/bag-tags'
import { STATUS_ORDER } from '@/lib/booking-status'

const CONFIRMED_ONWARD = new Set(STATUS_ORDER.slice(STATUS_ORDER.indexOf('confirmed')))

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await context.params

  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from('bookings')
    .select('id, tracking_id, booking_type, status, customer_name, customer_phone, from_city, to_city, service_label, service_type, pickup_date, drop_address, total_bags, is_test')
    .eq('id', id)
    .maybeSingle()

  if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 500 })
  if (!booking)    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  let groupDetails: Record<string, unknown> | null = null
  let guests: Record<string, unknown>[] = []
  if (booking.booking_type === 'group') {
    const [{ data: gd }, { data: g }] = await Promise.all([
      supabaseAdmin.from('group_booking_details').select('*').eq('booking_id', id).maybeSingle(),
      supabaseAdmin.from('group_guests').select('id, guest_name, mobile_number').eq('booking_id', id).is('deleted_at', null),
    ])
    groupDetails = gd ?? null
    guests = g ?? []
  }

  const { data: bags, error: bagsErr } = await supabaseAdmin
    .from('group_bags')
    .select('*')
    .eq('booking_id', id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (bagsErr) return NextResponse.json({ error: bagsErr.message }, { status: 500 })

  const canGenerate = CONFIRMED_ONWARD.has(booking.status)

  return NextResponse.json({
    booking,
    group_booking: groupDetails,
    guests,
    bags: bags ?? [],
    can_generate: canGenerate,
  })
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await context.params

  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from('bookings').select('id, booking_type, status').eq('id', id).maybeSingle()
  if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 500 })
  if (!booking)    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  if (!CONFIRMED_ONWARD.has(booking.status)) {
    return NextResponse.json(
      { error: 'This booking is not confirmed yet. Baggage tags can only be generated once a booking reaches Confirmed status.' },
      { status: 403 }
    )
  }

  if (booking.booking_type !== 'group') {
    // Individual booking — normally already handled by the auto-hook on
    // confirm (app/api/admin/bookings/[id]/route.ts); this covers
    // bookings confirmed before the Bag Tag System existed.
    const result = await ensureBagsForBooking(id)
    if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
    return NextResponse.json({ generated: result.created })
  }

  // Group booking — bags already exist from the manifest; just stamp
  // tag_generated_at on whichever ones don't have it yet.
  const { data: pending, error: pendingErr } = await supabaseAdmin
    .from('group_bags')
    .select('id')
    .eq('booking_id', id)
    .is('deleted_at', null)
    .is('tag_generated_at', null)
  if (pendingErr) return NextResponse.json({ error: pendingErr.message }, { status: 500 })

  if (!pending || pending.length === 0) return NextResponse.json({ generated: 0 })

  const now = new Date().toISOString()
  const ids = pending.map(b => b.id)
  const { error: updateErr } = await supabaseAdmin
    .from('group_bags').update({ tag_generated_at: now }).in('id', ids)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  await Promise.all(ids.map(bagId => trackBagEvent(bagId, 'tag_generated', { note: 'Tag generated', changedBy: 'admin' })))

  return NextResponse.json({ generated: ids.length })
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
  const bagIds: string[] = Array.isArray(body?.bag_ids) ? body.bag_ids : []
  if (bagIds.length === 0) return NextResponse.json({ error: 'bag_ids is required' }, { status: 400 })

  const { data: bags, error: fetchErr } = await supabaseAdmin
    .from('group_bags').select('id, status, tag_printed_at').eq('booking_id', id).in('id', bagIds)
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!bags || bags.length === 0) return NextResponse.json({ error: 'No matching bags found for this booking' }, { status: 404 })

  const now = new Date().toISOString()

  // Bump status tag_generated -> tag_printed on FIRST print only — a
  // reprint (status already moved past tag_printed, e.g. the bag was
  // already picked up) must never regress the status backwards; it just
  // re-stamps tag_printed_at and logs the reprint as its own event.
  const firstPrintIds = bags.filter(b => b.status === 'tag_generated').map(b => b.id)
  const reprintIds    = bags.filter(b => b.status !== 'tag_generated').map(b => b.id)

  const { error: updateErr } = await supabaseAdmin
    .from('group_bags').update({ tag_printed_at: now }).in('id', bagIds)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  if (firstPrintIds.length > 0) {
    await supabaseAdmin.from('group_bags').update({ status: 'tag_printed' }).in('id', firstPrintIds)
  }

  await Promise.all([
    ...firstPrintIds.map(bagId => trackBagEvent(bagId, 'tag_printed', { note: 'Tag printed', changedBy: 'admin' })),
    ...reprintIds.map(bagId => {
      const bag = bags.find(b => b.id === bagId)
      return trackBagEvent(bagId, bag?.status ?? 'tag_printed', { note: 'Tag reprinted', changedBy: 'admin' })
    }),
  ])

  return NextResponse.json({ printed: bagIds.length })
}
