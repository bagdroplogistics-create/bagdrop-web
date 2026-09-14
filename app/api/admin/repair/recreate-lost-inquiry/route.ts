import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'

// Kept in sync with app/api/bookings/route.ts's sanitizeFlightDateTime — a
// bare "HH:MM" (no date) reaching bookings.flight_datetime (timestamptz)
// fails the insert outright. See that file's comment for the full
// BDA-2026-0175 incident writeup.
function sanitizeFlightDateTime(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  return value.includes('T') ? value : null
}

/**
 * POST /api/admin/repair/recreate-lost-inquiry
 *
 * For the failure mode where a customer's inquiry never made it into the
 * database at all — the atomic counter minted a real BDA/BDL number, the
 * insert then failed (see app/api/bookings/route.ts's sanitizeFlightDateTime
 * comment for the incident this was built for: BDA-2026-0175, 2026-09-12),
 * and — because the old code continued past that failure instead of
 * returning an error — the "New Inquiry Received" admin email still went
 * out built from the in-memory request payload, even though nothing was
 * ever written to `bookings`/`leads`. That bug is now fixed (the route
 * returns a real error to the customer instead), but a founder who already
 * has the original inquiry's full details (from that email) and wants the
 * record recreated under its ORIGINAL tracking number — not a new one from
 * "+ New Quote", which would only ever mint the next available number —
 * needs a way to do that directly.
 *
 * Differs from every other admin/repair/* route in this folder: those all
 * derive a lead_number from an EXISTING row's own tracking_id. This one
 * creates both rows from scratch, using a tracking_id/lead_number the
 * caller already knows is correct (because it's the one that was actually
 * minted and shown to the customer) and that was NEVER written to the
 * database — so there's nothing to look up, only something to recreate.
 *
 * Deliberately admin-only (requireAdmin, not requireAdminAuth — staff keys
 * cannot call this) and deliberately sends ZERO notifications — no
 * "New Inquiry Received" admin email, no ops WhatsApp ping, no customer
 * acknowledgment. The founder already has all of that context; re-firing
 * any of it would either duplicate what they've already seen or send the
 * customer a confusing multi-day-late "we received your inquiry" message.
 *
 * Safety:
 *  - Refuses to run if tracking_id or lead_number already exists (this is
 *    creation, not repair-in-place — an existing row means this isn't the
 *    lost-inquiry case at all).
 *  - Does NOT touch bagdrop_number_counters / next_series_number() at all —
 *    inserting an explicit, already-known tracking_id bypasses the atomic
 *    counter entirely (see lib/number-series.ts). Safe here specifically
 *    because the number being reinserted is BEHIND the counter's current
 *    position (it was consumed once already, then the counter moved on
 *    past it) — never use this to insert a number ahead of the counter, or
 *    a future normal booking will eventually collide with it.
 */
export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized — full admin key required' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const trackingId: string | undefined = body.tracking_id?.trim()
  if (!trackingId || !/^BDA-\d{4}-\d{4}$/.test(trackingId)) {
    return NextResponse.json(
      { error: 'tracking_id is required and must match BDA-YYYY-NNNN (the exact number originally shown to the customer).' },
      { status: 400 }
    )
  }
  const leadNumber: string = body.lead_number?.trim() || trackingId.replace(/^BDA-/, 'BDL-')

  if (!body.customer_name || !body.customer_phone) {
    return NextResponse.json({ error: 'customer_name and customer_phone are required' }, { status: 400 })
  }

  // ── Refuse if either number is already in use ──────────────────────────
  const { data: existingBooking } = await supabaseAdmin
    .from('bookings').select('id').eq('tracking_id', trackingId).maybeSingle()
  if (existingBooking) {
    return NextResponse.json({ error: `A booking with tracking_id ${trackingId} already exists (id ${existingBooking.id}). This route only creates brand-new lost-inquiry records, not edits to existing ones.` }, { status: 409 })
  }
  const { data: existingLead } = await supabaseAdmin
    .from('leads').select('id').eq('lead_number', leadNumber).maybeSingle()
  if (existingLead) {
    return NextResponse.json({ error: `A lead with lead_number ${leadNumber} already exists (id ${existingLead.id}).` }, { status: 409 })
  }

  const customerPhone: string = body.customer_phone.trim().startsWith('+')
    ? body.customer_phone.trim()
    : '+91' + body.customer_phone.replace(/\D/g, '').replace(/^91/, '')

  // reason is caller-supplied (2026-09-14 — generalized after this route's
  // second use, recovering Sachin Patel's 10-Aug inquiry that was
  // overwritten by his 15-Aug re-inquiry reusing the same lead, the
  // 2026-08-17 duplicate-phone-reuse incident — a different root cause
  // than this route's original BDA-2026-0175 flight_datetime case). Falls
  // back to a generic description rather than hardcoding either specific
  // incident, since this route now serves any "recreate a record that was
  // lost or overwritten under its correct original tracking number" case.
  const reason = typeof body.reason === 'string' && body.reason.trim()
    ? body.reason.trim()
    : 'the original record was lost or overwritten and needed to be recreated under its correct original tracking number'
  const recoveryNote = `Recovered via recreate-lost-inquiry repair tool on ${new Date().toISOString().slice(0, 10)} — ${reason}. Recreated with its original tracking_id/lead_number and source=${body.source ?? 'website'}.${body.notes ? ' Original notes: ' + body.notes.trim() : ''}`

  // submitted_at backdates both rows to when the customer actually
  // submitted, not when this repair ran — both created_at columns are
  // plain DEFAULT now(), so an explicit value on insert overrides it.
  const submittedAt: string | undefined = body.submitted_at
    ? new Date(body.submitted_at).toISOString()
    : undefined

  const bookingPayload: Record<string, unknown> = {
    tracking_id:    trackingId,
    title:          body.title || 'Mr.',
    customer_name:  body.customer_name.trim(),
    customer_phone: customerPhone,
    customer_phone_country_code: body.phone_country_code || 'IN',
    customer_phone_national:     body.phone_national || customerPhone.replace(/^\+91/, ''),
    customer_email: body.customer_email?.trim()?.toLowerCase() || '',
    service_type:   body.service_type || '',
    service_label:  body.service_label || body.service_type || '',
    from_city:      body.from_city?.trim() || '',
    to_city:        body.to_city?.trim() || '',
    pickup_date:    body.pickup_date || null,
    delivery_date:  body.delivery_date || null,
    time_slot:      body.pickup_time || null,
    pickup_address: body.pickup_address?.trim() || null,
    drop_address:   body.drop_address?.trim() || null,
    total_bags:     Number(body.total_bags) || 1,
    flight_number:  body.flight_number?.trim() || null,
    flight_datetime: sanitizeFlightDateTime(body.flight_datetime),
    notes:          body.notes?.trim() || null,
    status:         'inquiry',
    status_history: [{
      from: null, to: 'inquiry', timestamp: submittedAt ?? new Date().toISOString(),
      changed_by: 'system',
      note: `Recreated via repair tool — original website submission was lost (see BDA-2026-0175 incident).`,
    }],
    is_test: false,
    ...(submittedAt ? { created_at: submittedAt } : {}),
  }

  const { data: newBooking, error: bookingErr } = await supabaseAdmin
    .from('bookings').insert(bookingPayload).select('id, tracking_id').single()

  if (bookingErr || !newBooking) {
    return NextResponse.json({ error: bookingErr?.message ?? 'Booking insert failed' }, { status: 500 })
  }

  const leadPayload: Record<string, unknown> = {
    lead_number: leadNumber,
    title:  body.title || 'Mr.',
    name:   body.customer_name.trim(),
    phone:  customerPhone,
    phone_country_code: body.phone_country_code || 'IN',
    phone_national:     body.phone_national || customerPhone.replace(/^\+91/, ''),
    email:  body.customer_email?.trim()?.toLowerCase() || null,
    source: body.source || 'website',
    status: 'new',
    service_interest: body.service_type || null,
    service_type:     body.service_type || null,
    from_city: body.from_city?.trim() || null,
    to_city:   body.to_city?.trim()   || null,
    travel_date:   body.travel_date   || body.pickup_date || null,
    pickup_date:   body.pickup_date   || null,
    delivery_date: body.delivery_date || null,
    pickup_time:   body.pickup_time   || null,
    pickup_address: body.pickup_address?.trim() || null,
    drop_address:   body.drop_address?.trim()   || null,
    bags_count: Number(body.total_bags) || 1,
    flight_number: body.flight_number?.trim() || null,
    notes: recoveryNote,
    booking_id: newBooking.id,
    is_test: false,
    ...(submittedAt ? { created_at: submittedAt } : {}),
  }

  const { data: newLead, error: leadErr } = await supabaseAdmin
    .from('leads').insert(leadPayload).select('id, lead_number').single()

  if (leadErr || !newLead) {
    // Roll back the booking so a failed repair attempt leaves nothing
    // half-created behind (same convention as the normal admin/leads route).
    await supabaseAdmin.from('bookings').delete().eq('id', newBooking.id)
    return NextResponse.json({ error: leadErr?.message ?? 'Lead insert failed' }, { status: 500 })
  }

  // Deliberately NO notifications of any kind — see module comment above.

  return NextResponse.json({
    success:     true,
    tracking_id: newBooking.tracking_id,
    lead_number: newLead.lead_number,
    booking_id:  newBooking.id,
    lead_id:     newLead.id,
  }, { status: 201 })
}
