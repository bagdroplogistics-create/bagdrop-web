// BAGDROP — app/api/admin/trip-sheets/[id]/apply-route-template/route.ts
// (Founder spec, 2026-09-15: BAGDROP-TRIPSHEET-ROUTE-TEMPLATE-001)
//
// The "select route + enter bags -> automatically build the complete Trip
// Sheet" step. Given an existing (freshly-created, normally empty) trip
// sheet and a route_template_id, snapshots that route's current operations
// into real trip_expenses rows — vendor, from/to, computed rate (fixed or
// per-bag x the sheet's bag count), operational date (per each operation's
// date_rule), and operation_category — then fires the same vendor-
// notification sync every other expense-creation path already uses.
//
// Deliberately NOT a new bulk-insert primitive reinvented from scratch —
// it mirrors exactly what POST /api/admin/trip-sheets/[id]/expenses already
// does per row (see that file), just for N rows in one request instead of
// the New Trip Sheet wizard firing N separate POSTs. recalcTotals runs ONCE
// at the end rather than once per row.
//
// Idempotent by construction: refuses to run a second time on a trip sheet
// that already has a route_template_applied_at timestamp, so a page
// refresh or a retried "Create Trip Sheet" click can never double-insert
// the same expense rows (founder spec's explicit acceptance criterion).

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { syncExpenseVendorNotifications } from '@/lib/vendor-notifications'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

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

  await supabaseAdmin.from('trip_sheets').update({ total_expense, net_profit }).eq('id', tripSheetId)
}

export async function POST(req: NextRequest, { params }: Params) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: tripSheetId } = await params

  const body = await req.json().catch(() => null)
  const routeTemplateId: string | undefined = body?.route_template_id
  if (!routeTemplateId) return NextResponse.json({ error: 'route_template_id is required' }, { status: 400 })

  const { data: sheet, error: sheetErr } = await supabaseAdmin
    .from('trip_sheets')
    .select('id, total_bags, pickup_date, delivery_date, route_template_id, route_template_applied_at')
    .eq('id', tripSheetId)
    .maybeSingle()
  if (sheetErr || !sheet) return NextResponse.json({ error: 'Trip sheet not found' }, { status: 404 })

  // ── Idempotency guard ────────────────────────────────────────────
  if (sheet.route_template_applied_at) {
    return NextResponse.json({
      error: `A route template was already applied to this trip sheet on ${new Date(sheet.route_template_applied_at).toLocaleString('en-IN')}. Delete the generated expenses manually first if you need to reapply a template.`,
    }, { status: 409 })
  }

  const { data: route, error: routeErr } = await supabaseAdmin
    .from('route_templates')
    .select('id, route_name, status')
    .eq('id', routeTemplateId)
    .maybeSingle()
  if (routeErr || !route) return NextResponse.json({ error: 'Route template not found' }, { status: 404 })
  if (route.status !== 'active') {
    return NextResponse.json({ error: `Route template "${route.route_name}" is inactive — activate it first or pick a different route.` }, { status: 400 })
  }

  const { data: operations, error: opsErr } = await supabaseAdmin
    .from('route_template_operations')
    .select('*')
    .eq('route_template_id', routeTemplateId)
    .order('sequence', { ascending: true })
  if (opsErr) return NextResponse.json({ error: opsErr.message }, { status: 500 })
  if (!operations || operations.length === 0) {
    return NextResponse.json({ error: `Route template "${route.route_name}" has no operations configured yet — add some in Route Templates first.` }, { status: 400 })
  }

  const totalBags = Number(body.bags) || Number(sheet.total_bags) || 1

  // Resolve vendor names up front (for the legacy free-text `vendor` column
  // — belt-and-suspenders display compatibility; the modern Vendor column
  // on the Trip Sheet detail page resolves via vendor_id, not this field).
  const vendorIds = [...new Set(operations.map(o => o.vendor_id).filter(Boolean))] as string[]
  const vendorNameById = new Map<string, string>()
  if (vendorIds.length > 0) {
    const { data: vendorRows } = await supabaseAdmin.from('vendors').select('id, vendor_name').in('id', vendorIds)
    for (const v of vendorRows ?? []) vendorNameById.set(v.id, v.vendor_name)
  }

  const rows = operations.map(op => {
    const rateType: 'fixed' | 'per_bag' = op.rate_type === 'per_bag' ? 'per_bag' : 'fixed'
    const unitRate = Number(op.rate) || 0
    const cost = rateType === 'per_bag' ? totalBags * unitRate : unitRate

    let operationalDate: string | null = null
    if (op.date_rule === 'pickup_date')  operationalDate = sheet.pickup_date ?? null
    if (op.date_rule === 'delivery_date') operationalDate = sheet.delivery_date ?? null

    return {
      trip_sheet_id:  tripSheetId,
      expense_type:   op.expense_type,
      mode:           op.mode,
      from_location:  op.from_location,
      to_location:    op.to_location,
      vendor:         op.vendor_id ? (vendorNameById.get(op.vendor_id) ?? null) : null,
      description:    op.description,
      estimated_cost: cost,
      actual_cost:    cost, // starts equal to the planned Rate/Cost — Accounts/Ops adjust Actual Cost as real invoices come in, same as any manually-added expense
      payment_status: 'pending',
      vendor_id:            op.vendor_id,
      operational_date:     operationalDate,
      operational_time:     null,
      operation_category:   op.operation_category,
      rate_type:            rateType,
      unit_rate:             unitRate,
      bags:                   rateType === 'per_bag' ? totalBags : null,
      route_template_operation_id: op.id,
      // notification_required is a route-template-only concept (which
      // operations to auto-notify FOR); it's not a trip_expenses column —
      // honored below by simply skipping the sync call, not by suppressing
      // vendor_id (the vendor link/display is unaffected either way).
    }
  })

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('trip_expenses')
    .insert(rows)
    .select('id, trip_sheet_id, expense_type, vendor_id, operational_date, operation_category, route_template_operation_id')
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  // Mark applied BEFORE the (best-effort) notification sync, so a crash mid-
  // sync still leaves the idempotency guard correctly set — the expenses
  // themselves are already committed at this point regardless.
  await supabaseAdmin
    .from('trip_sheets')
    .update({ route_template_id: routeTemplateId, route_template_applied_at: new Date().toISOString() })
    .eq('id', tripSheetId)

  await recalcTotals(tripSheetId)

  const notifyByOpId = new Map(operations.map(o => [o.id, o.notification_required !== false]))
  for (const exp of inserted ?? []) {
    const opId = exp.route_template_operation_id
    if (opId && notifyByOpId.get(opId) === false) continue // this operation's template marked Notification: No
    try {
      await syncExpenseVendorNotifications({
        id:                 exp.id,
        trip_sheet_id:      exp.trip_sheet_id,
        expense_type:       exp.expense_type,
        vendor_id:          exp.vendor_id,
        operational_date:   exp.operational_date,
        operation_category: exp.operation_category,
      })
    } catch (err) {
      console.error('[apply-route-template] vendor-notification sync failed (non-fatal):', err)
    }
  }

  return NextResponse.json({ success: true, expenses_created: inserted?.length ?? 0, route_template: route.route_name }, { status: 201 })
}
