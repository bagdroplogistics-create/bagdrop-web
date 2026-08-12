import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth, getAdminRole } from '@/lib/admin-auth'
import { sendLifecycleWhatsApp, isForwardMove } from '@/lib/lifecycle-notifications'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

// ── GET /api/admin/trip-sheets/[id] ─────────────────────────
export async function GET(req: NextRequest, { params }: Params) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('trip_sheets')
    .select('*, trip_expenses(*)')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ trip_sheet: data })
}

// ── PATCH /api/admin/trip-sheets/[id] ───────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const role = getAdminRole(req)

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const allowed = [
    'status', 'mode', 'payment_status', 'undertaking_status',
    'vendor', 'driver_name', 'vehicle_number', 'consignment_number',
    'luggage_code', 'cloak_room_number', 'pickup_person', 'pickup_contact',
    'delivery_person', 'delivery_contact', 'notes', 'remarks',
    'additional_charges', 'discount', 'tax_amount',
  ]

  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  // ── Sync income from the linked booking ────────────────────
  // trip_sheets.quote_amount is only ever set once, at trip-sheet creation
  // (POST /api/admin/trip-sheets), from whatever the booking's total_amount
  // was at that moment — see route.ts there. If a trip sheet gets created
  // before a quote/amount exists on the booking (e.g. right after the
  // inquiry, before "Generate Quote" has run), quote_amount is frozen at 0
  // forever: nothing else in this file ever re-reads it from the booking.
  // Once a real quote/amount is added to the booking afterward, the trip
  // sheet silently goes stale — expenses keep accruing against a 0 income,
  // producing a negative "profit" that has nothing to do with the real
  // numbers. This flag lets an admin explicitly refresh quote_amount from
  // the booking's current total_amount before recomputing income below.
  if (body.sync_quote_from_booking === true) {
    const { data: current } = await supabaseAdmin
      .from('trip_sheets')
      .select('booking_id')
      .eq('id', id)
      .single()

    if (!current?.booking_id) {
      return NextResponse.json({ error: 'This trip sheet has no linked booking to sync from.' }, { status: 400 })
    }

    const { data: bk, error: bkErr } = await supabaseAdmin
      .from('bookings')
      .select('total_amount')
      .eq('id', current.booking_id)
      .single()

    if (bkErr || !bk) {
      return NextResponse.json({ error: 'Linked booking not found.' }, { status: 404 })
    }

    updates.quote_amount = Number(bk.total_amount) || 0
  }

  // ── Status change: append to history ──────────────────────
  if ('status' in updates) {
    const { data: current } = await supabaseAdmin
      .from('trip_sheets')
      .select('status, status_history, quote_amount, additional_charges, discount, tax_amount, total_expense, booking_id')
      .eq('id', id)
      .single()

    if (current) {
      const history = (current.status_history ?? []) as object[]
      history.push({
        from:       current.status,
        to:         updates.status,
        timestamp:  new Date().toISOString(),
        changed_by: role,
        note:       body.note ?? null,
      })
      updates.status_history = history

      // Sync booking status
      const statusMap: Record<string, string> = {
        picked_up:        'picked_up',
        in_transit:       'in_transit',
        out_for_delivery: 'out_for_delivery',
        delivered:        'delivered',
        completed:        'completed',
        cancelled:        'cancelled',
      }
      if (current.booking_id && updates.status && statusMap[updates.status as string]) {
        // Select every field sendLifecycleWhatsApp needs (previously only
        // status/status_history) — this route updates the booking's status
        // directly but, until now, never fired the Fast2SMS lifecycle
        // WhatsApp send for it. That's the root cause of picked_up /
        // in_transit / out_for_delivery / delivered messages not reaching
        // the customer immediately: those statuses are normally advanced
        // from the Trip Sheet (this route), not the single-booking edit
        // route (app/api/admin/bookings/[id]/route.ts) which DOES send it —
        // so the customer only got the message later, if/when an admin
        // separately touched the booking's own page.
        const { data: bk } = await supabaseAdmin
          .from('bookings')
          .select('id, status, status_history, notified_statuses, tracking_id, customer_name, customer_phone, from_city, to_city, total_bags, total_amount, pickup_date, drop_address, service_label, service_type')
          .eq('id', current.booking_id)
          .single()

        if (bk) {
          const bkHistory = (bk.status_history ?? []) as object[]
          const newBkStatus = statusMap[updates.status as string]
          bkHistory.push({
            from:       bk.status,
            to:         newBkStatus,
            timestamp:  new Date().toISOString(),
            changed_by: 'system',
            note:       `Synced from trip sheet status: ${updates.status}`,
          })

          // Same notified_statuses record used by
          // app/api/admin/bookings/[id]/route.ts — see supabase/migrations/
          // 20260812_notified_statuses.sql. Without this, editing a quote
          // on an already-delivered/completed booking and any subsequent
          // trip-sheet status touch-up could re-fire a lifecycle WhatsApp
          // the customer already received.
          const prevNotified = Array.isArray(bk.notified_statuses) ? bk.notified_statuses as string[] : []
          const alreadyNotified = prevNotified.includes(newBkStatus)
          const shouldNotifyCustomer = isForwardMove(bk.status, newBkStatus) && !alreadyNotified

          const bookingUpdate: Record<string, unknown> = { status: newBkStatus, status_history: bkHistory }
          if (shouldNotifyCustomer) bookingUpdate.notified_statuses = [...prevNotified, newBkStatus]

          const { data: updatedBooking } = await supabaseAdmin
            .from('bookings')
            .update(bookingUpdate)
            .eq('id', current.booking_id)
            .select()
            .single()

          // Fires the matching Fast2SMS WhatsApp template — awaited so it
          // completes before this response returns, and only on genuine
          // forward progress to a status not already notified (never
          // re-fires if a trip sheet status is reverted-and-readvanced).
          // Never throws.
          if (shouldNotifyCustomer && updatedBooking) {
            await sendLifecycleWhatsApp(newBkStatus, updatedBooking)
          }
        }
      }
    }
  }

  // ── Recompute income / profit ─────────────────────────────
  const { data: current } = await supabaseAdmin
    .from('trip_sheets')
    .select('quote_amount, additional_charges, discount, tax_amount, total_expense')
    .eq('id', id)
    .single()

  if (current) {
    const qa   = Number(updates.quote_amount ?? current.quote_amount) || 0
    const ac   = Number(updates.additional_charges ?? current.additional_charges) || 0
    const disc = Number(updates.discount            ?? current.discount)           || 0
    const tax  = Number(updates.tax_amount          ?? current.tax_amount)         || 0
    const exp  = Number(current.total_expense)       || 0

    updates.total_income = qa + ac - disc + tax
    updates.net_profit   = (qa + ac - disc + tax) - exp
  }

  const { data, error } = await supabaseAdmin
    .from('trip_sheets')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ trip_sheet: data })
}

// ── DELETE /api/admin/trip-sheets/[id] ──────────────────────
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = getAdminRole(req)
  if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id } = await params

  // Expenses cascade-delete via FK
  const { error } = await supabaseAdmin.from('trip_sheets').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
