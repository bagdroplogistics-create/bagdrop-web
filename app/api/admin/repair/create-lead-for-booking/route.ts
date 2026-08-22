import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

/**
 * POST /api/admin/repair/create-lead-for-booking
 * Body: { tracking_id: string } OR { booking_id: string }
 *
 * Mirror of /api/admin/repair/create-booking-for-lead — for the opposite
 * failure mode found 2026-08-22: a booking was successfully created (e.g.
 * BDA-2026-0114) but the paired lead insert failed right after (transient
 * DB error, constraint violation, etc.), leaving a booking with no lead
 * row at all. That booking is visible on the Dashboard & Bookings tab
 * (reads `bookings` directly) but invisible on the Leads/Quote Management
 * tab under every filter, including Lost — there's no lead row to find.
 *
 * The three call sites that can produce this (app/api/admin/leads/route.ts,
 * app/api/contact/route.ts, app/api/y2k/inquiry/route.ts) were all fixed
 * the same day: admin/leads now rolls back the orphaned booking immediately
 * (safe — nothing was ever promised to a customer at that point), while
 * contact/y2k deliberately keep the booking and rely on this repair route
 * instead, since deleting a real customer's only inquiry record over a
 * rare backend hiccup would be worse than leaving it repairable.
 *
 * ALWAYS derives the lead_number from the booking's own tracking_id via
 * simple prefix substitution (BDA-YYYY-NNNN → BDL-YYYY-NNNN) — never an
 * independent counter mint — so a repaired lead can never end up mismatched
 * from its booking (see nextInquiryNumberPair's comment in
 * lib/number-series.ts for the full history of why that matters).
 * Idempotent — if a lead already exists for this booking, returns it.
 */
export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const trackingId: string | undefined = body?.tracking_id
  const bookingId:  string | undefined = body?.booking_id
  if (!trackingId && !bookingId) {
    return NextResponse.json({ error: 'tracking_id or booking_id is required' }, { status: 400 })
  }

  // ── 1. Fetch the booking ──────────────────────────────────────────
  const bookingQuery = supabaseAdmin.from('bookings').select('*')
  const { data: booking, error: bookingErr } = bookingId
    ? await bookingQuery.eq('id', bookingId).maybeSingle()
    : await bookingQuery.eq('tracking_id', trackingId).maybeSingle()

  if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 500 })
  if (!booking)   return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  // ── 2. Idempotency guard — a lead may already exist for this booking ──
  const { data: existingLead } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('booking_id', booking.id)
    .maybeSingle()
  if (existingLead) return NextResponse.json({ lead: existingLead, created: false })

  // ── 3. Derive the paired lead_number — never mint independently ──────
  if (!/^BDA-/.test(booking.tracking_id ?? '')) {
    return NextResponse.json(
      { error: `Booking tracking_id "${booking.tracking_id}" doesn't match the expected BDA-YYYY-NNNN format — refusing to guess a lead_number.` },
      { status: 400 }
    )
  }
  const leadNumber = booking.tracking_id.replace(/^BDA-/, 'BDL-')

  // If that exact lead_number is already taken by an unrelated lead, don't
  // silently overwrite it — surface it so a human can look at both records.
  const { data: collidingLead } = await supabaseAdmin
    .from('leads')
    .select('id, booking_id, name, phone')
    .eq('lead_number', leadNumber)
    .maybeSingle()
  if (collidingLead) {
    return NextResponse.json({
      error: `lead_number ${leadNumber} is already taken by a different lead (${collidingLead.name}, ${collidingLead.phone}, id ${collidingLead.id}) that isn't linked to this booking. Resolve that conflict manually before repairing this booking.`,
    }, { status: 409 })
  }

  // ── 4. Create the lead, carrying over everything the booking has ─────
  const { data: newLead, error: insertErr } = await supabaseAdmin
    .from('leads')
    .insert({
      lead_number:      leadNumber,
      title:            booking.title ?? null,
      name:             booking.customer_name  ?? 'Unknown',
      phone:            booking.customer_phone ?? '',
      email:            booking.customer_email || null,
      source:           'repair-tool',
      status:           'new',
      service_type:     booking.service_type ?? '',
      service_interest: booking.service_type ?? '',
      from_city:        booking.from_city ?? null,
      to_city:          booking.to_city   ?? null,
      pickup_date:      booking.pickup_date   ?? null,
      delivery_date:    booking.delivery_date ?? null,
      pickup_address:   booking.pickup_address ?? null,
      drop_address:     booking.drop_address   ?? null,
      bags_count:       booking.total_bags ?? 1,
      flight_number:    booking.flight_number ?? null,
      notes:            `Backfilled via repair tool — this booking (${booking.tracking_id}) existed with no linked lead.`,
      booking_id:       booking.id,
    })
    .select()
    .single()

  if (insertErr || !newLead) {
    return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })
  }

  return NextResponse.json({ lead: newLead, created: true }, { status: 201 })
}
