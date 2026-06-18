import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAdminRole } from '@/lib/admin-auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!getAdminRole(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const { data, error } = await supabaseAdmin.from('payments').select('*').eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ payment: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = getAdminRole(req)
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body   = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const allowed = ['payment_status', 'payment_method', 'payment_reference', 'notes', 'refund_amount', 'refund_reason']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (body.payment_status === 'paid') {
    updates.verified_by = role
    updates.verified_at = new Date().toISOString()
  }
  if (body.payment_status === 'refunded') {
    updates.refunded_at = new Date().toISOString()
  }

  const { data, error } = await supabaseAdmin.from('payments').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sync payment_status back to booking
  if (data.booking_id && body.payment_status) {
    await supabaseAdmin.from('bookings').update({ payment_status: body.payment_status }).eq('id', data.booking_id)
  }

  return NextResponse.json({ payment: data })
}
