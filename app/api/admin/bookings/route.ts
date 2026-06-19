import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const status   = searchParams.get('status')
  const statuses = searchParams.get('statuses')   // comma-separated list for phase filter
  const search   = searchParams.get('search')
  const page     = parseInt(searchParams.get('page') ?? '1', 10)
  const limit    = parseInt(searchParams.get('limit') ?? '50', 10)
  const offset   = (page - 1) * limit

  let query = supabaseAdmin
    .from('bookings')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (statuses) {
    // Phase filter: match any of the statuses in the list
    query = query.in('status', statuses.split(','))
  } else if (status && status !== 'all') {
    query = query.eq('status', status)
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
