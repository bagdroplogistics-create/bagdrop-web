import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendCustomerConfirmation, sendInquiryNotification, type BookingEmailData } from '@/lib/email'
import { SERVICE_TYPES, COVERAGE_CITIES, TIME_SLOTS } from '@/lib/constants'

export async function POST(req: Request) {
  try {
    const { booking, pricing } = await req.json()

    const rawPhoneCheck = booking?.phone?.replace(/\D/g, '') ?? ''
    const countryCode   = booking?.countryCode ?? '+91'
    // Validate by country: India 10 digits (6-9), UK 10-11, USA/CA 10
    const phoneValid =
      countryCode === '+91'  ? /^[6-9]\d{9}$/.test(rawPhoneCheck) :
      countryCode === '+44'  ? /^\d{10,11}$/.test(rawPhoneCheck)  :
                               /^\d{10}$/.test(rawPhoneCheck)
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

    const customerName  = booking.name.trim()
    const customerEmail = booking.email?.trim().toLowerCase() ?? ''
    const rawPhone      = booking.phone?.replace(/\D/g, '') ?? ''
    // Resolve actual dial code (+1CA → +1 for Canada)
    const dialCode      = countryCode === '+1CA' ? '+1' : countryCode
    const customerPhone = rawPhone ? dialCode + rawPhone : ''

    // Booking source: the mobile app explicitly sends { booking: { source: 'mobile-app', ... } }.
    // Anything else (including the real website, which sends no source field at all)
    // is treated as 'website'. Whitelisted so an unexpected value can't leak into
    // the tracking ID prefix or lead/CRM source fields.
    const bookingSource: 'mobile-app' | 'website' = booking?.source === 'mobile-app' ? 'mobile-app' : 'website'
    const trackingIdPrefix = bookingSource === 'mobile-app' ? 'BDM-' : 'BD-'
    const trackingId = trackingIdPrefix + Math.random().toString(36).toUpperCase().slice(2, 8)

    const { data: savedBooking, error: dbError } = await supabaseAdmin
      .from('bookings')
      .insert({
        tracking_id:    trackingId,
        status:         'pending',
        customer_name:  customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
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
        status_history: [{ status: 'pending', timestamp: new Date().toISOString(), note: 'Booking request received' }],
      })
      .select()
      .single()

    if (dbError) {
      console.error('[Bookings] Supabase insert error:', dbError)
    }

    // ── Auto-create Lead ────────────────────────────────────────────
    // Every website booking gets its own lead row.
    // We check by booking_id (not phone) so repeat customers also appear in leads.
    if (savedBooking) {
      try {
        // Guard against duplicate lead on API retry: check by booking_id
        const { data: existingLeadForBooking } = await supabaseAdmin
          .from('leads')
          .select('id')
          .eq('booking_id', savedBooking.id)
          .maybeSingle()

        if (!existingLeadForBooking) {
          // Generate lead number: BDL-YYYY-NNNN (max-based to avoid collisions on delete)
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
            name:             customerName,
            phone:            customerPhone,
            email:            customerEmail || null,
            source:           bookingSource,
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
            notes:            `Auto-created from ${bookingSource === 'mobile-app' ? 'mobile app' : 'website'} booking ${trackingId}`,
            booking_id:       savedBooking.id,
          }).select('id').single()

          if (leadInsertErr) {
            console.error('[Bookings] Lead insert error:', leadInsertErr.message)
          } else {
            // Note: lead_id on bookings omitted (column may not exist in all DB schemas).
            // Relationship is maintained via leads.booking_id set above.
            console.log(`[Bookings] Auto-created lead ${leadNumber} for booking ${trackingId}`)
          }
        } else {
          // Lead already exists for this booking (API retry or race) — no-op.
          console.log(`[Bookings] Lead already exists for booking ${trackingId} — skipping duplicate`)
        }
      } catch (leadErr) {
        // Non-fatal — booking already saved, just log the lead creation failure
        console.error('[Bookings] Lead auto-create failed (non-fatal):', leadErr)
      }
    }
    // ── End Auto-create Lead ────────────────────────────────────────

    const emailData: BookingEmailData = {
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
      orderId:     savedBooking?.id   ?? trackingId,
    }

    // Send notification emails — awaited so Vercel doesn't terminate before they complete
    const emailResults = await Promise.allSettled([
      // Customer confirmation (only if email provided)
      ...(customerEmail ? [sendCustomerConfirmation(emailData)] : []),
      // Admin inquiry notification to both info@ and aditya@ with full details
      sendInquiryNotification({
        inquiryNumber:   trackingId,
        source:          bookingSource,
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
      }),
    ])
    emailResults.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`[bookings] email[${i}] rejected:`, r.reason)
      } else {
        console.log(`[bookings] email[${i}] fulfilled`)
      }
    })

    return NextResponse.json({ success: true, trackingId, id: savedBooking?.id })
  } catch (err) {
    console.error('[Bookings] Unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
