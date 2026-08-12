import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const status         = searchParams.get('status')
  const statuses       = searchParams.get('statuses')        // comma-separated list for phase filter
  const requireQuote   = searchParams.get('require_quote') === 'true'  // Total Confirmed Bookings drill-down only — see KpiView.requireQuote in app/(admin)/admin/page.tsx
  const excludeStatus  = searchParams.get('exclude_status')  // single status to exclude (e.g. 'cancelled')
  const search         = searchParams.get('search')
  const leadId         = searchParams.get('lead_id')         // lookup by lead_id
  const dateFrom       = searchParams.get('date_from')       // inclusive, ISO date/datetime — filters created_at
  const dateTo         = searchParams.get('date_to')         // exclusive, ISO date/datetime — filters created_at
  const updatedFrom    = searchParams.get('updated_from')    // inclusive, ISO date/datetime — filters updated_at
  const updatedTo      = searchParams.get('updated_to')      // exclusive, ISO date/datetime — filters updated_at
  const completedFrom  = searchParams.get('completed_from')  // inclusive, "YYYY-MM-DD" — filters pickup_date, status='completed'
  const completedTo    = searchParams.get('completed_to')    // exclusive, "YYYY-MM-DD"
  const page           = parseInt(searchParams.get('page') ?? '1', 10)
  const limit          = parseInt(searchParams.get('limit') ?? '50', 10)
  const offset         = (page - 1) * limit

  // ── Lead-id lookup: return single booking linked to this lead ──────────────
  if (leadId) {
    const { data, error } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ booking: data ?? null, bookings: data ? [data] : [], total: data ? 1 : 0 })
  }

  let query = supabaseAdmin
    .from('bookings')
    .select('*', { count: 'exact' })
    // Only show rows that are real bookings — must have a tracking_id (BD-XXXXXX)
    // This prevents any accidentally trigger-created rows from showing up
    .not('tracking_id', 'is', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (completedFrom && completedTo) {
    // Used by the Dashboard Analytics "Current/Last Month Completed
    // Bookings" KPI cards — matches the same pickup_date-based logic
    // (with a completed_month_override escape hatch for the rare booking
    // where pickup_date alone gets the reporting month wrong — see
    // app/api/admin/dashboard-analytics/route.ts's module comment, and
    // COMPLETED_MONTH_OVERRIDE_MIGRATION.sql) the KPI number itself is
    // computed from.
    query = query
      .eq('status', 'completed')
      .or(
        `and(completed_month_override.gte.${completedFrom},completed_month_override.lt.${completedTo}),` +
        `and(completed_month_override.is.null,pickup_date.gte.${completedFrom},pickup_date.lt.${completedTo})`
      )
  } else if (statuses) {
    // Phase filter: match any of the statuses in the list
    query = query.in('status', statuses.split(','))
  } else if (status && status !== 'all') {
    query = query.eq('status', status)
  } else if (excludeStatus) {
    // Default view: exclude a specific status (used to hide cancelled from normal view)
    query = query.neq('status', excludeStatus)
  }

  if (requireQuote) {
    // Total Confirmed Bookings drill-down only. A booking's status can be
    // advanced independently of whether its lead ever actually had a
    // quote generated — found via a real case (a booking sitting at
    // payment_approved whose quote had since been deleted, leaving
    // leads.quote_number null) where it kept showing in this list despite
    // the KPI card's own count already excluding it. Mirrors the same
    // hasQuote guard in app/api/admin/dashboard-analytics/route.ts's
    // 'active' bucket so this list always matches that number. Scoped to
    // this one param rather than applied globally — the Workflow Phase
    // tabs (Payment/Booking/Operations/etc.) deliberately still show
    // quote-less bookings so an admin can find and fix them.
    const { data: quotedLeads } = await supabaseAdmin
      .from('leads')
      .select('booking_id')
      .not('booking_id', 'is', null)
      .not('quote_number', 'is', null)
    const quotedBookingIds = (quotedLeads ?? [])
      .map(l => l.booking_id)
      .filter((bid): bid is string => !!bid)
    // Pass an impossible id when the list is empty rather than relying on
    // .in()-with-empty-array behavior — guarantees zero rows either way.
    query = query.in('id', quotedBookingIds.length ? quotedBookingIds : ['00000000-0000-0000-0000-000000000000'])
  }

  if (search) {
    query = query.or(
      `customer_name.ilike.%${search}%,customer_email.ilike.%${search}%,tracking_id.ilike.%${search}%,customer_phone.ilike.%${search}%`
    )
  }

  // Date-range filter (used by the Booking Funnel's range control on the
  // dashboard) — scopes counts/rows to bookings created in [date_from, date_to).
  if (dateFrom) query = query.gte('created_at', dateFrom)
  if (dateTo)   query = query.lt('created_at', dateTo)

  // updated_at range filter — used by the Dashboard Analytics "Current/Last
  // Month Completed Bookings" KPI cards, which count a booking toward a
  // month based on when it actually reached 'completed' (see
  // app/api/admin/dashboard-analytics/route.ts), not when it was created.
  // 'completed' is a locked terminal status, so updated_at stops changing
  // the moment a booking reaches it — safe to use as its completion date.
  if (updatedFrom) query = query.gte('updated_at', updatedFrom)
  if (updatedTo)   query = query.lt('updated_at', updatedTo)

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ bookings: data, total: count, page, limit })
}
