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

  // Period-scoped Revenue Report figure — deliberately NOT the same "paid +
  // created_at" definition as revenue_this_month above. Per the user: the
  // Revenue Report's Paid Bookings count must match Dashboard Analytics'
  // Completed Bookings exactly, so it uses the identical dataset and
  // bucketing rule as app/api/admin/dashboard-analytics/route.ts —
  // status='completed', bucketed by completed_month_override when an
  // admin has set one, falling back to pickup_date (the booking's actual
  // completion date, not when the inquiry/lead was created). This also
  // means a booking whose inquiry came in one month but completed the next
  // is correctly attributed to its completion month here too — same as
  // Completed Bookings. Return-trip / duplicate-row concerns don't apply:
  // each booking is already a single row (see dashboard-analytics's module
  // comment on return quotes never creating a second row), so counting
  // bookings here is already unique-by-Inquiry-ID.
  let periodAmount: number | undefined
  let periodCount: number | undefined
  if (periodFrom) {
    // The two branches below select different columns, so their results
    // are normalized into one shape (completed_month_override always
    // present, null when unsupported/on the fallback) rather than
    // reassigning one PostgrestResponse over a differently-shaped one —
    // that reassignment is a TS type error, not just a runtime concern.
    type CompletedRow = { total_amount: number | null; pickup_date: string | null; completed_month_override: string | null }
    let completedData: CompletedRow[] = []
    const primary = await supabaseAdmin
      .from('bookings')
      .select('total_amount, pickup_date, completed_month_override')
      .eq('status', 'completed')
    if (primary.error?.message?.includes('completed_month_override')) {
      const fallback = await supabaseAdmin
        .from('bookings')
        .select('total_amount, pickup_date')
        .eq('status', 'completed')
      if (!fallback.error) {
        completedData = (fallback.data ?? []).map(b => ({ ...b, completed_month_override: null }))
      }
    } else if (!primary.error) {
      completedData = (primary.data ?? []) as CompletedRow[]
    }

    const fromMs = new Date(periodFrom).getTime()
    const toMs   = periodTo ? new Date(periodTo).getTime() : Infinity
    const inPeriod = completedData.filter(b => {
      const dateStr = b.completed_month_override || b.pickup_date
      if (!dateStr) return false
      const t = new Date(dateStr).getTime()
      return t >= fromMs && t < toMs
    })
    periodAmount = inPeriod.reduce((sum, b) => sum + (Number(b.total_amount) || 0), 0)
    periodCount  = inPeriod.length
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
