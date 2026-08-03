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
  const excludeStatus  = searchParams.get('exclude_status')  // single status to exclude (e.g. 'cancelled')
  const search         = searchParams.get('search')
  const leadId         = searchParams.get('lead_id')         // lookup by lead_id
  const dateFrom       = searchParams.get('date_from')       // inclusive, ISO date/datetime — filters created_at
  const dateTo         = searchParams.get('date_to')         // exclusive, ISO date/datetime — filters created_at
  const updatedFrom    = searchParams.get('updated_from')    // inclusive, ISO date/datetime — filters updated_at
  const updatedTo      = searchParams.get('updated_to')      // exclusive, ISO date/datetime — filters updated_at
  const completedFrom  = searchParams.get('completed_from')  // inclusive, "YYYY-MM-DD" — filters delivery_date (fallback pickup_date), status='completed'
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
    // Bookings" KPI cards — matches the same delivery_date-falling-back-
    // to-pickup_date logic the KPI number itself is computed from (see
    // app/api/admin/dashboard-analytics/route.ts). Deliberately not based
    // on updated_at/created_at — see that file's module comment for why
    // (the "Mark as Completed — Historical Booking" backfill flow stamps
    // those with the data-entry date, not the real completion date).
    query = query
      .eq('status', 'completed')
      .or(
        `and(delivery_date.gte.${completedFrom},delivery_date.lt.${completedTo}),` +
        `and(delivery_date.is.null,pickup_date.gte.${completedFrom},pickup_date.lt.${completedTo})`
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
