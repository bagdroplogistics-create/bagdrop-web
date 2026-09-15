// BAGDROP — app/api/admin/route-templates/route.ts
//
// Route Master CRUD (list + create). See supabase/migrations/
// 20260915_route_templates.sql for the schema. A route_templates row plus
// its route_template_operations children is the reusable "standard
// operations for this route" config that
// app/api/admin/trip-sheets/[id]/apply-route-template/route.ts snapshots
// from when generating a new Trip Sheet's expenses automatically.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export const runtime = 'nodejs'

const OPERATION_COLUMNS =
  'id, route_template_id, sequence, expense_type, mode, operation_category, vendor_id, from_location, to_location, rate_type, rate, date_rule, notification_required, description, created_at, updated_at'

// ── GET /api/admin/route-templates ──────────────────────────────────
// ?status=active (default) | inactive | all
// ?include_operations=true — embeds each route's operations (ordered by
//   sequence), with the linked vendor's display name/id joined in so the
//   New Trip Sheet wizard's route picker can show a full preview without a
//   second round trip per route.
// ?search= — matches route_name/from_city/to_city
export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status            = searchParams.get('status') ?? 'active'
  const includeOperations = searchParams.get('include_operations') === 'true'
  const search             = searchParams.get('search')?.trim()

  let query = supabaseAdmin
    .from('route_templates')
    .select(includeOperations
      ? `*, route_template_operations(${OPERATION_COLUMNS}, vendors(id, vendor_id, vendor_name))`
      : '*')
    .order('route_name')

  if (status !== 'all') query = query.eq('status', status)
  if (search) {
    const esc = search.replace(/[%_]/g, c => '\\' + c)
    query = query.or(`route_name.ilike.%${esc}%,from_city.ilike.%${esc}%,to_city.ilike.%${esc}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sort each route's embedded operations by sequence — Supabase's
  // embedded-resource select doesn't support ORDER BY on the child table
  // within a single query, so this is done client-side (small N per route).
  const routes = (data ?? []).map(r => {
    const withOps = r as typeof r & { route_template_operations?: { sequence: number }[] }
    if (includeOperations && Array.isArray(withOps.route_template_operations)) {
      withOps.route_template_operations = [...withOps.route_template_operations].sort((a, b) => a.sequence - b.sequence)
    }
    return withOps
  })

  return NextResponse.json({ route_templates: routes })
}

// ── POST /api/admin/route-templates — create route + optional operations ──
// Body: { route_name, from_city, to_city, notes?, operations?: [...] }
// Each operations[] entry: { expense_type, mode?, operation_category,
//   vendor_id?, from_location?, to_location?, rate_type, rate, date_rule,
//   notification_required?, description?, sequence? }
// Creating the operations inline (rather than requiring N follow-up POSTs
// to a separate endpoint) matches how the Route Template admin UI builds a
// route in one form submission.
export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const routeName = String(body.route_name ?? '').trim()
  const fromCity  = String(body.from_city  ?? '').trim()
  const toCity    = String(body.to_city    ?? '').trim()
  if (!routeName) return NextResponse.json({ error: 'route_name is required' }, { status: 400 })
  if (!fromCity)  return NextResponse.json({ error: 'from_city is required' }, { status: 400 })
  if (!toCity)    return NextResponse.json({ error: 'to_city is required' }, { status: 400 })

  const { data: route, error: routeErr } = await supabaseAdmin
    .from('route_templates')
    .insert({
      route_name: routeName,
      from_city:  fromCity,
      to_city:    toCity,
      notes:      String(body.notes ?? '').trim() || null,
      status:     'active',
    })
    .select()
    .single()

  if (routeErr || !route) return NextResponse.json({ error: routeErr?.message ?? 'Failed to create route' }, { status: 500 })

  const operations = Array.isArray(body.operations) ? body.operations : []
  if (operations.length > 0) {
    const rows = operations.map((op: Record<string, unknown>, i: number) => ({
      route_template_id:     route.id,
      sequence:               Number(op.sequence) || i,
      expense_type:           String(op.expense_type ?? '').trim() || `Operation ${i + 1}`,
      mode:                   String(op.mode ?? '').trim() || null,
      operation_category:     op.operation_category ?? 'other',
      vendor_id:               op.vendor_id || null,
      from_location:           String(op.from_location ?? '').trim() || null,
      to_location:             String(op.to_location ?? '').trim() || null,
      rate_type:               op.rate_type === 'per_bag' ? 'per_bag' : 'fixed',
      rate:                    Number(op.rate) || 0,
      date_rule:               ['pickup_date', 'delivery_date'].includes(op.date_rule as string) ? op.date_rule : 'none',
      notification_required:  op.notification_required !== false,
      description:             String(op.description ?? '').trim() || null,
    }))

    const { error: opsErr } = await supabaseAdmin.from('route_template_operations').insert(rows)
    if (opsErr) {
      // Roll back the route so a failed operations insert doesn't leave a
      // template with zero operations sitting in the picker.
      await supabaseAdmin.from('route_templates').delete().eq('id', route.id)
      return NextResponse.json({ error: 'Failed to create operations: ' + opsErr.message }, { status: 500 })
    }
  }

  const { data: full } = await supabaseAdmin
    .from('route_templates')
    .select(`*, route_template_operations(${OPERATION_COLUMNS})`)
    .eq('id', route.id)
    .single()

  return NextResponse.json({ route_template: full ?? route }, { status: 201 })
}
