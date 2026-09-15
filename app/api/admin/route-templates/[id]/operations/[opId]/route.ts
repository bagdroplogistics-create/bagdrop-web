// BAGDROP — app/api/admin/route-templates/[id]/operations/[opId]/route.ts
// Edit or remove a single route-template operation. Editing here only
// affects FUTURE trip sheets generated from this route — see the schema
// migration's module comment for why historical trip_expenses rows are
// never touched by this (they're a snapshot, not a live reference).

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string; opId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, opId } = await params

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const allowed = [
    'sequence', 'expense_type', 'mode', 'operation_category', 'vendor_id',
    'from_location', 'to_location', 'rate_type', 'rate', 'date_rule',
    'notification_required', 'description',
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }
  if ('rate' in updates) updates.rate = Number(updates.rate) || 0
  if ('sequence' in updates) updates.sequence = Number(updates.sequence) || 0
  if ('vendor_id' in updates && !updates.vendor_id) updates.vendor_id = null

  const { data, error } = await supabaseAdmin
    .from('route_template_operations')
    .update(updates)
    .eq('id', opId)
    .eq('route_template_id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ operation: data })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, opId } = await params

  const { error } = await supabaseAdmin
    .from('route_template_operations')
    .delete()
    .eq('id', opId)
    .eq('route_template_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
