import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { parseStoredPhone } from '@/lib/phone-format'
import { TITLE_OPTIONS } from '@/lib/constants'

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
    'title',
    'name', 'phone', 'phone_country_code', 'phone_national', 'email', 'source', 'service_interest', 'service_type',
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
    // quote_number/quote_date included so a whole (primary) quote can be
    // cleared via PATCH with every quote_* field set to null — mirrors the
    // return_quote_* clear support below, e.g. "Delete Quote" on the quote
    // view page. This never deletes the lead row itself.
    'quote_number', 'quote_date',
    'quote_line_items', 'quote_subtotal', 'quote_discount_pct', 'quote_discount_amt',
    'quote_tax', 'quote_total', 'quote_subject', 'quote_notes', 'quote_terms',
    'quote_expiry_date', 'salesperson_name', 'agent_name',
    // Return-journey quote fields — normally only written by
    // /api/admin/zoho/generate-quote (isReturnQuote branch). Included here so
    // an admin can clear an accidentally-generated return quote (e.g. a
    // second "Generate Quote" click on a one-way lead) via a PATCH with all
    // of these set to null, without touching the primary quote.
    'return_quote_number', 'return_quote_line_items', 'return_quote_total',
    'return_quote_subtotal', 'return_quote_tax', 'return_quote_date',
    'return_from_city', 'return_to_city', 'return_bags_count',
    'return_discount_amt', 'return_discount_pct', 'return_quote_notes',
    'return_pickup_address', 'return_pickup_date', 'return_booking_id',
    // Sales Follow-up & Reminder System — set by the "Mark Customer
    // Responded" action to stop the response-track reminder for this
    // lead. See lib/sales-followup-reminders.ts.
    'customer_responded_at',
    // Business Customer support (New Quote form) — additive, alongside the
    // existing Individual fields above. See
    // supabase/migrations/20260807_business_customer_fields.sql.
    'customer_type', 'business_name', 'business_address', 'gst_number', 'payment_terms',
  ]

  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  // Reject an invalid title rather than silently writing bad data past the
  // DB CHECK constraint (which would surface as an opaque 500).
  if ('title' in updates && !TITLE_OPTIONS.includes(updates.title as never)) {
    return NextResponse.json({ error: 'title must be one of Mr., Mrs., Ms.' }, { status: 400 })
  }

  // Convert empty strings to null for date/optional columns
  const nullableFields = [
    'travel_date', 'pickup_date', 'delivery_date', 'flight_time',
    'email', 'from_city', 'to_city', 'notes', 'assigned_to',
    'converted_booking_id', 'pnr', 'flight_number', 'flight_ticket_url', 'pickup_time',
    'pickup_address', 'drop_address',
    'quote_number', 'quote_date',
    'quote_expiry_date', 'quote_subject', 'quote_notes', 'quote_terms',
    'salesperson_name', 'agent_name',
    'return_quote_number', 'return_quote_total', 'return_quote_subtotal',
    'return_quote_tax', 'return_quote_date', 'return_from_city', 'return_to_city',
    'return_bags_count', 'return_discount_amt', 'return_discount_pct',
    'return_quote_notes', 'return_pickup_address', 'return_pickup_date',
    'customer_responded_at',
    'business_name', 'business_address', 'gst_number', 'payment_terms',
  ]
  for (const f of nullableFields) {
    if (f in updates && (updates[f] === '' || updates[f] === null)) updates[f] = null
  }

  // Keep service_interest and service_type in sync
  if ('service_interest' in updates) updates.service_type = updates.service_interest
  if ('service_type' in updates && !('service_interest' in updates)) updates.service_interest = updates.service_type

  // Normalise phone if provided. PhoneInput's Edit Quote/Edit Lead form now
  // sends a proper dial-code-prefixed value (e.g. "+14155550100") plus
  // phone_country_code/phone_national split out separately — this used to
  // hardcode +91 onto whatever digits arrived, corrupting every non-Indian
  // number no matter what country the admin actually selected. Bare-digit
  // input (no leading "+") is still assumed India, matching the legacy
  // pre-international behavior for any older caller.
  if ('phone' in updates && typeof updates.phone === 'string') {
    const trimmed = updates.phone.trim()
    if (!trimmed.startsWith('+')) {
      const raw = trimmed.replace(/\D/g, '')
      updates.phone = raw ? '+91' + raw.replace(/^91/, '') : trimmed
    } else {
      updates.phone = trimmed
    }
    // Fill in the split columns if the caller didn't already send them.
    if (!('phone_country_code' in updates) || !('phone_national' in updates)) {
      const parsed = parseStoredPhone(updates.phone as string)
      if (!('phone_country_code' in updates)) updates.phone_country_code = parsed.iso2
      if (!('phone_national' in updates))     updates.phone_national     = parsed.nationalNumber
    }
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

    const bookingUpdates: Record<string, unknown> = {}

    if ('title' in updates)          bookingUpdates.title          = lead.title
    if ('name' in updates)          bookingUpdates.customer_name  = lead.name
    if ('phone' in updates) {
      bookingUpdates.customer_phone = lead.phone
      bookingUpdates.customer_phone_country_code = lead.phone_country_code
      bookingUpdates.customer_phone_national     = lead.phone_national
    }
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

    // Business Customer support — keep the booking's copy of these fields
    // in sync so Invoice/LR (generated from bookings) reflect edits made
    // after the initial quote, e.g. switching Individual -> Business later.
    if ('customer_type' in updates)    bookingUpdates.customer_type    = lead.customer_type
    if ('business_name' in updates)    bookingUpdates.business_name    = lead.business_name
    if ('business_address' in updates) bookingUpdates.business_address = lead.business_address
    if ('gst_number' in updates)       bookingUpdates.gst_number       = lead.gst_number
    if ('payment_terms' in updates)    bookingUpdates.payment_terms    = lead.payment_terms

    if ('service_type' in updates || 'service_interest' in updates) {
      const sType = lead.service_type ?? lead.service_interest ?? ''
      bookingUpdates.service_type  = sType
      bookingUpdates.service_label = serviceLabelMap[sType] ?? sType
    }

    // NOTE: lead.status (new/contacted/qualified/converted/lost) is
    // intentionally NOT synced onto bookings.status here. It used to be,
    // via a status map ('contacted' -> 'document_collection', 'qualified'
    // -> 'review', etc.) that doesn't exist anywhere in the canonical
    // booking lifecycle vocabulary (STATUS_ORDER in
    // lib/lifecycle-notifications.ts and the equivalent STATUS_ORDER_BASE
    // in app/(admin)/admin/quotes/view/[lead_id]/page.tsx) — the Booking
    // Workflow UI's every step-enablement check, notification trigger,
    // Google Calendar sync, and Ops reminder scheduling all key off that
    // exact vocabulary. Writing an unrecognized status value made the
    // whole Booking Workflow stepper appear "stuck"/all-disabled, because
    // the current-step lookup silently returned -1 for a status it didn't
    // recognize. The lead's own status is a lighter-weight sales/CRM
    // categorization (has someone followed up yet) and is deliberately
    // decoupled from the booking's real operational status, which is
    // owned exclusively by the Booking Workflow's own explicit actions
    // (Send Quote, Confirm Booking, etc. — see
    // app/api/admin/bookings/[id]/route.ts). Changing a lead's status here
    // still updates the lead itself; it just no longer reaches into the
    // booking.

    if (Object.keys(bookingUpdates).length > 0) {
      const { error: bookingErr } = await supabaseAdmin
        .from('bookings')
        .update(bookingUpdates)
        .eq('id', lead.booking_id)

      if (bookingErr) {
        console.error('[leads PATCH] booking sync failed (non-fatal):', bookingErr.message)
      }
    }

    // ── Restore: un-cancel the booking if it was auto-cancelled by the
    // lead soft-delete (DELETE /api/admin/leads/[id]) ──────────────────
    // Only reverses bookings that carry our auto-cancel marker in
    // status_history — a booking the admin cancelled manually, or one
    // that was already 'cancelled' before the lead was deleted, is left
    // alone so restoring a lead never overrides a deliberate decision.
    if ('deleted_at' in updates && updates.deleted_at === null) {
      const { data: currentBooking } = await supabaseAdmin
        .from('bookings')
        .select('status, status_history')
        .eq('id', lead.booking_id)
        .single()

      if (currentBooking?.status === 'cancelled') {
        const history = Array.isArray(currentBooking.status_history) ? currentBooking.status_history : []
        const autoCancelEntry = [...history].reverse().find(
          (h: Record<string, unknown>) =>
            h?.to === 'cancelled' &&
            typeof h?.note === 'string' &&
            h.note.includes('linked lead') &&
            h.note.includes('deleted')
        )

        if (autoCancelEntry) {
          const restoredStatus = (autoCancelEntry.from as string) || 'inquiry'
          history.push({
            from:       'cancelled',
            to:         restoredStatus,
            timestamp:  new Date().toISOString(),
            changed_by: 'admin',
            note:       `Auto-restored — linked lead ${lead.lead_number} was un-deleted`,
          })
          const { error: restoreErr } = await supabaseAdmin
            .from('bookings')
            .update({ status: restoredStatus, status_history: history })
            .eq('id', lead.booking_id)

          if (restoreErr) {
            console.error('[leads PATCH] booking restore failed (non-fatal):', restoreErr.message)
          }
        }
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

  // Cancel the linked booking (it remains in DB, just marked cancelled) so it
  // drops out of the Dashboard's default view, which excludes status=cancelled.
  // Previously this only fired for BDA- (admin-created) bookings, so deleting
  // a lead whose booking came from the website/mobile form (BD-, Y2K-, BDC-,
  // etc.) left the booking sitting on the Dashboard even after the lead was
  // gone — that's the bug being fixed here. Cancelling should happen for any
  // linked booking, regardless of tracking-id prefix.
  if (lead?.booking_id) {
    const { data: booking } = await supabaseAdmin
      .from('bookings')
      .select('tracking_id, status, status_history')
      .eq('id', lead.booking_id)
      .single()

    if (booking && booking.status !== 'cancelled') {
      const history = Array.isArray(booking.status_history) ? booking.status_history : []
      history.push({
        from:       booking.status ?? null,
        to:         'cancelled',
        timestamp:  new Date().toISOString(),
        changed_by: 'admin',
        note:       `Auto-cancelled — linked lead ${lead.lead_number} was deleted`,
      })
      await supabaseAdmin
        .from('bookings')
        .update({
          status: 'cancelled',
          notes: `Lead ${lead.lead_number} soft-deleted by admin`,
          status_history: history,
        })
        .eq('id', lead.booking_id)
    }
  }

  return NextResponse.json({ success: true, soft_deleted: true })
}

// ── RESTORE: un-delete a soft-deleted lead ────────────────────────────────────
// Called via PATCH /api/admin/leads/[id] with body { deleted_at: null }
// The PATCH handler already handles this since 'deleted_at' is in the allowed list below.
