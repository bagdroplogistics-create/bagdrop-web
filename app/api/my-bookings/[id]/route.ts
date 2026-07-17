// BAGDROP — PATCH /api/my-bookings/[id]
//
// Lets a signed-in customer edit the logistics details of their own booking
// (pickup/drop address, dates, time slot, flight info, notes, bag count)
// directly from the mobile app's My Bookings tab. This intentionally does
// NOT allow changing service type or route — those (plus bag count) feed
// into the quote the ops team prepares manually, so a bag-count change here
// just means the quote they send will reflect the new count; nothing is
// auto-priced client-side. Service/route changes should go through support.
//
// Auth: same Supabase bearer-token pattern as GET /api/my-bookings.
// Ownership: the booking's customer_phone/customer_email must match the
// signed-in account before any update is allowed.
// Editable window: only bookings that haven't been picked up yet — once
// the ops team has acted on it, self-editing is blocked to avoid the
// customer changing details mid-pickup/delivery.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function phoneFromSyntheticEmail(authEmail: string): string | null {
  const m = authEmail.match(/^phone_(\d+)@auth\.bagdrop\.in$/i)
  if (!m) return null
  return '+' + m[1]
}

const EDITABLE_FIELDS = [
  'pickup_address',
  'drop_address',
  'pickup_date',
  'delivery_date',
  'time_slot',
  'flight_number',
  'notes',
] as const

// Once a booking reaches one of these, the ops team has already acted on
// it (or it's over) — no more self-service edits.
const LOCKED_STATUSES = new Set(['picked_up', 'in_transit', 'delivered', 'cancelled', 'rejected'])

const SELECT_COLUMNS =
  'id, tracking_id, status, customer_name, customer_email, customer_phone, ' +
  'service_type, service_label, from_city, to_city, pickup_address, drop_address, ' +
  'pickup_date, delivery_date, time_slot, flight_number, notes, total_bags, bag_details, total_amount, ' +
  'currency, payment_status, payment_reference, status_history, created_at, updated_at'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!token) {
    return NextResponse.json({ error: 'Missing Authorization bearer token.' }, { status: 401 })
  }

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: 'Invalid or expired session.' }, { status: 401 })
  }

  const authEmail = (userData.user.email ?? '').toLowerCase()
  if (!authEmail) {
    return NextResponse.json({ error: 'Account has no contact info on file.' }, { status: 400 })
  }
  const phone = phoneFromSyntheticEmail(authEmail)

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('bookings')
    .select('id, status, customer_phone, customer_email')
    .eq('id', id)
    .maybeSingle()

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
  }

  const owns =
    (!!phone && existing.customer_phone === phone) ||
    (!!authEmail && existing.customer_email === authEmail)
  if (!owns) {
    return NextResponse.json({ error: 'This booking does not belong to your account.' }, { status: 403 })
  }

  if (LOCKED_STATUSES.has(existing.status)) {
    return NextResponse.json(
      { error: 'This booking is already being processed and can no longer be edited here — please contact support to make changes.' },
      { status: 409 }
    )
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const updates: Record<string, unknown> = {}
  // Optional fields store null when cleared (matches how they're written on
  // booking creation) rather than an empty string.
  const NULLABLE_WHEN_EMPTY = new Set(['delivery_date', 'flight_number', 'notes'])
  for (const field of EDITABLE_FIELDS) {
    if (field in body) {
      const value = body[field]
      updates[field] = NULLABLE_WHEN_EMPTY.has(field) && value === '' ? null : value
    }
  }

  // Bag count / composition — sent as { bags: [{ type, quantity }, ...] }.
  // total_bags and bag_details are derived server-side, mirroring the same
  // shape POST /api/bookings writes on creation.
  if (Array.isArray(body.bags)) {
    const bags = (body.bags as { type: string; quantity: number }[]).filter(
      b => b && typeof b.type === 'string' && Number(b.quantity) > 0
    )
    const totalBags = bags.reduce((sum, b) => sum + Number(b.quantity), 0)
    if (totalBags < 1) {
      return NextResponse.json({ error: 'At least one bag is required.' }, { status: 400 })
    }
    const hasWedding = bags.some(b => b.type === 'wedding')
    updates.total_bags = totalBags
    updates.bag_details = hasWedding
      ? {
          bags,
          weddingGuests: body.weddingGuests ?? null,
          weddingEventType: body.weddingEventType ?? null,
          weddingEventDate: body.weddingEventDate ?? null,
          weddingPickupLocation: body.weddingPickupLocation ?? null,
          weddingDropLocation: body.weddingDropLocation ?? null,
          weddingSpecialInstructions: body.weddingSpecialInstructions ?? null,
        }
      : { bags }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No editable fields provided.' }, { status: 400 })
  }

  updates.updated_at = new Date().toISOString()

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('bookings')
    .update(updates)
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single()

  if (updateErr) {
    console.error('[my-bookings PATCH] update error:', updateErr.message)
    return NextResponse.json({ error: 'Could not update your booking. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ booking: updated })
}
