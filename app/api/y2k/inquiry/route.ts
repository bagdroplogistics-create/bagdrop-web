import { sanitizeFamily, bagTypeLabel, Y2K_SLOT_LIST, type FamilyPayload } from '@/lib/y2k-family'
import { PROHIBITED_ITEMS_VERSION, PROHIBITED_ACK_TEXT } from '@/lib/prohibited-items'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendNewInquiryWhatsApp } from '@/lib/new-inquiry-notification'
import { nextTrackingId } from '@/lib/number-series'
import { appendInquiryToSheet } from '@/lib/sheets-webhook'
import { alertCreationFailure } from '@/lib/creation-failure-alert'
import { generateAutoQuoteForLead } from '@/lib/auto-quote'

// Y2K booking form restrictions — mirrors the constants of the same name in
// app/y2k/page.tsx. This is the Y2K-only inquiry route (the regular BagDrop
// booking form posts to app/api/bookings/route.ts, untouched by this file),
// so these checks can never affect a normal booking. Re-validated here even
// though the frontend already restricts the date/time pickers and the
// location dropdown, so a request built by hand (devtools, curl, editing
// the form's values directly) can't submit an out-of-window pickup.
const Y2K_PICKUP_DATES = ['2026-12-10', '2026-12-11', '2026-12-12']
// Return Pickup is a reversed leg (venue → guest), not a copy of the
// onward one — bags aren't ready for collection from the venue until the
// day after the wedding ends. Fixed, single date — mirrors
// Y2K_RETURN_PICKUP_DATE in app/y2k/page.tsx.
const Y2K_RETURN_PICKUP_DATE = '2026-12-19'
// Onward pickups for the Y2K wedding service are accepted from Mumbai ONLY
// (the frontend dropdown offers just Mumbai; this re-checks server-side so a
// hand-crafted request can't submit another location). The Return Pickup leg
// is the reverse trip and legitimately starts at the venue (Udaipur), so it is
// exempt from this check.
const Y2K_PICKUP_LOCATIONS = ['mumbai']
const Y2K_PICKUP_CITY_MAX_LEN = 200
// Slot ids shared by Preferred Pickup Time and Preferred Delivery Time,
// must match app/y2k/page.tsx's TIME_SLOTS. 'night' was removed entirely
// (not just hidden) — the full pickup/delivery window stays within
// 10 AM – 6 PM for this event.
const Y2K_TIME_SLOTS = ['morning', 'afternoon', 'evening']

// ── Test mode ──────────────────────────────────────────────────────────
// Triggered by ?test=1 on the Y2K page (see app/y2k/page.tsx) — for the
// Founder to repeatedly test the booking form without burning real BDA/BDL
// tracking numbers or spamming ops with fake "New Inquiry" pings. Test
// tracking/lead IDs are deliberately OUTSIDE the `BDA-YYYY-NNNN` /
// `BDL-YYYY-NNNN` pattern the atomic counters (lib/number-series.ts) and
// the manual resync tool (app/api/admin/repair/resync-number-counter/
// route.ts) scan for — so test rows can never pollute the real sequence,
// and never need a cleanup+resync afterward. Delete them from the
// dashboard whenever; nothing else needs to know they existed.
function generateTestTrackingId(): string {
  const suffix = Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase()
  return `BDA-TEST-${suffix}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, phone, email, guests: _rawGuests, bags: rawBags, addOnGuests: rawAddOns, hotelRoomNumber: rawRoom, submissionId: rawSubmissionId, family: rawFamily, pickupAddress, pickupCity, deliveryAddress, deliveryCity, pickupTime, arrivalDate, requests, returnPickup, originalTrackingId, testMode, prohibitedAck } = body
    // returnPickup / originalTrackingId: set only by the second call
    // submit() in app/y2k/page.tsx fires when a guest checks "Add a return
    // pickup". Used below purely to make this leg visibly distinct in the
    // dashboard (Service column + WhatsApp ping) and linked back to the
    // onward booking's tracking ID — it's still a fully separate
    // booking/lead row (see that file's comment for why), just labeled so
    // ops doesn't mistake it for an unrelated new inquiry.
    const isReturnPickup = returnPickup === true
    // testMode: see generateTestTrackingId() above. Skips the real
    // tracking-number series AND every outbound notification (ops
    // WhatsApp ping, ops email, guest confirmation email) — only the
    // dashboard-visible booking/lead rows are created, so the Founder can
    // see the flow end-to-end without any real-world side effects.
    const isTestMode = testMode === true

    // ── Family booking: lead guest + add-on guests ─────────────────────
    // Total bags is ALWAYS computed here (lead bags + add-on bags); any
    // client-supplied total is ignored. Return-pickup legs never carry
    // add-ons (they only send their own bag count).
    type AddOn = { name: string; phone: string | null; email: string | null; bags: number; ref?: string; travel?: Record<string, string> }
    // Multi-step wizard payload (onward bookings only): validated + normalised
    // server-side; per-guest bag counts are derived from the bag list itself.
    let fam: FamilyPayload | null = null
    if (rawFamily !== undefined && rawFamily !== null && returnPickup !== true) {
      const sr = sanitizeFamily(rawFamily)
      if (!sr.ok) return NextResponse.json({ error: sr.error }, { status: 400 })
      fam = sr.family
      const p1 = fam.pickups[0]
      if (arrivalDate !== p1.date || pickupTime !== p1.slot) {
        return NextResponse.json({ error: 'Pickup details do not match. Please review and try again.' }, { status: 400 })
      }
    }
    const bagsOwnedBy = (ref: string) => fam ? fam.bags.filter(b => b.owner === ref).length : 0
    const isIntStr = (v: unknown) => typeof v === 'number' ? Number.isInteger(v) : typeof v === 'string' && /^\d+$/.test(v.trim())
    const leadBagsRaw = fam ? bagsOwnedBy(fam.members[0].ref) : (isIntStr(rawBags) ? Number(rawBags) : NaN)
    if (!Number.isFinite(leadBagsRaw) || leadBagsRaw < 0 || leadBagsRaw > 50) {
      return NextResponse.json({ error: 'Lead guest bags must be a whole number (0 or more).' }, { status: 400 })
    }
    const addOns: AddOn[] = []
    if (fam) {
      for (const m of fam.members.slice(1)) {
        addOns.push({ name: m.name, phone: m.phone ? '+91' + m.phone : null, email: null, bags: bagsOwnedBy(m.ref), ref: m.ref, travel: { mode: m.mode, arrDate: m.arrDate, arrTime: m.arrTime, travelNo: m.travelNo, depDate: m.depDate } })
      }
    } else if (rawAddOns !== undefined && rawAddOns !== null) {
      if (!Array.isArray(rawAddOns) || rawAddOns.length > 20 || (returnPickup === true && rawAddOns.length > 0)) {
        return NextResponse.json({ error: 'Invalid add-on guest list.' }, { status: 400 })
      }
      for (let i = 0; i < rawAddOns.length; i++) {
        const g = rawAddOns[i] ?? {}
        const gName = typeof g.name === 'string' ? g.name.trim() : ''
        if (!gName || gName.length > 100) return NextResponse.json({ error: `Add-on guest ${i + 1}: please enter a name.` }, { status: 400 })
        if (!isIntStr(g.bags) || Number(g.bags) < 0 || Number(g.bags) > 50) {
          return NextResponse.json({ error: `Add-on guest ${i + 1}: bags must be a whole number (0 or more).` }, { status: 400 })
        }
        const gPhoneDigits = typeof g.phone === 'string' ? g.phone.replace(/\D/g, '') : ''
        if (gPhoneDigits && !/^[6-9]\d{9}$/.test(gPhoneDigits)) {
          return NextResponse.json({ error: `Add-on guest ${i + 1}: enter a valid 10-digit mobile number or leave it blank.` }, { status: 400 })
        }
        const gEmail = typeof g.email === 'string' ? g.email.trim().toLowerCase() : ''
        if (gEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gEmail)) {
          return NextResponse.json({ error: `Add-on guest ${i + 1}: enter a valid email or leave it blank.` }, { status: 400 })
        }
        addOns.push({ name: gName, phone: gPhoneDigits ? '+91' + gPhoneDigits : null, email: gEmail || null, bags: Number(g.bags) })
      }
    }
    const totalBagsCount = leadBagsRaw + addOns.reduce((n, g) => n + g.bags, 0)
    if (totalBagsCount < 1) {
      return NextResponse.json({ error: 'Total bags must be at least 1.' }, { status: 400 })
    }
    const bags = String(totalBagsCount)
    const guests = String(1 + addOns.length)
    const hotelRoomNumber = typeof rawRoom === 'string' && rawRoom.trim() ? rawRoom.trim().slice(0, 40) : null
    const submissionId = typeof rawSubmissionId === 'string' && /^[A-Za-z0-9_:-]{8,80}$/.test(rawSubmissionId) ? rawSubmissionId : null
    const bagSummary = fam
      ? ['large', 'medium', 'small'].map(t => { const n = fam!.bags.filter(b => b.type === t).length; return n ? `${n} ${bagTypeLabel(t)}` : '' }).filter(Boolean).join(', ')
      : ''
    const slotLabel = (id: string) => Y2K_SLOT_LIST.find(x => x.id === id)?.label ?? id
    const famNote = fam
      ? [
          `Side: ${fam.side === 'groom' ? "Groom's (Yash)" : "Bride's (Yashna)"}`,
          `Bag types: ${bagSummary}`,
          fam.pickups.length > 1 ? 'Pickups: ' + fam.pickups.map(p => `${p.label || p.ref} — ${p.address}, Mumbai ${p.pincode} (${p.date}, ${slotLabel(p.slot)})`).join(' ; ') : '',
          fam.bags.some(b => b.ret) ? `Return planned for ${fam.bags.filter(b => b.ret).length} bag(s)` + (fam.extraReturn ? ` (+${fam.extraReturn} extra expected)` : '') : '',
          fam.notes ? `Family notes: ${fam.notes}` : '',
        ].filter(Boolean).join(' | ')
      : ''
    const familyNote = addOns.length
      ? `Family booking — Lead: ${name?.trim()} (${leadBagsRaw} bag${leadBagsRaw === 1 ? '' : 's'}); Add-ons: ` +
        addOns.map(g => `${g.name} (${g.bags})`).join(', ') + `; Total bags: ${totalBagsCount}`
      : ''
    const familyNoteAll = [familyNote, famNote].filter(Boolean).join(' | ')

    // Idempotency: a retry of the same submission returns the original
    // booking instead of creating a duplicate.
    if (submissionId) {
      const { data: dup } = await supabaseAdmin.from('bookings').select('tracking_id').eq('client_submission_id', submissionId).maybeSingle()
      if (dup?.tracking_id) return NextResponse.json({ success: true, trackingId: dup.tracking_id, emailSent: false, testMode: isTestMode, duplicate: true })
    }

    // Basic validation
    const digits = phone?.replace(/\D/g, '') ?? ''
    if (!name?.trim() || !/^[6-9]\d{9}$/.test(digits)) {
      return NextResponse.json({ error: 'Name and a valid 10-digit Indian mobile number are required.' }, { status: 400 })
    }

    // ── Prohibited-items acknowledgement (required) ─────────────────────
    // The customer must have actively ticked the checkbox on the form. The
    // acceptance (policy version, exact wording, server timestamp) is stored
    // with the inquiry below. This is still just an inquiry — accepting the
    // policy never confirms a booking.
    if (!prohibitedAck || prohibitedAck.accepted !== true || prohibitedAck.version !== PROHIBITED_ITEMS_VERSION) {
      return NextResponse.json({ error: 'Please confirm that you have read the prohibited-items list before submitting.' }, { status: 400 })
    }
    const ackAt = new Date().toISOString()
    const ackNote = `Prohibited-items policy acknowledged [${PROHIBITED_ITEMS_VERSION}] at ${ackAt}: "${PROHIBITED_ACK_TEXT}"`

    // ── Y2K pickup restrictions ─────────────────────────────────
    // arrivalDate (the pickup date) previously wasn't read here at all —
    // pickup_date below was hardcoded to the wedding date regardless of
    // what the guest actually selected. Fixed as part of wiring up this
    // validation, since restricting the date picker on the frontend would
    // otherwise have had no effect on what actually gets saved/serviced.
    // Return Pickup is a separate, fixed date (see Y2K_RETURN_PICKUP_DATE) —
    // re-validated here too, same reasoning as the onward window below.
    if (isReturnPickup) {
      if (arrivalDate !== Y2K_RETURN_PICKUP_DATE) {
        return NextResponse.json({ error: 'Return pickup date must be 19 December 2026.' }, { status: 400 })
      }
    } else if (!arrivalDate || !Y2K_PICKUP_DATES.includes(arrivalDate)) {
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
    if (!isReturnPickup && !Y2K_PICKUP_LOCATIONS.includes(pickupCity.trim().toLowerCase())) {
      return NextResponse.json({ error: 'Pickups for this service are available from Mumbai only.' }, { status: 400 })
    }

    // Atomic, race-safe BDA-YYYY-NNNN tracking ID — was a random 'Y2K-'
    // prefixed string, which broke the continuous numbering every other
    // inquiry source uses. See lib/number-series.ts. Test submissions skip
    // this entirely — see generateTestTrackingId() above.
    const trackingId = isTestMode ? generateTestTrackingId() : await nextTrackingId()

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
        service_label:  (isReturnPickup ? 'Destination Wedding — #Y2K (Return Pickup)' : 'Destination Wedding — #Y2K') + (isTestMode ? ' [TEST]' : ''),
        // Was hardcoded 'Udaipur' → 'Udaipur' regardless of where the guest
        // actually is — showed as "Udaipur → Udaipur" on the dashboard's
        // Route column for every single #Y2K booking, onward AND return
        // alike (2026-08-31 bug report). Onward: guest's pickup city
        // (whatever they selected/typed — Mumbai, Mumbai Airport, or
        // custom) → the fixed wedding venue in Udaipur. Return: reversed —
        // venue → the guest's own city, carried separately as
        // `deliveryCity` since `pickupCity` on a return-leg request is
        // itself 'Udaipur' (see app/y2k/page.tsx's return-leg payload).
        from_city:      pickupCity?.trim() || 'Mumbai',
        to_city:        isReturnPickup ? (deliveryCity?.trim() || 'Mumbai') : 'Udaipur',
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
        total_bags:     totalBagsCount,
        ...(hotelRoomNumber ? { hotel_room_number: hotelRoomNumber } : {}),
        ...(fam ? { family_details: { ...fam, submitted_at: new Date().toISOString(), version: 'y2k-wizard-v1' } } : {}),
        ...(submissionId ? { client_submission_id: submissionId } : {}),
        total_amount:   0,
        currency:       'INR',
        notes: [
          isTestMode ? '[TEST SUBMISSION — safe to delete, does not affect real tracking numbers]' : '',
          '[#Y2K — Yashna ❤️ Yash @ Taj Aravali, Udaipur · 17th–18th Dec 2026]',
          isReturnPickup ? `[RETURN PICKUP — linked to onward booking ${originalTrackingId || 'unknown'}]` : '',
          familyNoteAll,
          guests       ? `Group size: ${guests} guests` : '',
          bags         ? `Luggage pieces: ${bags}` : '',
          pickupAddress   ? `Pickup: ${pickupAddress}` : '',
          deliveryAddress ? `Delivery: ${deliveryAddress}` : '',
          pickupTime   ? `Preferred time: ${pickupTime}` : '',
          requests     ? `Special requests: ${requests}` : '',
          `Prohibited-items policy acknowledged (${PROHIBITED_ITEMS_VERSION}) at ${ackAt}`,
        ].filter(Boolean).join(' | '),
        status_history: [
          { status: 'inquiry', timestamp: new Date().toISOString(), note: '#Y2K wedding inquiry received' },
          { status: 'inquiry', timestamp: ackAt, note: ackNote, policy_version: PROHIBITED_ITEMS_VERSION, acknowledged_at: ackAt },
        ],
      }).select('id').single()

      if (dbError && (dbError as { code?: string }).code === '23505' && submissionId) {
        // Concurrent duplicate submit — return the row that won.
        const { data: winner } = await supabaseAdmin.from('bookings').select('tracking_id').eq('client_submission_id', submissionId).maybeSingle()
        if (winner?.tracking_id) return NextResponse.json({ success: true, trackingId: winner.tracking_id, emailSent: false, testMode: isTestMode, duplicate: true })
      }
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
          rawPayload:    body,
        })
      } else {
        savedBookingId = savedBooking?.id ?? null
        // Structured guest records (lead + add-ons) for onward bookings.
        // Non-fatal: the same info is also in the booking notes above.
        if (savedBookingId && !isReturnPickup) {
          const guestRows = [
            { booking_id: savedBookingId, guest_name: name.trim(), mobile_number: '+91' + digits, email: email?.trim().toLowerCase() || null, room_number: hotelRoomNumber, is_lead: true, bags_count: leadBagsRaw, sort_order: 0,
              ...(fam ? { member_ref: fam.members[0].ref, travel: { mode: fam.members[0].mode, arrDate: fam.members[0].arrDate, arrTime: fam.members[0].arrTime, travelNo: fam.members[0].travelNo, depDate: fam.members[0].depDate } } : {}) },
            ...addOns.map((g, i) => ({ booking_id: savedBookingId!, guest_name: g.name, mobile_number: g.phone, email: g.email, room_number: hotelRoomNumber, is_lead: false, bags_count: g.bags, sort_order: i + 1,
              ...(fam ? { member_ref: g.ref, travel: g.travel } : {}) })),
          ]
          const { error: gErr } = await supabaseAdmin.from('group_guests').insert(guestRows)
          if (gErr) console.error('[y2k/inquiry] guest rows insert failed (non-fatal):', gErr.message)
        }
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
        rawPayload:    body,
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

          const { data: newLead, error: leadInsertErr } = await supabaseAdmin.from('leads').insert({
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
            // Udaipur venue (or reversed, for the return leg), not a
            // hardcoded 'Udaipur' → 'Udaipur'.
            from_city:        pickupCity?.trim() || 'Mumbai',
            to_city:          isReturnPickup ? (deliveryCity?.trim() || 'Mumbai') : 'Udaipur',
            travel_date:      arrivalDate,
            pickup_date:      arrivalDate,
            pickup_address:   pickupAddress || null,
            drop_address:     deliveryAddress || null,
            bags_count:       totalBagsCount,
            notes:            (isReturnPickup
              ? `Return Pickup — linked to onward booking ${originalTrackingId || 'unknown'} — Auto-created from #Y2K wedding page inquiry ${trackingId}`
              : `Auto-created from #Y2K wedding page inquiry ${trackingId}`)
              + ` | Prohibited-items policy acknowledged (${PROHIBITED_ITEMS_VERSION}) at ${ackAt}`,
            booking_id:       savedBookingId,
          }).select('id').single()

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
              rawPayload:    body,
            })
          } else {
            console.log(`[y2k/inquiry] Auto-created lead ${leadNumber} for booking ${trackingId}`)
            // Automatic Quote Generation (Founder spec, 2026-10-03) —
            // creates a REAL quote (QT-YYYY-NNNN) + updates the linked
            // booking, using route pricing when known or a flagged
            // ₹10,000 starting figure when not. Never emails/WhatsApps the
            // customer. See lib/auto-quote.ts.
            if (newLead) await generateAutoQuoteForLead(newLead.id)
            // Internal ops WhatsApp ping — this route only ever emailed
            // info@bagdrop.co, same gap as the contact form had (see
            // app/api/contact/route.ts). Added so every inquiry source
            // notifies ops the same way. Skipped entirely for test
            // submissions — the whole point of test mode is repeated
            // testing without spamming ops with fake "New Inquiry" pings.
            if (!isTestMode) {
              await sendNewInquiryWhatsApp({
                inquiryNumber:   leadNumber,
                source:          'website',
                customerName:    name.trim(),
                customerPhone:   '+91' + digits,
                customerEmail:   email?.trim().toLowerCase() || null,
                serviceType:     'destination-weddings',
                fromCity:        pickupCity?.trim() || 'Mumbai',
                toCity:          isReturnPickup ? (deliveryCity?.trim() || 'Mumbai') : 'Udaipur',
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
            } else {
              console.log(`[y2k/inquiry] Test submission ${trackingId} — skipped ops WhatsApp ping`)
            }
          }
        }
      } catch (leadErr) {
        // Non-fatal — the booking itself already saved above either way.
        console.error('[y2k/inquiry] Lead auto-create failed (non-fatal):', leadErr)
      }
    }

    // ── Google Sheet copy of the inquiry (no-op until Y2K_SHEET_WEBHOOK_URL is set) ──
    // Skipped for test submissions. Never blocks or fails the booking.
    if (!isTestMode) {
      await appendInquiryToSheet({
        submitted_at:   new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        tracking_id:    trackingId,
        type:           isReturnPickup ? 'Return pickup' : 'Onward booking',
        linked_booking: originalTrackingId || '',
        name:           String(name ?? '').trim(),
        phone:          String(phone ?? '').trim(),
        email:          String(email ?? '').trim().toLowerCase(),
        pickup_city:    String(pickupCity ?? '').trim(),
        pickup_address: String(pickupAddress ?? '').trim(),
        delivery_city:  String(deliveryCity ?? '').trim(),
        delivery_address: String(deliveryAddress ?? '').trim(),
        arrival_date:   String(arrivalDate ?? ''),
        pickup_slot:    String(pickupTime ?? ''),
        bags:           Number(bags) || 0,
        extra_guests:   addOns.length,
        requests:       String(requests ?? '').trim(),
      })
    }

    // ── Send notification email to info@bagdrop.co ────────────
    // Skipped entirely for test submissions, same reasoning as the
    // WhatsApp ping above.
    const apiKey = process.env.RESEND_API_KEY
    let emailSent = false

    if (apiKey && !isTestMode) {
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
    // Skipped for test submissions too — don't want a real confirmation
    // email landing in whatever inbox was used to test the form.
    if (apiKey && email?.trim() && !isTestMode) {
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

    return NextResponse.json({ success: true, trackingId, emailSent, testMode: isTestMode })
  } catch (err) {
    console.error('[y2k/inquiry] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 })
  }
}
