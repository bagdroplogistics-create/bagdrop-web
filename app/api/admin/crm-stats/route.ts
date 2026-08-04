import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

// NOTE: the "which inquiries have we actually got" and "how many are
// completed/active/pending/cancelled" questions now live in
// app/api/admin/dashboard-analytics/route.ts — that's the single source of
// truth for unique-inquiry counting (see its module comment). This route
// keeps only the fields that endpoint doesn't cover: revenue, pending
// quotes, today's dispatch, and the raw all-time leads/unbooked-leads
// counts still consumed by admin-app (the separate mobile admin client).

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now        = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const today = new Date().toISOString().split('T')[0]

  // Optional — powers the Dashboard's Revenue Report period selector
  // (Current Month / Last Month / Custom Range / Month Selector). Purely
  // additive: revenue_this_month below is always computed for the actual
  // current calendar month regardless of these params, so existing
  // consumers (admin-app, the always-visible Revenue This Month KPI card)
  // are unaffected. When date_from is present, a second, period-scoped
  // figure is computed and returned as revenue_period_amount /
  // revenue_period_count — see below for what dataset it uses.
  const periodFrom = req.nextUrl.searchParams.get('date_from')
  const periodTo   = req.nextUrl.searchParams.get('date_to')

  const [leadsRes, unbookedLeadsRes, quotesRes, revenueRes, dispatchRes] = await Promise.all([
    // Total leads count
    supabaseAdmin.from('leads').select('*', { count: 'exact', head: true }),

    // Leads with no booking created yet at all — true "not even quoted"
    // inquiries, still needing action right now.
    supabaseAdmin.from('leads').select('*', { count: 'exact', head: true }).is('booking_id', null),

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
  ])

  const revenue = (revenueRes.data ?? []).reduce(
    (sum, b) => sum + (Number(b.total_amount) || 0),
    0
  )

  // Period-scoped Revenue Report figure. Was: filtering `bookings` by
  // status='completed'. Switched per the user — Trip Sheets are the
  // authoritative record of actual, revenue-generating jobs in this
  // business's real workflow (booking.status routinely lags behind reality;
  // e.g. a booking can sit at 'payment_approved' indefinitely even after
  // the job is fully done, since nothing currently forces admins to
  // advance it). trip_sheets.total_income already nets in additional
  // charges, discount, and tax (see app/api/admin/trip-sheets/route.ts's
  // POST handler), so summing it directly is the correct total — no need
  // to re-derive from bookings/quotes. Bucketed by the trip's pickup_date
  // (the day the job actually happened), same convention as
  // dashboard-analytics's Completed Bookings. This also naturally includes
  // manual trip sheets (no linked booking, e.g. an ad-hoc job) — those are
  // still real revenue, and Trip Sheets is the only record of them at all.
  //
  // Only trip sheets whose payment_status is 'paid' count as revenue — per
  // the user: "total revenue calculate according to these already paid
  // status." A trip sheet can exist for a job that hasn't actually been
  // paid for yet, so this is filtered the same way revenue_this_month
  // above filters bookings.payment_status = 'paid'.
  let periodAmount: number | undefined
  let periodCount: number | undefined
  if (periodFrom) {
    const { data: sheetsData, error: sheetsErr } = await supabaseAdmin
      .from('trip_sheets')
      .select('total_income, pickup_date')
      .eq('payment_status', 'paid')

    if (!sheetsErr) {
      const fromMs = new Date(periodFrom).getTime()
      const toMs   = periodTo ? new Date(periodTo).getTime() : Infinity
      const inPeriod = (sheetsData ?? []).filter(t => {
        if (!t.pickup_date) return false
        const ms = new Date(t.pickup_date).getTime()
        return ms >= fromMs && ms < toMs
      })
      periodAmount = inPeriod.reduce((sum, t) => sum + (Number(t.total_income) || 0), 0)
      periodCount  = inPeriod.length
    }
  }

  return NextResponse.json({
    total_leads:        leadsRes.count        ?? 0,
    unbooked_leads:      unbookedLeadsRes.count ?? 0,
    pending_quotes:     quotesRes.count       ?? 0,
    today_dispatch:     dispatchRes.count     ?? 0,
    revenue_this_month: revenue,
    ...(periodAmount !== undefined ? { revenue_period_amount: periodAmount, revenue_period_count: periodCount } : {}),
  })
}
