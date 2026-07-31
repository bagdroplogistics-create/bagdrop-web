import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export const runtime = 'nodejs'

// ============================================================================
// BAGDROP — Detailed Reports (Phase 2/3 of the Reports & Dashboard
// Enhancements request). One generic endpoint backs 9 report types —
// Inquiry Source, Booking Status, Route Performance, Partner, Customer,
// Payment, Driver & Operations, Document, Cancellation — each returning a
// uniform { columns, rows, summary } shape so the frontend can use one
// shared table + export renderer (components/admin/DetailedReportView.tsx)
// instead of 9 bespoke pages. The existing Revenue tab
// (app/api/admin/reports/route.ts, app/(admin)/admin/reports/page.tsx) is
// untouched — this is purely additive, read-only, and does not modify
// bookings/leads/payments/indemnity_bonds in any way.
//
// Type-inference note: same as every other route in this codebase —
// supabaseAdmin has no Database generic, so every query uses a short inline
// .select() literal + an explicit interface + cast immediately after.
// ============================================================================

type Row = Record<string, unknown>
interface Column { key: string; label: string }
interface SummaryItem { label: string; value: string }
interface ReportResult { columns: Column[]; rows: Row[]; summary: SummaryItem[]; warnings?: string[] }

interface Filters {
  from:    string | null
  to:      string | null
  service: string | null
  source:  string | null
  status:  string | null
  partner: string | null
  city:    string | null
}

function fmtRs(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

function toDateTimeEnd(dateStr: string): string {
  return dateStr + 'T23:59:59'
}

// ── Row interfaces (mirrors the field vocabulary already established in
//    app/api/admin/reports/operations/route.ts) ────────────────────────────
interface LeadRow {
  id: string; lead_number: string | null; name: string; phone: string
  source: string | null; partner_name: string | null; service_interest: string | null; service_type: string | null
  from_city: string | null; to_city: string | null; pickup_date: string | null
  status: string; booking_id: string | null; created_at: string
}
interface BookingRow {
  id: string; tracking_id: string; status: string; status_history: unknown
  customer_name: string | null; customer_phone: string | null; customer_email: string | null
  service_type: string | null; service_label: string | null
  from_city: string | null; to_city: string | null; pickup_date: string | null; delivery_date: string | null
  total_amount: number | null; partner_name: string | null
  driver_name: string | null; driver_phone: string | null; vehicle_number: string | null
  driver_details_sent_at: string | null
  created_at: string; updated_at: string | null
}
interface PaymentRow {
  id: string; payment_id: string | null; booking_id: string | null
  customer_name: string | null; customer_phone: string | null
  amount: number | null; payment_method: string | null; payment_status: string | null
  payment_reference: string | null; verified_by: string | null; created_at: string
}
interface IndemnityRow {
  id: string; booking_id: string; document_status: string
  submitted_at: string | null; reviewed_at: string | null; reviewed_by: string | null
  aadhaar_number: string | null; passport_number: string | null; created_at: string
}

// Matches the exact field list already proven working in
// app/api/admin/reports/operations/route.ts's LEAD_SELECT (minus
// assigned_to/zoho_estimate_number, which this report doesn't need) —
// deliberately not adding unverified columns (e.g. `email`) that aren't
// confirmed present on the production leads table; an unrecognized column
// in a .select() fails the whole query, which previously came back as a
// silent empty result here rather than a visible error.
const LEAD_SELECT = 'id, lead_number, name, phone, source, partner_name, service_interest, service_type, from_city, to_city, pickup_date, status, booking_id, created_at'
const BOOKING_SELECT = 'id, tracking_id, status, status_history, customer_name, customer_phone, customer_email, service_type, service_label, from_city, to_city, pickup_date, delivery_date, total_amount, partner_name, driver_name, driver_phone, vehicle_number, driver_details_sent_at, created_at, updated_at'
const PAYMENT_SELECT = 'id, payment_id, booking_id, customer_name, customer_phone, amount, payment_method, payment_status, payment_reference, verified_by, created_at'
const INDEMNITY_SELECT = 'id, booking_id, document_status, submitted_at, reviewed_at, reviewed_by, aadhaar_number, passport_number, created_at'

// Builds a fresh leads query builder every time it's called — deliberately
// NOT reused/mutated across the "try with deleted_at" / "retry without
// deleted_at" attempts below. supabase-js's PostgrestFilterBuilder mutates
// itself in place rather than returning an immutable copy, so calling
// .order()/.limit() again on a builder that already had .is('deleted_at',
// null) chained onto it still carries that filter — the retry would
// silently fail the exact same way. app/api/admin/reports/operations/route.ts
// avoids this by rebuilding the query from scratch for its retry; this does
// the same via a shared builder function instead of duplicating the filter
// wiring twice.
function buildLeadsQuery(f: Filters) {
  let q = supabaseAdmin.from('leads').select(LEAD_SELECT)
  if (f.from) q = q.gte('created_at', f.from)
  if (f.to) q = q.lte('created_at', toDateTimeEnd(f.to))
  if (f.source) q = q.eq('source', f.source)
  if (f.partner) q = q.eq('partner_name', f.partner)
  if (f.service) q = q.or(`service_interest.eq.${f.service},service_type.eq.${f.service}`)
  if (f.city) q = q.or(`from_city.eq.${f.city},to_city.eq.${f.city}`)
  return q
}

async function fetchLeads(f: Filters, warnings: string[]): Promise<LeadRow[]> {
  let { data, error } = await buildLeadsQuery(f).is('deleted_at', null).order('created_at', { ascending: false }).limit(5000)
  if (error?.message?.includes('deleted_at')) {
    const retry = await buildLeadsQuery(f).order('created_at', { ascending: false }).limit(5000)
    data = retry.data; error = retry.error
  }
  if (error) {
    console.warn('[reports/detailed] leads query failed:', error.message)
    warnings.push(`Leads query failed: ${error.message}`)
    return []
  }
  return (data ?? []) as unknown as LeadRow[]
}

async function fetchBookings(f: Filters, warnings: string[]): Promise<BookingRow[]> {
  let q = supabaseAdmin.from('bookings').select(BOOKING_SELECT)
  if (f.from) q = q.gte('created_at', f.from)
  if (f.to) q = q.lte('created_at', toDateTimeEnd(f.to))
  if (f.service) q = q.eq('service_type', f.service)
  if (f.status) q = q.eq('status', f.status)
  if (f.partner) q = q.eq('partner_name', f.partner)
  if (f.city) q = q.or(`from_city.eq.${f.city},to_city.eq.${f.city}`)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(5000)
  if (error) {
    console.warn('[reports/detailed] bookings query failed:', error.message)
    warnings.push(`Bookings query failed: ${error.message}`)
    return []
  }
  return (data ?? []) as unknown as BookingRow[]
}

async function leadIdsByBooking(bookingIds: string[]): Promise<Record<string, string>> {
  if (bookingIds.length === 0) return {}
  const { data, error } = await supabaseAdmin.from('leads').select('id, booking_id').in('booking_id', bookingIds)
  if (error) return {}
  const rows = (data ?? []) as unknown as Array<{ id: string; booking_id: string | null }>
  return Object.fromEntries(rows.filter(r => r.booking_id).map(r => [r.booking_id as string, r.id]))
}

// Pulls the most recent { from, to, timestamp, note } entry matching a given
// target status out of a booking's status_history jsonb — same recovery
// pattern used to diagnose the 3 corrupted bookings earlier in this project.
// Used here (read-only) to find *when*/*why* a booking was cancelled, since
// bookings has no dedicated cancelled_at/cancellation_reason column.
function lastHistoryEntryTo(history: unknown, targetStatus: string): { timestamp?: string; note?: string; from?: string } | null {
  if (!Array.isArray(history)) return null
  const matches = history.filter((e): e is { to?: string; timestamp?: string; note?: string; from?: string } =>
    !!e && typeof e === 'object' && (e as { to?: string }).to === targetStatus)
  if (matches.length === 0) return null
  matches.sort((a, b) => new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime())
  return matches[0]
}

// ── Report builders ─────────────────────────────────────────────────────

async function buildInquirySource(f: Filters): Promise<ReportResult> {
  const warnings: string[] = []
  const leads = await fetchLeads(f, warnings)
  const columns: Column[] = [
    { key: 'lead_number', label: 'Lead #' }, { key: 'name', label: 'Name' }, { key: 'phone', label: 'Phone' },
    { key: 'source', label: 'Source' }, { key: 'partner_name', label: 'Partner' },
    { key: 'service', label: 'Service' }, { key: 'route', label: 'Route' },
    { key: 'pickup_date', label: 'Pickup Date' }, { key: 'status', label: 'Status' },
    { key: 'converted', label: 'Converted' }, { key: 'created_at', label: 'Created' },
  ]
  const rows: Row[] = leads.map(l => ({
    lead_number: l.lead_number ?? l.id.slice(0, 8),
    name: l.name, phone: l.phone,
    source: l.source ?? 'manual', partner_name: l.partner_name ?? '—',
    service: l.service_interest ?? l.service_type ?? '—',
    route: l.from_city && l.to_city ? `${l.from_city} → ${l.to_city}` : '—',
    pickup_date: l.pickup_date ?? '—', status: l.status,
    converted: !!l.booking_id, created_at: l.created_at,
  }))
  const bySource: Record<string, number> = {}
  for (const l of leads) bySource[l.source ?? 'manual'] = (bySource[l.source ?? 'manual'] ?? 0) + 1
  const topSources = Object.entries(bySource).sort(([, a], [, b]) => b - a).slice(0, 4)
  const converted = leads.filter(l => l.booking_id).length
  const summary: SummaryItem[] = [
    { label: 'Total Leads', value: String(leads.length) },
    { label: 'Converted', value: String(converted) },
    { label: 'Conversion Rate', value: leads.length ? `${Math.round((converted / leads.length) * 1000) / 10}%` : '0%' },
    ...topSources.map(([src, ct]) => ({ label: src, value: String(ct) })),
  ]
  return { columns, rows, summary, warnings: warnings.length ? warnings : undefined }
}

async function buildBookingStatus(f: Filters): Promise<ReportResult> {
  const warnings: string[] = []
  const bookings = await fetchBookings(f, warnings)
  const leadMap = await leadIdsByBooking(bookings.map(b => b.id))
  const columns: Column[] = [
    { key: 'tracking_id', label: 'Tracking ID' }, { key: 'customer_name', label: 'Customer' },
    { key: 'customer_phone', label: 'Phone' }, { key: 'service_label', label: 'Service' },
    { key: 'route', label: 'Route' }, { key: 'pickup_date', label: 'Pickup Date' },
    { key: 'status', label: 'Status' }, { key: 'total_amount', label: 'Amount' },
    { key: 'partner_name', label: 'Partner' }, { key: 'created_at', label: 'Created' },
  ]
  const rows: Row[] = bookings.map(b => ({
    tracking_id: b.tracking_id, customer_name: b.customer_name ?? '—', customer_phone: b.customer_phone ?? '—',
    service_label: b.service_label ?? b.service_type ?? '—',
    route: b.from_city && b.to_city ? `${b.from_city} → ${b.to_city}` : '—',
    pickup_date: b.pickup_date ?? '—', status: b.status,
    total_amount: fmtRs(Number(b.total_amount) || 0), partner_name: b.partner_name ?? '—',
    created_at: b.created_at,
    // not in `columns` (kept off the printed/exported table) — used only by
    // the on-screen UI to build a clickable link through to the booking.
    lead_id: leadMap[b.id] ?? null,
  }))
  const statusCounts: Record<string, number> = {}
  for (const b of bookings) statusCounts[b.status] = (statusCounts[b.status] ?? 0) + 1
  const topStatuses = Object.entries(statusCounts).sort(([, a], [, b]) => b - a).slice(0, 5)
  const totalRevenue = bookings.reduce((s, b) => s + (Number(b.total_amount) || 0), 0)
  const summary: SummaryItem[] = [
    { label: 'Total Bookings', value: String(bookings.length) },
    { label: 'Total Value', value: fmtRs(totalRevenue) },
    ...topStatuses.map(([st, ct]) => ({ label: st.replace(/_/g, ' '), value: String(ct) })),
  ]
  return { columns, rows, summary, warnings: warnings.length ? warnings : undefined }
}

async function buildRoutePerformance(f: Filters): Promise<ReportResult> {
  const warnings: string[] = []
  const bookings = await fetchBookings(f, warnings)
  const columns: Column[] = [
    { key: 'route', label: 'Route' }, { key: 'bookings', label: 'Bookings' },
    { key: 'revenue', label: 'Revenue' }, { key: 'avg_order_value', label: 'Avg Order Value' },
    { key: 'cancelled', label: 'Cancelled' }, { key: 'cancellation_rate', label: 'Cancellation Rate' },
  ]
  const map: Record<string, { route: string; count: number; revenue: number; cancelled: number }> = {}
  for (const b of bookings) {
    const route = b.from_city && b.to_city ? `${b.from_city} → ${b.to_city}` : 'Unknown'
    if (!map[route]) map[route] = { route, count: 0, revenue: 0, cancelled: 0 }
    map[route].count++
    map[route].revenue += Number(b.total_amount) || 0
    if (b.status === 'cancelled') map[route].cancelled++
  }
  const rows: Row[] = Object.values(map).sort((a, b) => b.revenue - a.revenue).map(r => ({
    route: r.route, bookings: r.count, revenue: fmtRs(r.revenue),
    avg_order_value: fmtRs(r.count ? r.revenue / r.count : 0),
    cancelled: r.cancelled, cancellation_rate: r.count ? `${Math.round((r.cancelled / r.count) * 1000) / 10}%` : '0%',
  }))
  const totalRevenue = bookings.reduce((s, b) => s + (Number(b.total_amount) || 0), 0)
  const summary: SummaryItem[] = [
    { label: 'Routes', value: String(Object.keys(map).length) },
    { label: 'Total Revenue', value: fmtRs(totalRevenue) },
    { label: 'Top Route', value: rows[0]?.route as string ?? '—' },
  ]
  return { columns, rows, summary, warnings: warnings.length ? warnings : undefined }
}

async function buildPartner(f: Filters): Promise<ReportResult> {
  const warnings: string[] = []
  const leads = (await fetchLeads(f, warnings)).filter(l => l.partner_name)
  const bookingIds = leads.map(l => l.booking_id).filter((id): id is string => !!id)
  let revenueByBooking: Record<string, number> = {}
  if (bookingIds.length > 0) {
    const { data } = await supabaseAdmin.from('bookings').select('id, total_amount').in('id', bookingIds)
    const rows = (data ?? []) as unknown as Array<{ id: string; total_amount: number | null }>
    revenueByBooking = Object.fromEntries(rows.map(r => [r.id, Number(r.total_amount) || 0]))
  }
  const columns: Column[] = [
    { key: 'partner_name', label: 'Partner' }, { key: 'leads', label: 'Leads' },
    { key: 'converted', label: 'Converted' }, { key: 'conversion_rate', label: 'Conversion Rate' },
    { key: 'revenue', label: 'Revenue' }, { key: 'avg_order_value', label: 'Avg Order Value' },
  ]
  const map: Record<string, { partner: string; leads: number; converted: number; revenue: number }> = {}
  for (const l of leads) {
    const key = l.partner_name as string
    if (!map[key]) map[key] = { partner: key, leads: 0, converted: 0, revenue: 0 }
    map[key].leads++
    if (l.booking_id) {
      map[key].converted++
      map[key].revenue += revenueByBooking[l.booking_id] ?? 0
    }
  }
  const rows: Row[] = Object.values(map).sort((a, b) => b.revenue - a.revenue).map(p => ({
    partner_name: p.partner, leads: p.leads, converted: p.converted,
    conversion_rate: p.leads ? `${Math.round((p.converted / p.leads) * 1000) / 10}%` : '0%',
    revenue: fmtRs(p.revenue), avg_order_value: fmtRs(p.converted ? p.revenue / p.converted : 0),
  }))
  const summary: SummaryItem[] = [
    { label: 'Partners', value: String(Object.keys(map).length) },
    { label: 'Total Leads', value: String(leads.length) },
    { label: 'Total Revenue', value: fmtRs(Object.values(map).reduce((s, p) => s + p.revenue, 0)) },
  ]
  return { columns, rows, summary, warnings: warnings.length ? warnings : undefined }
}

async function buildCustomer(f: Filters): Promise<ReportResult> {
  const warnings: string[] = []
  const bookings = (await fetchBookings(f, warnings)).filter(b => b.status !== 'cancelled' && b.customer_phone)
  const columns: Column[] = [
    { key: 'customer_name', label: 'Customer Name' }, { key: 'customer_phone', label: 'Phone' },
    { key: 'customer_email', label: 'Email' }, { key: 'total_bookings', label: 'Bookings' },
    { key: 'total_spent', label: 'Total Spent' }, { key: 'first_booking', label: 'First Booking' },
    { key: 'last_booking', label: 'Last Booking' },
  ]
  const map: Record<string, { name: string; phone: string; email: string; count: number; spent: number; first: string; last: string }> = {}
  for (const b of bookings) {
    const key = b.customer_phone as string
    if (!map[key]) map[key] = { name: b.customer_name ?? '—', phone: key, email: b.customer_email ?? '—', count: 0, spent: 0, first: b.created_at, last: b.created_at }
    const p = map[key]
    p.count++
    p.spent += Number(b.total_amount) || 0
    if (b.created_at < p.first) p.first = b.created_at
    if (b.created_at > p.last) p.last = b.created_at
  }
  const rows: Row[] = Object.values(map).sort((a, b) => b.spent - a.spent).map(c => ({
    customer_name: c.name, customer_phone: c.phone, customer_email: c.email,
    total_bookings: c.count, total_spent: fmtRs(c.spent), first_booking: c.first, last_booking: c.last,
  }))
  const totalSpent = Object.values(map).reduce((s, c) => s + c.spent, 0)
  const summary: SummaryItem[] = [
    { label: 'Customers', value: String(Object.keys(map).length) },
    { label: 'Total Spent', value: fmtRs(totalSpent) },
    { label: 'Repeat Customers', value: String(Object.values(map).filter(c => c.count > 1).length) },
  ]
  return { columns, rows, summary, warnings: warnings.length ? warnings : undefined }
}

async function buildPayment(f: Filters): Promise<ReportResult> {
  const warnings: string[] = []
  let q = supabaseAdmin.from('payments').select(PAYMENT_SELECT)
  if (f.from) q = q.gte('created_at', f.from)
  if (f.to) q = q.lte('created_at', toDateTimeEnd(f.to))
  if (f.status) q = q.eq('payment_status', f.status)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(5000)
  if (error) { console.warn('[reports/detailed] payments query failed:', error.message); warnings.push(`Payments query failed: ${error.message}`) }
  const payments = (error ? [] : (data ?? [])) as unknown as PaymentRow[]

  const bookingIds = payments.map(p => p.booking_id).filter((id): id is string => !!id)
  let trackingByBooking: Record<string, string> = {}
  if (bookingIds.length > 0) {
    const { data: bkData } = await supabaseAdmin.from('bookings').select('id, tracking_id').in('id', bookingIds)
    const rows = (bkData ?? []) as unknown as Array<{ id: string; tracking_id: string }>
    trackingByBooking = Object.fromEntries(rows.map(r => [r.id, r.tracking_id]))
  }

  const columns: Column[] = [
    { key: 'payment_id', label: 'Payment ID' }, { key: 'tracking_id', label: 'Booking' },
    { key: 'customer_name', label: 'Customer' }, { key: 'amount', label: 'Amount' },
    { key: 'payment_method', label: 'Method' }, { key: 'payment_status', label: 'Status' },
    { key: 'payment_reference', label: 'Reference' }, { key: 'verified_by', label: 'Verified By' },
    { key: 'created_at', label: 'Created' },
  ]
  const rows: Row[] = payments.map(p => ({
    payment_id: p.payment_id ?? p.id.slice(0, 8),
    tracking_id: p.booking_id ? (trackingByBooking[p.booking_id] ?? '—') : '—',
    customer_name: p.customer_name ?? '—', amount: fmtRs(Number(p.amount) || 0),
    payment_method: p.payment_method ?? '—', payment_status: p.payment_status ?? '—',
    payment_reference: p.payment_reference ?? '—', verified_by: p.verified_by ?? '—',
    created_at: p.created_at,
  }))
  const total = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const paid = payments.filter(p => p.payment_status === 'paid').reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const pending = payments.filter(p => p.payment_status === 'pending').reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const refunded = payments.filter(p => p.payment_status === 'refunded').reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const summary: SummaryItem[] = [
    { label: 'Payments', value: String(payments.length) },
    { label: 'Total', value: fmtRs(total) },
    { label: 'Paid', value: fmtRs(paid) },
    { label: 'Pending', value: fmtRs(pending) },
    { label: 'Refunded', value: fmtRs(refunded) },
  ]
  return { columns, rows, summary, warnings: warnings.length ? warnings : undefined }
}

async function buildDriverOps(f: Filters): Promise<ReportResult> {
  const warnings: string[] = []
  let q = supabaseAdmin.from('bookings').select(BOOKING_SELECT)
  // Ops cares about pickup date, not creation date — mirrors the "Pickup
  // Today" redefinition already applied to the Operations Center.
  if (f.from) q = q.gte('pickup_date', f.from)
  if (f.to) q = q.lte('pickup_date', f.to)
  if (f.service) q = q.eq('service_type', f.service)
  if (f.status) q = q.eq('status', f.status)
  if (f.city) q = q.or(`from_city.eq.${f.city},to_city.eq.${f.city}`)
  q = q.not('status', 'in', '(inquiry,quote_created,quote_sent,accepted,cancelled,rejected)')
  const { data, error } = await q.order('pickup_date', { ascending: true }).limit(5000)
  if (error) { console.warn('[reports/detailed] driver-ops query failed:', error.message); warnings.push(`Bookings query failed: ${error.message}`) }
  const bookings = (error ? [] : (data ?? [])) as unknown as BookingRow[]

  const columns: Column[] = [
    { key: 'tracking_id', label: 'Tracking ID' }, { key: 'customer_name', label: 'Customer' },
    { key: 'route', label: 'Route' }, { key: 'pickup_date', label: 'Pickup Date' },
    { key: 'driver_name', label: 'Driver' }, { key: 'driver_phone', label: 'Driver Phone' },
    { key: 'vehicle_number', label: 'Vehicle' }, { key: 'status', label: 'Status' },
    { key: 'driver_details_sent', label: 'Driver Details Sent' },
  ]
  const rows: Row[] = bookings.map(b => ({
    tracking_id: b.tracking_id, customer_name: b.customer_name ?? '—',
    route: b.from_city && b.to_city ? `${b.from_city} → ${b.to_city}` : '—',
    pickup_date: b.pickup_date ?? '—', driver_name: b.driver_name ?? 'Unassigned',
    driver_phone: b.driver_phone ?? '—', vehicle_number: b.vehicle_number ?? '—',
    status: b.status, driver_details_sent: !!b.driver_details_sent_at,
  }))
  const unassigned = bookings.filter(b => !b.driver_name).length
  const summary: SummaryItem[] = [
    { label: 'Bookings', value: String(bookings.length) },
    { label: 'Driver Assigned', value: String(bookings.length - unassigned) },
    { label: 'Driver Unassigned', value: String(unassigned) },
  ]
  return { columns, rows, summary, warnings: warnings.length ? warnings : undefined }
}

async function buildDocument(f: Filters): Promise<ReportResult> {
  const warnings: string[] = []
  let q = supabaseAdmin.from('indemnity_bonds').select(INDEMNITY_SELECT)
  if (f.from) q = q.gte('created_at', f.from)
  if (f.to) q = q.lte('created_at', toDateTimeEnd(f.to))
  if (f.status) q = q.eq('document_status', f.status)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(5000)
  if (error) { console.warn('[reports/detailed] indemnity_bonds query failed (table may not exist yet):', error.message); warnings.push(`Indemnity bonds query failed: ${error.message}`) }
  const docs = (error ? [] : (data ?? [])) as unknown as IndemnityRow[]

  const bookingIds = docs.map(d => d.booking_id).filter(Boolean)
  let bookingInfo: Record<string, { tracking_id: string; customer_name: string | null }> = {}
  if (bookingIds.length > 0) {
    const { data: bkData } = await supabaseAdmin.from('bookings').select('id, tracking_id, customer_name').in('id', bookingIds)
    const rows = (bkData ?? []) as unknown as Array<{ id: string; tracking_id: string; customer_name: string | null }>
    bookingInfo = Object.fromEntries(rows.map(r => [r.id, { tracking_id: r.tracking_id, customer_name: r.customer_name }]))
  }

  const columns: Column[] = [
    { key: 'tracking_id', label: 'Tracking ID' }, { key: 'customer_name', label: 'Customer' },
    { key: 'document_status', label: 'Document Status' }, { key: 'submitted_at', label: 'Submitted At' },
    { key: 'reviewed_at', label: 'Reviewed At' }, { key: 'reviewed_by', label: 'Reviewed By' },
    { key: 'id_provided', label: 'ID Provided' },
  ]
  const rows: Row[] = docs.map(d => ({
    tracking_id: bookingInfo[d.booking_id]?.tracking_id ?? '—',
    customer_name: bookingInfo[d.booking_id]?.customer_name ?? '—',
    document_status: d.document_status, submitted_at: d.submitted_at ?? '—',
    reviewed_at: d.reviewed_at ?? '—', reviewed_by: d.reviewed_by ?? '—',
    id_provided: !!(d.aadhaar_number || d.passport_number),
  }))
  const byStatus: Record<string, number> = {}
  for (const d of docs) byStatus[d.document_status] = (byStatus[d.document_status] ?? 0) + 1
  const summary: SummaryItem[] = [
    { label: 'Documents', value: String(docs.length) },
    ...Object.entries(byStatus).map(([st, ct]) => ({ label: st.replace(/_/g, ' '), value: String(ct) })),
  ]
  return { columns, rows, summary, warnings: warnings.length ? warnings : undefined }
}

async function buildCancellation(f: Filters): Promise<ReportResult> {
  const warnings: string[] = []
  const cancelledFilters: Filters = { ...f, status: 'cancelled' }
  const bookings = await fetchBookings(cancelledFilters, warnings)
  const allInRange = await fetchBookings(f, warnings) // for the cancellation-rate denominator

  const columns: Column[] = [
    { key: 'tracking_id', label: 'Tracking ID' }, { key: 'customer_name', label: 'Customer' },
    { key: 'route', label: 'Route' }, { key: 'pickup_date', label: 'Pickup Date' },
    { key: 'amount', label: 'Amount' }, { key: 'cancelled_at', label: 'Cancelled At' },
    { key: 'note', label: 'Note' },
  ]
  const rows: Row[] = bookings.map(b => {
    const hist = lastHistoryEntryTo(b.status_history, 'cancelled')
    return {
      tracking_id: b.tracking_id, customer_name: b.customer_name ?? '—',
      route: b.from_city && b.to_city ? `${b.from_city} → ${b.to_city}` : '—',
      pickup_date: b.pickup_date ?? '—', amount: fmtRs(Number(b.total_amount) || 0),
      cancelled_at: hist?.timestamp ?? b.updated_at ?? '—',
      note: hist?.note ?? '—',
    }
  })
  const lostRevenue = bookings.reduce((s, b) => s + (Number(b.total_amount) || 0), 0)
  const rate = allInRange.length ? Math.round((bookings.length / allInRange.length) * 1000) / 10 : 0
  const summary: SummaryItem[] = [
    { label: 'Cancellations', value: String(bookings.length) },
    { label: 'Revenue Lost', value: fmtRs(lostRevenue) },
    { label: 'Cancellation Rate', value: `${rate}%` },
  ]
  return { columns, rows, summary, warnings: warnings.length ? warnings : undefined }
}

const BUILDERS: Record<string, (f: Filters) => Promise<ReportResult>> = {
  inquiry_source:    buildInquirySource,
  booking_status:    buildBookingStatus,
  route_performance: buildRoutePerformance,
  partner:           buildPartner,
  customer:          buildCustomer,
  payment:           buildPayment,
  driver_ops:        buildDriverOps,
  document:          buildDocument,
  cancellation:      buildCancellation,
}

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const type = searchParams.get('type') ?? ''
  const builder = BUILDERS[type]
  if (!builder) {
    return NextResponse.json({ error: `Unknown report type: ${type}. Valid types: ${Object.keys(BUILDERS).join(', ')}` }, { status: 400 })
  }

  const filters: Filters = {
    from:    searchParams.get('from'),
    to:      searchParams.get('to'),
    service: searchParams.get('service'),
    source:  searchParams.get('source'),
    status:  searchParams.get('status'),
    partner: searchParams.get('partner'),
    city:    searchParams.get('city'),
  }

  try {
    const result = await builder(filters)
    return NextResponse.json(result)
  } catch (err) {
    console.error(`[reports/detailed] ${type} report failed:`, err)
    return NextResponse.json({ error: 'Failed to build report' }, { status: 500 })
  }
}
