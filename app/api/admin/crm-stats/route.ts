import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { countsTowardTotalPaid } from '@/lib/payment-ledger'

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

  // Test Mode leads/bookings (dummy inquiries created only to test a
  // feature) never count toward these live CRM figures — founder-reported
  // 2026-09-05.
  const [leadsRes, unbookedLeadsRes, quotesRes, revenueRes, dispatchRes] = await Promise.all([
    // Total leads count
    supabaseAdmin.from('leads').select('*', { count: 'exact', head: true }).eq('is_test', false),

    // Leads with no booking created yet at all — true "not even quoted"
    // inquiries, still needing action right now.
    supabaseAdmin.from('leads').select('*', { count: 'exact', head: true }).eq('is_test', false).is('booking_id', null),

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
      .eq('is_test', false)
      .gte('created_at', monthStart),

    // Today's dispatch: bookings with pickup_date = today, not cancelled/completed
    supabaseAdmin
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('pickup_date', today)
      .eq('is_test', false)
      .not('status', 'in', '(cancelled,completed)'),
  ])

  const revenue = (revenueRes.data ?? []).reduce(
    (sum, b) => sum + (Number(b.total_amount) || 0),
    0
  )

  // Period-scoped Revenue Report figure. Tried trip_sheets.total_income
  // first, but the user clarified further: revenue should match the
  // Payments page's own "Paid" total exactly — every real `payments` row
  // with payment_status='paid', PLUS a synthetic entry for every
  // confirmed-or-later booking that reached payment_status='paid' without
  // ever getting a row logged in `payments` (the exact same reason
  // app/api/admin/payments/route.ts's fetchUnloggedBookingPayments exists
  // — bookings can reach a paid state via "Mark Payment Received" or the
  // Skybird approved-without-payment path without ever creating a real
  // payments row). Bucketed by created_at (when the payment/booking was
  // recorded) — same date convention as revenue_this_month above.
  let periodAmount: number | undefined
  let periodCount: number | undefined
  if (periodFrom) {
    const bookingsPaidSelect = 'id, total_amount, created_at, pickup_date, completed_month_override'
    const [realPaidRes, bookingsPaidPrimary, testBookingRowsRes] = await Promise.all([
      supabaseAdmin
        .from('payments')
        .select('amount, created_at, booking_id, payment_method, payment_status')
        .eq('payment_status', 'paid'),
      supabaseAdmin
        .from('bookings')
        .select(bookingsPaidSelect)
        // Founder-reported 2026-09-07: a booking can reach
        // payment_status='paid' (lib/payment-status.ts derives this purely
        // from the real `payments` ledger summing to >= total_amount) while
        // its workflow `status` is still stuck at e.g. 'payment_received' —
        // nobody has clicked "Confirm Booking" yet. The old
        // `.in('status', CONFIRMED_ONWARD_STATUSES)` filter here excluded
        // that booking from revenue entirely, even though the money has
        // genuinely, fully arrived. payment_status='paid' is already the
        // strict condition (below) — a workflow-stage gate on top of it is
        // an unrelated, incorrect second requirement, not a safeguard.
        // Removed rather than OR'd in, since 'paid' alone is sufficient.
        .eq('payment_status', 'paid')
        .eq('is_test', false),
      // `payments` has no is_test column of its own — cross-reference
      // booking_id against Test Mode bookings to exclude their payments too.
      supabaseAdmin.from('bookings').select('id').eq('is_test', true),
    ])

    // completed_month_override may not exist yet on this database — see
    // COMPLETED_MONTH_OVERRIDE_MIGRATION.sql and the identical defensive
    // pattern in app/api/admin/dashboard-analytics/route.ts. Falls back to
    // pickup_date-only bucketing rather than erroring. Typed loosely (not
    // reusing bookingsPaidPrimary's narrower inferred row type) since the
    // fallback branch's select omits a column the primary branch has.
    let bookingsPaidRes: { data: Record<string, unknown>[] | null; error: { message: string } | null } = bookingsPaidPrimary
    if (bookingsPaidPrimary.error?.message?.includes('completed_month_override')) {
      bookingsPaidRes = await supabaseAdmin
        .from('bookings')
        .select('id, total_amount, created_at, pickup_date')
        .eq('payment_status', 'paid')
        .eq('is_test', false)
    }

    if (!realPaidRes.error && !bookingsPaidRes.error) {
      const testBookingIds = new Set((testBookingRowsRes.data ?? []).map(b => b.id as string))
      // countsTowardTotalPaid excludes payment_method === 'upload' rows —
      // a payment-proof screenshot is a verification record, never its own
      // ledger entry (see lib/payment-ledger.ts, 2026-08-24 fix). Without
      // this, an approved proof for an already-paid booking would double
      // its contribution to Revenue Report.
      const realPayments   = (realPaidRes.data ?? [])
        .filter(countsTowardTotalPaid)
        .filter(p => !p.booking_id || !testBookingIds.has(p.booking_id))
      const paidBookingIds = new Set(realPayments.map(p => p.booking_id).filter((id): id is string => !!id))
      // Only bookings without a real payments row — avoids double-counting
      // a booking that has both a logged payment AND payment_status='paid'.
      // Dated by completed_month_override (if an admin has set one) falling
      // back to pickup_date, then created_at only if both are missing —
      // same fix as fetchUnloggedBookingPayments in app/api/admin/
      // payments/route.ts, and NOT delivery_date: founder-reported
      // 2026-09-07, Hetals Homemade Pvt Ltd (picked up 29 Jul, delivered 1
      // Aug) landed in August once a first attempt at this fix consulted
      // delivery_date first — the exact regression
      // app/api/admin/dashboard-analytics/route.ts already documents and
      // deliberately avoids. pickup_date is this codebase's established
      // source of truth for a completed booking's reporting month.
      const syntheticEntries = (bookingsPaidRes.data ?? [])
        .map(b => b as { id: string; total_amount: number | null; created_at: string; pickup_date: string | null; completed_month_override?: string | null })
        .filter(row => !paidBookingIds.has(row.id))
        .map(row => ({ amount: Number(row.total_amount) || 0, created_at: (row.completed_month_override ?? row.pickup_date ?? row.created_at) as string | null }))

      const allPaid = [
        ...realPayments.map(p => ({ amount: Number(p.amount) || 0, created_at: p.created_at as string | null })),
        ...syntheticEntries,
      ]

      const fromMs = new Date(periodFrom).getTime()
      const toMs   = periodTo ? new Date(periodTo).getTime() : Infinity
      const inPeriod = allPaid.filter(p => {
        if (!p.created_at) return false
        const ms = new Date(p.created_at).getTime()
        return ms >= fromMs && ms < toMs
      })
      periodAmount = inPeriod.reduce((sum, p) => sum + p.amount, 0)
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
