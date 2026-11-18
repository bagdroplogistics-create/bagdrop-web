import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'

/** One-off cleanup for QA/test bookings and leads that landed in the live
 *  tables (names like "Claude QA Test", "CTO TEST A", "Monali_Test_Booking").
 *  GET previews matches; POST with {"confirm":true} deletes them and every
 *  dependent row (quotes/payments/invoices/trip_sheets by booking_id, leads
 *  by id or by booking_id) before deleting the bookings themselves. Matches
 *  on a plain "test" or "claude" substring in the name — deliberately wider
 *  than automation's own \btest\b word-boundary check, per the owner's
 *  explicit request to remove every test-word booking, including ones like
 *  "Monali_Test_Booking" that word-boundary matching would miss. */

async function findMatches() {
  const { data: bookings } = await supabaseAdmin
    .from('bookings')
    .select('id, customer_name, customer_phone, status, tracking_id')
    .or('customer_name.ilike.%test%,customer_name.ilike.%claude%')
  const { data: leads } = await supabaseAdmin
    .from('leads')
    .select('id, name, phone, booking_id, lead_number')
    .or('name.ilike.%test%,name.ilike.%claude%')
  return { bookings: bookings ?? [], leads: leads ?? [] }
}

async function doDelete() {
  const { bookings, leads } = await findMatches()
  const bookingIds = Array.from(new Set([...bookings.map((b) => b.id), ...leads.map((l) => l.booking_id).filter(Boolean)]))
  const leadIds = leads.map((l) => l.id)

  const results: Record<string, { error: string | null }> = {}
  if (bookingIds.length) {
    for (const table of ['quotes', 'payments', 'invoices', 'trip_sheets'] as const) {
      const { error } = await supabaseAdmin.from(table).delete().in('booking_id', bookingIds)
      results[table] = { error: error?.message ?? null }
    }
  }
  if (leadIds.length) {
    const { error } = await supabaseAdmin.from('leads').delete().in('id', leadIds)
    results.leads = { error: error?.message ?? null }
  }
  if (bookingIds.length) {
    const { error } = await supabaseAdmin.from('bookings').delete().in('id', bookingIds)
    results.bookings = { error: error?.message ?? null }
  }

  const errors = Object.entries(results).filter(([, r]) => r.error).map(([table, r]) => `${table}: ${r.error}`)
  return NextResponse.json({ ok: errors.length === 0, deletedBookings: bookingIds.length, deletedLeads: leadIds.length, bookings, leads, errors })
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (req.nextUrl.searchParams.get('confirm') === '1') return doDelete()
  const { bookings, leads } = await findMatches()
  return NextResponse.json({ ok: true, dryRun: true, bookingCount: bookings.length, leadCount: leads.length, bookings, leads })
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (body?.confirm !== true) return NextResponse.json({ error: 'CONFIRM_REQUIRED', detail: 'POST {"confirm": true} to actually delete.' }, { status: 400 })
  return doDelete()
}
