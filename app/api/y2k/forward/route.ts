import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { nextTrackingId } from '@/lib/number-series'
import { sendY2kInquiryWhatsApp } from '@/lib/new-inquiry-notification'
import { alertCreationFailure } from '@/lib/creation-failure-alert'

// Receives a Y2K wedding booking from the NEW platform (bagdrop-new, which serves bagdrop.co/y2k)
// and mirrors it into THIS (old) system so it shows up on the old Dashboard + Leads tab and pings
// ops on WhatsApp, same as every other inquiry. The new platform already emails the inquiry desk,
// so this route deliberately sends no second email.
//
// Auth: shared secret in the `x-forward-secret` header (env Y2K_FORWARD_SECRET, set the same value
// in both Vercel projects). No other validation of dates/slots — the new platform owns the rules.
// Idempotent on the new platform's booking id (e.g. Y2K-FW327A): a retry never creates a duplicate.

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function normPhone(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (!d) return ''
  if (raw.trim().startsWith('+')) return '+' + d
  if (d.length === 10) return '+91' + d
  if (d.length === 12 && d.startsWith('91')) return '+' + d
  return '+' + d
}

export async function POST(req: NextRequest) {
  const secret = process.env.Y2K_FORWARD_SECRET
  if (!secret) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  if (req.headers.get('x-forward-secret') !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = await req.json().catch(() => null)
  const y2kId = str(b?.id, 80)
  const name = str(b?.name, 200)
  const phone = normPhone(str(b?.phone, 40))
  if (!y2kId || !name || !phone) return NextResponse.json({ error: 'id, name and phone are required' }, { status: 400 })

  const email = str(b?.email, 200).toLowerCase() || null
  const family = str(b?.familyName, 200)
  const side = str(b?.side, 40)
  const from = str(b?.from, 120) || 'Mumbai'
  const to = str(b?.to, 120) || 'Udaipur'
  const pickupAddress = str(b?.pickupAddress, 600) || null
  const date = str(b?.date, 20) || null
  const slot = str(b?.slot, 40) || null
  const bags = Math.max(1, parseInt(String(b?.bags ?? '1'), 10) || 1)
  const guests = Math.max(1, parseInt(String(b?.guests ?? '1'), 10) || 1)
  const details = str(b?.details, 6000)
  // Wedding extras sent by the new platform (all optional — older payloads simply omit them).
  const eventName = str(b?.eventName, 160)
  const retBags = Math.max(0, parseInt(String(b?.retBags ?? '0'), 10) || 0)
  const retDate = str(b?.retDate, 20)
  const retSlot = str(b?.retSlot, 60)
  const retTo = str(b?.retTo, 300)
  const returnLine = retBags > 0 || retDate
    ? `Return journey: ${retBags || '—'} bag(s) · pickup ${[retDate, retSlot].filter(Boolean).join(' ') || 'TBC'}${retTo ? ` · to ${retTo}` : ''}`
    : ''

  // Idempotency — same new-platform booking id never creates a second row.
  const { data: dup } = await supabaseAdmin.from('bookings').select('tracking_id').eq('client_submission_id', y2kId).maybeSingle()
  if (dup?.tracking_id) return NextResponse.json({ success: true, trackingId: dup.tracking_id, duplicate: true })

  const trackingId = await nextTrackingId()
  const label = `Destination Wedding — #Y2K${family ? ` · ${family}` : ''} (${y2kId})`

  const { data: saved, error: dbError } = await supabaseAdmin.from('bookings').insert({
    tracking_id:          trackingId,
    status:               'inquiry',
    customer_name:        name,
    customer_email:       email,
    customer_phone:       phone,
    service_type:         'destination-weddings',
    service_label:        label,
    from_city:            from,
    to_city:              to,
    pickup_address:       pickupAddress,
    pickup_date:          date,
    // The #Y2K form collects a PICKUP date only (delivery is to the wedding venue on the event
    // schedule), so no delivery date is stored — it used to be a copy of the pickup date.
    delivery_date:        null,
    time_slot:            slot,
    total_bags:           bags,
    total_amount:         0,
    currency:             'INR',
    client_submission_id: y2kId,
    notes: [
      `[#Y2K wedding — received on the new platform as ${y2kId}${side ? `, ${side}'s side` : ''}]`,
      `Group size: ${guests} guest(s)`,
      `Luggage pieces: ${bags}`,
      eventName && `Event: ${eventName}`,
      returnLine,
      details,
    ].filter(Boolean).join('\n'),
    status_history: [{ status: 'inquiry', timestamp: new Date().toISOString(), note: `#Y2K wedding booking ${y2kId} forwarded from the new platform` }],
  }).select('id').single()

  if (dbError || !saved) {
    console.error('[y2k/forward] booking insert failed:', dbError?.message)
    await alertCreationFailure({ source: 'y2k-forward', trackingId, failureStage: 'booking_insert', customerName: name, customerPhone: phone, customerEmail: email, errorMessage: dbError?.message ?? 'unknown', rawPayload: b })
    return NextResponse.json({ error: 'Could not save booking' }, { status: 500 })
  }

  // Matching lead so it appears in the old Leads tab (lead number mirrors the booking number).
  const leadNumber = trackingId.replace(/^BDA-/, 'BDL-')
  const { error: leadErr } = await supabaseAdmin.from('leads').insert({
    lead_number:      leadNumber,
    name,
    phone,
    email,
    source:           'website',
    status:           'new',
    service_type:     'destination-weddings',
    service_interest: 'destination-weddings',
    from_city:        from,
    to_city:          to,
    travel_date:      date,
    pickup_date:      date,
    pickup_address:   pickupAddress,
    bags_count:       bags,
    notes:            `Auto-created from #Y2K wedding booking ${y2kId} (new platform)${family ? ` · ${family}` : ''}${side ? ` · ${side}'s side` : ''}${eventName ? `\nEvent: ${eventName}` : ''}${returnLine ? `\n${returnLine}` : ''}\n${details}`.slice(0, 6000),
    booking_id:       saved.id,
  })
  if (leadErr) {
    console.error('[y2k/forward] lead insert failed:', leadErr.message)
    await alertCreationFailure({ source: 'y2k-forward', trackingId, leadNumber, failureStage: 'lead_insert', customerName: name, customerPhone: phone, customerEmail: email, errorMessage: leadErr.message, rawPayload: b })
  } else {
    try {
      await sendY2kInquiryWhatsApp({
        inquiryNumber: leadNumber, customerName: name, customerPhone: phone, customerEmail: email,
        familyName: family, side, eventName, fromCity: from, toCity: to, pickupAddress,
        pickupDate: date, slot, bags, guests, retBags, retDate, retSlot, retTo,
      })
    } catch (e) { console.error('[y2k/forward] ops WhatsApp failed (non-fatal):', e) }
  }

  return NextResponse.json({ success: true, trackingId, leadNumber })
}
