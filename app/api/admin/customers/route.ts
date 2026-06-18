import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

// Customers are derived from bookings — unique by phone number.
// We aggregate their bookings into a profile.
export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const search = searchParams.get('search')

  let query = supabaseAdmin
    .from('bookings')
    .select('customer_name, customer_phone, customer_email, total_amount, status, created_at, id, tracking_id, from_city, to_city')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })

  if (search) {
    query = query.or(
      `customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,customer_email.ilike.%${search}%`
    )
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Aggregate into customer profiles keyed by phone
  const profileMap = new Map<string, {
    phone:          string
    name:           string
    email:          string
    total_bookings: number
    total_spent:    number
    last_booking:   string
    first_booking:  string
    bookings:       typeof data
  }>()

  for (const b of data ?? []) {
    const key = b.customer_phone
    if (!profileMap.has(key)) {
      profileMap.set(key, {
        phone:          b.customer_phone,
        name:           b.customer_name,
        email:          b.customer_email ?? '',
        total_bookings: 0,
        total_spent:    0,
        last_booking:   b.created_at,
        first_booking:  b.created_at,
        bookings:       [],
      })
    }
    const profile = profileMap.get(key)!
    profile.total_bookings++
    profile.total_spent += Number(b.total_amount) || 0
    if (b.created_at > profile.last_booking)  profile.last_booking  = b.created_at
    if (b.created_at < profile.first_booking) profile.first_booking = b.created_at
    profile.bookings.push(b)
  }

  const customers = Array.from(profileMap.values()).sort(
    (a, b) => new Date(b.last_booking).getTime() - new Date(a.last_booking).getTime()
  )

  return NextResponse.json({ customers, total: customers.length })
}
