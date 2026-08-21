import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { nextTrackingId } from '@/lib/number-series'

/**
 * POST /api/admin/repair/create-booking-for-lead
 * Body: { lead_id: string }
 *
 * Creates a BDA-YYYY-NNNN booking for a lead that has no booking linked,
 * then writes booking_id back onto the lead row.
 * Idempotent — if a booking already exists (by booking_id or lead_id) it returns it.
 */
export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const leadId: string | undefined = body?.lead_id
  if (!leadId) return NextResponse.json({ error: 'lead_id is required' }, { status: 400 })

  // ── 1. Fetch the lead ────────────────────────────────────────────────────────
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()

  if (leadErr || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  // ── 2. Check if booking already exists (idempotent) ─────────────────────────
  if (lead.booking_id) {
    const { data: existing } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .eq('id', lead.booking_id)
      .maybeSingle()
    if (existing) return NextResponse.json({ booking: existing, created: false })
  }

  // ── 3. Pick the new booking's tracking ID ────────────────────────────────────
  // PREFER the number PAIRED with this lead's own lead_number (BDL-YYYY-NNNN
  // → BDA-YYYY-NNNN swap) so the two always match — founder requirement,
  // 2026-08-21 (this repair route used to always mint a brand-new,
  // independently-sequenced number instead, which meant a repaired
  // booking's BDA number silently drifted away from its own lead's BDL
  // number every time it ran — e.g. booking BDA-2026-0112 ending up paired
  // with lead BDL-2026-0115). Only fall back to a fresh number — re-pairing
  // this lead's lead_number to match it — if the derived number turns out
  // to already belong to a genuinely different booking (verified by phone
  // match, not just "some row exists" — a live direct/public booking with
  // no lead, e.g. app/api/bookings/route.ts, can independently consume BDA
  // numbers, so a real collision is possible, just uncommon).
  const derivedTrackingId = lead.lead_number.replace(/^BDL-/, 'BDA-')
  const { data: existingByTracking } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('tracking_id', derivedTrackingId)
    .maybeSingle()

  let trackingId: string
  if (!existingByTracking) {
    trackingId = derivedTrackingId
  } else if (existingByTracking.customer_phone === lead.phone) {
    // This repair tool already ran for this exact lead before — idempotent,
    // just re-link and return it. (lead_id column does not exist on
    // bookings — relationship is via leads.booking_id only.)
    await supabaseAdmin
      .from('leads')
      .update({ booking_id: existingByTracking.id })
      .eq('id', leadId)
    return NextResponse.json({ booking: existingByTracking, created: false })
  } else {
    // Genuine collision with an unrelated booking — mint a fresh,
    // independently-sequenced number and re-pair this lead's lead_number
    // to match it, so pairing still holds under whichever number is
    // actually used.
    trackingId = await nextTrackingId()
    await supabaseAdmin
      .from('leads')
      .update({ lead_number: trackingId.replace(/^BDA-/, 'BDL-') })
      .eq('id', leadId)
  }

  // ── 4. Service label map ─────────────────────────────────────────────────────
  const serviceLabelMap: Record<string, string> = {
    'airport-to-doorstep':  'Airport → Doorstep',
    'airport-to-door':      'Airport → Doorstep',
    'doorstep-to-airport':  'Doorstep → Airport',
    'door-to-airport':      'Doorstep → Airport',
    'doorstep-to-doorstep': 'Doorstep → Doorstep',
    'airport-to-airport':   'Airport → Airport',
    'intercity':            'Intercity',
  }
  const sType = lead.service_type ?? lead.service_interest ?? 'intercity'

  // ── 5. Create the booking ────────────────────────────────────────────────────
  const { data: newBooking, error: insertErr } = await supabaseAdmin
    .from('bookings')
    .insert({
      tracking_id:    trackingId,
      // lead_id omitted — column may not exist in older DB schemas.
      // The relationship is maintained via leads.booking_id (set below).
      customer_name:  lead.name,
      customer_phone: lead.phone,
      customer_email: lead.email ?? '',
      from_city:      lead.from_city ?? '',
      to_city:        lead.to_city ?? '',
      pickup_date:    lead.pickup_date ?? null,
      time_slot:      lead.pickup_time ?? null,
      pickup_address: lead.pickup_address ?? null,
      drop_address:   lead.drop_address ?? null,
      total_bags:     lead.bags_count ?? 1,
      flight_number:  lead.flight_number ?? null,
      notes:          lead.notes ?? null,
      service_type:   sType || '',
      service_label:  serviceLabelMap[sType] ?? sType ?? '',
      total_amount:   lead.quote_total ?? null,
      status:         lead.quote_number ? 'quote_created' : 'inquiry',
      status_history: [
        {
          from:       null,
          to:         lead.quote_number ? 'quote_created' : 'inquiry',
          timestamp:  new Date().toISOString(),
          changed_by: 'system',
          note:       `Booking created via repair tool for lead ${lead.lead_number}`,
        },
      ],
    })
    .select()
    .single()

  if (insertErr || !newBooking) {
    return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })
  }

  // ── 6. Link booking_id back onto the lead ────────────────────────────────────
  await supabaseAdmin
    .from('leads')
    .update({ booking_id: newBooking.id })
    .eq('id', leadId)

  return NextResponse.json({ booking: newBooking, created: true }, { status: 201 })
}
