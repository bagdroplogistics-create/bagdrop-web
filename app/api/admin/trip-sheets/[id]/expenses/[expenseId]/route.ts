import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

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
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if ('estimated_cost' in updates) updates.estimated_cost = Number(updates.estimated_cost) || 0
  if ('actual_cost'    in updates) updates.actual_cost    = Number(updates.actual_cost)    || 0

  const { data, error } = await supabaseAdmin
    .from('trip_expenses')
    .update(updates)
    .eq('id', expenseId)
    .eq('trip_sheet_id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recalcTotals(id)
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
