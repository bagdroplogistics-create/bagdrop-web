import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now        = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const today = new Date().toISOString().split('T')[0]

  const [leadsRes, quotesRes, revenueRes, dispatchRes] = await Promise.all([
    // Total leads count
    supabaseAdmin.from('leads').select('*', { count: 'exact', head: true }),

    // Pending quotes (draft or sent)
    supabaseAdmin
      .from('quotes')
      .select('*', { count: 'exact', head: true })
      .in('status', ['draft', 'sent']),

    // Revenue this month.
    // Was: .in('status', ['confirmed', 'picked_up', 'in_transit', 'delivered'])
    // That whitelist silently excluded every other post-payment status —
    // most notably 'completed' (a booking's actual terminal state), but also
    // 'payment_received', 'payment_approved', 'invoice_generated',
    // 'invoice_sent', 'pickup_scheduled', 'out_for_delivery',
    // 'driver_details_shared', and 'trip_created' — so a booking that had
    // genuinely been paid for and finished contributed nothing to revenue
    // just because its exact status string wasn't one of those four.
    // Flipped to a blacklist of the pre-revenue stages instead: anything
    // still at inquiry/quote/payment-pending, or rejected/cancelled, is
    // excluded; everything from the point a booking is actually committed
    // onward counts. Adjust this list if "revenue" should instead only be
    // recognized once payment is received (i.e. exclude 'confirmed' too).
    supabaseAdmin
      .from('bookings')
      .select('total_amount')
      .not('status', 'in', '(inquiry,quote_created,quote_sent,payment_pending,rejected,cancelled)')
      .gte('created_at', monthStart),

    // Today's dispatch: bookings with pickup_date = today, not cancelled/completed
    supabaseAdmin
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('pickup_date', today)
      .not('status', 'in', '(cancelled,completed)'),
  ])

  const revenue = (revenueRes.data ?? []).reduce(
    (sum, b) => sum + (Number(b.total_amount) || 0),
    0
  )

  return NextResponse.json({
    total_leads:        leadsRes.count    ?? 0,
    pending_quotes:     quotesRes.count   ?? 0,
    today_dispatch:     dispatchRes.count ?? 0,
    revenue_this_month: revenue,
  })
}
