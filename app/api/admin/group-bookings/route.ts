import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { nextInquiryNumberPair, nextGroupBookingNumber } from '@/lib/number-series'
import { mintBagIds } from '@/lib/group-booking'

// ── Group / Wedding Booking module — Phase 1 ─────────────────────────────
// A Group Booking is a `bookings` row (booking_type = 'group') plus a 1:1
// `group_booking_details` row for the event-specific fields, plus a linked
// `leads` row (same pattern every other creation path uses — see
// app/api/admin/leads/route.ts) so the EXISTING quote engine, payment
// workflow, LR, Tripsheet, and Invoice modules all work on this booking
// completely unmodified — none of them know or care that it's a group.
//
// This is deliberately NOT a parallel booking system: 150 bags never
// become 150 leads/quotes/bookings. See supabase/migrations/
// 20260904_group_bookings.sql for the schema this reads/writes.

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const search = (searchParams.get('search') ?? '').trim()

  // group_booking_details.booking_id has a FK to bookings.id — Supabase
  // auto-detects this and lets us embed the parent booking row in one
  // query (avoids an N+1 fetch per group booking).
  let query = supabaseAdmin
    .from('group_booking_details')
    .select('*, booking:bookings(id, tracking_id, status, payment_status, total_amount, from_city, to_city, created_at, is_test)')
    .order('created_at', { ascending: false })

  if (search) {
    // Matches Group Booking ID, Event Name, or Primary Contact — Guest
    // Name/Bag ID search happens inside a specific group booking's own
    // manifest (app/(admin)/admin/group-bookings/[id]/page.tsx), not here,
    // since guest/bag rows don't carry the event/contact fields this list
    // filters on.
    query = query.or(
      `group_booking_number.ilike.%${search}%,event_name.ilike.%${search}%,primary_contact_name.ilike.%${search}%,primary_contact_number.ilike.%${search}%`
    )
  }

  const { data: groups, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const bookingIds = (groups ?? []).map(g => g.booking_id)

  // Guest/bag counts — one query each for all groups at once, aggregated
  // in JS, rather than one query per row.
  let guestCounts = new Map<string, number>()
  let bagCounts   = new Map<string, number>()
  if (bookingIds.length > 0) {
    const [{ data: guestRows }, { data: bagRows }] = await Promise.all([
      supabaseAdmin.from('group_guests').select('booking_id').in('booking_id', bookingIds).is('deleted_at', null),
      supabaseAdmin.from('group_bags').select('booking_id').in('booking_id', bookingIds).is('deleted_at', null),
    ])
    for (const r of guestRows ?? []) guestCounts.set(r.booking_id, (guestCounts.get(r.booking_id) ?? 0) + 1)
    for (const r of bagRows   ?? []) bagCounts.set(r.booking_id,   (bagCounts.get(r.booking_id)   ?? 0) + 1)
  }

  const result = (groups ?? []).map(g => ({
    ...g,
    guest_count: guestCounts.get(g.booking_id) ?? 0,
    bag_count:   bagCounts.get(g.booking_id) ?? 0,
  }))

  return NextResponse.json({ group_bookings: result })
}

export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    return await handleCreate(req)
  } catch (err) {
    console.error('[group-bookings POST] Unhandled error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create group booking (unexpected server error)' },
      { status: 500 }
    )
  }
}

async function handleCreate(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => null)

  if (!body?.event_name?.trim())              return NextResponse.json({ error: 'Group / Event Name is required' }, { status: 400 })
  if (!body?.primary_contact_name?.trim())     return NextResponse.json({ error: 'Primary Contact Name is required' }, { status: 400 })
  if (!body?.primary_contact_number?.trim())   return NextResponse.json({ error: 'Primary Contact Number is required' }, { status: 400 })

  const estimatedBags = Number(body.estimated_total_bags) || 0
  const finalBags      = body.final_total_bags != null ? Number(body.final_total_bags) : null
  const totalBagsForBooking = finalBags || estimatedBags || 1
  const isTest = body.is_test === true

  const nullStr  = (v: unknown) => (typeof v === 'string' ? v.trim() : '') || null
  const nullDate = (v: unknown) => (typeof v === 'string' ? v.trim() : '') || null

  // Same paired-numbering guarantee every other creation path uses (see
  // lib/number-series.ts's nextInquiryNumberPair doc comment) — the
  // underlying bookings.tracking_id and leads.lead_number always share the
  // same NNNN suffix. The Group Booking Number is a separate, independent
  // series (GBL-), minted once here.
  const [{ trackingId, leadNumber }, groupBookingNumber] = await Promise.all([
    nextInquiryNumberPair(),
    nextGroupBookingNumber(),
  ])

  const bookingPayload = {
    tracking_id:    trackingId,
    booking_type:   'group',
    is_test:        isTest,
    title:          'Mr.',
    customer_name:  body.primary_contact_name.trim(),
    customer_phone: body.primary_contact_number.trim(),
    customer_email: nullStr(body.email)?.toLowerCase() ?? '',
    service_type:   'group-booking',
    service_label:  'Group / Wedding Booking',
    from_city:      nullStr(body.pickup_city) ?? '',
    to_city:        nullStr(body.delivery_city) ?? '',
    // Single-date fields on `bookings` — every other module (Operations
    // Center, LR "LR Date = Pickup Date", Dashboard today's-pickups widget)
    // reads these, so a Group Booking needs a best-effort anchor date even
    // though it operationally spans a pickup WINDOW (kept in full on
    // group_booking_details below). Pickup anchor = window start; delivery
    // anchor = the event date itself (bags are expected delivered by then).
    pickup_date:    nullDate(body.pickup_window_start),
    delivery_date:  nullDate(body.event_date),
    pickup_address: nullStr(body.pickup_address),
    drop_address:   nullStr(body.delivery_address),
    total_bags:     totalBagsForBooking,
    notes:          nullStr(body.special_instructions),
    status:         'inquiry',
    status_history: [{
      from: null, to: 'inquiry', timestamp: new Date().toISOString(), changed_by: 'system',
      note: `Group Booking created — ${groupBookingNumber} (${body.event_name.trim()})`,
    }],
  }

  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from('bookings')
    .insert(bookingPayload)
    .select('id, tracking_id')
    .single()

  if (bookingErr || !booking) {
    console.error('[group-bookings POST] booking insert failed:', bookingErr?.message)
    return NextResponse.json({ error: bookingErr?.message ?? 'Could not create the underlying booking' }, { status: 500 })
  }

  // Linked lead — gives this Group Booking a normal presence in the
  // existing quote engine (generate-quote keys off lead_id) without any
  // change to that route. bags_count here drives the existing "Up to 2
  // bags + Additional bag(s)" pricing calculation unchanged.
  const { error: leadErr } = await supabaseAdmin
    .from('leads')
    .insert({
      lead_number:      leadNumber,
      booking_id:       booking.id,
      booking_type:     'group',
      is_test:          isTest,
      title:            'Mr.',
      name:             body.primary_contact_name.trim(),
      phone:            body.primary_contact_number.trim(),
      email:            nullStr(body.email),
      source:           'group-wedding',
      service_interest: 'group-booking',
      service_type:     'group-booking',
      from_city:        nullStr(body.pickup_city),
      to_city:          nullStr(body.delivery_city),
      pickup_date:      nullDate(body.pickup_window_start),
      delivery_date:    nullDate(body.event_date),
      pickup_address:   nullStr(body.pickup_address),
      drop_address:     nullStr(body.delivery_address),
      bags_count:       totalBagsForBooking,
      status:           'new',
      notes:            nullStr(body.special_instructions),
    })

  if (leadErr) {
    // Non-fatal for the booking itself, but the quote engine won't work
    // until this exists — surface it clearly rather than silently leaving
    // an unquotable group booking behind.
    console.error('[group-bookings POST] lead insert failed:', leadErr.message)
  }

  const { data: details, error: detailsErr } = await supabaseAdmin
    .from('group_booking_details')
    .insert({
      booking_id:             booking.id,
      group_booking_number:   groupBookingNumber,
      event_name:             body.event_name.trim(),
      event_type:             nullStr(body.event_type),
      primary_contact_name:   body.primary_contact_name.trim(),
      primary_contact_number: body.primary_contact_number.trim(),
      primary_contact_email:  nullStr(body.email),
      event_date:             nullDate(body.event_date),
      pickup_city:            nullStr(body.pickup_city),
      pickup_address:         nullStr(body.pickup_address),
      delivery_city:          nullStr(body.delivery_city),
      delivery_address:       nullStr(body.delivery_address),
      hotel_name:              nullStr(body.hotel_name),
      estimated_total_bags:   estimatedBags || null,
      final_total_bags:       finalBags,
      pickup_window_start:    nullDate(body.pickup_window_start),
      pickup_window_end:      nullDate(body.pickup_window_end),
      special_instructions:   nullStr(body.special_instructions),
      remarks:                nullStr(body.remarks),
    })
    .select('*')
    .single()

  if (detailsErr) {
    console.error('[group-bookings POST] group_booking_details insert failed:', detailsErr.message)
    return NextResponse.json({ error: detailsErr.message }, { status: 500 })
  }

  // Auto-add the Primary Contact as the FIRST guest in the manifest, with
  // their own bags — otherwise the bags they're personally bringing exist
  // only as a top-level "estimate" number that a real guest/bag record
  // never backs, and get silently superseded the moment any OTHER guest is
  // added to the manifest (the manifest becomes the real source of truth —
  // see lib/group-booking.ts's syncBagCountToBooking). Founder-reported,
  // 2026-09-04: "main Monali Patel who has created group booking with 5
  // bags... this 5 bags is not count in total" — she was Primary Contact
  // but never a Guest row. This makes every new Group Booking start with
  // that guest already in place instead. Admin can still edit/remove her
  // like any other guest afterward.
  if (totalBagsForBooking > 0) {
    try {
      const { data: primaryGuest, error: primaryGuestErr } = await supabaseAdmin
        .from('group_guests')
        .insert({
          booking_id:  booking.id,
          guest_name:  body.primary_contact_name.trim(),
          mobile_number: body.primary_contact_number.trim(),
          email:       nullStr(body.email),
          hotel_name:  nullStr(body.hotel_name),
          delivery_location: nullStr(body.delivery_address),
        })
        .select('id')
        .single()

      if (primaryGuestErr || !primaryGuest) {
        console.error('[group-bookings POST] primary-contact guest insert failed:', primaryGuestErr?.message)
      } else {
        const bagNumbers = await mintBagIds(totalBagsForBooking)
        const { error: bagsErr } = await supabaseAdmin
          .from('group_bags')
          .insert(bagNumbers.map(bag_number => ({
            booking_id: booking.id,
            guest_id:   primaryGuest.id,
            bag_number,
            status:     'pending',
            hotel_name: nullStr(body.hotel_name),
            delivery_location: nullStr(body.delivery_address),
          })))
        if (bagsErr) console.error('[group-bookings POST] primary-contact bag insert failed:', bagsErr.message)
      }
    } catch (err) {
      // Non-fatal — the group booking itself is already created and valid;
      // the admin can still add the primary contact as a guest manually
      // from the manifest if this step failed.
      console.error('[group-bookings POST] primary-contact guest/bags step failed:', err instanceof Error ? err.message : err)
    }
  }

  return NextResponse.json({ group_booking: { ...details, booking } }, { status: 201 })
}
