import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

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
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recalcTotals(id)
  return NextResponse.json({ expense: data }, { status: 201 })
}
