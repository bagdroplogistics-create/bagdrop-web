// BAGDROP — app/api/admin/route-templates/[id]/route.ts
// GET a single route template (with operations), PATCH the route's own
// fields (name/cities/status/notes — NOT its operations, see the
// operations/ subroute for those), DELETE (archive — see DELETE below).

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth, getAdminRole } from '@/lib/admin-auth'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

const OPERATION_COLUMNS =
  'id, route_template_id, sequence, expense_type, mode, operation_category, vendor_id, from_location, to_location, rate_type, rate, date_rule, notification_required, description, created_at, updated_at'

export async function GET(req: NextRequest, { params }: Params) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('route_templates')
    .select(`*, route_template_operations(${OPERATION_COLUMNS}, vendors(id, vendor_id, vendor_name))`)
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Route template not found' }, { status: 404 })

  const withOps = data as typeof data & { route_template_operations?: { sequence: number }[] }
  if (Array.isArray(withOps.route_template_operations)) {
    withOps.route_template_operations = [...withOps.route_template_operations].sort((a, b) => a.sequence - b.sequence)
  }

  return NextResponse.json({ route_template: withOps })
}

// ── PATCH — edit the route's own fields, or archive/restore via status ──
// This is the ONE place a route's vendor/rate/from/to changes for FUTURE
// trip sheets — see the module comment in the migration for why historical
// trip sheets are never affected by this.
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const allowed = ['route_name', 'from_city', 'to_city', 'status', 'notes']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }
  if ('status' in updates && !['active', 'inactive'].includes(updates.status as string)) {
    return NextResponse.json({ error: "status must be 'active' or 'inactive'" }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('route_templates')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ route_template: data })
}

// ── DELETE — hard delete, admin-only ────────────────────────────────
// Safe by construction: route_template_operations cascade-delete, and
// every trip_sheets.route_template_id / trip_expenses.route_template_
// operation_id reference is ON DELETE SET NULL — deleting a route template
// never touches a single historical trip sheet or expense row, it just
// removes the (already-informational-only) traceability link. Prefer
// PATCH { status: 'inactive' } for routes still referenced by past trips —
// this is for genuine mistakes (e.g. a route created with a typo'd name).
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (getAdminRole(req) !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const { id } = await params

  const { error } = await supabaseAdmin.from('route_templates').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
