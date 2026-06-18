import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now        = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [leadsRes, quotesRes, revenueRes, customersRes] = await Promise.all([
    // Total leads count
    supabaseAdmin.from('leads').select('*', { count: 'exact', head: true }),

    // Pending quotes (draft or sent)
    supabaseAdmin
      .from('quotes')
      .select('*', { count: 'exact', head: true })
      .in('status', ['draft', 'sent']),

    // Revenue this month (confirmed/in_transit/delivered bookings)
    supabaseAdmin
      .from('bookings')
      .select('total_amount')
      .in('status', ['confirmed', 'picked_up', 'in_transit', 'delivered'])
      .gte('created_at', monthStart),

    // Active customers = unique phones in bookings (not cancelled)
    supabaseAdmin
      .from('bookings')
      .select('customer_phone', { count: 'exact' })
      .neq('status', 'cancelled'),
  ])

  const revenue = (revenueRes.data ?? []).reduce(
    (sum, b) => sum + (Number(b.total_amount) || 0),
    0
  )

  // Count unique customers by phone
  const uniquePhones = new Set(
    (customersRes.data ?? []).map(b => b.customer_phone)
  )

  return NextResponse.json({
    total_leads:      leadsRes.count     ?? 0,
    pending_quotes:   quotesRes.count    ?? 0,
    active_customers: uniquePhones.size,
    revenue_this_month: revenue,
  })
}
