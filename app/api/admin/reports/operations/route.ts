import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { STATUS_ORDER } from '@/lib/lifecycle-notifications'

export const runtime = 'nodejs'

// ============================================================================
// BAGDROP — Operations Center report data
// Backs app/(admin)/admin/reports/operations/page.tsx (Phase 1 of the Reports
// & Dashboard Enhancements request): Today's Inquiries, Upcoming Bookings
// (7-day), Missed/Overdue Tasks, Today's Operational Tasks, the top summary
// widget row, and login-time Alerts — all in one call so the page loads with
// a single round trip instead of 6+.
//
// Read-only. Does not touch bookings.status, leads.status, or any other
// column — purely aggregates what's already there. Existing Dashboard
// (app/(admin)/admin/page.tsx) and its API routes are untouched.
//
// ── Assumptions (flagging per project convention — adjust if these don't
// match how the team actually wants "overdue" defined; there's no SLA
// config in the system yet, so these are reasonable defaults, not measured
// business rules):
//   - "Quote not sent in expected time"   → status still 'quote_created' more than 24h after creation.
//   - "Customer approval pending"         → status still 'quote_sent' more than 48h since last status change.
//   - "Payment pending too long"          → status still 'payment_pending' more than 24h since last status change.
//   - "Driver assignment pending"         → status confirmed-or-later, pickup within 2 days (or past), no driver_name yet.
//   - "Driver details not shared in time" → airport-involving service, pickup within 4h (or past), driver_details_sent_at still null.
//   - "Indemnity bond pending"            → status stuck at 'indemnity_bond_sent' (sent but not yet signed).
//   - "Pickup overdue"                    → pickup_date has passed, status hasn't reached 'picked_up' yet.
//   - "Delivery overdue"                  → delivery_date has passed, status hasn't reached 'delivered'/'completed' yet.
// "Time since last status change" uses bookings.updated_at as a proxy —
// there's no per-status timestamp column, and updated_at changes whenever
// the row (including status) is patched, which is the closest available signal.
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
  customer_name:               string | null
  customer_phone:              string | null
  customer_email:              string | null
  service_type:                string | null
  service_label:                string | null
  from_city:                   string | null
  to_city:                     string | null
  pickup_date:                 string | null
  delivery_date:               string | null
  time_slot:                   string | null
  total_bags:                  number | null
  total_amount:                number | null
  payment_status:               string | null
  driver_name:                 string | null
  driver_phone:                string | null
  driver_details_sent_at:      string | null
  created_at:                  string
  updated_at:                  string | null
}

interface LeadRow {
  id:                    string
  lead_number:           string | null
  name:                  string
  phone:                 string
  source:                string | null
  partner_name:          string | null
  service_interest:      string | null
  service_type:          string | null
  from_city:             string | null
  to_city:               string | null
  pickup_date:           string | null
  status:                string
  assigned_to:           string | null
  booking_id:            string | null
  zoho_estimate_number:  string | null
  created_at:            string
}

function idx(status: string | null | undefined): number {
  return STATUS_ORDER.indexOf(status ?? '')
}

function hoursSince(iso: string | null | undefined): number {
  if (!iso) return 0
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60)
}

function isAirport(serviceType: string | null | undefined): boolean {
  return /airport/i.test(serviceType ?? '')
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10)
}

const LEAD_SELECT = 'id, lead_number, name, phone, source, partner_name, service_interest, service_type, from_city, to_city, pickup_date, status, assigned_to, booking_id, zoho_estimate_number, created_at'
const BOOKING_SELECT = 'id, tracking_id, status, status_history, customer_name, customer_phone, customer_email, service_type, service_label, from_city, to_city, pickup_date, delivery_date, time_slot, total_bags, total_amount, payment_status, driver_name, driver_phone, driver_details_sent_at, created_at, updated_at'

// "Upcoming Confirmed Bookings" — operations only wants to see bookings the
// customer has actually committed to (accepted the quote AND the booking has
// been confirmed), not every quote in flight. Anything still at inquiry,
// quote-created/sent, awaiting approval, or payment-pending is excluded —
// those may never convert (customer rejects the quote, goes quiet, etc.) and
// cluttering an operational "get ready for these pickups" view with them was
// the exact complaint. Cancelled/rejected are excluded too. Derived from
// STATUS_ORDER rather than hand-listed so any future status added after
// 'confirmed' in that sequence is automatically included without a code
// change here.
const CONFIRMED_ONWARD_STATUSES = STATUS_ORDER.slice(STATUS_ORDER.indexOf('confirmed'))

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
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
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

  // leads.deleted_at only exists once SOFT_DELETE_MIGRATION.sql has been run
  // (same defensive pattern as app/api/admin/leads/route.ts) — a missing
  // column means "no soft-delete support yet," so retry unfiltered instead
  // of failing this whole report over one optional migration.
  async function fetchLeadsInRange(gte: string, lte?: string): Promise<LeadRow[]> {
    let query = supabaseAdmin.from('leads').select(LEAD_SELECT).gte('created_at', gte)
    if (lte) query = query.lte('created_at', lte)
    let { data, error } = await query.is('deleted_at', null).order('created_at', { ascending: false })
    if (error?.message?.includes('deleted_at')) {
      let retryQuery = supabaseAdmin.from('leads').select(LEAD_SELECT).gte('created_at', gte)
      if (lte) retryQuery = retryQuery.lte('created_at', lte)
      const retry = await retryQuery.order('created_at', { ascending: false })
      data = retry.data; error = retry.error
    }
    if (error) {
      console.warn('[reports/operations] leads query failed (non-fatal, defaulting to empty):', error.message)
      return []
    }
    return (data ?? []) as unknown as LeadRow[]
  }

  // "Today's Inquiries" means "inquiries whose pickup is scheduled for
  // today" — not "inquiries created today". The point of this list is an
  // Ops don't-miss-it reminder ("today is this customer's pickup"), not a
  // new-leads-received feed; an inquiry submitted weeks ago with today's
  // pickup date belongs here, and one submitted an hour ago with a pickup
  // next month does not. Same deleted_at fallback as fetchLeadsInRange above.
  async function fetchLeadsByPickupDate(dateStr: string): Promise<LeadRow[]> {
    let { data, error } = await supabaseAdmin
      .from('leads').select(LEAD_SELECT).eq('pickup_date', dateStr)
      .is('deleted_at', null).order('created_at', { ascending: false })
    if (error?.message?.includes('deleted_at')) {
      const retry = await supabaseAdmin
        .from('leads').select(LEAD_SELECT).eq('pickup_date', dateStr)
        .order('created_at', { ascending: false })
      data = retry.data; error = retry.error
    }
    if (error) {
      console.warn('[reports/operations] leads-by-pickup-date query failed (non-fatal, defaulting to empty):', error.message)
      return []
    }
    return (data ?? []) as unknown as LeadRow[]
  }

  // Upcoming CONFIRMED bookings in the requested window — see
  // CONFIRMED_ONWARD_STATUSES above for why this isn't every booking. Built
  // as a mutable query (same reassignment pattern already used by
  // fetchLeadsInRange above and app/api/admin/leads/route.ts) so the upper
  // bound can be conditionally omitted for the 'all' default instead of
  // being forced to always cut off at some fixed date.
  let upcomingQueryBuilder = supabaseAdmin
    .from('bookings')
    .select(BOOKING_SELECT)
    .gte('pickup_date', upcomingFrom)
    .in('status', CONFIRMED_ONWARD_STATUSES)
  if (upcomingTo) upcomingQueryBuilder = upcomingQueryBuilder.lte('pickup_date', upcomingTo)
  upcomingQueryBuilder = upcomingQueryBuilder.order('pickup_date', { ascending: true })

  const [
    leadsToday,
    leadsMonth,
    upcomingQ,
    upcoming7dCountQ,
    allActiveQ,
    docsPending,
    revenueQ,
  ] = await Promise.all([
    fetchLeadsByPickupDate(todayStr),
    fetchLeadsInRange(monthStart),

    upcomingQueryBuilder,

    // Fixed 7-day count for the summary widget card — deliberately a
    // separate query from the one above, so the widget always means "next
    // 7 days" regardless of whichever range preset the admin currently has
    // selected for the table (previously these shared one query, so the
    // widget's number silently changed meaning whenever the table's range
    // filter changed — e.g. showing "Today"'s count under a label that
    // still said "7d").
    supabaseAdmin
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .gte('pickup_date', todayStr)
      .lte('pickup_date', in7DaysStr)
      .in('status', CONFIRMED_ONWARD_STATUSES),

    // Broad pull of everything not yet finished — Missed/Overdue, Today's Ops,
    // and several summary widgets all derive from this same set, so one query
    // covers all of them instead of five near-identical ones.
    supabaseAdmin
      .from('bookings')
      .select(BOOKING_SELECT)
      .not('status', 'in', '(cancelled,rejected,completed)')
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

    // Monthly revenue — mirrors crm-stats' definition (see that route's
    // comments for why 'accepted' and the other pre-payment stages are
    // excluded). Duplicated rather than imported since crm-stats is a route
    // handler, not a shared lib function.
    supabaseAdmin
      .from('bookings')
      .select('total_amount')
      .not('status', 'in', '(inquiry,quote_created,quote_sent,accepted,payment_pending,rejected,cancelled)')
      .gte('created_at', monthStart),
  ])

  if (upcomingQ.error)  return NextResponse.json({ error: upcomingQ.error.message },  { status: 500 })
  if (allActiveQ.error) return NextResponse.json({ error: allActiveQ.error.message }, { status: 500 })

  const upcoming  = (upcomingQ.data  ?? []) as unknown as BookingRow[]
  const allActive = (allActiveQ.data ?? []) as unknown as BookingRow[]

  // ── Today's Inquiries: attach linked booking status (manual fetch — not a
  // nested embed, matching the established pattern elsewhere in this repo
  // for avoiding PostgREST relationship-resolution failures) ──────────────
  const bookingIds = leadsToday.map(l => l.booking_id).filter((id): id is string => !!id)
  let bookingsById: Record<string, { tracking_id: string; status: string }> = {}
  if (bookingIds.length > 0) {
    const { data: bkRowsRaw } = await supabaseAdmin
      .from('bookings')
      .select('id, tracking_id, status')
      .in('id', bookingIds)
    const bkRows = (bkRowsRaw ?? []) as unknown as Array<{ id: string; tracking_id: string; status: string }>
    bookingsById = Object.fromEntries(bkRows.map(b => [b.id, { tracking_id: b.tracking_id, status: b.status }]))
  }

  const todaysInquiries = leadsToday.map(l => ({
    id:              l.id,
    lead_number:     l.lead_number,
    customer_name:   l.name,
    phone:           l.phone,
    booking_id:      l.booking_id,
    tracking_id:     l.booking_id ? (bookingsById[l.booking_id]?.tracking_id ?? null) : null,
    service_type:    l.service_interest ?? l.service_type,
    from_city:       l.from_city,
    to_city:         l.to_city,
    pickup_date:     l.pickup_date,
    status:          l.booking_id ? (bookingsById[l.booking_id]?.status ?? l.status) : l.status,
    assigned_to:     l.assigned_to,
    has_quote:       !!l.zoho_estimate_number,
  }))

  const confirmedIdx = idx('confirmed')
  const todaysInquiriesTotals = {
    total:            leadsToday.length,
    pending_quotes:   todaysInquiries.filter(l => !l.has_quote).length,
    pending_payments: todaysInquiries.filter(l => l.status === 'payment_pending').length,
    confirmed:        todaysInquiries.filter(l => idx(l.status) >= confirmedIdx && idx(l.status) !== -1).length,
  }

  // ── Missed / Overdue Tasks — see assumptions block at top of file ──────
  const pickedUpIdx  = idx('picked_up')
  const deliveredIdx = idx('delivered')

  type OverdueReason = { code: string; label: string }
  const overdue: Array<BookingRow & { overdue_reasons: OverdueReason[] }> = []

  for (const b of allActive) {
    const reasons: OverdueReason[] = []
    const bIdx = idx(b.status)

    if (b.pickup_date && b.pickup_date < todayStr && bIdx !== -1 && bIdx < pickedUpIdx) {
      reasons.push({ code: 'pickup_overdue', label: 'Pickup overdue' })
    }
    if (b.delivery_date && b.delivery_date < todayStr && bIdx !== -1 && bIdx < deliveredIdx) {
      reasons.push({ code: 'delivery_overdue', label: 'Delivery overdue' })
    }
    if (b.status === 'payment_pending' && hoursSince(b.updated_at) > 24) {
      reasons.push({ code: 'payment_pending', label: 'Payment pending > 24h' })
    }
    if (b.status === 'quote_created' && hoursSince(b.created_at) > 24) {
      reasons.push({ code: 'quote_not_sent', label: 'Quote not sent > 24h' })
    }
    if (b.status === 'quote_sent' && hoursSince(b.updated_at) > 48) {
      reasons.push({ code: 'approval_pending', label: 'Customer approval pending > 48h' })
    }
    if (b.status === 'indemnity_bond_sent') {
      reasons.push({ code: 'indemnity_pending', label: 'Indemnity bond not signed yet' })
    }
    if (bIdx >= confirmedIdx && bIdx !== -1 && bIdx < pickedUpIdx && !b.driver_name &&
        b.pickup_date && b.pickup_date <= dateOnly(new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000))) {
      reasons.push({ code: 'driver_unassigned', label: 'Driver not assigned' })
    }
    if (isAirport(b.service_type) && !b.driver_details_sent_at && bIdx !== -1 && bIdx < pickedUpIdx &&
        b.pickup_date && b.pickup_date <= dateOnly(new Date(now.getTime() + 4 * 60 * 60 * 1000))) {
      reasons.push({ code: 'driver_details_not_shared', label: 'Driver details not shared before pickup' })
    }

    if (reasons.length > 0) overdue.push({ ...b, overdue_reasons: reasons })
  }

  // ── Today's Operational Tasks ───────────────────────────────────────────
  const todaysPickups        = allActive.filter(b => b.pickup_date === todayStr)
  const todaysDeliveries     = allActive.filter(b => b.delivery_date === todayStr)
  const todaysAirportCollect = todaysPickups.filter(b => isAirport(b.service_type))
  const driverAssignPending  = overdue.filter(o => o.overdue_reasons.some(r => r.code === 'driver_unassigned')).length
  const driverDetailsPending = overdue.filter(o => o.overdue_reasons.some(r => r.code === 'driver_details_not_shared')).length
  const indemnityPendingCt   = allActive.filter(b => b.status === 'indemnity_bond_sent').length

  // ── Alerts (login-time) ─────────────────────────────────────────────────
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const in4h  = new Date(now.getTime() + 4 * 60 * 60 * 1000)

  const alerts: Array<{ severity: 'high' | 'medium'; message: string; count: number }> = []

  const pickupsSoon = allActive.filter(b => b.pickup_date && b.pickup_date >= todayStr && b.pickup_date <= dateOnly(in24h) && idx(b.status) < pickedUpIdx)
  if (pickupsSoon.length) alerts.push({ severity: 'medium', message: 'Pickups scheduled within the next 24 hours', count: pickupsSoon.length })

  const airportSoon = pickupsSoon.filter(b => isAirport(b.service_type) && b.pickup_date && b.pickup_date <= dateOnly(in4h))
  if (airportSoon.length) alerts.push({ severity: 'high', message: 'Airport collections within the next 4 hours', count: airportSoon.length })

  if (overdue.length) alerts.push({ severity: 'high', message: 'Overdue bookings needing attention', count: overdue.length })

  const paymentsOld = allActive.filter(b => b.status === 'payment_pending' && hoursSince(b.updated_at) > 24)
  if (paymentsOld.length) alerts.push({ severity: 'medium', message: 'Payments pending for more than 24 hours', count: paymentsOld.length })

  const quotesAwaiting = allActive.filter(b => b.status === 'quote_sent')
  if (quotesAwaiting.length) alerts.push({ severity: 'medium', message: 'Quotes awaiting customer response', count: quotesAwaiting.length })

  if (driverAssignPending) alerts.push({ severity: 'high', message: 'Bookings with no driver assigned yet', count: driverAssignPending })
  if (indemnityPendingCt)  alerts.push({ severity: 'medium', message: 'Indemnity bonds sent but not yet signed', count: indemnityPendingCt })

  const deliveriesUpcoming = allActive.filter(b => b.delivery_date && b.delivery_date >= todayStr && b.delivery_date <= dateOnly(in24h) && idx(b.status) < deliveredIdx)
  if (deliveriesUpcoming.length) alerts.push({ severity: 'medium', message: 'Deliveries due within the next 24 hours', count: deliveriesUpcoming.length })

  // ── Summary widgets ──────────────────────────────────────────────────────
  if (revenueQ.error) console.warn('[reports/operations] revenue query failed (non-fatal):', revenueQ.error.message)
  const monthlyRevenue = (revenueQ.data ?? []).reduce((s, b) => s + (Number(b.total_amount) || 0), 0)
  const activePartners = new Set(leadsMonth.map(l => l.partner_name).filter(Boolean)).size
  const convertedThisMonth = leadsMonth.filter(l => !!l.booking_id).length
  const conversionRate = leadsMonth.length > 0 ? Math.round((convertedThisMonth / leadsMonth.length) * 1000) / 10 : 0

  const widgets = {
    todays_inquiries:           leadsToday.length,
    todays_pickups:             todaysPickups.length,
    todays_deliveries:          todaysDeliveries.length,
    upcoming_pickups_7d:        upcoming7dCountQ.count ?? 0,
    pending_quotes:             todaysInquiriesTotals.pending_quotes,
    pending_payments:           allActive.filter(b => b.status === 'payment_pending').length,
    pending_driver_assign:      driverAssignPending,
    pending_documents:          docsPending.length,
    completed_deliveries_today: allActive.filter(b => b.delivery_date === todayStr && (b.status === 'delivered' || b.status === 'completed')).length,
    monthly_revenue:            monthlyRevenue,
    active_partners:            activePartners,
    conversion_rate:            conversionRate,
  }

  return NextResponse.json({
    todays_inquiries:        todaysInquiries,
    todays_inquiries_totals: todaysInquiriesTotals,
    upcoming_bookings:       upcoming,
    upcoming_range:          { from: upcomingFrom, to: upcomingTo, preset: rangeParam },
    overdue,
    todays_ops: {
      pickups:                todaysPickups,
      airport_collections:    todaysAirportCollect,
      deliveries:             todaysDeliveries,
      driver_assign_pending:  driverAssignPending,
      driver_details_pending: driverDetailsPending,
      indemnity_pending:      indemnityPendingCt,
      documents_pending:      docsPending.length,
    },
    alerts,
    widgets,
  })
}
