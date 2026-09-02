import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAdminRole } from '@/lib/admin-auth'
import { getBranchAccess, canAccessBranch } from '@/lib/branch-auth'
import { computeLrCharges, LR_CHARGE_FIELDS, isValidTiTag } from '@/lib/lr-constants'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

// ── GET /api/admin/lrs/[id] ─────────────────────────────────
export async function GET(req: NextRequest, { params }: Params) {
  const access = await getBranchAccess(req)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('lrs')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  // A branch-scoped key can only view LRs that belong to its own branch —
  // an LR with branch_id null (legacy/ambiguous, no confident branch match
  // at creation) is only visible to a super_admin, same reasoning as
  // canAccessBranch() treats "no branch" as "not this branch's to see."
  if (!canAccessBranch(access, data.branch_id)) {
    return NextResponse.json({ error: 'This key does not have access to that LR' }, { status: 403 })
  }
  return NextResponse.json({ lr: data })
}

// ── PATCH /api/admin/lrs/[id] ───────────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  const access = await getBranchAccess(req)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const role = getAdminRole(req) ?? (access.role === 'branch' ? 'branch' : null)

  const { data: target } = await supabaseAdmin.from('lrs').select('branch_id').eq('id', id).maybeSingle()
  if (!target) return NextResponse.json({ error: 'LR not found' }, { status: 404 })
  if (!canAccessBranch(access, target.branch_id)) {
    return NextResponse.json({ error: 'This key does not have access to that LR' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const allowed = [
    'status', 'lr_date', 'booking_office', 'vehicle_number', 'from_city', 'to_city', 'mode',
    'consignor_name', 'consignor_address', 'consignor_mobile', 'consignor_email', 'consignor_gstin',
    'consignee_name', 'consignee_address', 'consignee_mobile', 'consignee_gstin',
    'billed_to_name', 'billed_to_gstin', 'delivery_address',
    'invoice_number', 'invoice_value', 'eway_bill_number',
    'total_bags', 'content_description', 'actual_weight', 'chargeable_weight',
    'size_l', 'size_w', 'size_h', 'private_mark', 'ti_tag',
    ...LR_CHARGE_FIELDS.map(f => f.key),
    'insurance_by_customer', 'gst_payable_by', 'payment_terms', 'lr_type', 'delivery_at',
    'remarks', 'prepared_by',
    'flight_number', 'airline', 'arrival_date', 'arrival_time',
    'driver_name', 'driver_mobile', 'vehicle_type',
  ]

  // Ti-Tag stays optional on edit too — only checked when actually present
  // and non-empty in the request.
  if (typeof body.ti_tag === 'string' && body.ti_tag.trim() && !isValidTiTag(body.ti_tag.trim())) {
    return NextResponse.json({ error: 'Ti-Tag must be alphanumeric (letters and numbers only)' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  // ── Status change: append to history ────────────────────────
  if ('status' in updates) {
    const { data: current } = await supabaseAdmin
      .from('lrs')
      .select('status, status_history')
      .eq('id', id)
      .single()

    if (current) {
      const history = (current.status_history ?? []) as object[]
      history.push({
        from: current.status, to: updates.status,
        timestamp: new Date().toISOString(),
        changed_by: role,
        note: body.note ?? null,
      })
      updates.status_history = history
    }
  }

  // ── Recompute charges ledger if any charge field or the route changed ──
  const chargeKeysTouched = LR_CHARGE_FIELDS.some(f => f.key in updates)
  if (chargeKeysTouched) {
    const { data: current } = await supabaseAdmin
      .from('lrs')
      .select(`${LR_CHARGE_FIELDS.map(f => f.key).join(',')}, route_id`)
      .eq('id', id)
      .single<Record<string, number | string | null>>()

    if (current) {
      let gstType: 'intrastate' | 'interstate' = 'intrastate'
      if (current.route_id) {
        const { data: route } = await supabaseAdmin
          .from('lr_routes')
          .select('gst_type')
          .eq('id', current.route_id as string)
          .maybeSingle()
        if (route?.gst_type === 'interstate') gstType = 'interstate'
      }

      const merged: Record<string, number> = {}
      for (const f of LR_CHARGE_FIELDS) {
        merged[f.key] = Number(updates[f.key] ?? current[f.key]) || 0
      }
      Object.assign(updates, computeLrCharges(merged, gstType))
    }
  }

  const { data, error } = await supabaseAdmin
    .from('lrs')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lr: data })
}

// ── DELETE /api/admin/lrs/[id] ──────────────────────────────
// Unchanged policy — admin (super_admin) only, same as before this
// feature. Branch-scoped keys can never delete an LR, even their own
// branch's — deletion stays a founder-level action.
export async function DELETE(req: NextRequest, { params }: Params) {
  const role = getAdminRole(req)
  if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id } = await params

  const { error } = await supabaseAdmin.from('lrs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
