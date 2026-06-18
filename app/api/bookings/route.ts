import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendCustomerConfirmation, sendAdminNotification, type BookingEmailData } from '@/lib/email'
import { SERVICE_TYPES, COVERAGE_CITIES, TIME_SLOTS } from '@/lib/constants'

export async function POST(req: Request) {
  try {
    const { booking, pricing } = await req.json()

    const rawPhoneCheck = booking?.phone?.replace(/\D/g, '') ?? ''
    if (!booking?.name || !/^[6-9]\d{9}$/.test(rawPhoneCheck)) {
      return NextResponse.json(
        { error: 'Name and a valid 10-digit mobile number are required' },
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
    const customerPhone = rawPhone ? '+91' + rawPhone : ''

    const trackingId = 'BD-' + Math.random().toString(36).toUpperCase().slice(2, 8)

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
        pickup_address: booking.pickupAddress  ?? null,
        drop_address:   booking.dropAddress    ?? null,
        pickup_date:    booking.date           ?? null,
        time_slot:      timeSlotLabel,
        flight_number:  booking.flightNumber   ?? null,
        total_bags:     pricing?.totalBags     ?? booking.bags ?? 1,
        bag_details:    booking.bagDetails     ?? null,
        total_amount:   pricing?.total         ?? 0,
        currency:       'INR',
        add_ons:        pricing?.addOns        ?? null,
        notes:          booking.notes          ?? null,
        status_history: [{ status: 'pending', timestamp: new Date().toISOString(), note: 'Booking request received' }],
      })
      .select()
      .single()

    if (dbError) {
      console.error('[Bookings] Supabase insert error:', dbError)
    }

    // ── Auto-create Lead ────────────────────────────────────────────
    // Only create a lead if one doesn't already exist for this phone number
    if (savedBooking && customerPhone) {
      try {
        const { data: existingLead } = await supabaseAdmin
          .from('leads')
          .select('id')
          .eq('phone', customerPhone)
          .limit(1)
          .single()

        if (!existingLead) {
          // Generate lead number: BDL-YYYY-NNNN
          const year = new Date().getFullYear()
          const { count } = await supabaseAdmin
            .from('leads')
            .select('*', { count: 'exact', head: true })
          const seq = String((count ?? 0) + 1).padStart(4, '0')
          const leadNumber = `BDL-${year}-${seq}`

          await supabaseAdmin.from('leads').insert({
            lead_number:      leadNumber,
            name:             customerName,
            phone:            customerPhone,
            email:            customerEmail || null,
            source:           'website',
            status:           'new',
            service_type:     booking.serviceId ?? '',
            service_interest: booking.serviceId ?? '',
            from_city:        fromCityLabel,
            to_city:          toCityLabel,
            travel_date:      booking.date ?? null,
            bags_count:       pricing?.totalBags ?? booking.bags ?? 1,
            notes:            `Auto-created from booking ${trackingId}`,
            booking_id:       savedBooking.id,
          })
          console.log(`[Bookings] Auto-created lead ${leadNumber} for ${customerPhone}`)
        } else {
          console.log(`[Bookings] Lead already exists for ${customerPhone} — skipping`)
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

    Promise.allSettled([
      ...(customerEmail ? [sendCustomerConfirmation(emailData)] : []),
      sendAdminNotification(emailData),
    ])

    return NextResponse.json({ success: true, trackingId, id: savedBooking?.id })
  } catch (err) {
    console.error('[Bookings] Unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
