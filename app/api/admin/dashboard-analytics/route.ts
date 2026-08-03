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
// Confirmed with the user: each booking/trip (including each leg of a
// return trip taken as a separate real-world booking, e.g. a repeat
// customer travelling out and back on different occasions) is its own
// real inquiry and should be counted separately — only soft-deleted leads
// (removed via the Leads tab's own Delete action) are excluded. So `leads`
// (minus soft-deleted rows) is the canonical inquiry list, one row = one
// inquiry, no customer-level deduplication.
//
// Separately: a "return quote" created from the admin Quotes screen (an
// onward + return leg quoted together for a single inquiry) does NOT
// create a second lead/booking row — it's stored as extra return_* columns
// on the SAME leads row (see RETURN_QUOTE_MIGRATION.sql). So this counting
// model already guarantees a return-quote inquiry is counted exactly once;
// there is nothing to deduplicate there.
//
// Rejected/closed quotes are tracked as their own bucket and their own
// KPI card, but do NOT count toward Total Inquiries (or the Monthly Total
// Inquiries cards) — verified directly against a full export of this
// database: 60 leads, 20 of them 'rejected', and 60-20=40 is exactly the
// real total the user confirmed. They're still visible everywhere else
// (Total Rejected card, and the Booking Funnel's own Quotes Rejected card
// is untouched by this file).
//
// Each lead is bucketed by its linked booking's current status; a lead
// with no booking yet is 'pending'.
//
// current_month_completed / last_month_completed: counts bookings that
// actually REACHED 'completed' status during that calendar month (using
// the booking's updated_at as the completion timestamp — 'completed' is a
// locked terminal status per STATUS_CONFIG, so nothing can edit the row
// afterward and updated_at stops changing the moment it's marked
// complete). This is intentionally independent of which month the
// underlying inquiry/lead was created in — a lead from last month that
// only finished this week counts as completed THIS month, not last month.
// Total Inquiries and Completed Bookings therefore describe two different
// populations (inquiries received vs. jobs finished) and are not expected
// to be subsets of one another for the same month.

const ACTIVE_STATUSES = new Set([
  // Paid and actively moving, but not yet at the final Completed status —
  // mirrors the Booking Funnel's Row 2 cards minus 'completed' itself.
  'payment_received', 'confirmed', 'in_transit', 'out_for_delivery', 'delivered',
])

type Bucket = 'completed' | 'cancelled' | 'active' | 'pending' | 'rejected'

function bucketFor(status: string | null): Bucket {
  if (status === 'completed') return 'completed'
  if (status === 'cancelled') return 'cancelled'
  // 'closed' (Inquiry Closed) is the same "didn't convert" outcome as a
  // rejected quote — grouped together so a lost inquiry doesn't inflate
  // Total Inquiries either.
  if (status === 'rejected' || status === 'closed') return 'rejected'
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

  // Excludes soft-deleted leads (leads.deleted_at IS NOT NULL) — the exact
  // same default filter the Leads tab itself applies (see
  // app/api/admin/leads/route.ts). Falls back to an unfiltered query if
  // the deleted_at column doesn't exist yet (SOFT_DELETE_MIGRATION.sql /
  // 20260717_leads_soft_delete.sql not run against this database) — in
  // that case deletedAtSupported is reported in `debug` below so it's
  // visible when a "deleted" lead isn't actually dropping out of the count
  // (the column silently isn't there to write deleted_at to at all).
  let deletedAtSupported = true
  let leadsRes = await supabaseAdmin
    .from('leads')
    .select('id, created_at, booking_id')
    .is('deleted_at', null)
    .limit(20000)
  if (leadsRes.error?.message?.includes('deleted_at')) {
    deletedAtSupported = false
    leadsRes = await supabaseAdmin.from('leads').select('id, created_at, booking_id').limit(20000)
  }
  if (leadsRes.error) return NextResponse.json({ error: leadsRes.error.message }, { status: 500 })

  // Unfiltered count, for comparison against the deleted_at-filtered count
  // above — the gap between the two is exactly how many leads are
  // currently soft-deleted (should shrink every time one is deleted via
  // the Leads tab).
  const leadsAllRes = await supabaseAdmin.from('leads').select('*', { count: 'exact', head: true })

  // Excludes any row without a tracking_id — same guard the Dashboard's own
  // bookings list uses (app/api/admin/bookings/route.ts) to keep out
  // accidentally trigger-created rows.
  const bookingsRes = await supabaseAdmin
    .from('bookings')
    .select('id, status, updated_at')
    .not('tracking_id', 'is', null)
    .limit(20000)
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

  const bucketCounts = (list: typeof leads) => {
    const rejected = list.filter(l => l.bucket === 'rejected').length
    return {
      // Total Inquiries excludes rejected/closed — see module comment.
      total:     list.length - rejected,
      completed: list.filter(l => l.bucket === 'completed').length,
      active:    list.filter(l => l.bucket === 'active').length,
      pending:   list.filter(l => l.bucket === 'pending').length,
      cancelled: list.filter(l => l.bucket === 'cancelled').length,
      rejected,
    }
  }

  const overall = bucketCounts(leads)

  // Diagnostic breakdown — shown in the Dashboard Analytics UI so any
  // mismatch is visible instead of a black box.
  const linkedBookingIds = new Set(
    (leadsRes.data ?? []).map(l => l.booking_id).filter((id): id is string => !!id)
  )
  const bookingsTotal       = (bookingsRes.data ?? []).length
  const bookingsWithoutLead = (bookingsRes.data ?? []).filter(b => !linkedBookingIds.has(b.id as string)).length
  const leadsAllCount       = leadsAllRes.count ?? leads.length
  const softDeletedCount    = deletedAtSupported ? Math.max(0, leadsAllCount - leads.length) : 0

  const now = new Date()
  const thisMonth = monthWindow(now, 0)
  const lastMonth = monthWindow(now, -1)
  const currentMonthLeads = inWindow(leads, thisMonth.from, thisMonth.to)
  const lastMonthLeads    = inWindow(leads, lastMonth.from, lastMonth.to)

  // Completed-in-month: based on the booking's own updated_at (completion
  // timestamp), not the lead's created_at — see module comment above.
  const completedInWindow = (from: Date, to: Date) =>
    (bookingsRes.data ?? []).filter(b => {
      if ((b.status as string) !== 'completed') return false
      const raw = b.updated_at as string | null
      if (!raw) return false
      const t = new Date(raw).getTime()
      return t >= from.getTime() && t < to.getTime()
    }).length

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
    total_rejected:  overall.rejected,

    // .total here already excludes rejected/closed, same as the overall figure.
    current_month_total_inquiries: bucketCounts(currentMonthLeads).total,
    last_month_total_inquiries:    bucketCounts(lastMonthLeads).total,
    // Completed-in-month — see module comment. Not derived from
    // currentMonthLeads/lastMonthLeads; a different population (bookings
    // that finished this/last month), independent of when the inquiry came in.
    current_month_completed:       completedInWindow(thisMonth.from, thisMonth.to),
    last_month_completed:          completedInWindow(lastMonth.from, lastMonth.to),

    ...(rangeInquiries !== undefined ? { range_inquiries: rangeInquiries } : {}),

    // Diagnostic breakdown, surfaced in the Dashboard Analytics UI.
    debug: {
      leads_total_including_deleted: leadsAllCount,
      soft_deleted_count:            softDeletedCount,
      deleted_at_supported:          deletedAtSupported,
      bookings_total:                bookingsTotal,
      bookings_without_lead:         bookingsWithoutLead,
    },
  })
}
