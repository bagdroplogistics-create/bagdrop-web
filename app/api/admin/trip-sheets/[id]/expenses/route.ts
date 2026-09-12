import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { syncExpenseVendorNotifications } from '@/lib/vendor-notifications'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

// ── Recompute trip sheet totals from all expenses ─────────────
async function recalcTotals(tripSheetId: string) {
  const { data: expenses } = await supabaseAdmin
    .from('trip_expenses')
    .select('actual_cost')
    .eq('trip_sheet_id', tripSheetId)

  const total_expense = expenses?.reduce((s, e) => s + (Number(e.actual_cost) || 0), 0) ?? 0

  const { data: sheet } = await supabaseAdmin
    .from('trip_sheets')
    .select('total_income')
    .eq('id', tripSheetId)
    .single()

  const total_income = Number(sheet?.total_income) || 0
  const net_profit   = total_income - total_expense

  await supabaseAdmin
    .from('trip_sheets')
    .update({ total_expense, net_profit })
    .eq('id', tripSheetId)
}

// ── GET /api/admin/trip-sheets/[id]/expenses ─────────────────
export async function GET(req: NextRequest, { params }: Params) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('trip_expenses')
    .select('*')
    .eq('trip_sheet_id', id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ expenses: data })
}

// ── POST /api/admin/trip-sheets/[id]/expenses ────────────────
export async function POST(req: NextRequest, { params }: Params) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const operationCategory: string = body.operation_category ?? 'other'

  // Default the Operational Date sensibly by category, per founder spec
  // (§6): "Do not assume every expense must always use the Booking Pickup
  // Date... use the actual scheduled date for that particular operation if
  // the existing system already stores one." The only two dates the
  // parent trip sheet actually stores are pickup_date and delivery_date —
  // Pickup obviously maps to the former; Delivery and Airport Delivery
  // (both "the vendor hands bags over at the far end") map to the latter.
  // Middle Mile / Handling / Other have no existing structured date to
  // infer from, so they're left blank for the admin to fill in — same
  // "don't guess wrong" principle the spec explicitly asks for.
  let operationalDate: string | null = body.operational_date ?? null
  if (!operationalDate) {
    const { data: sheet } = await supabaseAdmin
      .from('trip_sheets')
      .select('pickup_date, delivery_date')
      .eq('id', id)
      .maybeSingle()
    if (operationCategory === 'pickup') operationalDate = sheet?.pickup_date ?? null
    else if (operationCategory === 'delivery' || operationCategory === 'airport_delivery') operationalDate = sheet?.delivery_date ?? null
  }

  const { data, error } = await supabaseAdmin
    .from('trip_expenses')
    .insert({
      trip_sheet_id:  id,
      expense_type:   body.expense_type   ?? 'Miscellaneous',
      mode:           body.mode           ?? null,
      from_location:  body.from_location  ?? null,
      to_location:    body.to_location    ?? null,
      vendor:         body.vendor         ?? null,
      description:    body.description    ?? null,
      estimated_cost: Number(body.estimated_cost) || 0,
      actual_cost:    Number(body.actual_cost)     || 0,
      payment_status: body.payment_status ?? 'pending',
      receipt_url:    body.receipt_url    ?? null,
      // Vendor Master link + automatic notification fields (founder spec
      // BAGDROP-VENDOR-AUTOMATION-001, 2026-09-12).
      vendor_id:           body.vendor_id || null,
      operational_date:    operationalDate,
      operational_time:    body.operational_time || null,
      operation_category:  operationCategory,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recalcTotals(id)

  try {
    await syncExpenseVendorNotifications({
      id:                 data.id,
      trip_sheet_id:      data.trip_sheet_id,
      expense_type:       data.expense_type,
      vendor_id:          data.vendor_id,
      operational_date:   data.operational_date,
      operation_category: data.operation_category,
    })
  } catch (err) {
    console.error('[trip-expenses POST] vendor-notification sync failed (non-fatal):', err)
  }

  return NextResponse.json({ expense: data }, { status: 201 })
}
