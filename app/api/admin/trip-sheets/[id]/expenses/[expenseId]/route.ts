import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { syncExpenseVendorNotifications } from '@/lib/vendor-notifications'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string; expenseId: string }> }

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

  const net_profit = (Number(sheet?.total_income) || 0) - total_expense

  await supabaseAdmin
    .from('trip_sheets')
    .update({ total_expense, net_profit })
    .eq('id', tripSheetId)
}

// ── PATCH /api/admin/trip-sheets/[id]/expenses/[expenseId] ───
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, expenseId } = await params

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const allowed = [
    'expense_type', 'mode', 'from_location', 'to_location', 'vendor',
    'description', 'estimated_cost', 'actual_cost', 'payment_status', 'receipt_url',
    // Vendor Master link + automatic notification fields (founder spec
    // BAGDROP-VENDOR-AUTOMATION-001, 2026-09-12) — the pre-existing
    // `vendor` free-text column above is untouched; vendor_id is the new,
    // separate structured link that actually drives notifications.
    'vendor_id', 'operational_date', 'operational_time', 'operation_category',
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if ('estimated_cost' in updates) updates.estimated_cost = Number(updates.estimated_cost) || 0
  if ('actual_cost'    in updates) updates.actual_cost    = Number(updates.actual_cost)    || 0
  // Allow explicitly clearing the vendor link (e.g. switching an expense
  // back to in-house) — 'vendor_id' in body with an empty/falsy value
  // means "unassign", not "leave unchanged".
  if ('vendor_id' in updates && !updates.vendor_id) updates.vendor_id = null

  const { data, error } = await supabaseAdmin
    .from('trip_expenses')
    .update(updates)
    .eq('id', expenseId)
    .eq('trip_sheet_id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recalcTotals(id)

  // Best-effort — never blocks the save response. Only re-syncs when a
  // field that actually affects the vendor notification changed, so an
  // unrelated edit (e.g. just the Actual Cost) doesn't touch it.
  if (['vendor_id', 'operational_date', 'operation_category', 'expense_type'].some(k => k in updates)) {
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
      console.error('[trip-expenses PATCH] vendor-notification sync failed (non-fatal):', err)
    }
  }

  return NextResponse.json({ expense: data })
}

// ── DELETE /api/admin/trip-sheets/[id]/expenses/[expenseId] ──
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, expenseId } = await params

  const { error } = await supabaseAdmin
    .from('trip_expenses')
    .delete()
    .eq('id', expenseId)
    .eq('trip_sheet_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recalcTotals(id)
  return NextResponse.json({ success: true })
}
