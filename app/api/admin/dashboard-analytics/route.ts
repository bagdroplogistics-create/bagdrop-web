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
// current_month_completed / last_month_completed: counts bookings whose
// pickup_date falls in that calendar month — i.e. the month the job
// actually happened in, independent of which month the underlying
// inquiry/lead was created in.
//
// IMPORTANT — two things were tried here and are wrong, do not revert to
// either:
//
// 1. bookings.updated_at. There's a "Mark as Completed — Historical
//    Booking" action (app/api/admin/bookings/[id]/route.ts,
//    mark_historical branch) for backfilling bookings fulfilled before
//    this workflow existed. It stamps status_history and (via the DB's
//    updated_at trigger) updated_at with the moment the admin does the
//    *data entry*, not the real historical completion date. Verified
//    against a full export of the database's completed bookings at the
//    time: bucketing by updated_at put 7 of 17 in the wrong month (all
//    backfilled together on 1 Aug showed as "completed in August"
//    regardless of when they actually happened).
//
// 2. delivery_date (falling back to pickup_date only when delivery_date
//    is null). This looked right at first (matched 15 of 17 rows against
//    the user's own count) but got the one cross-month booking backwards:
//    a booking picked up 29 Jul but not delivered until 1 Aug landed in
//    "August" under this rule, and the user confirmed that booking should
//    count as JULY (the pickup month) — current_month_completed showed 1
//    when it should have been 0. So pickup_date is the actual source of
//    truth, not delivery_date; a booking belongs to the month it was
//    picked up/actioned, not whichever month delivery happened to land in.
//    pickup_date is always present on a real booking, so no fallback is
//    needed.
//
// pickup_date is right for 16 of the user's 17 completed bookings, but not
// all — one (Mouly Mistry, picked up 28 Jun, delivered 1 Jul) is confirmed
// by the user as a JULY completion despite its June pickup_date, with no
// date field that gets BOTH that case and the Hetals case above right
// automatically. So completed_month_override (nullable DATE, see
// COMPLETED_MONTH_OVERRIDE_MIGRATION.sql) exists purely as a manual escape
// hatch: null for every booking except ones an admin has explicitly
// corrected, in which case its month wins over pickup_date. Falls back to
// pickup_date-only bucketing if the column hasn't been migrated onto this
// database yet (completedOverrideSupported reported in `debug`).

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

// "YYYY-MM" for a calendar month relative to `base` — compared as a plain
// string prefix against DATE columns (pickup_date stores "YYYY-MM-DD"
// with no time/timezone component), so this has zero timezone risk,
// unlike comparing Date object timestamps.
function monthKey(base: Date, offsetMonths: number) {
  const d = new Date(base.getFullYear(), base.getMonth() + offsetMonths, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
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
  // completed_month_override may not exist yet on this database — see
  // COMPLETED_MONTH_OVERRIDE_MIGRATION.sql. Falls back to a query without
  // it (pickup_date-only bucketing) rather than erroring, same pattern as
  // deleted_at above.
  let completedOverrideSupported = true
  let bookingsRes = await supabaseAdmin
    .from('bookings')
    .select('id, status, pickup_date, completed_month_override')
    .not('tracking_id', 'is', null)
    .limit(20000)
  if (bookingsRes.error?.message?.includes('completed_month_override')) {
    completedOverrideSupported = false
    bookingsRes = await supabaseAdmin
      .from('bookings')
      .select('id, status, pickup_date')
      .not('tracking_id', 'is', null)
      .limit(20000)
  }
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

  // Completed-in-month: based on pickup_date, not updated_at, delivery_date,
  // or the lead's created_at — see module comment above for why. A booking
  // with completed_month_override set uses that month instead (manual
  // correction — see module comment).
  const completedInMonth = (key: string) =>
    (bookingsRes.data ?? []).filter(b => {
      if ((b.status as string) !== 'completed') return false
      const override = completedOverrideSupported ? (b.completed_month_override as string | null) : null
      const dateStr = override || (b.pickup_date as string | null)
      if (!dateStr) return false
      return dateStr.slice(0, 7) === key
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
    current_month_completed:       completedInMonth(monthKey(now, 0)),
    last_month_completed:          completedInMonth(monthKey(now, -1)),

    ...(rangeInquiries !== undefined ? { range_inquiries: rangeInquiries } : {}),

    // Diagnostic breakdown, surfaced in the Dashboard Analytics UI.
    debug: {
      leads_total_including_deleted: leadsAllCount,
      soft_deleted_count:            softDeletedCount,
      deleted_at_supported:          deletedAtSupported,
      bookings_total:                bookingsTotal,
      bookings_without_lead:         bookingsWithoutLead,
      completed_override_supported:  completedOverrideSupported,
    },
  })
}
