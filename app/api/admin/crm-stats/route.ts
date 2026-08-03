import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl

  const now        = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const today = new Date().toISOString().split('T')[0]

  // Optional date-range scope for the Booking Funnel's range control (see
  // app/(admin)/admin/page.tsx). Only affects unbooked_leads — the piece
  // this endpoint contributes to the funnel's "New Inquiries" card — so the
  // funnel's date filter reconciles with what /api/admin/bookings returns
  // for the same range. Every other figure here (total_leads, pending_quotes,
  // total_completed, total_rejected, revenue_this_month) stays all-time or
  // fixed-to-calendar-month by design, same as before.
  const dateFrom = searchParams.get('date_from')
  const dateTo   = searchParams.get('date_to')

  let unbookedLeadsQuery = supabaseAdmin
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .is('booking_id', null)
  if (dateFrom) unbookedLeadsQuery = unbookedLeadsQuery.gte('created_at', dateFrom)
  if (dateTo)   unbookedLeadsQuery = unbookedLeadsQuery.lt('created_at', dateTo)

  const [leadsRes, unbookedLeadsRes, quotesRes, revenueRes, dispatchRes, completedRes, rejectedRes] = await Promise.all([
    // Total leads count
    supabaseAdmin.from('leads').select('*', { count: 'exact', head: true }),

    // Leads with no booking created yet at all — true "not even quoted"
    // inquiries. The Booking Funnel on the dashboard only counts rows in
    // `bookings`, which don't exist until a quote is generated for a lead,
    // so this population was previously invisible everywhere on the
    // dashboard even though it's the majority of Total Leads. Folded into
    // the funnel's "New Inquiries" card (see app/(admin)/admin/page.tsx)
    // so the funnel and Total Leads describe the same underlying set of
    // inquiries instead of two different ones.
    unbookedLeadsQuery,

    // Pending quotes (draft or sent)
    supabaseAdmin
      .from('quotes')
      .select('*', { count: 'exact', head: true })
      .in('status', ['draft', 'sent']),

    // Revenue this month = value of bookings that came in this month AND
    // have actually been paid for.
    // Was: .not('status', 'in', '(inquiry,quote_created,quote_sent,accepted,
    // payment_pending,rejected,cancelled)') — i.e. "status has progressed
    // past payment_pending," which is NOT the same thing as "payment was
    // actually received." A booking can advance all the way to
    // 'delivered'/'completed' via the delivery lifecycle without
    // payment_status ever being set to 'paid' (see the payment_status
    // backfill done for exactly this reason) — that inflated this figure
    // with bookings that hadn't actually been paid for. Switched to
    // filtering on bookings.payment_status = 'paid' directly, which is now
    // the single source of truth for "has this been paid" used consistently
    // across the Payment report, the CRM Payments page, and here.
    // "This month" is still based on when the booking/inquiry was created,
    // not when payment was marked — i.e. this is "revenue from this
    // month's inquiries," not "cash collected this month" (a booking
    // created in June and paid in July counts toward June's revenue, not
    // July's, since its inquiry happened in June).
    supabaseAdmin
      .from('bookings')
      .select('total_amount')
      .eq('payment_status', 'paid')
      .gte('created_at', monthStart),

    // Today's dispatch: bookings with pickup_date = today, not cancelled/completed
    supabaseAdmin
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('pickup_date', today)
      .not('status', 'in', '(cancelled,completed)'),

    // Total completed inquiries (all-time) — replaces "Today's Dispatch" on
    // the CRM quick-links row.
    supabaseAdmin
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed'),

    // Total rejected inquiries (all-time) — replaces "Pending Quotes" on
    // the CRM quick-links row.
    supabaseAdmin
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'rejected'),
  ])

  const revenue = (revenueRes.data ?? []).reduce(
    (sum, b) => sum + (Number(b.total_amount) || 0),
    0
  )

  return NextResponse.json({
    total_leads:        leadsRes.count        ?? 0,
    unbooked_leads:      unbookedLeadsRes.count ?? 0,
    pending_quotes:     quotesRes.count       ?? 0,
    today_dispatch:     dispatchRes.count     ?? 0,
    total_completed:    completedRes.count    ?? 0,
    total_rejected:     rejectedRes.count     ?? 0,
    revenue_this_month: revenue,
  })
}
