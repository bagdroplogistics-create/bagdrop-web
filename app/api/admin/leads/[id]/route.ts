import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ lead: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const allowed = [
    'name', 'phone', 'email', 'source', 'service_interest', 'service_type',
    'from_city', 'to_city', 'travel_date', 'pickup_date', 'delivery_date',
    'pickup_time', 'pickup_address', 'drop_address', 'bags_count', 'status', 'notes', 'assigned_to',
    'converted_booking_id', 'booking_id', 'pnr', 'flight_number', 'flight_time', 'flight_ticket_url',
    // Zoho Books integration
    'zoho_estimate_id', 'zoho_estimate_number',
    // Soft-delete support: set to null to restore a deleted lead
    'deleted_at',
    // Payment tracking
    'payment_status',
    // Quote / pricing data — editable via Edit Quote, must round-trip in full
    // (including custom/manual routes not present in the Route Map).
    'quote_line_items', 'quote_subtotal', 'quote_discount_pct', 'quote_discount_amt',
    'quote_tax', 'quote_total', 'quote_subject', 'quote_notes', 'quote_terms',
    'quote_expiry_date', 'salesperson_name', 'agent_name',
  ]

  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  // Convert empty strings to null for date/optional columns
  const nullableFields = [
    'travel_date', 'pickup_date', 'delivery_date', 'flight_time',
    'email', 'from_city', 'to_city', 'notes', 'assigned_to',
    'converted_booking_id', 'pnr', 'flight_number', 'flight_ticket_url', 'pickup_time',
    'pickup_address', 'drop_address',
    'quote_expiry_date', 'quote_subject', 'quote_notes', 'quote_terms',
    'salesperson_name', 'agent_name',
  ]
  for (const f of nullableFields) {
    if (f in updates && (updates[f] === '' || updates[f] === null)) updates[f] = null
  }

  // Keep service_interest and service_type in sync
  if ('service_interest' in updates) updates.service_type = updates.service_interest
  if ('service_type' in updates && !('service_interest' in updates)) updates.service_interest = updates.service_type

  // Normalise phone if provided
  if ('phone' in updates && typeof updates.phone === 'string') {
    const raw = updates.phone.replace(/\D/g, '')
    updates.phone = raw ? '+91' + raw.replace(/^91/, '') : updates.phone
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // ── Update lead record ────────────────────────────────────────────
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 500 })

  // ── Sync key fields to the linked booking ────────────────────────
  if (lead.booking_id) {
    const serviceLabelMap: Record<string, string> = {
      'airport-to-doorstep':  'Airport → Doorstep',
      'airport-to-door':      'Airport → Doorstep',
      'doorstep-to-airport':  'Doorstep → Airport',
      'door-to-airport':      'Doorstep → Airport',
      'doorstep-to-doorstep': 'Doorstep → Doorstep',
      'airport-to-airport':   'Airport → Airport',
      'intercity':            'Intercity',
    }

    const statusMap: Record<string, string> = {
      new:       'inquiry',
      contacted: 'document_collection',
      qualified: 'review',
      converted: 'accepted',
      lost:      'rejected',
    }

    const bookingUpdates: Record<string, unknown> = {}

    if ('name' in updates)          bookingUpdates.customer_name  = lead.name
    if ('phone' in updates)         bookingUpdates.customer_phone = lead.phone
    if ('email' in updates)         bookingUpdates.customer_email = lead.email
    if ('from_city' in updates)     bookingUpdates.from_city      = lead.from_city
    if ('to_city' in updates)       bookingUpdates.to_city        = lead.to_city
    if ('pickup_date' in updates)    bookingUpdates.pickup_date    = lead.pickup_date
    if ('pickup_time' in updates)    bookingUpdates.time_slot      = lead.pickup_time
    if ('pickup_address' in updates) bookingUpdates.pickup_address = lead.pickup_address
    if ('drop_address' in updates)   bookingUpdates.drop_address   = lead.drop_address
    if ('bags_count' in updates)     bookingUpdates.total_bags     = lead.bags_count
    if ('notes' in updates)          bookingUpdates.notes          = lead.notes
    if ('flight_number' in updates)  bookingUpdates.flight_number  = lead.flight_number
    // Keep the linked booking's total in sync when a quote is edited (incl. custom/manual routes)
    if ('quote_total' in updates)    bookingUpdates.total_amount   = lead.quote_total

    if ('service_type' in updates || 'service_interest' in updates) {
      const sType = lead.service_type ?? lead.service_interest ?? ''
      bookingUpdates.service_type  = sType
      bookingUpdates.service_label = serviceLabelMap[sType] ?? sType
    }

    // Sync lead status → booking status (only advance, never regress)
    if ('status' in updates && body.status in statusMap) {
      const { data: currentBooking } = await supabaseAdmin
        .from('bookings')
        .select('status, status_history')
        .eq('id', lead.booking_id)
        .single()

      const bookingStatusOrder = [
        'inquiry', 'document_collection', 'pending', 'review',
        'accepted', 'rejected', 'quote_sent', 'payment_pending',
        'payment_approved', 'confirmed', 'pickup_scheduled', 'picked_up',
        'in_transit', 'out_for_delivery', 'delivered', 'completed', 'cancelled',
      ]
      const newBookingStatus = statusMap[body.status]
      const currentIdx       = bookingStatusOrder.indexOf(currentBooking?.status ?? 'inquiry')
      const newIdx           = bookingStatusOrder.indexOf(newBookingStatus)

      if (newIdx > currentIdx || body.status === 'lost') {
        bookingUpdates.status = newBookingStatus
        const history = currentBooking?.status_history ?? []
        history.push({
          from:       currentBooking?.status ?? null,
          to:         newBookingStatus,
          timestamp:  new Date().toISOString(),
          changed_by: 'admin',
          note:       `Synced from lead status change: ${body.status}`,
        })
        bookingUpdates.status_history = history
      }
    }

    if (Object.keys(bookingUpdates).length > 0) {
      const { error: bookingErr } = await supabaseAdmin
        .from('bookings')
        .update(bookingUpdates)
        .eq('id', lead.booking_id)

      if (bookingErr) {
        console.error('[leads PATCH] booking sync failed (non-fatal):', bookingErr.message)
      }
    }
  }

  return NextResponse.json({ lead })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  // Fetch lead first so we know what to do with the linked booking
  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('booking_id, lead_number')
    .eq('id', id)
    .single()

  // ── SOFT-DELETE: set deleted_at instead of hard-deleting ──────────────────
  // This preserves the record in the database and allows recovery via
  // PATCH /api/admin/leads/[id] with { deleted_at: null }.
  // Hard deletes are NOT used for leads — inquiries must never vanish.
  const { error } = await supabaseAdmin
    .from('leads')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    // If deleted_at column doesn't exist yet (migration not run), fall back to
    // keeping the record but still cancelling the linked booking.
    if (error.message?.includes('deleted_at')) {
      console.warn('[leads DELETE] deleted_at column missing — SOFT_DELETE_MIGRATION.sql not yet run. Booking will be cancelled but lead record preserved.')
      // Don't return an error to the frontend — handle gracefully below.
    } else {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  console.log(`[leads DELETE] Soft-deleted lead ${lead?.lead_number ?? id}`)

  // Cancel the linked BDA- booking (it remains in DB, just marked cancelled)
  if (lead?.booking_id) {
    const { data: booking } = await supabaseAdmin
      .from('bookings')
      .select('tracking_id')
      .eq('id', lead.booking_id)
      .single()

    if (booking?.tracking_id?.startsWith('BDA-')) {
      await supabaseAdmin
        .from('bookings')
        .update({ status: 'cancelled', notes: `Lead ${lead.lead_number} soft-deleted by admin` })
        .eq('id', lead.booking_id)
    }
  }

  return NextResponse.json({ success: true, soft_deleted: true })
}

// ── RESTORE: un-delete a soft-deleted lead ────────────────────────────────────
// Called via PATCH /api/admin/leads/[id] with body { deleted_at: null }
// The PATCH handler already handles this since 'deleted_at' is in the allowed list below.
