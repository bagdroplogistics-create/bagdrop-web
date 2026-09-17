// BAGDROP — app/api/admin/route-templates/add-common-operations/route.ts
// Founder request, 2026-09-17: "add Auto charges, porter charges, Cloak
// room charges (MGAS), Bus Freight (Metro Travels), Shree Shyam Travels
// (Mahipalpur-Delhi) expense in route templates." Clarified via follow-up:
// apply to every existing route template (not one specific route), rates
// to be filled in by the founder afterward.
//
// Same philosophy as add-standard-operations/route.ts: safe to copy the
// STRUCTURE (expense type + known vendor name) onto every route, NOT safe
// to invent a rate or silently link an unverified Vendor Master record —
// this app has no way to confirm "MGAS"/"Metro Travels"/"Shree Shyam
// Travels" already exist as Vendor Master rows from here, so vendor_id is
// left null (In-house) and the vendor name is carried in `description`
// instead; the founder links the real Vendor Master record per route
// afterward via the existing Vendor dropdown if/when needed, and fills in
// Rate/Rate Type per route with the real numbers ("rate i will add later").
//
// Unlike add-standard-operations (which only ever touches a template with
// ZERO existing operations), this runs against every route template
// regardless of what it already has, but is dedup-safe per operation: an
// operation is only inserted into a template if that template doesn't
// already have one with the same expense_type + vendor label, so this
// endpoint can be re-run (e.g. after a new route template is added later)
// without creating duplicate rows on templates it already touched.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export const runtime = 'nodejs'

const COMMON_OPERATIONS: { expense_type: string; description: string | null }[] = [
  { expense_type: 'Auto Charges',        description: null },
  { expense_type: 'Porter Charges',      description: null },
  { expense_type: 'Cloak Room Charges',  description: 'Vendor: MGAS' },
  { expense_type: 'Bus Freight',         description: 'Vendor: Metro Travels' },
  { expense_type: 'Bus Freight',         description: 'Vendor: Shree Shyam Travels (Mahipalpur–Delhi route)' },
]

function dedupKey(expenseType: string, description: string | null) {
  return `${expenseType.trim().toLowerCase()}|${(description ?? '').trim().toLowerCase()}`
}

export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const routeIds = Array.isArray(body?.route_ids) ? (body.route_ids as string[]) : null

  let query = supabaseAdmin
    .from('route_templates')
    .select('id, route_name, route_template_operations(expense_type, description)')
  if (routeIds) query = query.in('id', routeIds)

  const { data: routes, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows: Record<string, unknown>[] = []
  const touched = new Set<string>()

  for (const r of routes ?? []) {
    const existingKeys = new Set(
      (r.route_template_operations ?? []).map(op => dedupKey(op.expense_type ?? '', op.description ?? null))
    )
    // Sequence new rows after whatever this template already has, so they
    // land at the end of the operations list rather than reordering
    // anything the founder already configured.
    let seq = (r.route_template_operations ?? []).length
    for (const op of COMMON_OPERATIONS) {
      const key = dedupKey(op.expense_type, op.description)
      if (existingKeys.has(key)) continue
      rows.push({
        route_template_id:    r.id,
        sequence:              seq++,
        expense_type:          op.expense_type,
        mode:                  null,
        operation_category:    'other',
        vendor_id:             null,
        from_location:         null,
        to_location:           null,
        rate_type:             'fixed' as const,
        rate:                  0,
        date_rule:             'none' as const,
        notification_required: true,
        description:           op.description,
      })
      touched.add(r.id)
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({ success: true, routes_updated: 0, operations_created: 0 })
  }

  const { error: insertErr } = await supabaseAdmin.from('route_template_operations').insert(rows)
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    routes_updated:     touched.size,
    operations_created: rows.length,
  })
}
