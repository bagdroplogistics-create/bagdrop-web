import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [total, pending, confirmed, in_transit, delivered, revenue] = await Promise.all([
    supabaseAdmin.from('bookings').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabaseAdmin.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'confirmed'),
    supabaseAdmin.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'in_transit'),
    supabaseAdmin.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'delivered'),
    supabaseAdmin.from('bookings').select('total_amount').eq('status', 'delivered'),
  ])

  const totalRevenue = (revenue.data ?? []).reduce(
    (sum, b) => sum + (Number(b.total_amount) || 0), 0
  )

  return NextResponse.json({
    total:       total.count      ?? 0,
    pending:     pending.count    ?? 0,
    confirmed:   confirmed.count  ?? 0,
    in_transit:  in_transit.count ?? 0,
    delivered:   delivered.count  ?? 0,
    revenue:     totalRevenue,
  })
}
