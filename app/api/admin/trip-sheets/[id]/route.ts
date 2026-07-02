import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth, getAdminRole } from '@/lib/admin-auth'

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
    'status', 'vendor', 'driver_name', 'vehicle_number', 'consignment_number',
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
        const { data: bk } = await supabaseAdmin
          .from('bookings')
          .select('status, status_history')
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
          await supabaseAdmin
            .from('bookings')
            .update({ status: newBkStatus, status_history: bkHistory })
            .eq('id', current.booking_id)
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
