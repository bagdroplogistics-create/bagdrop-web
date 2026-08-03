import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export const runtime = 'nodejs'

// ── Single source of truth for "how many inquiries do we actually have" ──
//
// The Dashboard (bookings table) and the Leads tab (leads table) were
// showing separate, non-reconciling inquiry counts, even though they
// describe the same underlying inquiries. Every inquiry-creation path in
// this codebase — website/mobile booking (app/api/bookings/route.ts),
// contact form (app/api/contact/route.ts), admin manual entry
// (app/api/admin/leads/route.ts), Skybird partner bookings/leads
// (app/api/skybird/*/route.ts) — always writes exactly one row to `leads`,
// linked forward to its booking (once one exists) via leads.booking_id. A
// booking is never created without a linked lead in the normal flow (the
// one lazy-create path, admin/zoho/generate-quote, only fires for a lead
// that doesn't have a booking yet).
//
// So `leads` is the canonical inquiry list — counting its rows (instead of
// adding leads.count + bookings.count, which double-counts every inquiry
// that has progressed past "just a lead") gives a true unique count. Each
// lead is bucketed by its linked booking's current status; a lead with no
// booking yet is 'pending'.

const ACTIVE_STATUSES = new Set([
  // Paid and actively moving, but not yet at the final Completed status —
  // mirrors the Booking Funnel's Row 2 cards minus 'completed' itself.
  'payment_received', 'confirmed', 'in_transit', 'out_for_delivery', 'delivered',
])

type Bucket = 'completed' | 'cancelled' | 'active' | 'pending'

function bucketFor(status: string | null): Bucket {
  if (status === 'completed') return 'completed'
  if (status === 'cancelled') return 'cancelled'
  if (status && ACTIVE_STATUSES.has(status)) return 'active'
  // No booking yet, or still in inquiry/quote/payment/pre-dispatch stages —
  // i.e. still needs action, hasn't reached active fulfillment or an
  // end state.
  return 'pending'
}

function monthWindow(base: Date, offsetMonths: number) {
  const from = new Date(base.getFullYear(), base.getMonth() + offsetMonths, 1)
  const to   = new Date(base.getFullYear(), base.getMonth() + offsetMonths + 1, 1)
  return { from, to }
}

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  // Optional — used by the Booking Funnel's date-range control (Today /
  // This Month / Last Month / Custom) to scope just the "New Inquiries"
  // count to the same window as the rest of the funnel.
  const dateFromParam = searchParams.get('date_from')
  const dateToParam   = searchParams.get('date_to')

  const [leadsRes, bookingsRes] = await Promise.all([
    supabaseAdmin.from('leads').select('id, created_at, booking_id').limit(20000),
    supabaseAdmin.from('bookings').select('id, status').limit(20000),
  ])
  if (leadsRes.error)    return NextResponse.json({ error: leadsRes.error.message }, { status: 500 })
  if (bookingsRes.error) return NextResponse.json({ error: bookingsRes.error.message }, { status: 500 })

  const statusByBookingId = new Map<string, string>()
  for (const b of bookingsRes.data ?? []) statusByBookingId.set(b.id as string, b.status as string)

  const leads = (leadsRes.data ?? []).map(l => ({
    created_at: l.created_at as string,
    bucket: bucketFor(l.booking_id ? (statusByBookingId.get(l.booking_id as string) ?? null) : null),
  }))

  const inWindow = (list: typeof leads, from: Date, to: Date) =>
    list.filter(l => {
      const t = new Date(l.created_at).getTime()
      return t >= from.getTime() && t < to.getTime()
    })

  const bucketCounts = (list: typeof leads) => ({
    total:     list.length,
    completed: list.filter(l => l.bucket === 'completed').length,
    active:    list.filter(l => l.bucket === 'active').length,
    pending:   list.filter(l => l.bucket === 'pending').length,
    cancelled: list.filter(l => l.bucket === 'cancelled').length,
  })

  const overall = bucketCounts(leads)

  const now = new Date()
  const thisMonth = monthWindow(now, 0)
  const lastMonth = monthWindow(now, -1)
  const currentMonthLeads = inWindow(leads, thisMonth.from, thisMonth.to)
  const lastMonthLeads    = inWindow(leads, lastMonth.from, lastMonth.to)

  let rangeInquiries: number | undefined
  if (dateFromParam || dateToParam) {
    const from = dateFromParam ? new Date(dateFromParam) : new Date(0)
    const to   = dateToParam   ? new Date(dateToParam)   : new Date(8640000000000000)
    rangeInquiries = inWindow(leads, from, to).length
  }

  return NextResponse.json({
    total_inquiries: overall.total,
    total_completed: overall.completed,
    total_active:    overall.active,
    total_pending:   overall.pending,
    total_cancelled: overall.cancelled,

    current_month_total_inquiries: currentMonthLeads.length,
    last_month_total_inquiries:    lastMonthLeads.length,
    current_month_completed:       currentMonthLeads.filter(l => l.bucket === 'completed').length,
    last_month_completed:          lastMonthLeads.filter(l => l.bucket === 'completed').length,

    ...(rangeInquiries !== undefined ? { range_inquiries: rangeInquiries } : {}),
  })
}
