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
// booking is never created without a linked lead in the normal flow.
//
// On top of that, the same real customer can legitimately have more than
// one lead row — most commonly a return-trip pair (e.g. Doorstep→Airport
// plus the Airport→Doorstep leg back), each created as its own booking/
// lead. Confirmed against real data: no dummy/test rows in this dataset
// (one known exception, deleted via the Leads tab's own Delete action —
// see PATCH .../leads/[id] with deleted_at, already excluded below). So
// "unique inquiry" here means unique CUSTOMER, not unique lead row —
// leads sharing the same phone number are the same person and collapse
// into a single inquiry, counted once no matter how many bookings
// (onward + return, or a genuine repeat visit) they generated.
//
// Each customer is bucketed by the most-advanced status across all of
// their bookings (completed beats active beats pending beats cancelled —
// e.g. a customer with one completed leg and one cancelled leg still
// counts as a completed customer, not cancelled), and dated by their
// earliest inquiry (first lead created), which is what Monthly Inquiry
// Statistics and the funnel's date-range filter key off.

const ACTIVE_STATUSES = new Set([
  // Paid and actively moving, but not yet at the final Completed status —
  // mirrors the Booking Funnel's Row 2 cards minus 'completed' itself.
  'payment_received', 'confirmed', 'in_transit', 'out_for_delivery', 'delivered',
])

type Bucket = 'completed' | 'cancelled' | 'active' | 'pending'

const BUCKET_PRIORITY: Record<Bucket, number> = {
  completed: 3, active: 2, pending: 1, cancelled: 0,
}

function bucketFor(status: string | null): Bucket {
  if (status === 'completed') return 'completed'
  if (status === 'cancelled') return 'cancelled'
  if (status && ACTIVE_STATUSES.has(status)) return 'active'
  // No booking yet, or still in inquiry/quote/payment/pre-dispatch stages —
  // i.e. still needs action, hasn't reached active fulfillment or an
  // end state.
  return 'pending'
}

// Normalizes a phone number to its last 10 digits so the same customer
// grouped across slightly different formats (with/without +91, spaces,
// dashes) still matches. India mobile numbers are 10 digits; this is
// robust enough without needing full E.164 parsing here.
function normalizePhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
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

  // Excludes soft-deleted leads (leads.deleted_at IS NOT NULL) — the exact
  // same default filter the Leads tab itself applies (see
  // app/api/admin/leads/route.ts). Falls back to an unfiltered query if
  // the column doesn't exist yet (migration not run), same defensive
  // pattern used in admin/leads/route.ts.
  let leadsRes = await supabaseAdmin
    .from('leads')
    .select('id, created_at, booking_id, phone')
    .is('deleted_at', null)
    .limit(20000)
  if (leadsRes.error?.message?.includes('deleted_at')) {
    leadsRes = await supabaseAdmin.from('leads').select('id, created_at, booking_id, phone').limit(20000)
  }
  if (leadsRes.error) return NextResponse.json({ error: leadsRes.error.message }, { status: 500 })

  // Excludes any row without a tracking_id — same guard the Dashboard's own
  // bookings list uses (app/api/admin/bookings/route.ts) to keep out
  // accidentally trigger-created rows.
  const bookingsRes = await supabaseAdmin
    .from('bookings')
    .select('id, status')
    .not('tracking_id', 'is', null)
    .limit(20000)
  if (bookingsRes.error) return NextResponse.json({ error: bookingsRes.error.message }, { status: 500 })

  const statusByBookingId = new Map<string, string>()
  for (const b of bookingsRes.data ?? []) statusByBookingId.set(b.id as string, b.status as string)

  const rawLeads = (leadsRes.data ?? []).map(l => ({
    phoneKey:   normalizePhone(l.phone as string | null),
    created_at: l.created_at as string,
    bucket:     bucketFor(l.booking_id ? (statusByBookingId.get(l.booking_id as string) ?? null) : null),
  }))

  // ── Collapse same-customer leads (return-trip pairs, repeat inquiries)
  // into one row per unique phone number ──────────────────────────────
  const byPhone = new Map<string, typeof rawLeads>()
  for (const l of rawLeads) {
    // Blank/unparseable phone numbers are never merged with each other —
    // only group when there's an actual matching number, so records
    // missing a phone don't get incorrectly collapsed together.
    const key = l.phoneKey || `__no_phone_${byPhone.size}_${Math.random()}`
    if (!byPhone.has(key)) byPhone.set(key, [])
    byPhone.get(key)!.push(l)
  }

  const customers = [...byPhone.values()].map(group => ({
    created_at: group.reduce((min, l) => (l.created_at < min ? l.created_at : min), group[0].created_at),
    bucket: group.reduce(
      (best, l) => (BUCKET_PRIORITY[l.bucket] > BUCKET_PRIORITY[best] ? l.bucket : best),
      group[0].bucket
    ),
  }))

  const inWindow = (list: typeof customers, from: Date, to: Date) =>
    list.filter(c => {
      const t = new Date(c.created_at).getTime()
      return t >= from.getTime() && t < to.getTime()
    })

  const bucketCounts = (list: typeof customers) => ({
    total:     list.length,
    completed: list.filter(c => c.bucket === 'completed').length,
    active:    list.filter(c => c.bucket === 'active').length,
    pending:   list.filter(c => c.bucket === 'pending').length,
    cancelled: list.filter(c => c.bucket === 'cancelled').length,
  })

  const overall = bucketCounts(customers)

  // Diagnostic breakdown — shown in the Dashboard Analytics UI so the gap
  // between raw lead rows and unique customers is visible instead of a
  // black box.
  const linkedBookingIds = new Set(
    (leadsRes.data ?? []).map(l => l.booking_id).filter((id): id is string => !!id)
  )
  const bookingsTotal       = (bookingsRes.data ?? []).length
  const bookingsWithoutLead = (bookingsRes.data ?? []).filter(b => !linkedBookingIds.has(b.id as string)).length

  const now = new Date()
  const thisMonth = monthWindow(now, 0)
  const lastMonth = monthWindow(now, -1)
  const currentMonthCustomers = inWindow(customers, thisMonth.from, thisMonth.to)
  const lastMonthCustomers    = inWindow(customers, lastMonth.from, lastMonth.to)

  let rangeInquiries: number | undefined
  if (dateFromParam || dateToParam) {
    const from = dateFromParam ? new Date(dateFromParam) : new Date(0)
    const to   = dateToParam   ? new Date(dateToParam)   : new Date(8640000000000000)
    rangeInquiries = inWindow(customers, from, to).length
  }

  return NextResponse.json({
    total_inquiries: overall.total,
    total_completed: overall.completed,
    total_active:    overall.active,
    total_pending:   overall.pending,
    total_cancelled: overall.cancelled,

    current_month_total_inquiries: currentMonthCustomers.length,
    last_month_total_inquiries:    lastMonthCustomers.length,
    current_month_completed:       currentMonthCustomers.filter(c => c.bucket === 'completed').length,
    last_month_completed:          lastMonthCustomers.filter(c => c.bucket === 'completed').length,

    ...(rangeInquiries !== undefined ? { range_inquiries: rangeInquiries } : {}),

    // Diagnostic breakdown, surfaced in the Dashboard Analytics UI.
    debug: {
      raw_lead_rows:         rawLeads.length,
      unique_customers:      customers.length,
      repeat_customer_extra: rawLeads.length - customers.length,
      bookings_total:        bookingsTotal,
      bookings_without_lead: bookingsWithoutLead,
    },
  })
}
