import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { STATUS_ORDER } from '@/lib/lifecycle-notifications'
import { shouldShowDriverDetailsStep } from '@/lib/service-type'

export const runtime = 'nodejs'

// ============================================================================
// BAGDROP — Operations Center report data
// Backs app/(admin)/admin/reports/operations/page.tsx.
//
// REWORKED 2026-08-22 per founder spec: the Operations Center is now
// Confirmed + Upcoming bookings ONLY — it must answer "what confirmed
// bookings are coming up, and what does Ops need to do for them?", not
// function as a second Leads/Sales dashboard. Concretely, this means:
//   - Every query in this route is scoped to OPS_ACTIVE_STATUSES (below) —
//     'confirmed' through 'trip_created' — so inquiries, quotes (created/
//     sent/awaiting approval/rejected/expired), payment-pending bookings,
//     and cancelled/rejected bookings can never appear anywhere in this
//     route's output, not even indirectly via an "overdue" or "alert" list.
//   - 'completed' is deliberately excluded too (its own STATUS_ORDER slot is
//     the last one) — this is an *active/upcoming* view, not a historical
//     log. Completed bookings remain fully accessible via the Leads tab /
//     Dashboard; this route just no longer surfaces them.
//   - The old "Today's Inquiries" (lead-based, pre-confirmation) and
//     "Today's Operations" tabs are gone — removed, not hidden — along with
//     every sales/financial widget (pending quotes, pending payments,
//     monthly revenue, active partners, conversion rate). Those belong on
//     the Leads tab and the Reports Dashboard, which this change does not
//     touch.
//   - "Driver Details Shared" relevance now uses the same
//     shouldShowDriverDetailsStep() gate as the Booking Workflow page and
//     its PATCH route (lib/service-type.ts) — Doorstep→Airport and
//     Airport→Airport only — instead of the old broad /airport/i regex,
//     which incorrectly matched Airport→Doorstep too.
//
// Read-only. Does not touch bookings.status, leads.status, or any other
// column — purely aggregates what's already there. Existing Dashboard
// (app/(admin)/admin/page.tsx), Leads tab, and Reports Dashboard are
// untouched.
//
// ── Assumptions (flagging per project convention — adjust if these don't
// match how the team actually wants "overdue" defined; there's no SLA
// config in the system yet, so these are reasonable defaults, not measured
// business rules):
//   - "Driver assignment pending"         → status confirmed-or-later, pickup within 2 days (or past), no driver_name yet.
//   - "Driver details not shared in time" → destination-airport service type, pickup within 4h (or past), driver_details_sent_at still null.
//   - "Indemnity bond pending"            → status stuck at 'indemnity_bond_sent' (sent but not yet signed).
//   - "Pickup overdue"                    → pickup_date has passed, status hasn't reached 'picked_up' yet.
//   - "Delivery overdue"                  → delivery_date has passed, status hasn't reached 'delivered'/'completed' yet.
// The old sales-side overdue reasons ("Quote not sent > 24h", "Customer
// approval pending > 48h", "Payment pending > 24h") have been REMOVED, not
// just hidden — they describe pre-confirmation states that can no longer
// appear in this route's scoped dataset at all.
//
// ── Type-inference note: supabaseAdmin (lib/supabase.ts) has no Database
// generic, so postgrest-js falls back to parsing the raw .select() string at
// the TYPE level — fragile for long field lists (breaks on string
// concatenation/variables, sometimes even on long inline literals). Every
// query below uses a short inline literal and an explicit interface + cast
// immediately after, sidestepping that inference entirely rather than
// fighting it. See app/api/skybird/leads/route.ts for the same pattern and
// the build-failure history behind it.
// ============================================================================

interface BookingRow {
  id:                          string
  tracking_id:                 string
  status:                      string
  status_history:              unknown
  title:                       string | null
  customer_name:               string | null
  customer_phone:              string | null
  customer_email:              string | null
  service_type:                string | null
  service_label:                string | null
  from_city:                   string | null
  to_city:                     string | null
  pickup_address:              string | null
  drop_address:                string | null
  pickup_date:                 string | null
  delivery_date:               string | null
  time_slot:                   string | null
  total_bags:                  number | null
  total_amount:                number | null
  payment_status:               string | null
  driver_name:                 string | null
  driver_phone:                string | null
  driver_details_sent_at:      string | null
  notes:                       string | null
  pickup_instructions:         string | null
  created_at:                  string
  updated_at:                  string | null
}

function idx(status: string | null | undefined): number {
  return STATUS_ORDER.indexOf(status ?? '')
}

function hoursSince(iso: string | null | undefined): number {
  if (!iso) return 0
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60)
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10)
}

const BOOKING_SELECT = 'id, tracking_id, status, status_history, title, customer_name, customer_phone, customer_email, service_type, service_label, from_city, to_city, pickup_address, drop_address, pickup_date, delivery_date, time_slot, total_bags, total_amount, payment_status, driver_name, driver_phone, driver_details_sent_at, notes, pickup_instructions, created_at, updated_at'

// Operations Center scope, per founder spec (2026-08-22): "confirmed and
// upcoming" only. Derived from STATUS_ORDER (lib/lifecycle-notifications.ts)
// rather than hand-listed so any future status inserted between 'confirmed'
// and 'completed' is automatically included without a code change here.
// Deliberately EXCLUDES:
//   - everything before 'confirmed'   (inquiry, quote_created, quote_sent,
//     accepted, payment_pending, payment_received, payment_approved) — sales
//     / quotation workflow, not operations.
//   - 'completed'                     — historical, not "upcoming"; stays
//     accessible via the Leads tab, just not cluttering this view.
//   - 'cancelled' / 'rejected'        — never in STATUS_ORDER at all, so
//     already excluded by construction.
const OPS_ACTIVE_STATUSES = STATUS_ORDER.slice(STATUS_ORDER.indexOf('confirmed'), STATUS_ORDER.indexOf('completed'))

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  // Upcoming-bookings window: all | today | tomorrow | next3 | next7 | custom
  // Default is 'all' — a Confirmed booking with a pickup date further out
  // than whatever the previous fixed default was (e.g. next month) must
  // never silently vanish from this list just because of a lookahead
  // window the admin didn't know was applied. Narrower presets remain
  // available for the admin to opt into when they specifically want a
  // near-term view.
  const rangeParam = searchParams.get('range') ?? 'all'
  const fromParam  = searchParams.get('from')
  const toParam    = searchParams.get('to')

  const now        = new Date()
  const todayStr   = dateOnly(now)
  const in7DaysStr = dateOnly(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000))

  let upcomingFrom = todayStr
  let upcomingTo: string | null = null   // null = no upper bound ('all')
  if (rangeParam === 'today') {
    upcomingTo = todayStr
  } else if (rangeParam === 'tomorrow') {
    const t = new Date(now); t.setDate(t.getDate() + 1)
    upcomingFrom = dateOnly(t); upcomingTo = dateOnly(t)
  } else if (rangeParam === 'next3') {
    const t = new Date(now); t.setDate(t.getDate() + 3)
    upcomingTo = dateOnly(t)
  } else if (rangeParam === 'next7') {
    upcomingTo = in7DaysStr
  } else if (rangeParam === 'custom' && fromParam && toParam) {
    upcomingFrom = fromParam; upcomingTo = toParam
  }
  // else: 'all' (or an unrecognized value) — upcomingTo stays null, no
  // upper bound applied to the query below.

  // Upcoming CONFIRMED bookings in the requested window — see
  // OPS_ACTIVE_STATUSES above for why this isn't every booking. Built
  // as a mutable query so the upper bound can be conditionally omitted for
  // the 'all' default instead of being forced to always cut off at some
  // fixed date.
  let upcomingQueryBuilder = supabaseAdmin
    .from('bookings')
    .select(BOOKING_SELECT)
    .gte('pickup_date', upcomingFrom)
    .in('status', OPS_ACTIVE_STATUSES)
    // Test Mode bookings never appear in the live Operations Center —
    // founder-reported 2026-09-05.
    .eq('is_test', false)
  if (upcomingTo) upcomingQueryBuilder = upcomingQueryBuilder.lte('pickup_date', upcomingTo)
  upcomingQueryBuilder = upcomingQueryBuilder.order('pickup_date', { ascending: true })

  const [
    upcomingQ,
    upcoming7dCountQ,
    opsActiveQ,
    docsPending,
  ] = await Promise.all([
    upcomingQueryBuilder,

    // Fixed 7-day count for the summary widget card — deliberately a
    // separate query from the one above, so the widget always means "next
    // 7 days" regardless of whichever range preset the admin currently has
    // selected for the table.
    supabaseAdmin
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .gte('pickup_date', todayStr)
      .lte('pickup_date', in7DaysStr)
      .in('status', OPS_ACTIVE_STATUSES)
      .eq('is_test', false),

    // Confirmed+ (minus completed) bookings regardless of pickup date —
    // Needs Attention and the Today's Pickups/Deliveries widgets all derive
    // from this same set, so one query covers all of them instead of
    // several near-identical ones. Scoped to OPS_ACTIVE_STATUSES (not "not
    // yet finished") so a pre-confirmation booking can never surface here
    // even indirectly.
    supabaseAdmin
      .from('bookings')
      .select(BOOKING_SELECT)
      .in('status', OPS_ACTIVE_STATUSES)
      .eq('is_test', false)
      .order('pickup_date', { ascending: true })
      .limit(2000),

    // Documents pending approval / resubmission — indemnity_bonds.document_status.
    // Table only exists once 20260727_indemnity_bond.sql has run; treated as
    // optional (empty result) rather than fatal if it's missing.
    supabaseAdmin
      .from('indemnity_bonds')
      .select('id, document_status')
      .in('document_status', ['pending', 'resubmission_requested'])
      .not('submitted_at', 'is', null)
      .then(r => {
        if (r.error) console.warn('[reports/operations] indemnity_bonds query failed (non-fatal):', r.error.message)
        return (r.error ? [] : (r.data ?? [])) as unknown as Array<{ id: string; document_status: string }>
      }),
  ])

  if (upcomingQ.error) return NextResponse.json({ error: upcomingQ.error.message }, { status: 500 })
  if (opsActiveQ.error) return NextResponse.json({ error: opsActiveQ.error.message }, { status: 500 })

  const upcoming  = (upcomingQ.data  ?? []) as unknown as BookingRow[]
  const opsActive = (opsActiveQ.data ?? []) as unknown as BookingRow[]

  const confirmedIdx = idx('confirmed')

  // ── Needs Attention — see assumptions block at top of file ─────────────
  const pickedUpIdx  = idx('picked_up')
  const deliveredIdx = idx('delivered')

  type OverdueReason = { code: string; label: string }
  const overdue: Array<BookingRow & { overdue_reasons: OverdueReason[] }> = []

  for (const b of opsActive) {
    const reasons: OverdueReason[] = []
    const bIdx = idx(b.status)

    if (b.pickup_date && b.pickup_date < todayStr && bIdx !== -1 && bIdx < pickedUpIdx) {
      reasons.push({ code: 'pickup_overdue', label: 'Pickup overdue' })
    }
    if (b.delivery_date && b.delivery_date < todayStr && bIdx !== -1 && bIdx < deliveredIdx) {
      reasons.push({ code: 'delivery_overdue', label: 'Delivery overdue' })
    }
    if (b.status === 'indemnity_bond_sent') {
      reasons.push({ code: 'indemnity_pending', label: 'Indemnity bond not signed yet' })
    }
    if (bIdx >= confirmedIdx && bIdx !== -1 && bIdx < pickedUpIdx && !b.driver_name &&
        b.pickup_date && b.pickup_date <= dateOnly(new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000))) {
      reasons.push({ code: 'driver_unassigned', label: 'Driver not assigned' })
    }
    if (shouldShowDriverDetailsStep(b.service_type) && !b.driver_details_sent_at && bIdx !== -1 && bIdx < pickedUpIdx &&
        b.pickup_date && b.pickup_date <= dateOnly(new Date(now.getTime() + 4 * 60 * 60 * 1000))) {
      reasons.push({ code: 'driver_details_not_shared', label: 'Driver details not shared before pickup' })
    }

    if (reasons.length > 0) overdue.push({ ...b, overdue_reasons: reasons })
  }

  // ── Today's counts (summary widgets) ────────────────────────────────────
  const todaysPickups    = opsActive.filter(b => b.pickup_date === todayStr)
  const todaysDeliveries = opsActive.filter(b => b.delivery_date === todayStr)
  const deliveredToday   = opsActive.filter(b => b.delivery_date === todayStr && b.status === 'delivered').length
  const driverAssignPending  = overdue.filter(o => o.overdue_reasons.some(r => r.code === 'driver_unassigned')).length
  const indemnityPendingCt   = opsActive.filter(b => b.status === 'indemnity_bond_sent').length

  // ── Alerts (login-time, all ops-scoped) ─────────────────────────────────
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const in4h  = new Date(now.getTime() + 4 * 60 * 60 * 1000)

  const alerts: Array<{ severity: 'high' | 'medium'; message: string; count: number }> = []

  const pickupsSoon = opsActive.filter(b => b.pickup_date && b.pickup_date >= todayStr && b.pickup_date <= dateOnly(in24h) && idx(b.status) < pickedUpIdx)
  if (pickupsSoon.length) alerts.push({ severity: 'medium', message: 'Pickups scheduled within the next 24 hours', count: pickupsSoon.length })

  const driverDetailsSoon = pickupsSoon.filter(b => shouldShowDriverDetailsStep(b.service_type) && !b.driver_details_sent_at && b.pickup_date && b.pickup_date <= dateOnly(in4h))
  if (driverDetailsSoon.length) alerts.push({ severity: 'high', message: 'Driver details not yet shared for pickups within 4 hours', count: driverDetailsSoon.length })

  if (overdue.length) alerts.push({ severity: 'high', message: 'Overdue bookings needing attention', count: overdue.length })

  if (driverAssignPending) alerts.push({ severity: 'high', message: 'Bookings with no driver assigned yet', count: driverAssignPending })
  if (indemnityPendingCt)  alerts.push({ severity: 'medium', message: 'Indemnity bonds sent but not yet signed', count: indemnityPendingCt })
  if (docsPending.length)  alerts.push({ severity: 'medium', message: 'Documents pending approval or resubmission', count: docsPending.length })

  const deliveriesUpcoming = opsActive.filter(b => b.delivery_date && b.delivery_date >= todayStr && b.delivery_date <= dateOnly(in24h) && idx(b.status) < deliveredIdx)
  if (deliveriesUpcoming.length) alerts.push({ severity: 'medium', message: 'Deliveries due within the next 24 hours', count: deliveriesUpcoming.length })

  // ── Summary widgets — ops-only counts, no sales/financial figures ──────
  const widgets = {
    todays_pickups:      todaysPickups.length,
    todays_deliveries:   todaysDeliveries.length,
    delivered_today:     deliveredToday,
    upcoming_pickups_7d: upcoming7dCountQ.count ?? 0,
  }

  return NextResponse.json({
    upcoming_bookings: upcoming,
    upcoming_range:    { from: upcomingFrom, to: upcomingTo, preset: rangeParam },
    overdue,
    alerts,
    widgets,
  })
}
