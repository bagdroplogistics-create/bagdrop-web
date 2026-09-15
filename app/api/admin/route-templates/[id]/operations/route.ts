// BAGDROP — app/api/admin/route-templates/[id]/operations/route.ts
// Add a single operation to an existing route template. Bulk creation
// (building a whole route in one form submit) goes through POST
// /api/admin/route-templates's `operations` array instead — this is for
// adding one more operation to a route that already exists.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { data: route } = await supabaseAdmin.from('route_templates').select('id').eq('id', id).maybeSingle()
  if (!route) return NextResponse.json({ error: 'Route template not found' }, { status: 404 })

  // Default a new operation's sequence to "after the last one" so it lands
  // at the end of the list rather than colliding at 0 with existing rows.
  let sequence = Number(body.sequence)
  if (!Number.isFinite(sequence)) {
    const { data: last } = await supabaseAdmin
      .from('route_template_operations')
      .select('sequence')
      .eq('route_template_id', id)
      .order('sequence', { ascending: false })
      .limit(1)
      .maybeSingle()
    sequence = (last?.sequence ?? -1) + 1
  }

  const { data, error } = await supabaseAdmin
    .from('route_template_operations')
    .insert({
      route_template_id:     id,
      sequence,
      expense_type:           String(body.expense_type ?? '').trim() || 'Operation',
      mode:                   String(body.mode ?? '').trim() || null,
      operation_category:     body.operation_category ?? 'other',
      vendor_id:               body.vendor_id || null,
      from_location:           String(body.from_location ?? '').trim() || null,
      to_location:             String(body.to_location ?? '').trim() || null,
      rate_type:               body.rate_type === 'per_bag' ? 'per_bag' : 'fixed',
      rate:                    Number(body.rate) || 0,
      date_rule:               ['pickup_date', 'delivery_date'].includes(body.date_rule) ? body.date_rule : 'none',
      notification_required:  body.notification_required !== false,
      description:             String(body.description ?? '').trim() || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ operation: data }, { status: 201 })
}
