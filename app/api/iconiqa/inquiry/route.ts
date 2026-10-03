import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendNewInquiryWhatsApp } from '@/lib/new-inquiry-notification'
import { nextTrackingId } from '@/lib/number-series'
import { alertCreationFailure } from '@/lib/creation-failure-alert'
import { generateAutoQuoteForLead } from '@/lib/auto-quote'
import { TIME_OPTIONS, fmtTimeLabel } from '@/lib/time-options'

// BAGDROP — ICONIQA Hotel, Mumbai International Airport × Bagdrop landing
// page inquiry endpoint (app/iconiqa/page.tsx).
//
// Modeled directly on the existing app/api/y2k/inquiry/route.ts — the
// established pattern in this codebase for a dedicated landing page: reuse
// the shared tracking-number series, booking/lead schema, and notification
// functions rather than inventing a parallel inquiry system. Differences
// from the Y2K route are only the ones the hotel use case actually needs
// (no fixed event date window, a 4-way service-type selector instead of a
// single fixed destination, hotel-room/flight fields).
//
// IMPORTANT — this endpoint only ever creates a `bookings` row with
// status: 'inquiry'. It must NEVER mark a booking confirmed/paid — the
// existing quotation → customer approval → payment/confirmation workflow
// (Booking Workflow page) is the only place that happens. See the Founder
// spec's "Important Booking Status Rule."
//
// Service Type → underlying directional `service_type` (lib/service-type.ts
// already recognizes these 4 directional values from admin-created
// quotes — reused here rather than inventing a 5th category):
//   hotel-to-airport     → doorstep-to-airport   (pickup = hotel, fixed)
//   airport-to-hotel     → airport-to-doorstep   (delivery = hotel, fixed)
//   hotel-to-destination → doorstep-to-doorstep  (pickup = hotel, fixed; delivery = guest-entered)
//   airport-to-destination → airport-to-doorstep (pickup = Mumbai Airport, fixed; delivery = guest-entered)
const ICONIQA_HOTEL_ADDRESS = 'ICONIQA Hotel, Mumbai International Airport'
const ICONIQA_AIRPORT_ADDRESS = 'Mumbai International Airport (Chhatrapati Shivaji Maharaj International Airport)'

const SERVICE_MAP: Record<string, { serviceType: string; label: string; fixedFrom: string | null; fixedTo: string | null }> = {
  'hotel-to-airport':      { serviceType: 'doorstep-to-airport',  label: 'ICONIQA Hotel → Airport',      fixedFrom: ICONIQA_HOTEL_ADDRESS,   fixedTo: ICONIQA_AIRPORT_ADDRESS },
  'airport-to-hotel':      { serviceType: 'airport-to-doorstep',  label: 'Airport → ICONIQA Hotel',      fixedFrom: ICONIQA_AIRPORT_ADDRESS, fixedTo: ICONIQA_HOTEL_ADDRESS },
  'hotel-to-destination':  { serviceType: 'doorstep-to-doorstep', label: 'ICONIQA Hotel → Destination',  fixedFrom: ICONIQA_HOTEL_ADDRESS,   fixedTo: null },
  'airport-to-destination':{ serviceType: 'airport-to-doorstep',  label: 'Airport → Destination',        fixedFrom: ICONIQA_AIRPORT_ADDRESS, fixedTo: null },
}

// Pickup/delivery time validation (Founder request, 2026-10-03) — was a
// coarse 3-slot picker; now validates against the same precise 30-minute
// TIME_OPTIONS (06:00 AM … 05:30 AM, 24h "HH:MM" values) the main booking
// form's "Preferred pickup time" field already uses, since an airport
// transfer needs to match a specific flight time, not a broad window.
const VALID_TIME_VALUES = new Set(TIME_OPTIONS.map(t => t.value))
const ADDRESS_MAX_LEN = 300
const NOTES_MAX_LEN = 1000

// Test mode (?test=1 on the page) — same convention as app/api/y2k/
// inquiry/route.ts: lets the Founder/hotel staff repeatedly test the form
// without burning real BDA/BDL tracking numbers or triggering real ops
// WhatsApp/email notifications.
function generateTestTrackingId(): string {
  const suffix = Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase()
  return `BDA-TEST-${suffix}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      name, phone, whatsapp, email,
      serviceType,
      bags,
      pickupDate, pickupTime,
      deliveryDate, deliveryTime,
      deliveryLocation, deliveryAddress,
      pickupAddress,
      flightNumber, airline, pnr, roomNumber,
      notes,
      testMode,
    } = body
    const isTestMode = testMode === true

    // ── Basic validation ────────────────────────────────────────
    const digits = phone?.replace(/\D/g, '') ?? ''
    if (!name?.trim() || !/^[6-9]\d{9}$/.test(digits)) {
      return NextResponse.json({ error: 'Name and a valid 10-digit Indian mobile number are required.' }, { status: 400 })
    }
    const whatsappDigits = whatsapp?.replace(/\D/g, '') || digits
    if (!/^[6-9]\d{9}$/.test(whatsappDigits)) {
      return NextResponse.json({ error: 'Please provide a valid 10-digit WhatsApp number.' }, { status: 400 })
    }

    const svc = SERVICE_MAP[serviceType]
    if (!svc) {
      return NextResponse.json({ error: 'Please select a valid baggage delivery service.' }, { status: 400 })
    }

    const bagsCount = parseInt(bags, 10)
    if (!bagsCount || bagsCount < 1 || bagsCount > 50) {
      return NextResponse.json({ error: 'Please enter a valid number of bags.' }, { status: 400 })
    }

    if (!pickupDate) {
      return NextResponse.json({ error: 'Please select a pickup date.' }, { status: 400 })
    }
    if (!pickupTime || !VALID_TIME_VALUES.has(pickupTime)) {
      return NextResponse.json({ error: 'Please select a pickup time.' }, { status: 400 })
    }

    // Pickup address: required whenever the pickup leg is the hotel itself
    // (the guest still needs to give a room/contact note even though the
    // hotel's own address is fixed/locked on the frontend) — kept lenient
    // (non-empty, length-capped) rather than re-validating free text
    // structure.
    if (!pickupAddress?.trim() || pickupAddress.trim().length > ADDRESS_MAX_LEN) {
      return NextResponse.json({ error: 'Please provide pickup details (room number / contact point).' }, { status: 400 })
    }

    // Delivery location: fixed for hotel-to-airport / airport-to-hotel
    // (svc.fixedTo set), guest-entered for the two "→ Destination" services.
    const resolvedDeliveryLocation = svc.fixedTo ?? deliveryLocation?.trim()
    if (!resolvedDeliveryLocation || resolvedDeliveryLocation.length > ADDRESS_MAX_LEN) {
      return NextResponse.json({ error: 'Please provide a delivery location.' }, { status: 400 })
    }
    if (!svc.fixedTo && (!deliveryAddress?.trim() || deliveryAddress.trim().length > ADDRESS_MAX_LEN)) {
      return NextResponse.json({ error: 'Please provide the delivery address.' }, { status: 400 })
    }

    if (notes && notes.length > NOTES_MAX_LEN) {
      return NextResponse.json({ error: 'Special requests note is too long.' }, { status: 400 })
    }

    const trackingId = isTestMode ? generateTestTrackingId() : await nextTrackingId()
    const resolvedPickupLocation = svc.fixedFrom as string // always fixed — both pickup legs originate hotel or airport

    // ── Save to database — status 'inquiry', never auto-confirmed ──
    let savedBookingId: string | null = null
    try {
      const { data: savedBooking, error: dbError } = await supabaseAdmin.from('bookings').insert({
        tracking_id:    trackingId,
        status:         'inquiry',
        // Founder request (2026-10-02): test submissions should still be
        // easy to spot and bulk-clean-up later. is_test is the existing
        // column every admin list/report/Dashboard metric already filters
        // on by default (see app/api/admin/bookings/route.ts's
        // `if (!includeTest) query = query.eq('is_test', false)`), so
        // setting it here means a test ICONIQA inquiry is automatically
        // excluded from real numbers without anyone remembering to toggle
        // it by hand afterward — and it's findable/deletable via the
        // existing Test Mode filter on the Leads/Bookings admin pages.
        is_test:        isTestMode,
        customer_name:  name.trim(),
        customer_email: email?.trim().toLowerCase() || null,
        customer_phone: '+91' + digits,
        service_type:   svc.serviceType,
        service_label:  svc.label + (isTestMode ? ' [TEST]' : ''),
        from_city:      resolvedPickupLocation,
        to_city:        resolvedDeliveryLocation,
        pickup_address: pickupAddress?.trim() || null,
        drop_address:   svc.fixedTo ? null : (deliveryAddress?.trim() || null),
        pickup_date:    pickupDate,
        delivery_date:  deliveryDate || null,
        time_slot:      pickupTime || null,
        total_bags:     bagsCount,
        total_amount:   0,
        currency:       'INR',
        notes: [
          isTestMode ? '[TEST SUBMISSION — safe to delete, does not affect real tracking numbers]' : '',
          '[ICONIQA Hotel, Mumbai International Airport landing page]',
          `Service: ${svc.label}`,
          whatsappDigits !== digits ? `WhatsApp: +91${whatsappDigits}` : '',
          deliveryTime   ? `Preferred delivery time: ${fmtTimeLabel(deliveryTime)}` : '',
          flightNumber   ? `Flight number: ${flightNumber}` : '',
          airline        ? `Airline: ${airline}` : '',
          pnr            ? `PNR: ${pnr}` : '',
          roomNumber     ? `Room number: ${roomNumber}` : '',
          notes          ? `Special requests: ${notes}` : '',
        ].filter(Boolean).join(' | '),
        status_history: [{ status: 'inquiry', timestamp: new Date().toISOString(), note: 'ICONIQA Hotel landing page inquiry received' }],
      }).select('id').single()

      if (dbError) {
        console.error('[iconiqa/inquiry] DB save error:', dbError)
        await alertCreationFailure({
          source:        'iconiqa-inquiry',
          trackingId,
          failureStage:  'booking_insert',
          customerName:  name.trim(),
          customerPhone: '+91' + digits,
          customerEmail: email?.trim().toLowerCase() || null,
          errorMessage:  dbError.message,
          rawPayload:    body,
        })
      } else {
        savedBookingId = savedBooking?.id ?? null
      }
    } catch (dbErr) {
      console.error('[iconiqa/inquiry] DB save error:', dbErr)
      await alertCreationFailure({
        source:        'iconiqa-inquiry',
        trackingId,
        failureStage:  'booking_insert',
        customerName:  name.trim(),
        customerPhone: '+91' + digits,
        customerEmail: email?.trim().toLowerCase() || null,
        errorMessage:  dbErr instanceof Error ? dbErr.message : String(dbErr),
        rawPayload:    body,
      })
    }

    // ── Auto-create Lead — mirrors app/api/y2k/inquiry/route.ts ────
    // Every inquiry, regardless of which landing page it came through,
    // must be visible both on the Dashboard (reads `bookings`) and the
    // Leads tab (reads `leads`). Source is 'iconiqa-hotel' — NOT
    // 'website' — so this is identifiable as its own channel throughout
    // the Dashboard/Leads/Reports, per the Founder's explicit source-
        // tracking requirement (not lumped into Website/Contact Form/Other).
    if (savedBookingId) {
      try {
        const { data: existingLeadForBooking } = await supabaseAdmin
          .from('leads')
          .select('id')
          .eq('booking_id', savedBookingId)
          .maybeSingle()

        if (!existingLeadForBooking) {
          // Derive the lead number from the tracking ID already minted for
          // this same booking — see app/api/y2k/inquiry/route.ts's
          // identical comment for why (keeps BDA/BDL suffixes in sync).
          const leadNumber = trackingId.replace(/^BDA-/, 'BDL-')

          const { data: newLead, error: leadInsertErr } = await supabaseAdmin.from('leads').insert({
            lead_number:      leadNumber,
            is_test:          isTestMode,
            name:             name.trim(),
            phone:            '+91' + digits,
            email:            email?.trim().toLowerCase() || null,
            source:           'iconiqa-hotel',
            status:           'new',
            service_type:     svc.serviceType,
            service_interest: svc.serviceType,
            from_city:        resolvedPickupLocation,
            to_city:          resolvedDeliveryLocation,
            travel_date:      pickupDate,
            pickup_date:      pickupDate,
            pickup_address:   pickupAddress?.trim() || null,
            drop_address:     svc.fixedTo ? null : (deliveryAddress?.trim() || null),
            bags_count:       bagsCount,
            notes:            `Auto-created from ICONIQA Hotel landing page inquiry ${trackingId} — ${svc.label}`,
            booking_id:       savedBookingId,
          }).select('id').single()

          if (leadInsertErr) {
            console.error('[iconiqa/inquiry] Lead insert error:', leadInsertErr.message)
            // NOTE: deliberately NOT rolled back — same reasoning as
            // app/api/y2k/inquiry/route.ts / app/api/contact/route.ts. The
            // booking staying orphaned-but-visible on the Dashboard
            // (repairable via /api/admin/repair/create-lead-for-booking)
            // is far better than silently dropping a real guest's inquiry.
            await alertCreationFailure({
              source:        'iconiqa-inquiry',
              trackingId,
              leadNumber,
              failureStage:  'lead_insert',
              customerName:  name.trim(),
              customerPhone: '+91' + digits,
              customerEmail: email?.trim().toLowerCase() || null,
              errorMessage:  leadInsertErr.message,
              rawPayload:    body,
            })
          } else {
            console.log(`[iconiqa/inquiry] Auto-created lead ${leadNumber} for booking ${trackingId}`)
            // Automatic Quote Generation (Founder spec, 2026-10-03) —
            // creates a REAL quote (QT-YYYY-NNNN) + updates the linked
            // booking, using route pricing when known or a flagged
            // ₹10,000 starting figure when not. Never emails/WhatsApps the
            // customer. See lib/auto-quote.ts.
            if (newLead) await generateAutoQuoteForLead(newLead.id)
            // Founder request (2026-10-02): test submissions should still
            // trigger the real ops WhatsApp ping (to both internal numbers —
            // see lib/new-inquiry-notification.ts) so the Founder can verify
            // end-to-end delivery actually works, not just that the DB rows
            // were created. The tracking/lead number itself already carries
            // "TEST" (BDA-TEST-xxx / BDL-TEST-xxx — see generateTestTrackingId
            // above), so the ping is unmistakably a test; is_test:true on the
            // booking/lead above keeps it out of real Dashboard numbers
            // regardless, and makes it easy to find and delete afterward.
            await sendNewInquiryWhatsApp({
              inquiryNumber:   leadNumber,
              source:          isTestMode ? 'ICONIQA Hotel [TEST]' : 'ICONIQA Hotel',
              customerName:    name.trim(),
              customerPhone:   '+91' + digits,
              customerEmail:   email?.trim().toLowerCase() || null,
              serviceType:     svc.label,
              fromCity:        resolvedPickupLocation,
              toCity:          resolvedDeliveryLocation,
              pickupAddress:   pickupAddress?.trim() || null,
              deliveryAddress: svc.fixedTo ? null : (deliveryAddress?.trim() || null),
              pickupDate:      pickupDate,
              bagsCount:       bagsCount,
              deliveryDate:    deliveryDate || pickupDate,
              notes:           `ICONIQA Hotel landing page — ${svc.label} — ${trackingId}`,
              submittedAt:     new Date().toISOString(),
            })
          }
        }
      } catch (leadErr) {
        console.error('[iconiqa/inquiry] Lead auto-create failed (non-fatal):', leadErr)
      }
    }

    // ── Notification email to info@bagdrop.co ──────────────────
    // Founder request (2026-10-02): send this in test mode too (previously
    // skipped entirely), so the Founder can confirm the email path actually
    // works end-to-end, not just the WhatsApp path. Subject/banner below are
    // prefixed "TEST —" whenever isTestMode so it's unmistakable in the
    // inbox and safe to delete once verified.
    const apiKey = process.env.RESEND_API_KEY
    let emailSent = false

    if (apiKey) {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F6F4F0;font-family:Georgia,serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F6F4F0;padding:32px 0">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(20,20,20,0.10);max-width:580px">
  <tr><td style="background:linear-gradient(135deg,#1C2230 0%,#232C3D 100%);padding:32px 40px;text-align:center">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:rgba(201,169,110,0.8)">ICONIQA Hotel × Bagdrop</p>
    <p style="margin:0;font-family:Georgia,serif;font-size:26px;color:#E6D9B8;font-weight:300">Baggage Delivery Request</p>
  </td></tr>
  <tr><td style="background:#C9A96E;padding:10px 40px;text-align:center">
    <p style="margin:0;font-size:13px;font-weight:700;color:#1C2230;letter-spacing:1px">NEW BOOKING REQUEST — ${trackingId}</p>
  </td></tr>
  ${isTestMode ? `<tr><td style="background:#B3261E;padding:10px 40px;text-align:center">
    <p style="margin:0;font-size:12px;font-weight:700;color:#fff;letter-spacing:1px">⚠ TEST SUBMISSION — not a real guest. Safe to delete once verified.</p>
  </td></tr>` : ''}
  <tr><td style="padding:36px 40px">
    <p style="margin:0 0 24px;font-size:15px;color:#4A4A45;line-height:1.6">A guest from <strong>ICONIQA Hotel, Mumbai International Airport</strong> has submitted a baggage delivery request.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #EBE6DA;border-radius:12px;overflow:hidden;margin-bottom:24px">
      <tr style="background:#F6F4F0"><td colspan="2" style="padding:12px 16px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#8A7B55">Guest Details</td></tr>
      ${[
        ['Full Name', name.trim()],
        ['Mobile', '+91 ' + digits],
        ['WhatsApp', '+91 ' + whatsappDigits],
        ['Email', email?.trim() || '—'],
        ['Bags', String(bagsCount)],
      ].map(([l, v]) => `<tr><td style="padding:10px 16px;font-size:13px;color:#8A8578;border-top:1px solid #F0EDE2;width:40%">${l}</td><td style="padding:10px 16px;font-size:13px;font-weight:600;color:#232323;border-top:1px solid #F0EDE2">${v}</td></tr>`).join('')}
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #EBE6DA;border-radius:12px;overflow:hidden;margin-bottom:24px">
      <tr style="background:#F6F4F0"><td colspan="2" style="padding:12px 16px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#8A7B55">Service</td></tr>
      ${[
        ['Service', svc.label],
        ['Pickup', resolvedPickupLocation],
        ['Delivery', resolvedDeliveryLocation],
        ['Pickup Date', pickupDate],
        ['Pickup Time', fmtTimeLabel(pickupTime)],
        ['Flight', flightNumber || '—'],
        ['Room Number', roomNumber || '—'],
      ].map(([l, v]) => `<tr><td style="padding:10px 16px;font-size:13px;color:#8A8578;border-top:1px solid #F0EDE2;width:40%">${l}</td><td style="padding:10px 16px;font-size:13px;font-weight:600;color:#232323;border-top:1px solid #F0EDE2">${v}</td></tr>`).join('')}
    </table>
    ${notes ? `<div style="background:#FBF9F3;border:1px solid #EBE6DA;border-radius:10px;padding:16px 20px;margin-bottom:24px"><p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#8A7B55">Special Requests</p><p style="margin:0;font-size:14px;color:#232323;line-height:1.65">${notes}</p></div>` : ''}
    <p style="margin:0;font-size:14px;color:#4A4A45;line-height:1.7">Please review and share the applicable quotation with the guest.</p>
  </td></tr>
  <tr><td style="background:#1C2230;padding:20px 40px;text-align:center">
    <p style="margin:0;font-size:12px;color:rgba(230,217,184,0.5)">Bagdrop × ICONIQA Hotel · info@bagdrop.co</p>
  </td></tr>
</table></td></tr></table>
</body></html>`

      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'BagDrop <info@bagdrop.co>',
            to: ['info@bagdrop.co'],
            subject: `${isTestMode ? '[TEST] ' : ''}🧳 ICONIQA Hotel Booking Request — ${name.trim()} (${trackingId})`,
            html,
          }),
        })
        emailSent = emailRes.ok
        if (!emailRes.ok) console.error('[iconiqa/inquiry] Resend error:', await emailRes.text())
      } catch (err) {
        console.error('[iconiqa/inquiry] Email send error:', err)
      }
    }

    // ── Acknowledgement email to guest (if provided) — deliberately does
    // NOT say "confirmed" anywhere, per the Founder's explicit status rule.
    if (apiKey && email?.trim() && !isTestMode) {
      const guestHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F6F4F0;font-family:Georgia,serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F6F4F0;padding:32px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(20,20,20,0.08);max-width:560px">
  <tr><td style="background:linear-gradient(135deg,#1C2230 0%,#232C3D 100%);padding:36px 40px;text-align:center">
    <p style="margin:0 0 8px;font-family:Georgia,serif;font-size:26px;color:#E6D9B8;font-weight:300">ICONIQA Hotel × Bagdrop</p>
    <p style="margin:0;font-size:13px;color:rgba(230,217,184,0.8)">Mumbai International Airport</p>
  </td></tr>
  <tr><td style="padding:36px 40px;text-align:center">
    <p style="margin:0 0 8px;font-size:18px;color:#232323">Dear <strong>${name.trim()}</strong>,</p>
    <p style="margin:0 0 24px;font-size:15px;color:#4A4A45;line-height:1.75">Thank you. We have received your baggage delivery request (<strong>${svc.label}</strong>). Our team will review the details and get back to you with availability, quotation, and next steps.</p>
    <div style="background:#F6F4F0;border:1px solid #C9A96E;border-radius:12px;padding:20px;display:inline-block;margin-bottom:24px;text-align:left">
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8A7B55">Request ID</p>
      <p style="margin:0;font-size:24px;font-weight:300;color:#A0824A;font-family:Georgia,serif">${trackingId}</p>
    </div>
    <p style="margin:0 0 4px;font-size:13px;color:#8A8578;">This is a booking request, not a confirmed booking. Your booking is confirmed only after you approve the quotation and complete the payment process.</p>
    <p style="margin:16px 0 0;font-size:14px;color:#4A4A45;line-height:1.7">For any queries, reach us at <a href="mailto:info@bagdrop.co" style="color:#A0824A">info@bagdrop.co</a></p>
  </td></tr>
  <tr><td style="background:#1C2230;padding:16px 40px;text-align:center">
    <p style="margin:0;font-size:11px;color:rgba(230,217,184,0.4)">Bagdrop — India's Premium Baggage Infrastructure · www.bagdrop.co</p>
  </td></tr>
</table></td></tr></table>
</body></html>`

      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'BagDrop <info@bagdrop.co>',
            to: [email.trim()],
            subject: `Your Baggage Delivery Request — ${trackingId}`,
            html: guestHtml,
          }),
        })
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ success: true, trackingId, emailSent, testMode: isTestMode })
  } catch (err) {
    console.error('[iconiqa/inquiry] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 })
  }
}
