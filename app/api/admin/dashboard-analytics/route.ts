import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { ACTIVE_BOOKING_STATUSES } from '@/lib/lifecycle-notifications'

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

// 2026-08-24 fix — was a locally hardcoded array missing
// 'indemnity_bond_signed'; now the single shared definition (see
// ACTIVE_BOOKING_STATUSES's doc comment in lib/lifecycle-notifications.ts).
const ACTIVE_STATUSES = new Set(ACTIVE_BOOKING_STATUSES)

type Bucket = 'completed' | 'cancelled' | 'active' | 'pending' | 'rejected'

// hasQuote guards the 'active' bucket (surfaced on the Dashboard as "Total
// Confirmed Bookings"): a booking's status field can, in practice, get
// advanced independently of whether its lead ever actually had a quote
// generated (nothing in app/api/admin/bookings/[id]/route.ts's PATCH
// handler requires quote_number to be set before allowing a status
// transition) — found via a real case where a lead with no quote_number
// was still counting as an active/confirmed booking because its linked
// booking's status had been moved into ACTIVE_STATUSES. A quote-less lead
// falls back to 'pending' instead, regardless of its booking's status,
// since "confirmed" without ever having sent a quote is a data
// inconsistency, not a real confirmed booking.
function bucketFor(status: string | null, hasQuote: boolean): Bucket {
  if (status === 'completed') return 'completed'
  if (status === 'cancelled') return 'cancelled'
  // 'closed' (Inquiry Closed) is the same "didn't convert" outcome as a
  // rejected quote — grouped together so a lost inquiry doesn't inflate
  // Total Inquiries either.
  if (status === 'rejected' || status === 'closed') return 'rejected'
  if (status && ACTIVE_STATUSES.has(status) && hasQuote) return 'active'
  // No booking yet, still in inquiry/quote/payment/pre-dispatch stages, or
  // (see hasQuote above) a booking whose status was advanced without a
  // quote ever being generated — i.e. still needs action, hasn't reached
  // active fulfillment or an end state.
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
  // is_test (supabase/migrations/20260904_group_bookings.sql — Group
  // Booking module's Test Mode) excludes bookings/leads created purely to
  // test a flow on production from every count below. Probed the same
  // defensive way as deleted_at/completed_month_override further down —
  // this route must keep working unmodified on any database that hasn't
  // run that migration yet. Both bookings.is_test and leads.is_test are
  // added by the SAME migration, so one probe (via the leads query) covers
  // both — reused for the bookings query further below too.
  let isTestSupported = true
  let deletedAtSupported = true
  let leadsRes = await supabaseAdmin
    .from('leads')
    .select('id, created_at, booking_id, quote_number, status')
    .is('deleted_at', null)
    .eq('is_test', false)
    .limit(20000)
  if (leadsRes.error?.message?.includes('is_test')) {
    isTestSupported = false
    leadsRes = await supabaseAdmin
      .from('leads')
      .select('id, created_at, booking_id, quote_number, status')
      .is('deleted_at', null)
      .limit(20000)
  }
  if (leadsRes.error?.message?.includes('deleted_at')) {
    deletedAtSupported = false
    leadsRes = isTestSupported
      ? await supabaseAdmin.from('leads').select('id, created_at, booking_id, quote_number, status').eq('is_test', false).limit(20000)
      : await supabaseAdmin.from('leads').select('id, created_at, booking_id, quote_number, status').limit(20000)
  }
  if (leadsRes.error) return NextResponse.json({ error: leadsRes.error.message }, { status: 500 })

  // Unfiltered count, for comparison against the deleted_at-filtered count
  // above — the gap between the two is exactly how many leads are
  // currently soft-deleted (should shrink every time one is deleted via
  // the Leads tab). Still excludes Test Mode leads, same as leadsRes.
  const leadsAllRes = isTestSupported
    ? await supabaseAdmin.from('leads').select('*', { count: 'exact', head: true }).eq('is_test', false)
    : await supabaseAdmin.from('leads').select('*', { count: 'exact', head: true })

  // Excludes any row without a tracking_id — same guard the Dashboard's own
  // bookings list uses (app/api/admin/bookings/route.ts) to keep out
  // accidentally trigger-created rows.
  // completed_month_override may not exist yet on this database — see
  // COMPLETED_MONTH_OVERRIDE_MIGRATION.sql. Falls back to a query without
  // it (pickup_date-only bucketing) rather than erroring, same pattern as
  // deleted_at above. The two branches select different columns, so their
  // results are normalized into one BookingRow[] shape below (assigning a
  // narrower-select PostgrestResponse over a wider-select one, or vice
  // versa, is a TS type error, not just a runtime concern).
  type BookingRow = { id: string; status: string; pickup_date: string | null; completed_month_override: string | null }
  let completedOverrideSupported = true
  let bookingsData: BookingRow[] = []
  {
    let primaryQuery = supabaseAdmin
      .from('bookings')
      .select('id, status, pickup_date, completed_month_override')
      .not('tracking_id', 'is', null)
    if (isTestSupported) primaryQuery = primaryQuery.eq('is_test', false)
    const primary = await primaryQuery.limit(20000)
    if (primary.error?.message?.includes('completed_month_override')) {
      completedOverrideSupported = false
      let fallbackQuery = supabaseAdmin
        .from('bookings')
        .select('id, status, pickup_date')
        .not('tracking_id', 'is', null)
      if (isTestSupported) fallbackQuery = fallbackQuery.eq('is_test', false)
      const fallback = await fallbackQuery.limit(20000)
      if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 })
      bookingsData = (fallback.data ?? []).map(b => ({ ...b, completed_month_override: null }))
    } else {
      if (primary.error) return NextResponse.json({ error: primary.error.message }, { status: 500 })
      bookingsData = (primary.data ?? []) as BookingRow[]
    }
  }

  const statusByBookingId = new Map<string, string>()
  for (const b of bookingsData) statusByBookingId.set(b.id, b.status)

  // Founder decision (2026-08-19): Lost leads (leads.status='lost', the CRM
  // disposition an admin sets on the Leads tab — separate from
  // bookings.status) should be hidden from the Dashboard by default, not
  // deleted. Grouped into the 'rejected' bucket, the same "didn't convert"
  // outcome bucketFor() already gives a rejected/closed booking — so a Lost
  // lead now correctly stops inflating Total Inquiries and Pending, instead
  // of falling through to 'pending' (no booking yet, so bucketFor got a
  // null status and treated it as still needing action, which is exactly
  // what the module comment on bucketFor already assumed didn't happen).
  const leads = (leadsRes.data ?? []).map(l => ({
    created_at: l.created_at as string,
    bucket: l.status === 'lost' ? 'rejected' as const : bucketFor(
      l.booking_id ? (statusByBookingId.get(l.booking_id as string) ?? null) : null,
      !!l.quote_number
    ),
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
  const bookingsTotal       = bookingsData.length
  const bookingsWithoutLead = bookingsData.filter(b => !linkedBookingIds.has(b.id)).length
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
    bookingsData.filter(b => {
      if (b.status !== 'completed') return false
      const dateStr = b.completed_month_override || b.pickup_date
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
