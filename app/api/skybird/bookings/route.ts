import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendCustomerConfirmation, sendInquiryNotification, type BookingEmailData } from '@/lib/email'
import { sendNewInquiryWhatsApp } from '@/lib/new-inquiry-notification'
import { sendLeadAcknowledgment } from '@/lib/lead-acknowledgment'
import { SERVICE_TYPES, COVERAGE_CITIES, TIME_SLOTS, TITLE_OPTIONS, DEFAULT_TITLE, type TitleId } from '@/lib/constants'
import { isValidPhoneForCountry, toE164 } from '@/lib/phone-format'
import { DEFAULT_COUNTRY_ISO2 } from '@/lib/phone-countries'
import { requireSkybirdAuth, SKYBIRD_SOURCE, SKYBIRD_PARTNER_NAME } from '@/lib/skybird-auth'

// ============================================================================
// SKYBIRD PARTNER DASHBOARD — scoped bookings API
// ============================================================================
// Deliberately a SEPARATE route from the public /api/bookings (not a shared
// handler) so Skybird-specific changes can never regress the live,
// already-working customer booking flow. Field mapping, pricing payload
// shape, bag/wedding details, auto-lead-creation and notification pipeline
// all mirror /api/bookings/route.ts exactly — keep the two in sync if the
// underlying booking data model changes.
//
// Differences from the public route:
//   - Requires a valid Skybird partner key (requireSkybirdAuth), not public.
//   - source is ALWAYS forced to 'skybird' and partner_name to 'Skybird USA'
//     server-side — whatever the client sends is ignored. Skybird agents
//     can never spoof or see these fields.
//   - Tracking IDs use the 'BDS-' prefix (Bagdrop-Skybird), matching the
//     existing per-surface prefix convention (BD- website, BDM- mobile app,
//     BDA- admin-created lead).
// ============================================================================

export async function POST(req: NextRequest) {
  if (!requireSkybirdAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    const timeSlotObj   = TIME_SLOTS.find((t: { id: string; label: string; range?: string }) => t.id === booking.timeSlotId)
    const timeSlotLabel = timeSlotObj
      ? (timeSlotObj.label + (timeSlotObj.range ? ' (' + timeSlotObj.range + ')' : ''))
      : (booking.timeSlotId ?? '')

    const customerTitle: TitleId = TITLE_OPTIONS.includes(booking?.title) ? booking.title : DEFAULT_TITLE
    const customerName  = booking.name.trim()
    const customerEmail = booking.email?.trim().toLowerCase() ?? ''
    const rawPhone      = booking.phone?.replace(/\D/g, '') ?? ''
    const customerPhone = toE164(rawPhone, countryIso2)

    // Source is fixed — never trust the client here.
    const trackingId = 'BDS-' + Math.random().toString(36).toUpperCase().slice(2, 8)

    const { data: savedBooking, error: dbError } = await supabaseAdmin
      .from('bookings')
      .insert({
        tracking_id:    trackingId,
        status:         'inquiry',
        title:          customerTitle,
        customer_name:  customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        customer_phone_country_code: countryIso2,
        customer_phone_national:     rawPhone,
        service_type:   booking.serviceId   ?? '',
        service_label:  serviceLabel,
        from_city:      fromCityLabel,
        to_city:        toCityLabel,
        pickup_address: booking.pickupAddress   ?? null,
        drop_address:   booking.dropAddress    ?? null,
        pickup_date:    booking.date           ?? null,
        delivery_date:  booking.deliveryDate   || null,
        time_slot:      timeSlotLabel,
        flight_number:  booking.flightNumber   ?? null,
        flight_datetime: booking.flightDateTime || null,
        total_bags:     pricing?.totalBags     ?? booking.bags ?? 1,
        bag_details:    (() => {
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
        })(),
        total_amount:   pricing?.total         ?? 0,
        currency:       'INR',
        add_ons:        pricing?.addOns        ?? null,
        notes: (() => {
          const parts: string[] = []
          if (booking.notes?.trim()) parts.push(booking.notes.trim())
          if (booking.weddingEventType) {
            parts.push(`[Wedding] Event: ${booking.weddingEventType}`)
            if (booking.weddingGuests)    parts.push(`Guests: ${booking.weddingGuests}`)
            if (booking.weddingEventDate) parts.push(`Event date: ${booking.weddingEventDate}`)
            if (booking.weddingSpecialInstructions) parts.push(`Notes: ${booking.weddingSpecialInstructions}`)
          }
          return parts.length ? parts.join(' | ') : null
        })(),
        // Hidden/internal — admin-only visibility, never editable by Skybird.
        partner_name:   SKYBIRD_PARTNER_NAME,
        status_history: [{ status: 'inquiry', timestamp: new Date().toISOString(), note: 'Skybird partner inquiry received' }],
      })
      .select()
      .single()

    if (dbError || !savedBooking) {
      console.error('[Skybird Bookings] Supabase insert error:', dbError)
      // Unlike the public /api/bookings route, we surface this instead of
      // silently returning success:true — an internal partner tool must
      // never show a "confirmed" tracking ID that was never persisted.
      // Most common cause: a DB migration (e.g. SKYBIRD_PARTNER_MIGRATION.sql)
      // hasn't been run yet, so a column this insert writes doesn't exist.
      return NextResponse.json(
        { error: 'Could not save the inquiry. Please try again or contact Bagdrop support.' },
        { status: 500 }
      )
    }

    // ── Auto-create Lead — same as /api/bookings, force-tagged skybird ────
    let ackPromise: Promise<void> = Promise.resolve()
    {
      try {
        const { data: existingLeadForBooking } = await supabaseAdmin
          .from('leads')
          .select('id')
          .eq('booking_id', savedBooking.id)
          .maybeSingle()

        if (!existingLeadForBooking) {
          const year = new Date().getFullYear()
          const { data: lastLead } = await supabaseAdmin
            .from('leads')
            .select('lead_number')
            .like('lead_number', `BDL-${year}-%`)
            .order('lead_number', { ascending: false })
            .limit(1)
            .maybeSingle()
          let nextSeq = 1
          if (lastLead?.lead_number) {
            const parts = lastLead.lead_number.split('-')
            const last = parseInt(parts[parts.length - 1], 10)
            if (!isNaN(last)) nextSeq = last + 1
          }
          const leadNumber = `BDL-${year}-${String(nextSeq).padStart(4, '0')}`

          const { data: newLead, error: leadInsertErr } = await supabaseAdmin.from('leads').insert({
            lead_number:      leadNumber,
            title:            customerTitle,
            name:             customerName,
            phone:            customerPhone,
            email:            customerEmail || null,
            source:           SKYBIRD_SOURCE,
            partner_name:     SKYBIRD_PARTNER_NAME,
            status:           'new',
            service_type:     booking.serviceId ?? '',
            service_interest: booking.serviceId ?? '',
            from_city:        fromCityLabel,
            to_city:          toCityLabel,
            pickup_date:      booking.date ?? null,
            travel_date:      booking.date ?? null,
            delivery_date:    booking.deliveryDate || null,
            pickup_address:   booking.pickupAddress ?? null,
            drop_address:     booking.dropAddress ?? null,
            bags_count:       pricing?.totalBags ?? booking.bags ?? 1,
            flight_number:    booking.flightNumber ?? null,
            notes:            `Auto-created from Skybird partner inquiry ${trackingId}`,
            booking_id:       savedBooking.id,
          }).select('id').single()

          if (leadInsertErr) {
            console.error('[Skybird Bookings] Lead insert error:', leadInsertErr.message)
          } else {
            console.log(`[Skybird Bookings] Auto-created lead ${leadNumber} for booking ${trackingId}`)
            if (newLead) {
              ackPromise = sendLeadAcknowledgment({
                id:    newLead.id,
                title: customerTitle,
                name:  customerName,
                phone: customerPhone,
                email: customerEmail,
              })
            }
          }
        } else {
          console.log(`[Skybird Bookings] Lead already exists for booking ${trackingId} — skipping duplicate`)
        }
      } catch (leadErr) {
        console.error('[Skybird Bookings] Lead auto-create failed (non-fatal):', leadErr)
      }
    }
    // ── End Auto-create Lead ────────────────────────────────────────

    const emailData: BookingEmailData = {
      customerTitle,
      customerName,
      customerEmail,
      customerPhone,
      trackingId,
      serviceLabel,
      fromCity:    fromCityLabel,
      toCity:      toCityLabel,
      date:        booking.date     ?? '',
      timeSlot:    timeSlotLabel,
      totalBags:   pricing?.totalBags ?? booking.bags ?? 1,
      orderId:     savedBooking.id,
    }

    const inquiryData = {
      inquiryNumber:   trackingId,
      source:          'Skybird USA (Partner)',
      customerTitle,
      customerName,
      customerPhone,
      customerEmail,
      serviceType:     booking.serviceId ?? '',
      fromCity:        fromCityLabel,
      toCity:          toCityLabel,
      pickupAddress:   booking.pickupAddress ?? null,
      deliveryAddress: booking.dropAddress   ?? null,
      bagsCount:       pricing?.totalBags ?? booking.bags ?? 1,
      travelDate:      booking.date           ?? null,
      pickupDate:      booking.date           ?? null,
      deliveryDate:    booking.deliveryDate   || null,
      flightNumber:    booking.flightNumber   ?? null,
      notes: (() => {
        const parts: string[] = []
        if (booking.notes?.trim()) parts.push(booking.notes.trim())
        if (booking.weddingEventType) parts.push('[Wedding] ' + booking.weddingEventType)
        return parts.join(' | ') || null
      })(),
      submittedAt: new Date().toISOString(),
    }

    const emailResults = await Promise.allSettled([
      ...(customerEmail ? [sendCustomerConfirmation(emailData)] : []),
      sendInquiryNotification(inquiryData),
      // Internal ops WhatsApp ping — mirrors the admin email above. See
      // lib/new-inquiry-notification.ts.
      sendNewInquiryWhatsApp(inquiryData),
      ackPromise,
    ])
    emailResults.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`[skybird/bookings] email[${i}] rejected:`, r.reason)
      } else {
        console.log(`[skybird/bookings] email[${i}] fulfilled`)
      }
    })

    return NextResponse.json({ success: true, trackingId, id: savedBooking.id })
  } catch (err) {
    console.error('[Skybird Bookings] Unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
