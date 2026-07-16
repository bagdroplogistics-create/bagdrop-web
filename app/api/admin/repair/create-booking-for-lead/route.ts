import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

/**
 * POST /api/admin/repair/create-booking-for-lead
 * Body: { lead_id: string }
 *
 * Creates a BDA-XXXX booking for a lead that has no booking linked,
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

  // Also check by derived BDA- tracking_id in case booking exists but wasn't linked
  // (lead_id column does not exist on bookings — relationship is via leads.booking_id only)
  const derivedTrackingId = lead.lead_number.replace(/^BDL-/, 'BDA-')
  const { data: existingByTracking } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('tracking_id', derivedTrackingId)
    .maybeSingle()

  if (existingByTracking) {
    // Link it back to lead
    await supabaseAdmin
      .from('leads')
      .update({ booking_id: existingByTracking.id })
      .eq('id', leadId)
    return NextResponse.json({ booking: existingByTracking, created: false })
  }

  // ── 3. Derive BDA- tracking ID from lead number (guaranteed unique) ──────────
  // BDL-2026-0001 → BDA-2026-0001 — enables cross-referencing across modules
  const trackingId = lead.lead_number.replace(/^BDL-/, 'BDA-')

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
