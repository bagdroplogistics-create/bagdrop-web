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

  if (statuses) {
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

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ bookings: data, total: count, page, limit })
}
