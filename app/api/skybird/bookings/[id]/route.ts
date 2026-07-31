import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { SERVICE_TYPES, COVERAGE_CITIES } from '@/lib/constants'
import { isValidPhoneForCountry, toE164 } from '@/lib/phone-format'
import { DEFAULT_COUNTRY_ISO2 } from '@/lib/phone-countries'
import { requireSkybirdAuth, SKYBIRD_PARTNER_NAME } from '@/lib/skybird-auth'

// ============================================================================
// SKYBIRD PARTNER DASHBOARD — edit an existing booking
// ============================================================================
// Deliberately a separate route from app/api/skybird/bookings/route.ts
// (create) and from every BagDrop Admin booking route — editing here can
// never regress the Admin Dashboard/website's own PATCH
// (app/api/admin/bookings/[id]/route.ts is untouched by this file).
//
// Ownership boundary: a Skybird key may only GET/PATCH a booking whose
// partner_name is already 'Skybird USA' — i.e. one Skybird itself created.
// It can never read or edit a BagDrop-direct or another partner's booking,
// even if it somehow learned the booking id.
//
// Editable window: only while the booking is still at status 'inquiry' —
// this feature is for fixing a typo right after creating an inquiry, not
// for rewriting a booking BagDrop staff have already started acting on
// (quoted, confirmed, picked up, etc.). Once it's moved past 'inquiry',
// Skybird should contact BagDrop support instead of silently changing
// details out from under an in-progress booking.
//
// No customer-facing notification is sent on edit (unlike creation) —
// resending a confirmation/inquiry email for what's usually just a typo
// fix would be noisy. The BagDrop team sees the change via the booking's
// own status_history, same as any other edit trail in this codebase.
// ============================================================================

const BOOKING_SELECT = 'id, tracking_id, status, status_history, partner_name, customer_name, customer_email, customer_phone, customer_phone_country_code, customer_phone_national, service_type, service_label, from_city, to_city, pickup_address, drop_address, pickup_date, delivery_date, time_slot, flight_number, flight_datetime, total_bags, bag_details, total_amount, add_ons, notes'

async function loadOwnedBooking(id: string) {
  const { data, error } = await supabaseAdmin.from('bookings').select(BOOKING_SELECT).eq('id', id).maybeSingle()
  if (error || !data) return { booking: null as null | Record<string, unknown>, error: error?.message ?? 'Booking not found' }
  if (data.partner_name !== SKYBIRD_PARTNER_NAME) return { booking: null, error: 'Booking not found' }
  return { booking: data, error: null }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireSkybirdAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await context.params
  const { booking, error } = await loadOwnedBooking(id)
  if (!booking) return NextResponse.json({ error: error ?? 'Booking not found' }, { status: 404 })

  return NextResponse.json({
    booking,
    canEdit: booking.status === 'inquiry',
  })
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireSkybirdAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await context.params
  const { booking: existing, error: loadErr } = await loadOwnedBooking(id)
  if (!existing) return NextResponse.json({ error: loadErr ?? 'Booking not found' }, { status: 404 })

  if (existing.status !== 'inquiry') {
    return NextResponse.json(
      { error: 'This booking has already moved past the inquiry stage and can no longer be edited here. Please contact Bagdrop support for changes.' },
      { status: 409 }
    )
  }

  try {
    const { booking, pricing } = await req.json()

    const rawPhoneCheck = booking?.phone?.replace(/\D/g, '') ?? ''
    const countryIso2 = booking?.countryIso2 || DEFAULT_COUNTRY_ISO2
    const phoneValid = isValidPhoneForCountry(rawPhoneCheck, countryIso2)
    if (!booking?.name || !phoneValid) {
      return NextResponse.json(
        { error: 'Name and a valid mobile number are required' },
        { status: 400 }
      )
    }

    const serviceLabel  = SERVICE_TYPES.find((s: { id: string; label: string }) => s.id === booking.serviceId)?.label ?? booking.serviceId ?? 'Standard Delivery'
    const fromCityLabel = COVERAGE_CITIES.find((c: { id: string; label: string }) => c.id === booking.fromCity)?.label ?? booking.fromCity ?? ''
    const toCityLabel   = COVERAGE_CITIES.find((c: { id: string; label: string }) => c.id === booking.toCity)?.label   ?? booking.toCity   ?? ''
    // time_slot is stored as the raw timeSlotId (see app/api/skybird/bookings/route.ts —
    // the TIME_SLOTS label lookup there never actually matches StepSchedule's
    // 24h TIME_OPTIONS ids, so the id itself ends up in the DB either way).
    // Mirrored here rather than "fixed" so an edit round-trips identically
    // to how the value was originally stored at creation.
    const timeSlotLabel = booking.timeSlotId ?? ''

    const customerName  = booking.name.trim()
    const customerEmail = booking.email?.trim().toLowerCase() ?? ''
    const rawPhone       = booking.phone?.replace(/\D/g, '') ?? ''
    const customerPhone  = toE164(rawPhone, countryIso2)

    const bagDetails = (() => {
      const base = booking.bagDetails ?? null
      const hasWedding = Array.isArray(booking.bags)
        ? booking.bags.some((b: { type: string }) => b.type === 'wedding')
        : false
      if (!hasWedding) return base
      return {
        ...(typeof base === 'object' && base !== null ? base : {}),
        weddingGuests:              booking.weddingGuests              ?? null,
        weddingEventType:           booking.weddingEventType           ?? null,
        weddingEventDate:           booking.weddingEventDate           ?? null,
        weddingPickupLocation:      booking.weddingPickupLocation      ?? null,
        weddingDropLocation:        booking.weddingDropLocation        ?? null,
        weddingSpecialInstructions: booking.weddingSpecialInstructions ?? null,
      }
    })()

    const notes = (() => {
      const parts: string[] = []
      if (booking.notes?.trim()) parts.push(booking.notes.trim())
      if (booking.weddingEventType) {
        parts.push(`[Wedding] Event: ${booking.weddingEventType}`)
        if (booking.weddingGuests)    parts.push(`Guests: ${booking.weddingGuests}`)
        if (booking.weddingEventDate) parts.push(`Event date: ${booking.weddingEventDate}`)
        if (booking.weddingSpecialInstructions) parts.push(`Notes: ${booking.weddingSpecialInstructions}`)
      }
      return parts.length ? parts.join(' | ') : null
    })()

    const history = Array.isArray(existing.status_history) ? (existing.status_history as unknown[]) : []
    history.push({
      from: 'inquiry', to: 'inquiry', timestamp: new Date().toISOString(),
      changed_by: 'skybird', note: 'Booking details updated by Skybird partner',
    })

    const updatePayload = {
      customer_name:  customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      customer_phone_country_code: countryIso2,
      customer_phone_national:     rawPhone,
      service_type:   booking.serviceId ?? '',
      service_label:  serviceLabel,
      from_city:      fromCityLabel,
      to_city:        toCityLabel,
      pickup_address: booking.pickupAddress ?? null,
      drop_address:   booking.dropAddress   ?? null,
      pickup_date:    booking.date          ?? null,
      delivery_date:  booking.deliveryDate  || null,
      time_slot:      timeSlotLabel,
      flight_number:  booking.flightNumber  ?? null,
      flight_datetime: booking.flightDateTime || null,
      total_bags:     pricing?.totalBags    ?? booking.bags ?? 1,
      bag_details:    bagDetails,
      total_amount:   pricing?.total        ?? existing.total_amount ?? 0,
      add_ons:        pricing?.addOns       ?? null,
      notes,
      status_history: history,
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('bookings')
      .update(updatePayload)
      .eq('id', id)
      .select('id, tracking_id')
      .single()

    if (updateErr || !updated) {
      console.error('[Skybird Bookings PATCH] update failed:', updateErr?.message)
      return NextResponse.json({ error: 'Could not save changes. Please try again.' }, { status: 500 })
    }

    // Mirror the same subset of fields onto the linked lead row, if one
    // exists — the Skybird dashboard's inquiries table (GET
    // /api/skybird/leads) reads from `leads`, not `bookings`, so without
    // this the table would keep showing the pre-edit route/dates/bags.
    const { error: leadUpdateErr } = await supabaseAdmin
      .from('leads')
      .update({
        name:  customerName,
        phone: customerPhone,
        email: customerEmail || null,
        service_interest: booking.serviceId ?? '',
        service_type:     booking.serviceId ?? '',
        from_city:      fromCityLabel,
        to_city:        toCityLabel,
        pickup_date:    booking.date         ?? null,
        travel_date:    booking.date         ?? null,
        delivery_date:  booking.deliveryDate || null,
        pickup_address: booking.pickupAddress ?? null,
        drop_address:   booking.dropAddress   ?? null,
        bags_count:     pricing?.totalBags ?? booking.bags ?? 1,
        flight_number:  booking.flightNumber ?? null,
      })
      .eq('booking_id', id)

    if (leadUpdateErr) {
      // Non-fatal — the booking itself saved fine; the inquiries table row
      // just won't reflect the edit until this is investigated.
      console.error('[Skybird Bookings PATCH] linked lead sync failed (non-fatal):', leadUpdateErr.message)
    }

    return NextResponse.json({ success: true, trackingId: updated.tracking_id, id: updated.id })
  } catch (err) {
    console.error('[Skybird Bookings PATCH] Unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
