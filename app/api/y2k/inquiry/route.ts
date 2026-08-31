import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendNewInquiryWhatsApp } from '@/lib/new-inquiry-notification'
import { nextTrackingId } from '@/lib/number-series'
import { alertCreationFailure } from '@/lib/creation-failure-alert'

// Y2K booking form restrictions — mirrors the constants of the same name in
// app/y2k/page.tsx. This is the Y2K-only inquiry route (the regular BagDrop
// booking form posts to app/api/bookings/route.ts, untouched by this file),
// so these checks can never affect a normal booking. Re-validated here even
// though the frontend already restricts the date/time pickers and the
// location dropdown, so a request built by hand (devtools, curl, editing
// the form's values directly) can't submit an out-of-window pickup.
const Y2K_PICKUP_DATES = ['2026-12-10', '2026-12-11', '2026-12-12']
// Preset dropdown options on the frontend. 'Other' isn't a real location —
// picking it reveals a free-text field, and *that* text is what's actually
// sent as pickupCity, so this route never sees the literal word "Other".
// Any non-empty pickupCity is accepted below (capped at a sane length) so
// guests outside Mumbai/Mumbai Airport can still submit a pickup.
const Y2K_PICKUP_LOCATIONS = ['Mumbai', 'Mumbai Airport', 'Other']
const Y2K_PICKUP_CITY_MAX_LEN = 200
// Slot ids shared by Preferred Pickup Time and Preferred Delivery Time,
// must match app/y2k/page.tsx's TIME_SLOTS. 'night' was removed entirely
// (not just hidden) — the full pickup/delivery window stays within
// 10 AM – 6 PM for this event.
const Y2K_TIME_SLOTS = ['morning', 'afternoon', 'evening']

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, phone, email, guests, bags, pickupAddress, pickupCity, deliveryAddress, pickupTime, arrivalDate, requests, returnPickup, originalTrackingId } = body
    // returnPickup / originalTrackingId: set only by the second call
    // submit() in app/y2k/page.tsx fires when a guest checks "Add a return
    // pickup". Used below purely to make this leg visibly distinct in the
    // dashboard (Service column + WhatsApp ping) and linked back to the
    // onward booking's tracking ID — it's still a fully separate
    // booking/lead row (see that file's comment for why), just labeled so
    // ops doesn't mistake it for an unrelated new inquiry.
    const isReturnPickup = returnPickup === true

    // Basic validation
    const digits = phone?.replace(/\D/g, '') ?? ''
    if (!name?.trim() || !/^[6-9]\d{9}$/.test(digits)) {
      return NextResponse.json({ error: 'Name and a valid 10-digit Indian mobile number are required.' }, { status: 400 })
    }

    // ── Y2K pickup restrictions ─────────────────────────────────
    // arrivalDate (the pickup date) previously wasn't read here at all —
    // pickup_date below was hardcoded to the wedding date regardless of
    // what the guest actually selected. Fixed as part of wiring up this
    // validation, since restricting the date picker on the frontend would
    // otherwise have had no effect on what actually gets saved/serviced.
    if (!arrivalDate || !Y2K_PICKUP_DATES.includes(arrivalDate)) {
      return NextResponse.json({ error: 'Pickup date must be 10, 11, or 12 December 2026.' }, { status: 400 })
    }
    // Pickup time is now a morning/afternoon/evening slot id (matches
    // Preferred Delivery Time's UI), not a raw HH:MM clock time.
    if (!pickupTime || !Y2K_TIME_SLOTS.includes(pickupTime)) {
      return NextResponse.json({ error: 'Pickup time must be Morning, Afternoon, or Evening.' }, { status: 400 })
    }
    // Location is either one of the presets, or free text the guest typed
    // after picking 'Others' on the frontend — either way, just needs to
    // be a non-empty, reasonably-sized string here.
    if (!pickupCity?.trim() || pickupCity.trim().length > Y2K_PICKUP_CITY_MAX_LEN) {
      return NextResponse.json({ error: 'Please provide a valid pickup location.' }, { status: 400 })
    }

    // Atomic, race-safe BDA-YYYY-NNNN tracking ID — was a random 'Y2K-'
    // prefixed string, which broke the continuous numbering every other
    // inquiry source uses. See lib/number-series.ts.
    const trackingId = await nextTrackingId()

    // ── Save to database ──────────────────────────────────────
    let savedBookingId: string | null = null
    try {
      const { data: savedBooking, error: dbError } = await supabaseAdmin.from('bookings').insert({
        tracking_id:    trackingId,
        // See app/api/bookings/route.ts for why this must be 'inquiry', not
        // 'pending' — 'pending' isn't a valid admin Booking Workflow status.
        status:         'inquiry',
        customer_name:  name.trim(),
        customer_email: email?.trim().toLowerCase() || null,
        customer_phone: '+91' + digits,
        service_type:   'destination-weddings',
        service_label:  isReturnPickup ? 'Destination Wedding — #Y2K (Return Pickup)' : 'Destination Wedding — #Y2K',
        // Was hardcoded 'Udaipur' → 'Udaipur' regardless of where the guest
        // actually is — showed as "Udaipur → Udaipur" on the dashboard's
        // Route column for every single #Y2K booking, onward AND return
        // alike (2026-08-31 bug report). The real movement is: guest's
        // pickup city (whatever they selected/typed — Mumbai, Mumbai
        // Airport, or custom) → the fixed wedding venue in Udaipur.
        from_city:      pickupCity?.trim() || 'Mumbai',
        to_city:        'Udaipur',
        pickup_address: pickupAddress || null,
        drop_address:   deliveryAddress || null,
        // Was hardcoded to the wedding date ('2026-12-17') — now uses the
        // guest's validated pickup date (10/11/12 Dec) instead.
        pickup_date:    arrivalDate,
        // Y2K has no separate delivery-date field (bags go Mumbai →
        // Taj Aravali the same operating day as pickup) — was omitted
        // entirely before, which is also why the WhatsApp ops ping
        // below showed "Delivery Date: —".
        delivery_date:  arrivalDate,
        time_slot:      pickupTime || null,
        total_bags:     parseInt(bags) || 1,
        total_amount:   0,
        currency:       'INR',
        notes: [
          '[#Y2K — Yashna ❤️ Yash @ Taj Aravali, Udaipur · 17th–18th Dec 2026]',
          isReturnPickup ? `[RETURN PICKUP — linked to onward booking ${originalTrackingId || 'unknown'}]` : '',
          guests       ? `Group size: ${guests} guests` : '',
          bags         ? `Luggage pieces: ${bags}` : '',
          pickupAddress   ? `Pickup: ${pickupAddress}` : '',
          deliveryAddress ? `Delivery: ${deliveryAddress}` : '',
          pickupTime   ? `Preferred time: ${pickupTime}` : '',
          requests     ? `Special requests: ${requests}` : '',
        ].filter(Boolean).join(' | '),
        status_history: [{ status: 'inquiry', timestamp: new Date().toISOString(), note: '#Y2K wedding inquiry received' }],
      }).select('id').single()

      if (dbError) {
        console.error('[y2k/inquiry] DB save error:', dbError)
        // Booking insert failed outright — no lead gets attempted below
        // (gated on savedBookingId), so this tracking number vanishes with
        // NOTHING created anywhere, same failure class as the 2026-08-22
        // BDA-2026-0114/0115/0117 incident. Surface it immediately.
        await alertCreationFailure({
          source:        'y2k-inquiry',
          trackingId,
          failureStage:  'booking_insert',
          customerName:  name.trim(),
          customerPhone: '+91' + digits,
          customerEmail: email?.trim().toLowerCase() || null,
          errorMessage:  dbError.message,
        })
      } else {
        savedBookingId = savedBooking?.id ?? null
      }
    } catch (dbErr) {
      console.error('[y2k/inquiry] DB save error:', dbErr)
      await alertCreationFailure({
        source:        'y2k-inquiry',
        trackingId,
        failureStage:  'booking_insert',
        customerName:  name.trim(),
        customerPhone: '+91' + digits,
        customerEmail: email?.trim().toLowerCase() || null,
        errorMessage:  dbErr instanceof Error ? dbErr.message : String(dbErr),
      })
    }

    // ── Auto-create Lead ────────────────────────────────────────
    // Mirrors app/api/bookings/route.ts's auto-lead-creation. This route
    // previously only wrote to `bookings`, so #Y2K inquiries showed up on
    // the Dashboard (which reads bookings) but were invisible in the Leads
    // tab (which reads leads) — no lead row was ever created for them.
    // Every inquiry, regardless of which form it came through, should be
    // visible in both places, so this now creates a matching lead exactly
    // like the regular booking form does.
    if (savedBookingId) {
      try {
        const { data: existingLeadForBooking } = await supabaseAdmin
          .from('leads')
          .select('id')
          .eq('booking_id', savedBookingId)
          .maybeSingle()

        if (!existingLeadForBooking) {
          // Derive the lead number from the tracking ID already minted for
          // this same booking above — NOT a fresh, independent
          // nextLeadNumber() call. The two must carry the same NNNN
          // suffix, and the only way to guarantee that is to reuse the
          // number that's already sitting in `trackingId` rather than
          // drawing a second number from the separate BDL counter (which
          // can drift out of sync with BDA from unrelated activity
          // elsewhere — see nextInquiryNumberPair's comment in
          // lib/number-series.ts).
          const leadNumber = trackingId.replace(/^BDA-/, 'BDL-')

          const { error: leadInsertErr } = await supabaseAdmin.from('leads').insert({
            lead_number:      leadNumber,
            name:             name.trim(),
            phone:            '+91' + digits,
            email:            email?.trim().toLowerCase() || null,
            // 'website' (not a new 'y2k' source) so it shows up under the
            // existing Leads source filter without needing that filter's
            // option list extended — the notes line below still marks it
            // as a #Y2K lead for anyone scanning the list.
            source:           'website',
            status:           'new',
            service_type:     'destination-weddings',
            service_interest: 'destination-weddings',
            // Same fix as the booking insert above — real pickup city →
            // Udaipur venue, not a hardcoded 'Udaipur' → 'Udaipur'.
            from_city:        pickupCity?.trim() || 'Mumbai',
            to_city:          'Udaipur',
            travel_date:      arrivalDate,
            pickup_date:      arrivalDate,
            pickup_address:   pickupAddress || null,
            drop_address:     deliveryAddress || null,
            bags_count:       parseInt(bags) || 1,
            notes:            isReturnPickup
              ? `Return Pickup — linked to onward booking ${originalTrackingId || 'unknown'} — Auto-created from #Y2K wedding page inquiry ${trackingId}`
              : `Auto-created from #Y2K wedding page inquiry ${trackingId}`,
            booking_id:       savedBookingId,
          })

          if (leadInsertErr) {
            console.error('[y2k/inquiry] Lead insert error:', leadInsertErr.message)
            // NOTE (2026-08-22): deliberately NOT rolled back — same
            // reasoning as app/api/contact/route.ts. This is a real wedding
            // guest's inquiry; the booking staying orphaned-but-visible on
            // the Dashboard (repairable via
            // /api/admin/repair/create-lead-for-booking) is far better than
            // silently deleting their only record with us over a rare
            // backend hiccup. Matches this function's existing "Non-fatal —
            // the booking itself already saved above either way" comment
            // below, which already reflects this intentional choice.
            await alertCreationFailure({
              source:        'y2k-inquiry',
              trackingId,
              leadNumber,
              failureStage:  'lead_insert',
              customerName:  name.trim(),
              customerPhone: '+91' + digits,
              customerEmail: email?.trim().toLowerCase() || null,
              errorMessage:  leadInsertErr.message,
            })
          } else {
            console.log(`[y2k/inquiry] Auto-created lead ${leadNumber} for booking ${trackingId}`)
            // Internal ops WhatsApp ping — this route only ever emailed
            // info@bagdrop.co, same gap as the contact form had (see
            // app/api/contact/route.ts). Added so every inquiry source
            // notifies ops the same way.
            await sendNewInquiryWhatsApp({
              inquiryNumber:   leadNumber,
              source:          'website',
              customerName:    name.trim(),
              customerPhone:   '+91' + digits,
              customerEmail:   email?.trim().toLowerCase() || null,
              serviceType:     'destination-weddings',
              fromCity:        pickupCity?.trim() || 'Mumbai',
              toCity:          'Udaipur',
              pickupAddress:   pickupAddress || null,
              deliveryAddress: deliveryAddress || null,
              pickupDate:      arrivalDate,
              // Both were previously omitted from this call entirely,
              // which is why the WhatsApp template showed "Bags: —" and
              // "Delivery Date: —" — the approved template requires all
              // 10 variables filled or WhatsApp rejects the send outright
              // (see the template-variable-order note at the top of
              // lib/new-inquiry-notification.ts), so this was silently
              // sending blanks rather than failing loudly.
              bagsCount:       parseInt(bags) || 1,
              deliveryDate:    arrivalDate,
              notes:           isReturnPickup
                ? `RETURN PICKUP — linked to onward booking ${originalTrackingId || 'unknown'} — #Y2K wedding inquiry ${trackingId}`
                : `#Y2K wedding inquiry ${trackingId}`,
              submittedAt:     new Date().toISOString(),
            })
          }
        }
      } catch (leadErr) {
        // Non-fatal — the booking itself already saved above either way.
        console.error('[y2k/inquiry] Lead auto-create failed (non-fatal):', leadErr)
      }
    }

    // ── Send notification email to info@bagdrop.co ────────────
    const apiKey = process.env.RESEND_API_KEY
    let emailSent = false

    if (apiKey) {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAF4EE;font-family:Georgia,serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF4EE;padding:32px 0">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(44,24,16,0.10);max-width:580px">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#1A0A12 0%,#2E1020 100%);padding:32px 40px;text-align:center">
    <p style="margin:0 0 4px;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:rgba(232,212,154,0.7)">OFFICIAL CONCIERGE PARTNER</p>
    <p style="margin:0;font-family:Georgia,serif;font-size:28px;color:#E8D49A;font-weight:300">✨ #Y2K Wedding ✨</p>
    <p style="margin:6px 0 0;font-size:14px;color:rgba(240,192,203,0.8)">Yashna ❤️ Yash · Taj Aravali, Udaipur</p>
  </td></tr>

  <!-- Alert banner -->
  <tr><td style="background:#C9A84C;padding:10px 40px;text-align:center">
    <p style="margin:0;font-size:13px;font-weight:700;color:#2C1810;letter-spacing:1px">NEW LUGGAGE CONCIERGE INQUIRY — ${trackingId}</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:36px 40px">
    <p style="margin:0 0 24px;font-size:15px;color:#6B4C3B;line-height:1.6">A wedding guest has submitted a luggage concierge inquiry for <strong>#Y2K</strong>.</p>

    <!-- Guest details -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #F0E4D0;border-radius:12px;overflow:hidden;margin-bottom:24px">
      <tr style="background:#FAF4EE"><td colspan="2" style="padding:12px 16px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#A07830">Guest Details</td></tr>
      ${[
        ['Full Name',  name.trim()],
        ['Mobile',     '+91 ' + digits],
        ['Email',      email?.trim() || '—'],
        ['Group Size', (guests || '1') + ' guest(s)'],
        ['Luggage',    (bags   || '1') + ' piece(s)'],
      ].map(([l,v]) => `<tr><td style="padding:10px 16px;font-size:13px;color:#9B7650;border-top:1px solid #F5ECD6;width:40%">${l}</td><td style="padding:10px 16px;font-size:13px;font-weight:600;color:#2C1810;border-top:1px solid #F5ECD6">${v}</td></tr>`).join('')}
    </table>

    <!-- Logistics -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #F0E4D0;border-radius:12px;overflow:hidden;margin-bottom:24px">
      <tr style="background:#FAF4EE"><td colspan="2" style="padding:12px 16px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#A07830">Logistics</td></tr>
      ${[
        ['Pickup Address',    pickupAddress   || '—'],
        ['Preferred Time',    pickupTime      || '—'],
        ['Delivery Address',  deliveryAddress || '—'],
        ['Event Date',        '17th–18th December 2026'],
        ['Wedding Venue',     'Taj Aravali, Udaipur'],
      ].map(([l,v]) => `<tr><td style="padding:10px 16px;font-size:13px;color:#9B7650;border-top:1px solid #F5ECD6;width:40%">${l}</td><td style="padding:10px 16px;font-size:13px;font-weight:600;color:#2C1810;border-top:1px solid #F5ECD6">${v}</td></tr>`).join('')}
    </table>

    ${requests ? `<div style="background:#FFF9F0;border:1px solid #F0E4D0;border-radius:10px;padding:16px 20px;margin-bottom:24px">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#A07830">Special Requests</p>
      <p style="margin:0;font-size:14px;color:#2C1810;line-height:1.65">${requests}</p>
    </div>` : ''}

    <p style="margin:0;font-size:14px;color:#6B4C3B;line-height:1.7">Please follow up with the guest at your earliest convenience to confirm the concierge arrangement for <strong>#Y2K</strong>.</p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#1A0A12;padding:20px 40px;text-align:center">
    <p style="margin:0;font-size:12px;color:rgba(232,212,154,0.5)">Bagdrop Luggage Concierge · #Y2K Wedding · info@bagdrop.co</p>
  </td></tr>

</table></td></tr></table>
</body></html>`

      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method:  'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from:    'BagDrop Weddings <info@bagdrop.co>',
            to:      ['info@bagdrop.co'],
            subject: `💍 #Y2K Concierge Inquiry — ${name.trim()} (${trackingId})`,
            html,
          }),
        })
        emailSent = emailRes.ok
        if (!emailRes.ok) console.error('[y2k/inquiry] Resend error:', await emailRes.text())
      } catch (err) {
        console.error('[y2k/inquiry] Email send error:', err)
      }
    }

    // ── Send confirmation to guest (if email provided) ────────
    if (apiKey && email?.trim()) {
      const guestHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAF4EE;font-family:Georgia,serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF4EE;padding:32px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(44,24,16,0.08);max-width:560px">
  <tr><td style="background:linear-gradient(135deg,#1A0A12 0%,#2E1020 100%);padding:36px 40px;text-align:center">
    <p style="margin:0 0 8px;font-family:Georgia,serif;font-size:32px;color:#E8D49A;font-weight:300">✨ #Y2K ✨</p>
    <p style="margin:0;font-size:14px;color:rgba(240,192,203,0.85)">Yashna ❤️ Yash · Taj Aravali, Udaipur · 17th–18th Dec 2026</p>
  </td></tr>
  <tr><td style="padding:36px 40px;text-align:center">
    <p style="margin:0 0 8px;font-size:18px;color:#2C1810">Dear <strong>${name.trim()}</strong>,</p>
    <p style="margin:0 0 24px;font-size:15px;color:#6B4C3B;line-height:1.75">Your luggage concierge request for <strong>Yashna ❤️ Yash's</strong> wedding has been received. Our team will be in touch shortly to confirm your arrangement for <strong>#Y2K</strong> at Taj Aravali, Udaipur.</p>
    <div style="background:#FAF4EE;border:1px solid #E8D49A;border-radius:12px;padding:20px;display:inline-block;margin-bottom:24px;text-align:left">
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#A07830">Your Reference</p>
      <p style="margin:0;font-size:24px;font-weight:300;color:#C9A84C;font-family:Georgia,serif">${trackingId}</p>
    </div>
    <p style="margin:0;font-size:14px;color:#6B4C3B;line-height:1.7">For any queries, reach us at <a href="mailto:info@bagdrop.co" style="color:#C9A84C">info@bagdrop.co</a></p>
  </td></tr>
  <tr><td style="background:#1A0A12;padding:16px 40px;text-align:center">
    <p style="margin:0;font-size:11px;color:rgba(232,212,154,0.4)">Bagdrop — India's Premium Luggage Concierge · www.bagdrop.co</p>
  </td></tr>
</table></td></tr></table>
</body></html>`

      try {
        await fetch('https://api.resend.com/emails', {
          method:  'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from:    'BagDrop Weddings <info@bagdrop.co>',
            to:      [email.trim()],
            subject: `Your #Y2K Concierge Request is Confirmed — ${trackingId}`,
            html:    guestHtml,
          }),
        })
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ success: true, trackingId, emailSent })
  } catch (err) {
    console.error('[y2k/inquiry] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 })
  }
}
