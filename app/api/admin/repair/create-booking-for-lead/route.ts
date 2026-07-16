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

  // Also check by lead_id in case booking exists but wasn't linked
  const { data: existingByLead } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingByLead) {
    // Link it back to lead
    await supabaseAdmin
      .from('leads')
      .update({ booking_id: existingByLead.id })
      .eq('id', leadId)
    return NextResponse.json({ booking: existingByLead, created: false })
  }

  // ── 3. Generate BDA- tracking ID ────────────────────────────────────────────
  const year = new Date().getFullYear()
  const { count } = await supabaseAdmin
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .like('tracking_id', `BDA-%`)

  const seq = String((count ?? 0) + 1).padStart(4, '0')
  const trackingId = `BDA-${year}-${seq}`

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
      lead_id:        lead.id,
      customer_name:  lead.name,
      customer_phone: lead.phone,
      customer_email: lead.email ?? null,
      from_city:      lead.from_city ?? null,
      to_city:        lead.to_city ?? null,
      pickup_date:    lead.pickup_date ?? null,
      time_slot:      lead.pickup_time ?? null,
      pickup_address: lead.pickup_address ?? null,
      drop_address:   lead.drop_address ?? null,
      total_bags:     lead.bags_count ?? 1,
      flight_number:  lead.flight_number ?? null,
      notes:          lead.notes ?? null,
      service_type:   sType,
      service_label:  serviceLabelMap[sType] ?? sType,
      total_amount:   lead.quote_total ?? null,
      status:         lead.quote_number ? 'quote_created' : 'inquiry',
      status_history: [
        {
          status:    lead.quote_number ? 'quote_created' : 'inquiry',
          timestamp: new Date().toISOString(),
          note:      'Booking created via repair tool (admin lead)',
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
