import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const period    = searchParams.get('period') ?? 'monthly' // daily | weekly | monthly | custom
  const dateFrom  = searchParams.get('from')
  const dateTo    = searchParams.get('to')

  const now   = new Date()
  let fromDate: string
  let toDate: string = now.toISOString()

  if (period === 'daily') {
    fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  } else if (period === 'weekly') {
    const d = new Date(now); d.setDate(d.getDate() - 7)
    fromDate = d.toISOString()
  } else if (period === 'custom' && dateFrom && dateTo) {
    fromDate = new Date(dateFrom).toISOString()
    toDate   = new Date(dateTo + 'T23:59:59').toISOString()
  } else {
    // monthly default
    fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  }

  const [bookingsRes, paymentsRes, allBookingsRes] = await Promise.all([
    supabaseAdmin
      .from('bookings')
      .select('status, total_amount, from_city, to_city, created_at')
      .gte('created_at', fromDate)
      .lte('created_at', toDate),

    supabaseAdmin
      .from('payments')
      .select('payment_status, amount, created_at')
      .gte('created_at', fromDate)
      .lte('created_at', toDate),

    // For trend chart — last 30 days regardless of period
    supabaseAdmin
      .from('bookings')
      .select('created_at, total_amount, status')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: true }),
  ])

  const bookings  = bookingsRes.data  ?? []
  const payments  = paymentsRes.data  ?? []
  const allBks    = allBookingsRes.data ?? []

  // Summary stats
  const totalBookings     = bookings.length
  const totalRevenue      = bookings.filter(b => ['confirmed','picked_up','in_transit','out_for_delivery','delivered','completed'].includes(b.status))
                                    .reduce((s, b) => s + Number(b.total_amount), 0)
  const pendingPayments   = payments.filter(p => p.payment_status === 'pending').reduce((s, p) => s + Number(p.amount), 0)
  const deliveredCount    = bookings.filter(b => b.status === 'delivered' || b.status === 'completed').length
  const cancelledCount    = bookings.filter(b => b.status === 'cancelled').length
  const avgOrderValue     = totalBookings > 0 ? totalRevenue / totalBookings : 0

  // Daily booking trend (last 30 days)
  const trendMap: Record<string, { bookings: number; revenue: number }> = {}
  for (const b of allBks) {
    const day = b.created_at.split('T')[0]
    if (!trendMap[day]) trendMap[day] = { bookings: 0, revenue: 0 }
    trendMap[day].bookings++
    if (['confirmed','in_transit','delivered','completed'].includes(b.status)) {
      trendMap[day].revenue += Number(b.total_amount)
    }
  }
  const trend = Object.entries(trendMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }))

  // Route-wise revenue
  const routeMap: Record<string, { route: string; bookings: number; revenue: number }> = {}
  for (const b of bookings) {
    const route = `${b.from_city} → ${b.to_city}`
    if (!routeMap[route]) routeMap[route] = { route, bookings: 0, revenue: 0 }
    routeMap[route].bookings++
    routeMap[route].revenue += Number(b.total_amount)
  }
  const routeRevenue = Object.values(routeMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10)

  // Status breakdown
  const statusBreakdown: Record<string, number> = {}
  for (const b of bookings) {
    statusBreakdown[b.status] = (statusBreakdown[b.status] ?? 0) + 1
  }

  return NextResponse.json({
    period, fromDate, toDate,
    summary: { totalBookings, totalRevenue, pendingPayments, deliveredCount, cancelledCount, avgOrderValue },
    trend,
    routeRevenue,
    statusBreakdown,
  })
}
