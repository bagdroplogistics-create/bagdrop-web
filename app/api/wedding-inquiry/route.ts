import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendNewInquiryWhatsApp } from '@/lib/new-inquiry-notification'
import { nextTrackingId } from '@/lib/number-series'
import { alertCreationFailure } from '@/lib/creation-failure-alert'
import { COVERAGE_CITIES } from '@/lib/constants'
import { isValidPhoneForCountry, toE164 } from '@/lib/phone-format'
import { DEFAULT_COUNTRY_ISO2 } from '@/lib/phone-countries'

// BAGDROP — "Weddings and events" inquiry (from the Bagdrop Platform blueprint).
// Takes venue, dates and pickup cities ONLY — no rate is shown or promised. Mirrors
// app/api/iconiqa/inquiry/route.ts: creates a `bookings` row (status 'inquiry') and a
// linked lead so it appears on the Dashboard AND the Leads tab. It never creates a quote
// (the events desk prices weddings by hand) and never marks anything confirmed/paid.

const ROLES: Record<string, string> = {
  host: 'Host family', planner: 'Wedding or event planner', hotel: 'Hotel or venue', other: 'Other',
}
const cityLabel = (v: string) => COVERAGE_CITIES.find(c => c.id === v)?.label ?? v.trim()
const MAX = 400

export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    const name = String(b.name ?? '').trim()
    const countryIso2 = String(b.countryIso2 || DEFAULT_COUNTRY_ISO2)
    const digits = String(b.phone ?? '').replace(/\D/g, '')
    const email = String(b.email ?? '').trim().toLowerCase()
    const venueCity = String(b.venueCity ?? '').trim()
    const venue = String(b.venue ?? '').trim()
    const arrive = String(b.arrive ?? '')
    const leave = String(b.leave ?? '')
    const fromCities: string[] = Array.isArray(b.fromCities) ? b.fromCities.map((c: unknown) => String(c)).slice(0, 30) : []
    const families = parseInt(b.families, 10) || 0
    const bags = parseInt(b.bags, 10) || 0
    const role = ROLES[b.role] ? b.role : 'other'
    const note = String(b.note ?? '').trim()

    if (!name || !isValidPhoneForCountry(digits, countryIso2)) {
      return NextResponse.json({ error: 'Your name and a valid mobile number are required.' }, { status: 400 })
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }
    if (!venueCity) return NextResponse.json({ error: 'Please choose the venue city.' }, { status: 400 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(arrive)) return NextResponse.json({ error: 'Please choose the date guests arrive.' }, { status: 400 })
    if (leave && (!/^\d{4}-\d{2}-\d{2}$/.test(leave) || leave < arrive)) {
      return NextResponse.json({ error: 'The leaving date cannot be before the arrival date.' }, { status: 400 })
    }
    if (!fromCities.length) return NextResponse.json({ error: 'Choose at least one city the guests travel from.' }, { status: 400 })
    if (venue.length > MAX || note.length > 1000) {
      return NextResponse.json({ error: 'One of the fields is too long.' }, { status: 400 })
    }

    const phone = toE164(digits, countryIso2)
    const fromLabels = fromCities.map(cityLabel)
    const fromText = fromLabels.join(', ')
    const toText = [cityLabel(venueCity), venue].filter(Boolean).join(' · ')
    const trackingId = await nextTrackingId()
    const notes = [
      '[Wedding / Event inquiry — website]',
      `Role: ${ROLES[role]}`,
      `Venue: ${toText}`,
      `Guests arrive: ${arrive}${leave ? `, leave: ${leave}` : ''}`,
      `Guests travel from: ${fromText}`,
      families ? `Families (rough): ${families}` : '',
      bags ? `Bags (rough): ${bags}` : '',
      note ? `Note: ${note}` : '',
    ].filter(Boolean).join(' | ')

    const { data: saved, error: dbError } = await supabaseAdmin.from('bookings').insert({
      tracking_id:    trackingId,
      status:         'inquiry',
      customer_name:  name,
      customer_email: email || null,
      customer_phone: phone,
      customer_phone_country_code: countryIso2,
      customer_phone_national:     digits,
      service_type:   'destination-weddings',
      service_label:  'Wedding / Event inquiry',
      from_city:      fromText,
      to_city:        toText,
      pickup_date:    arrive,
      delivery_date:  leave || null,
      total_bags:     bags || 1,
      total_amount:   0,
      currency:       'INR',
      notes,
      status_history: [{ status: 'inquiry', timestamp: new Date().toISOString(), note: 'Wedding / event inquiry received' }],
    }).select('id').single()

    if (dbError || !saved) {
      await alertCreationFailure({
        source: 'wedding-inquiry', trackingId, failureStage: 'booking_insert',
        customerName: name, customerPhone: phone, customerEmail: email || null,
        errorMessage: dbError?.message ?? 'Insert returned no row', rawPayload: b,
      })
      return NextResponse.json({ error: 'Something went wrong saving your inquiry. Please try again, or contact us directly.' }, { status: 500 })
    }

    const leadNumber = trackingId.replace(/^BDA-/, 'BDL-')
    try {
      const { error: leadErr } = await supabaseAdmin.from('leads').insert({
        lead_number: leadNumber, name, phone, email: email || null,
        source: 'wedding-inquiry', status: 'new',
        service_type: 'destination-weddings', service_interest: 'destination-weddings',
        from_city: fromText, to_city: toText,
        travel_date: arrive, pickup_date: arrive,
        bags_count: bags || 1,
        notes: `Auto-created from wedding/event inquiry ${trackingId}. ${notes}`,
        booking_id: saved.id,
      })
      if (leadErr) {
        await alertCreationFailure({
          source: 'wedding-inquiry', trackingId, leadNumber, failureStage: 'lead_insert',
          customerName: name, customerPhone: phone, customerEmail: email || null,
          errorMessage: leadErr.message, rawPayload: b,
        })
      } else {
        await sendNewInquiryWhatsApp({
          inquiryNumber: leadNumber, source: 'Wedding / Event inquiry',
          customerName: name, customerPhone: phone, customerEmail: email || null,
          serviceType: 'Wedding / Event', fromCity: fromText, toCity: toText,
          pickupAddress: null, deliveryAddress: null, pickupDate: arrive,
          bagsCount: bags || 1, deliveryDate: leave || arrive,
          notes: notes.slice(0, 500), submittedAt: new Date().toISOString(),
        })
      }
    } catch (e) {
      console.error('[wedding-inquiry] lead/notify failed (non-fatal):', e)
    }

    return NextResponse.json({ success: true, trackingId })
  } catch (e) {
    console.error('[wedding-inquiry]', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
