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
          .select('id, status, status_history, tracking_id, customer_name, customer_phone, from_city, to_city, total_bags, total_amount, pickup_date, drop_address, service_label, service_type')
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
          const { data: updatedBooking } = await supabaseAdmin
            .from('bookings')
            .update({ status: newBkStatus, status_history: bkHistory })
            .eq('id', current.booking_id)
            .select()
            .single()

          // Fires the matching Fast2SMS WhatsApp template — awaited so it
          // completes before this response returns, and only on genuine
          // forward progress (never re-fires if a trip sheet status is
          // reverted). Never throws.
          if (isForwardMove(bk.status, newBkStatus) && updatedBooking) {
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
    const qa   = Number(current.quote_amount)        || 0
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
