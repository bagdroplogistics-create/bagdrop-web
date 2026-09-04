'use client'

import { useEffect, useState, useCallback, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import {
  Package, Clock, CheckCircle, Truck,
  Search, ChevronDown, RefreshCw, TrendingUp,
  MapPin, Calendar, Phone, Mail, Hash, Pencil, X, Save,
  Users, FileText, IndianRupee, Lock, AlertCircle,
  FileCheck, CreditCard, Receipt, Download, ArrowUpDown, ArrowRight,
} from 'lucide-react'
import Link from 'next/link'
import { PhoneInput } from '@/components/ui/phone-input'
import { parseStoredPhone, toE164 } from '@/lib/phone-format'
import { TITLE_OPTIONS, DEFAULT_TITLE, formatCustomerName } from '@/lib/constants'
import FollowUpPanel from '@/components/admin/FollowUpPanel'
import ReviewPanel from '@/components/admin/ReviewPanel'
import CancelBookingPanel from '@/components/admin/CancelBookingPanel'
import { resolveSource } from '@/lib/lead-source'
// 2026-08-24 fix: import from lib/booking-status.ts (zero imports, client-safe)
// rather than lib/lifecycle-notifications.ts (which imports supabaseAdmin —
// unsafe to bundle into a 'use client' file). Aliased because this file
// already declares its own local ACTIVE_BOOKING_STATUSES const below.
import { ACTIVE_BOOKING_STATUSES as SHARED_ACTIVE_BOOKING_STATUSES, UNCONFIRMED_BOOKING_STATUSES } from '@/lib/booking-status'

interface Booking {
  id: string
  tracking_id: string
  status: string
  title?: string | null
  customer_name: string
  customer_email: string
  customer_phone: string
  customer_phone_country_code?: string | null
  customer_phone_national?: string | null
  service_label: string
  from_city: string
  to_city: string
  pickup_date: string | null
  pickup_address: string | null
  drop_address: string | null
  // Manual override for which calendar month this completed booking
  // reports under in Dashboard Analytics — see
  // COMPLETED_MONTH_OVERRIDE_MIGRATION.sql. Only meaningful once status
  // is 'completed'; null means "use pickup_date automatically."
  completed_month_override?: string | null
  time_slot: string | null
  total_bags: number
  total_amount: number
  payment_status: string | null
  payment_reference: string | null
  notes: string | null
  created_at: string
  updated_at?: string | null
  rejection_reason?: string | null
  rejection_comment?: string | null
  source?: string | null
  lead_id?: string | null
  status_history?: Array<{
    from: string | null
    to: string
    timestamp: string
    changed_by: string
    note: string | null
  }> | null
}

interface Stats {
  total: number
  new_inquiries: number
  in_progress: number
  in_transit: number
  delivered: number
  revenue: number
}

// ── Full booking workflow — 20 statuses ───────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode; locked?: boolean }> = {
  // Phase 1: Inquiry
  inquiry:           { label: 'New Inquiry',         color: '#92400e', bg: '#fef3c7', icon: <AlertCircle className="h-3 w-3" /> },
  // Phase 2: Quote
  quote_created:     { label: 'Quote Created',       color: '#4f46e5', bg: '#eef2ff', icon: <FileCheck className="h-3 w-3" /> },
  quote_sent:        { label: 'Quote Sent',          color: '#6d28d9', bg: '#ede9fe', icon: <FileText className="h-3 w-3" /> },
  accepted:          { label: 'Quote Accepted',      color: '#0891b2', bg: '#cffafe', icon: <CheckCircle className="h-3 w-3" /> },
  rejected:          { label: 'Quote Rejected',      color: '#dc2626', bg: '#fee2e2', icon: <X className="h-3 w-3" /> },
  closed:            { label: 'Inquiry Closed',      color: '#6b7280', bg: '#f3f4f6', icon: <X className="h-3 w-3" /> },
  // Phase 3: Payment
  payment_pending:   { label: 'Payment Requested',  color: '#d97706', bg: '#fef3c7', icon: <CreditCard className="h-3 w-3" /> },
  payment_received:  { label: 'Payment Received',   color: '#059669', bg: '#d1fae5', icon: <CheckCircle className="h-3 w-3" /> },
  payment_approved:  { label: 'Admin Approved',     color: '#059669', bg: '#d1fae5', icon: <CheckCircle className="h-3 w-3" /> },
  // Phase 4: Booking
  confirmed:         { label: 'Booking Confirmed',  color: '#2563eb', bg: '#dbeafe', icon: <CheckCircle className="h-3 w-3" /> },
  invoice_generated: { label: 'Invoice Generated',  color: '#7c3aed', bg: '#ede9fe', icon: <Receipt className="h-3 w-3" /> },
  invoice_sent:      { label: 'Invoice Sent',       color: '#6d28d9', bg: '#ede9fe', icon: <FileText className="h-3 w-3" /> },
  // Phase 5: Operations
  pickup_scheduled:  { label: 'Pickup Scheduled',   color: '#7c3aed', bg: '#ede9fe', icon: <Calendar className="h-3 w-3" /> },
  picked_up:         { label: 'Bags Picked Up',     color: '#7c3aed', bg: '#ede9fe', icon: <Package className="h-3 w-3" /> },
  in_transit:        { label: 'In Transit',         color: '#0891b2', bg: '#cffafe', icon: <Truck className="h-3 w-3" /> },
  out_for_delivery:  { label: 'Out for Delivery',   color: '#ea580c', bg: '#ffedd5', icon: <Truck className="h-3 w-3" /> },
  // Airport Delivery only — set from the Trip Sheet, not selectable for
  // any other service type. See app/api/admin/trip-sheets/[id]/route.ts.
  driver_details_shared: { label: 'Driver Details Shared', color: '#0369a1', bg: '#e0f2fe', icon: <Phone className="h-3 w-3" /> },
  indemnity_bond_sent: { label: 'Indemnity Bond Sent', color: '#b45309', bg: '#fef3c7', icon: <FileCheck className="h-3 w-3" /> },
  // 2026-08-24 fix — was missing (same class of bug as the ACTIVE_STATUSES
  // gap fixed earlier today); a booking at exactly this status fell through
  // this lookup and rendered no badge at all.
  indemnity_bond_signed: { label: 'Indemnity Bond Signed', color: '#65a30d', bg: '#ecfccb', icon: <CheckCircle className="h-3 w-3" /> },
  delivered:         { label: 'Delivered',          color: '#16a34a', bg: '#dcfce7', icon: <CheckCircle className="h-3 w-3" /> },
  trip_created:      { label: 'Trip Sheet Created', color: '#0891b2', bg: '#cffafe', icon: <Truck className="h-3 w-3" /> },
  // Phase 6: Final
  completed:         { label: 'Completed',          color: '#14532d', bg: '#bbf7d0', icon: <CheckCircle className="h-3 w-3" />, locked: true },
  cancelled:         { label: 'Cancelled',          color: '#dc2626', bg: '#fee2e2', icon: <X className="h-3 w-3" /> },
}

const WORKFLOW_PHASES = [
  { label: 'Inquiry',    statuses: ['inquiry'] },
  { label: 'Quote',      statuses: ['quote_created','quote_sent','accepted','rejected','closed'] },
  { label: 'Payment',    statuses: ['payment_pending','payment_received','payment_approved'] },
  { label: 'Booking',    statuses: ['confirmed','invoice_generated','invoice_sent'] },
  { label: 'Operations', statuses: ['pickup_scheduled','picked_up','in_transit','out_for_delivery','driver_details_shared','indemnity_bond_sent','indemnity_bond_signed'] },
  { label: 'Closed',     statuses: ['delivered','trip_created','completed','cancelled'] },
]

// ── Status groupings for the Dashboard Analytics KPI cards ──────────────
// Mirrors the buckets computed server-side in
// app/api/admin/dashboard-analytics/route.ts (bucketFor / ACTIVE_STATUSES)
// so that clicking a KPI card filters the bookings table to exactly the
// records that make up that card's number. Read-only groupings — no
// business logic (status values, workflow) is changed by this.
// 2026-08-24 fix: was a locally hardcoded array missing
// 'indemnity_bond_signed'; now the single shared definition (see
// ACTIVE_BOOKING_STATUSES's doc comment in lib/booking-status.ts).
const ACTIVE_BOOKING_STATUSES   = SHARED_ACTIVE_BOOKING_STATUSES
const REJECTED_BOOKING_STATUSES = ['rejected', 'closed']
const ALL_STATUS_KEYS           = Object.keys(STATUS_CONFIG)
const PENDING_BOOKING_STATUSES  = ALL_STATUS_KEYS.filter(s =>
  s !== 'completed' && s !== 'cancelled' &&
  !ACTIVE_BOOKING_STATUSES.includes(s) && !REJECTED_BOOKING_STATUSES.includes(s)
)
const NON_REJECTED_STATUSES = ALL_STATUS_KEYS.filter(s => !REJECTED_BOOKING_STATUSES.includes(s))

function monthWindowISO(offsetMonths: number) {
  const base = new Date()
  const from = new Date(base.getFullYear(), base.getMonth() + offsetMonths, 1)
  const to   = new Date(base.getFullYear(), base.getMonth() + offsetMonths + 1, 1)
  return { from: from.toISOString(), to: to.toISOString() }
}

// Same month window as monthWindowISO, but as plain "YYYY-MM-DD" (no time/
// timezone component) — matches the bookings API's completed_from/
// completed_to params, which compare directly against the DATE-typed
// pickup_date column.
function monthWindowDateOnly(offsetMonths: number) {
  const base = new Date()
  const from = new Date(base.getFullYear(), base.getMonth() + offsetMonths, 1)
  const to   = new Date(base.getFullYear(), base.getMonth() + offsetMonths + 1, 1)
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { from: fmt(from), to: fmt(to) }
}

// A KPI card's click target — filters the bookings table below without
// touching any status/workflow logic. `statuses` restricts to a set of
// booking statuses (matches the bookings API's `statuses=` param); `month`
// restricts to bookings CREATED in that calendar month (matches how the
// Total Inquiries KPIs are computed); `completedMonth` restricts to
// bookings whose pickup_date falls in that calendar month — matches how
// the Completed Bookings KPIs are computed (see
// app/api/admin/dashboard-analytics/route.ts). month and completedMonth
// are mutually exclusive.
interface KpiView {
  statuses?: string[]
  month?: 'current' | 'last'
  completedMonth?: 'current' | 'last'
  label: string
  // Total Confirmed Bookings only — excludes any booking whose linked
  // lead never actually had a quote generated (quote_number is null),
  // mirroring the same guard the KPI number itself already applies in
  // app/api/admin/dashboard-analytics/route.ts. Without this the
  // drill-down list and the card's own count could disagree — exactly
  // what happened with a booking whose status had been advanced without
  // a quote ever being sent.
  requireQuote?: boolean
}

// Module-scope (not just inside AdminDashboard) so EditModal can use it too
// for the reporting-month override control's pickup-date hint.
function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// For DATE-ONLY columns (pickup_date, delivery_date, etc.) as opposed to
// full timestamps (created_at). Supabase returns these as plain
// "YYYY-MM-DD" strings, which `new Date(...)` parses as UTC midnight per
// the JS spec. formatDate() above renders in the viewing browser's own
// local timezone — fine for a real timestamp like created_at, but for a
// date-only value that silently rolls the date back a day for any admin
// whose machine isn't set to a timezone at/ahead of UTC (2026-08-31 bug
// report: the pickup date shown on the dashboard didn't match what the
// customer actually selected). Pinning timeZone to 'UTC' guarantees the
// calendar date shown always matches the date-only value as stored,
// regardless of the viewer's own clock/timezone settings.
function formatDateOnly(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

// Pulls the most recent { from, to, timestamp, note, changed_by } entry
// matching a given target status out of a booking's status_history jsonb.
// Same read-only recovery pattern already used by app/api/admin/reports/
// detailed/route.ts's lastHistoryEntryTo() (bookings has no dedicated
// cancellation_reason/cancelled_at column — status_history is the existing
// source of truth this app already reads cancellation details back out of
// for reporting; this is the same lookup, just local to this page so the
// Cancel Booking feature's reason/notes/who/when are visible right where
// Admin cancelled it, not only in the Reports tab).
function lastHistoryEntryTo(history: unknown, targetStatus: string): { timestamp?: string; note?: string; changed_by?: string } | null {
  if (!Array.isArray(history)) return null
  const matches = history.filter((e): e is { to?: string; timestamp?: string; note?: string; changed_by?: string } =>
    !!e && typeof e === 'object' && (e as { to?: string }).to === targetStatus)
  if (matches.length === 0) return null
  matches.sort((a, b) => new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime())
  return matches[0]
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6', icon: null }
  return (
    <span style={{ color: cfg.color, background: cfg.bg }}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap">
      {cfg.icon}{cfg.label}
      {cfg.locked && <Lock className="h-2.5 w-2.5 ml-0.5" />}
    </span>
  )
}

// Statuses that require a quote before any status change is allowed
const PRE_QUOTE_STATUSES = ['inquiry', 'pending']

function StatusSelect({ id, current, adminKey, onUpdate }: {
  id: string; current: string; adminKey: string; onUpdate: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Admin Approve: move the booking to any workflow step from this same
  // dropdown WITHOUT sending the customer a WhatsApp/email for it — e.g.
  // they were already told over a call, or the admin is correcting a step
  // rather than genuinely advancing it. Purely a "skip notification for
  // this one change" flag — see admin_approve in
  // app/api/admin/bookings/[id]/route.ts. Resets after each change so it
  // never silently stays on for a later, genuinely-new status move.
  const [silent, setSilent] = useState(false)
  const isLocked = STATUS_CONFIG[current]?.locked === true

  // Lock dropdown for pre-quote statuses — quote must be created first via Leads tab
  const isPreQuote = PRE_QUOTE_STATUSES.includes(current)

  if (isLocked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-green-50 border border-green-200 px-3 py-1.5 text-xs font-semibold text-green-800">
        <Lock className="h-3 w-3" /> Completed
      </span>
    )
  }

  if (isPreQuote) {
    return (
      <div className="space-y-1">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 cursor-not-allowed select-none">
          <Lock className="h-3 w-3" />
          {STATUS_CONFIG[current]?.label ?? current}
        </span>
        <p className="text-[10px] text-amber-600 leading-tight max-w-[160px]">
          Create a quote first via Leads tab → New Quote
        </p>
        {/* Escape hatch: some bookings (orphan test entries, duplicates, spam)
            have no linked lead at all, so "Leads tab → New Quote" is a dead
            end — there's nothing to click there. Cancelling doesn't need a
            quote, so it's exposed here directly instead of being blocked
            behind the same lock as real status progression. */}
        <button
          onClick={() => { if (confirm('Cancel this booking? It will drop off the default Dashboard view.')) change('cancelled') }}
          disabled={loading}
          className="text-[10px] font-semibold text-red-500 hover:text-red-700 underline disabled:opacity-50"
        >
          {loading ? 'Cancelling…' : 'Cancel booking'}
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    )
  }

  async function change(next: string) {
    if (next === current || loading) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/admin/bookings/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ status: next, ...(silent ? { admin_approve: true } : {}) }),
    })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Failed')
    }
    setLoading(false)
    setSilent(false)
    onUpdate()
  }

  return (
    <div>
      <div className="relative inline-block">
        <select
          value={current}
          onChange={e => change(e.target.value)}
          disabled={loading}
          className="appearance-none rounded-lg border border-gray-200 bg-white py-1.5 pl-3 pr-8 text-xs font-medium text-gray-700 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:opacity-50 cursor-pointer"
        >
          {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
            <option key={val} value={val}>{cfg.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
      </div>
      {/* Admin Approve toggle — check before picking a status above to move
          the booking forward without emailing/WhatsApp-ing the customer. */}
      <label className="mt-1 flex items-center gap-1.5 text-[10px] font-medium text-gray-500 cursor-pointer select-none">
        <input type="checkbox" checked={silent} onChange={e => setSilent(e.target.checked)} disabled={loading}
          className="h-3 w-3 rounded border-gray-300 text-orange-500 focus:ring-orange-400"/>
        Admin Approve (don&apos;t notify customer)
      </label>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

function DetailRow({ icon, label, val }: { icon: React.ReactNode; label: string; val: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-800">{val}</p>
      </div>
    </div>
  )
}

// FollowUpPanel — extracted to components/admin/FollowUpPanel.tsx so this
// exact same implementation (and default message template) is shared
// with the Leads table (app/(admin)/admin/leads/page.tsx) instead of two
// copies drifting apart.


interface EditForm {
  title: string; customer_name: string; customer_phone: string; customer_phone_country_iso2: string; customer_email: string
  total_bags: string; pickup_date: string; pickup_address: string
  drop_address: string; notes: string
}

function EditModal({ booking, adminKey, onSaved, onClose }: {
  booking: Booking; adminKey: string; onSaved: () => void; onClose: () => void
}) {
  // Re-parses the stored E.164 string so the correct flag/dial code shows
  // automatically instead of always assuming +91 — previously this stripped
  // a literal "+91" prefix and silently left any other country code intact
  // (mangled) or, for genuinely Indian numbers, worked by coincidence.
  const initialPhone = parseStoredPhone(booking.customer_phone)
  const [form, setForm] = useState<EditForm>({
    title: booking.title && TITLE_OPTIONS.includes(booking.title as never) ? booking.title : DEFAULT_TITLE,
    customer_name:  booking.customer_name,
    customer_phone: booking.customer_phone_national || initialPhone.nationalNumber,
    customer_phone_country_iso2: booking.customer_phone_country_code || initialPhone.iso2,
    customer_email: booking.customer_email ?? '',
    total_bags:     String(booking.total_bags),
    pickup_date:    booking.pickup_date?.slice(0, 10) ?? '',
    pickup_address: booking.pickup_address ?? '',
    drop_address:   booking.drop_address ?? '',
    notes:          booking.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const isLocked = STATUS_CONFIG[booking.status]?.locked === true

  // Reporting-month override — the one field editable even on a locked/
  // completed booking, since it exists specifically to correct Dashboard
  // Analytics reporting after the fact (see
  // COMPLETED_MONTH_OVERRIDE_MIGRATION.sql). Sent as its own PATCH with no
  // `status` field, so it never trips the "completed booking is read-only"
  // lock in the API (that lock only guards status transitions).
  const [monthOverride, setMonthOverride] = useState(
    booking.completed_month_override ? booking.completed_month_override.slice(0, 7) : ''
  )
  const [savingMonth, setSavingMonth] = useState(false)
  const [monthError, setMonthError]   = useState<string | null>(null)
  const [monthSaved, setMonthSaved]   = useState(false)

  // Accepts an explicit value so "Clear" can save an empty override
  // immediately without waiting on a state update to land first.
  async function saveMonthOverride(value: string = monthOverride) {
    setSavingMonth(true); setMonthError(null); setMonthSaved(false)
    try {
      const res = await fetch('/api/admin/bookings/' + booking.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        // "YYYY-MM" -> first of that month; empty clears the override.
        body: JSON.stringify({ completed_month_override: value ? value + '-01' : null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setMonthSaved(true)
      onSaved()
    } catch (err: unknown) {
      setMonthError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSavingMonth(false)
    }
  }

  function set(key: keyof EditForm, val: string) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSave() {
    setSaving(true); setSaveError(null)
    try {
      const res = await fetch('/api/admin/bookings/' + booking.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({
          title:          form.title,
          customer_name:  form.customer_name.trim(),
          customer_phone: toE164(form.customer_phone, form.customer_phone_country_iso2),
          customer_phone_country_code: form.customer_phone_country_iso2,
          customer_phone_national:     form.customer_phone.trim(),
          customer_email: form.customer_email.trim(),
          total_bags:     Number(form.total_bags) || 1,
          pickup_date:    form.pickup_date || null,
          pickup_address: form.pickup_address.trim(),
          drop_address:   form.drop_address.trim(),
          notes:          form.notes.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      onSaved()
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Could not save changes')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-8">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Edit Booking</h2>
            <p className="text-xs text-orange-500 font-mono font-semibold">{booking.tracking_id}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        {isLocked && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm font-medium text-green-800">
            <Lock className="h-4 w-4" /> This booking is completed. Details are read-only.
          </div>
        )}
        {booking.status === 'completed' && (
          <div className="mx-6 mt-4 space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-semibold text-amber-800">
              Dashboard Analytics reporting month
            </p>
            <p className="text-[11px] text-amber-700">
              Defaults to this booking's pickup date ({booking.pickup_date ? formatDateOnly(booking.pickup_date) : '—'}).
              Only set this if that's the wrong month for Current/Last Month Completed Bookings.
            </p>
            <div className="flex items-center gap-2">
              <input type="month" value={monthOverride} onChange={e => setMonthOverride(e.target.value)}
                className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400" />
              <button onClick={() => saveMonthOverride()} disabled={savingMonth}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50 transition-colors">
                {savingMonth ? 'Saving…' : 'Save'}
              </button>
              {monthOverride && (
                <button onClick={() => { setMonthOverride(''); saveMonthOverride('') }} disabled={savingMonth}
                  className="text-xs font-semibold text-amber-700 underline hover:text-amber-900 disabled:opacity-50">
                  Clear (use pickup date)
                </button>
              )}
            </div>
            {monthSaved && !monthError && <p className="text-xs font-medium text-green-700">Saved ✓</p>}
            {monthError && <p className="text-xs text-red-600">{monthError}</p>}
          </div>
        )}
        <div className="space-y-4 p-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Title</label>
              <select value={form.title} disabled={isLocked}
                onChange={e => set('title', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:bg-gray-50 disabled:text-gray-500">
                {TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Customer Name</label>
              <input type="text" value={form.customer_name} disabled={isLocked}
                onChange={e => set('customer_name', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:bg-gray-50 disabled:text-gray-500" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Mobile</label>
              <PhoneInput
                countryIso2={form.customer_phone_country_iso2}
                nationalNumber={form.customer_phone}
                onCountryChange={iso2 => set('customer_phone_country_iso2', iso2)}
                onNumberChange={digits => set('customer_phone', digits)}
                disabled={isLocked}
                placeholder="9876543210"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Email</label>
              <input type="email" value={form.customer_email} disabled={isLocked}
                onChange={e => set('customer_email', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:bg-gray-50 disabled:text-gray-500" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Total Bags</label>
              <input type="number" min={1} max={99} value={form.total_bags} disabled={isLocked}
                onChange={e => set('total_bags', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:bg-gray-50 disabled:text-gray-500" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Pickup Date</label>
              <input type="date" value={form.pickup_date} disabled={isLocked}
                onChange={e => set('pickup_date', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:bg-gray-50 disabled:text-gray-500" />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Pickup Address</label>
              <input type="text" value={form.pickup_address} disabled={isLocked}
                onChange={e => set('pickup_address', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:bg-gray-50 disabled:text-gray-500" />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Drop Address</label>
              <input type="text" value={form.drop_address} disabled={isLocked}
                onChange={e => set('drop_address', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:bg-gray-50 disabled:text-gray-500" />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Notes / Special Instructions</label>
              <textarea rows={3} value={form.notes} disabled={isLocked}
                onChange={e => set('notes', e.target.value)}
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:bg-gray-50 disabled:text-gray-500" />
            </div>
          </div>
          {saveError && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{saveError}</p>}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            {isLocked ? 'Close' : 'Cancel'}
          </button>
          {!isLocked && (
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-50 transition-colors">
              {saving
                ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                : <Save className="h-3.5 w-3.5" />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Workflow is managed entirely from the Leads (Quote Management) module
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function QuotePaymentPanel({ booking, adminKey, onUpdate }: {
  booking: Booking; adminKey: string; onUpdate: () => void
}) {
  return null
}
// ── Dead code below — kept for reference only, never called ──────
function _QuotePaymentPanelLEGACY({ booking, adminKey, onUpdate }: {
  booking: Booking; adminKey: string; onUpdate: () => void
}) {
  const [basePrice,      setBasePrice]      = useState('')
  const [utr,            setUtr]            = useState('')
  const [upiId,          setUpiId]          = useState('')
  const [loading,        setLoading]        = useState(false)
  const [err,            setErr]            = useState('')
  const [msg,            setMsg]            = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReason,   setRejectReason]   = useState('')
  const [rejectComment,  setRejectComment]  = useState('')
  const [invoiceData,    setInvoiceData]    = useState<{
    id: string; invoice_number: string; base_amount: number; cgst: number; sgst: number; total_amount: number
  } | null>(null)

  const s = booking.status

  const PANEL_STATUSES = [
    'inquiry', 'quote_created', 'accepted', 'quote_sent', 'rejected',
    'payment_pending', 'payment_received', 'payment_approved',
    'confirmed', 'invoice_generated', 'invoice_sent',
    'pickup_scheduled', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'trip_created',
  ]

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!['inquiry','quote_created','accepted','quote_sent','payment_pending','payment_received'].includes(s)) return
    fetch('/api/admin/settings?key=' + adminKey)
      .then(r => r.json())
      .then(d => { if (d.settings?.payment_upi) setUpiId(d.settings.payment_upi) })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, adminKey])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (s !== 'invoice_generated') { setInvoiceData(null); return }
    fetch(`/api/admin/invoices?key=${adminKey}&booking_id=${booking.id}`)
      .then(r => r.json())
      .then(d => { if (d.invoices?.[0]) setInvoiceData(d.invoices[0]) })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, adminKey, booking.id])

  if (!PANEL_STATUSES.includes(s)) return null

  const base   = parseFloat(basePrice) || 0
  const cgst   = parseFloat((base * 0.025).toFixed(2))
  const sgst   = parseFloat((base * 0.025).toFixed(2))
  const total  = parseFloat((base + cgst + sgst).toFixed(2))
  const amount = Number(booking.total_amount)
  const upiLink  = upiId && amount > 0 ? `upi://pay?pa=${upiId}&pn=Bagdrop&am=${amount}&cu=INR&tn=${booking.tracking_id}` : ''
  const upiQrUrl = upiLink ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiLink)}` : null

  // ── Stage step tracker ──────────────────────────────────────────
  const STAGE_ORDER  = ['inquiry', 'quote', 'payment', 'booking', 'ops']
  const STAGE_LABELS = ['Inquiry', 'Quote', 'Payment', 'Booking', 'Operations']
  const STAGE_MAP: Record<string, string> = {
    inquiry: 'inquiry',
    quote_created:'quote', quote_sent:'quote', accepted:'quote', rejected:'quote', closed:'quote',
    payment_pending:'payment', payment_received:'payment', payment_approved:'payment',
    confirmed:'booking', invoice_generated:'booking', invoice_sent:'booking',
    trip_created:'ops',
    pickup_scheduled:'ops', picked_up:'ops', in_transit:'ops', out_for_delivery:'ops', delivered:'ops',
  }
  const curStage = STAGE_MAP[s] ?? 'inquiry'
  const curIdx   = STAGE_ORDER.indexOf(curStage)

  // ── API helpers ─────────────────────────────────────────────────
  async function patchBooking(body: Record<string, unknown>) {
    setLoading(true); setErr('')
    const res = await fetch('/api/admin/bookings/' + booking.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(body),
    })
    const d = await res.json()
    if (!res.ok) { setErr(d.error ?? 'Failed'); setLoading(false); return false }
    setLoading(false); onUpdate(); return true
  }

  async function sendQuote() {
    if (base <= 0) { setErr('Enter a valid base price'); return }
    setLoading(true); setErr('')
    const qRes = await fetch('/api/admin/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({
        booking_id: booking.id, title: booking.title, customer_name: booking.customer_name,
        customer_phone: booking.customer_phone, customer_email: booking.customer_email,
        service_type: booking.service_label || 'Baggage Delivery',
        from_city: booking.from_city, to_city: booking.to_city,
        pickup_date: booking.pickup_date, total_bags: booking.total_bags,
        base_price: base, status: 'sent', notes: `Booking ${booking.tracking_id}`,
      }),
    })
    const qData = await qRes.json()
    if (!qRes.ok) { setErr('Quote creation failed: ' + (qData.error ?? 'Unknown')); setLoading(false); return }
    const emailSent = qData.email_sent === true
    await patchBooking({ status: 'quote_sent', total_amount: total })
    setMsg(emailSent
      ? `Quote ${qData.quote?.quote_number ?? ''} created & emailed to ${booking.customer_email} ✓`
      : `Quote ${qData.quote?.quote_number ?? ''} created. Email not sent (no email or service unavailable).`)
  }

  async function acceptQuote()  { await patchBooking({ status: 'accepted' }) }

  async function rejectQuote() {
    if (!rejectReason) { setErr('Select a rejection reason'); return }
    const ok = await patchBooking({
      status: 'rejected',
      rejection_reason:  rejectReason,
      rejection_comment: rejectComment.trim() || null,
    })
    if (ok) { setShowRejectForm(false); setMsg('Quote rejected and recorded.') }
  }

  async function verifyPayment() {
    if (!utr.trim()) { setErr('Enter UTR / reference number'); return }
    const ok = await patchBooking({
      status: 'payment_received', payment_status: 'paid',
      payment_method: 'upi', payment_reference: utr.trim(),
    })
    if (ok) setMsg('✅ Payment received! Generate invoice & confirm booking below.')
  }

  async function adminApprovePayLater() {
    const ok = await patchBooking({ status: 'payment_approved', approved_without_payment: true })
    if (ok) setMsg('✅ Admin approved (Pay Later). Generate invoice & confirm booking.')
  }

  // Was generateInvoiceAndConfirm() — generated the invoice AND confirmed
  // the booking in one action, right after payment. Per the updated
  // workflow (Payment → ... → Completed → Generate Invoice), invoicing no
  // longer happens here at all — this now only confirms the booking.
  // Invoice generation moved to the new completed-only action below
  // (see generateInvoiceAfterCompletion), reusing the exact same
  // POST /api/admin/invoices endpoint — nothing about how an invoice is
  // built or numbered changed, only when this button offers to create one.
  async function confirmBooking() {
    setLoading(true); setErr(''); setMsg('')
    const ok = await patchBooking({ status: 'confirmed' })
    if (ok) setMsg('🎉 Booking confirmed! Invoice can be generated once this booking reaches Completed.')
    setLoading(false)
  }

  // Kept for any already-in-flight booking that reached 'confirmed' before
  // this change and still expects the old confirmed→invoice_generated step
  // to exist. New bookings won't use this — see the 'completed'-only
  // generateInvoiceAfterCompletion below for the new flow.
  async function generateInvoice() {
    setLoading(true); setErr(''); setMsg('')
    try {
      const invRes = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ booking_id: booking.id }),
      })
      const invData = await invRes.json()
      if (!invRes.ok) { setErr(invData.error ?? 'Invoice generation failed'); setLoading(false); return }
      setInvoiceData(invData.invoice)
      await patchBooking({ status: 'invoice_generated' })
      setMsg(`Invoice ${invData.invoice?.invoice_number ?? ''} generated.`)
    } catch {
      setErr('Failed to generate invoice'); setLoading(false)
    }
  }

  // ── Generate Invoice AFTER Completed (new location per updated workflow) ──
  // 'completed' is a locked/terminal status (patchBooking's completed-lock
  // guard rejects any status change once a booking is completed), so this
  // deliberately never calls patchBooking — it only creates the invoice
  // record via the same existing endpoint used everywhere else. The
  // booking's own status stays 'completed'; the invoice is bookkeeping on
  // top of it, not a workflow step.
  async function generateInvoiceAfterCompletion() {
    setLoading(true); setErr(''); setMsg('')
    try {
      const invRes = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ booking_id: booking.id, send_email: true }),
      })
      const invData = await invRes.json()
      if (!invRes.ok) { setErr(invData.error ?? 'Invoice generation failed'); setLoading(false); return }
      setInvoiceData(invData.invoice)
      setMsg(`Invoice ${invData.invoice?.invoice_number ?? ''} generated` +
        (invData.email_sent ? ` and emailed to ${booking.customer_email}.` : '.'))
    } catch {
      setErr('Failed to generate invoice')
    } finally {
      setLoading(false)
    }
  }

  async function sendInvoiceToCustomer() {
    setLoading(true); setErr(''); setMsg('')
    try {
      const invRes = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ booking_id: booking.id, send_email: true }),
      })
      const invData = await invRes.json()
      if (!invRes.ok) { setErr(invData.error ?? 'Failed'); setLoading(false); return }
      await patchBooking({ status: 'invoice_sent' })
      setMsg(invData.email_sent
        ? `✅ Invoice emailed to ${booking.customer_email}`
        : 'Invoice marked as sent (no email address on file).')
    } catch {
      setErr('Failed'); setLoading(false)
    }
  }

  async function markInvoiceSent() {
    const ok = await patchBooking({ status: 'invoice_sent' })
    if (ok) setMsg('Invoice marked as sent.')
  }

  function sharePaymentWhatsApp() {
    const phone = booking.customer_phone.replace(/\D/g, '')
    const e164  = phone.startsWith('91') ? phone : '91' + phone
    const upi   = upiId || 'BAGDROP1717@IOB'
    const upiDeepLink = `upi://pay?pa=${upi}&pn=Bagdrop&am=${amount}&cu=INR&tn=${booking.tracking_id}`
    const qrImgUrl    = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiDeepLink)}`
    const message = [
      `Hi ${formatCustomerName(booking.title, booking.customer_name) || booking.customer_name}! 🧳`, ``,
      `Your Bagdrop quote for *${booking.from_city} → ${booking.to_city}* is ready for payment.`, ``,
      `💰 *Amount Due: ₹${amount.toLocaleString('en-IN')}*`, ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `💳 *Pay via UPI*`, `UPI ID: *${upi}*`, `📲 Tap to Pay: ${upiDeepLink}`, ``,
      `📷 *Scan QR Code to Pay:*`, qrImgUrl,
      `━━━━━━━━━━━━━━━━━━━━`, ``,
      `Reference: ${booking.tracking_id}`, ``,
      `Once payment is done, reply with a screenshot and we will confirm your booking.`, ``,
      `_Bagdrop — Baggage Delivered. Journey Simplified._`,
    ].join('\n')
    // web.whatsapp.com/send (not wa.me) goes straight to the WhatsApp Web
    // chat with the message drafted — wa.me bounces through an
    // api.whatsapp.com landing page on desktop browsers first.
    window.open(`https://web.whatsapp.com/send?phone=${e164}&text=${encodeURIComponent(message)}`, '_blank')
  }

  async function sendPaymentViaWhatsApp() {
    await patchBooking({ status: 'payment_pending' })
    sharePaymentWhatsApp()
  }

  async function sharePaymentEmail() {
    if (!booking.customer_email) { setErr('No email address on this booking.'); return }
    setLoading(true); setErr('')
    try {
      const res = await fetch('/api/admin/bookings/' + booking.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ send_payment_email: true }),
      })
      if (res.ok) setMsg(`Payment request emailed to ${booking.customer_email} ✓`)
      else        setErr('Could not send email. Check Resend config.')
    } catch { setErr('Error sending email.') }
    setLoading(false)
  }

  // ── Inline quote price builder ──────────────────────────────────
  const QuoteBuilder = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Base Price (₹)</label>
        <input type="number" min={0} placeholder="e.g. 2000" value={basePrice}
          onChange={e => setBasePrice(e.target.value)}
          className="w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
      </div>
      {base > 0 && (
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5">
          <div className="flex gap-5 text-xs text-gray-500">
            <span>CGST 2.5%: <strong className="text-gray-700">₹{cgst.toFixed(2)}</strong></span>
            <span>SGST 2.5%: <strong className="text-gray-700">₹{sgst.toFixed(2)}</strong></span>
          </div>
          <p className="mt-1 text-lg font-bold text-gray-900">Total: ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
        </div>
      )}
    </div>
  )

  // ── Rejection form ──────────────────────────────────────────────
  const RejectForm = (
    <div className="rounded-xl border border-red-100 bg-red-50 p-4 space-y-3">
      <p className="text-xs font-bold uppercase tracking-widest text-red-500">Record Rejection Reason</p>
      <select value={rejectReason} onChange={e => setRejectReason(e.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400">
        <option value="">Select reason…</option>
        <option>Price too high</option>
        <option>Chose another provider</option>
        <option>Trust issue</option>
        <option>Service not required</option>
        <option>Timeline not suitable</option>
        <option>Changed travel plans</option>
        <option>No response from customer</option>
        <option>Other</option>
      </select>
      <textarea rows={2} value={rejectComment} onChange={e => setRejectComment(e.target.value)}
        placeholder="Optional comment…"
        className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400" />
      <div className="flex gap-2">
        <button onClick={rejectQuote} disabled={loading || !rejectReason}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40 transition-colors">
          Confirm Rejection
        </button>
        <button onClick={() => setShowRejectForm(false)}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )

  return (
    <div className="mt-4 rounded-xl border border-orange-100 bg-white p-4 shadow-sm" onClick={e => e.stopPropagation()}>

      {/* ── Step progress tracker ── */}
      <div className="mb-4 flex items-center gap-1 overflow-x-auto pb-1">
        {STAGE_LABELS.map((label, i) => {
          const key = STAGE_ORDER[i]
          const isActive = key === curStage
          const isPast   = i < curIdx
          return (
            <div key={key} className="flex items-center gap-1 shrink-0">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
                isActive ? 'bg-orange-500 text-white' :
                isPast   ? 'bg-green-100 text-green-700' :
                           'bg-gray-100 text-gray-400'
              }`}>
                {isPast ? '✓' : `${i + 1}.`} {label}
              </span>
              {i < 4 && <span className="text-gray-200 text-[10px]">›</span>}
            </div>
          )
        })}
      </div>

      {/* ── INQUIRY: Create & Send Quote ── */}
      {s === 'inquiry' && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-500">🔍 New Inquiry — Set Price & Create Quote</p>
          {QuoteBuilder}
          <button onClick={sendQuote} disabled={loading || base <= 0}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-purple-700 disabled:opacity-40 transition-colors">
            <FileText className="h-3.5 w-3.5" />
            {loading ? 'Sending...' : 'Create & Send Quote →'}
          </button>
        </div>
      )}



      {/* ── QUOTE ACCEPTED: removed — managed via status dropdown ── */}

      {/* ── QUOTE REJECTED: Details & close ── */}
      {s === 'rejected' && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-red-400">✗ Quote Rejected</p>
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 space-y-1.5">
            <p className="text-sm text-red-700">
              <span className="font-semibold">Reason: </span>
              {booking.rejection_reason || <span className="italic text-red-400">Not recorded</span>}
            </p>
            {booking.rejection_comment && (
              <p className="text-sm text-red-600"><span className="font-semibold">Comment: </span>{booking.rejection_comment}</p>
            )}
          </div>
          {!showRejectForm ? (
            <div className="flex gap-2">
              <button onClick={() => setShowRejectForm(true)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors">
                {booking.rejection_reason ? 'Update Reason' : 'Record Reason'}
              </button>
              <button onClick={() => patchBooking({ status: 'closed' })} disabled={loading}
                className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-200 transition-colors">
                Close Inquiry
              </button>
            </div>
          ) : (
            <div>{RejectForm}</div>
          )}
        </div>
      )}

      {/* ── PAYMENT REQUESTED: QR + Verify ── */}
      {s === 'payment_pending' && (
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-amber-500">💳 Payment Requested — Awaiting Customer Payment</p>
          <div className="flex flex-wrap gap-6">
            <div className="flex flex-col items-center gap-2 shrink-0">
              {upiQrUrl ? (
                <>
                  <img src={upiQrUrl} alt="UPI QR Code" className="rounded-xl border-2 border-orange-100 shadow-md" width={160} height={160} />
                  <p className="text-[11px] font-mono font-bold text-gray-600">{upiId}</p>
                  <p className="text-sm font-bold text-gray-800">₹{amount.toLocaleString('en-IN')}</p>
                </>
              ) : (
                <div className="flex h-[160px] w-[160px] items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-center text-xs text-gray-400 p-4">
                  Set UPI ID in<br />Settings → Payment
                </div>
              )}
            </div>
            <div className="flex-1 min-w-[240px] space-y-3">
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 mb-1">Payment Details</p>
                <p className="text-sm font-mono font-bold text-amber-900">{upiId || '(Set UPI in Settings)'}</p>
                <p className="text-lg font-bold text-amber-900">₹{amount.toLocaleString('en-IN')}</p>
                <p className="text-[10px] text-amber-600 mt-0.5">Ref: {booking.tracking_id}</p>
              </div>
              <div className="space-y-2">
                <button onClick={sharePaymentWhatsApp} disabled={!upiId}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-40 transition-colors">
                  <span>📲</span> Resend Payment Request via WhatsApp
                </button>
                <button onClick={sharePaymentEmail} disabled={loading || !booking.customer_email || !upiId}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40 transition-colors">
                  <span>📧</span> Send via Email
                </button>
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">UTR / Payment Reference No.</label>
                <input type="text" placeholder="12-digit UTR or reference" value={utr}
                  onChange={e => setUtr(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400" />
              </div>
              <button onClick={verifyPayment} disabled={loading || !utr.trim()}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-40 transition-colors">
                <CheckCircle className="h-3.5 w-3.5" />
                {loading ? 'Processing...' : 'Mark Payment Received ✓'}
              </button>
              <div className="border-t border-gray-100 pt-2">
                <button onClick={adminApprovePayLater} disabled={loading}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors">
                  🏦 Admin Approve — Pay Later (no payment received)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PAYMENT RECEIVED / ADMIN APPROVED: Payment Proof + Confirm ── */}
      {(s === 'payment_received' || s === 'payment_approved') && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-green-500">
            {s === 'payment_received' ? '✅ Payment Received — Confirm Booking' : '🏦 Admin Approved — Confirm Booking'}
          </p>
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-5 py-3">
              <CheckCircle className="h-6 w-6 text-green-600 shrink-0" />
              <div>
                <p className="text-sm font-bold text-green-800">
                  {s === 'payment_received' ? 'Payment Received' : 'Admin Approved (Pay Later)'}
                </p>
                <p className="text-xs text-green-600">₹{amount.toLocaleString('en-IN')}</p>
                {booking.payment_reference && (
                  <p className="text-[10px] font-mono text-green-500 mt-0.5">UTR: {booking.payment_reference}</p>
                )}
              </div>
            </div>
            <div className="flex-1 rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
              <p className="text-sm font-bold text-blue-800">Next: Confirm Booking</p>
              <p className="text-xs text-blue-600">
                Invoicing now happens later, once this booking reaches Completed — this step just confirms the booking.
              </p>
              <button onClick={confirmBooking} disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-40 transition-colors">
                <CheckCircle className="h-4 w-4" />
                {loading ? 'Processing...' : 'Confirm Booking →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── BOOKING CONFIRMED: Generate Invoice ── */}
      {/* Invoice generation used to be offered right here. Per the updated
          workflow, invoicing now only happens once the booking reaches
          Completed (see the new block below, near the 'completed' status) —
          so a confirmed booking moves straight to scheduling pickup instead,
          same action/button already used at the old invoice_sent step. */}
      {s === 'confirmed' && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-500">🎉 Booking Confirmed — Schedule Pickup</p>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
            <p className="text-sm text-blue-700">Coordinate with the customer and schedule bag pickup. Invoicing happens later, once this booking is Completed.</p>
            <button onClick={() => patchBooking({ status: 'pickup_scheduled' })} disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-40 transition-colors">
              <Calendar className="h-4 w-4" />
              {loading ? 'Updating...' : 'Pickup Scheduled →'}
            </button>
          </div>
        </div>
      )}

      {/* ── INVOICE GENERATED: Preview + Download + Send ── */}
      {s === 'invoice_generated' && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-purple-500">🧾 Invoice Generated — Review & Send</p>
          {invoiceData ? (
            <div className="rounded-xl border border-purple-100 bg-purple-50 p-4 space-y-3">
              {/* Invoice summary */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-purple-400">Invoice Number</p>
                  <p className="text-xl font-bold font-mono text-purple-800 mt-0.5">{invoiceData.invoice_number}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-purple-400">Total Amount</p>
                  <p className="text-xl font-bold text-green-700 mt-0.5">₹{Number(invoiceData.total_amount).toLocaleString('en-IN')}</p>
                </div>
              </div>
              {/* GST breakdown */}
              <div className="grid grid-cols-3 gap-2 text-xs text-center">
                <div className="rounded-lg bg-white border border-purple-100 px-2 py-2">
                  <p className="text-purple-400 font-semibold mb-0.5">Base Amount</p>
                  <p className="font-bold text-gray-700">₹{Number(invoiceData.base_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="rounded-lg bg-white border border-purple-100 px-2 py-2">
                  <p className="text-purple-400 font-semibold mb-0.5">CGST 2.5%</p>
                  <p className="font-bold text-gray-700">₹{Number(invoiceData.cgst).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="rounded-lg bg-white border border-purple-100 px-2 py-2">
                  <p className="text-purple-400 font-semibold mb-0.5">SGST 2.5%</p>
                  <p className="font-bold text-gray-700">₹{Number(invoiceData.sgst).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                </div>
              </div>
              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-1">
                <a href={`/admin/invoices/${invoiceData.id}/print?key=${adminKey}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-white px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50 transition-colors">
                  <Download className="h-3.5 w-3.5" /> View / Download Invoice
                </a>
                {booking.customer_email ? (
                  <button onClick={sendInvoiceToCustomer} disabled={loading}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-40 transition-colors">
                    <Mail className="h-3.5 w-3.5" />
                    {loading ? 'Sending...' : `Send Invoice to Customer →`}
                  </button>
                ) : (
                  <button onClick={sendInvoiceToCustomer} disabled={loading}
                    className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100 disabled:opacity-40 transition-colors">
                    <CheckCircle className="h-3.5 w-3.5" />
                    {loading ? '...' : 'Mark Invoice as Sent →'}
                  </button>
                )}
              </div>
              {!booking.customer_email && (
                <p className="text-[10px] text-purple-400">⚠ No email on file — will mark as sent without emailing.</p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-purple-100 bg-purple-50 p-4 text-center">
              <p className="text-sm text-purple-500">Loading invoice details...</p>
            </div>
          )}
        </div>
      )}

      {/* ── INVOICE SENT: Schedule Pickup ── */}
      {s === 'invoice_sent' && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-green-500">✅ Invoice Sent — Schedule Customer Pickup</p>
          <div className="rounded-xl border border-orange-100 bg-orange-50 p-4 space-y-3">
            <p className="text-sm text-orange-700">Invoice has been sent. Coordinate with the customer to schedule bag pickup.</p>
            <button onClick={() => patchBooking({ status: 'pickup_scheduled' })} disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-40 transition-colors">
              <Calendar className="h-4 w-4" />
              {loading ? 'Updating...' : 'Pickup Scheduled →'}
            </button>
          </div>
        </div>
      )}

      {/* ── PICKUP SCHEDULED: Confirm bags collected ── */}
      {s === 'pickup_scheduled' && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-violet-500">📅 Pickup Scheduled — Confirm When Collected</p>
          <div className="rounded-xl border border-violet-100 bg-violet-50 p-4 space-y-3">
            <p className="text-sm text-violet-700">Once your team has collected the bags from the customer, mark them as picked up.</p>
            <button onClick={() => patchBooking({ status: 'picked_up' })} disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-40 transition-colors">
              <Package className="h-4 w-4" />
              {loading ? 'Updating...' : 'Bags Picked Up →'}
            </button>
          </div>
        </div>
      )}

      {/* ── PICKED UP: Mark in transit ── */}
      {s === 'picked_up' && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-500">📦 Bags Picked Up — Mark In Transit</p>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
            <p className="text-sm text-blue-700">Bags have been collected. Mark as in transit once the shipment is on the way.</p>
            <button onClick={() => patchBooking({ status: 'in_transit' })} disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-40 transition-colors">
              <Truck className="h-4 w-4" />
              {loading ? 'Updating...' : 'In Transit →'}
            </button>
          </div>
        </div>
      )}

      {/* ── IN TRANSIT: Out for delivery ── */}
      {s === 'in_transit' && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-600">🚚 In Transit — Mark Out for Delivery</p>
          <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-4 space-y-3">
            <p className="text-sm text-cyan-700">Shipment is in transit. Mark as out for delivery when the delivery agent is on the way to the customer.</p>
            <button onClick={() => patchBooking({ status: 'out_for_delivery' })} disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-cyan-700 disabled:opacity-40 transition-colors">
              <Truck className="h-4 w-4" />
              {loading ? 'Updating...' : 'Out for Delivery →'}
            </button>
          </div>
        </div>
      )}

      {/* ── OUT FOR DELIVERY: Confirm delivery ── */}
      {s === 'out_for_delivery' && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-500">🛵 Out for Delivery — Confirm Delivered</p>
          <div className="rounded-xl border border-orange-100 bg-orange-50 p-4 space-y-3">
            <p className="text-sm text-orange-700">Delivery agent is on the way. Mark as delivered once bags reach the customer.</p>
            <button onClick={() => patchBooking({ status: 'delivered' })} disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-40 transition-colors">
              <CheckCircle className="h-4 w-4" />
              {loading ? 'Updating...' : 'Delivered ✓'}
            </button>
          </div>
        </div>
      )}

      {/* ── DELIVERED: Create trip sheet ── */}
      {s === 'delivered' && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-green-600">🎉 Delivered — Create Trip Sheet</p>
          <div className="rounded-xl border border-green-100 bg-green-50 p-4 space-y-3">
            <p className="text-sm text-green-700">
              Bags delivered. Now create a trip sheet to log delivery expenses for this booking.
            </p>
            <Link href="/admin/trip-sheets/new"
              onClick={async (e) => {
                e.preventDefault()
                await patchBooking({ status: 'trip_created' })
                window.location.href = '/admin/trip-sheets/new'
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors">
              <Truck className="h-4 w-4" /> Create Trip Sheet →
            </Link>
          </div>
        </div>
      )}

      {/* ── TRIP SHEET CREATED: Mark completed ── */}
      {s === 'trip_created' && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-600">📋 Trip Sheet Created — Close Booking</p>
          <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-4 space-y-3">
            <p className="text-sm text-cyan-700">
              Trip sheet has been created and expenses logged. Mark this booking as completed to close it.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/trip-sheets/new"
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-200 bg-white px-4 py-2.5 text-sm font-semibold text-cyan-700 hover:bg-cyan-50 transition-colors">
                <Truck className="h-3.5 w-3.5" /> View / Edit Trip Sheet
              </Link>
              <button onClick={() => patchBooking({ status: 'completed' })} disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-40 transition-colors">
                <CheckCircle className="h-4 w-4" />
                {loading ? '...' : 'Mark Completed ✓'}
              </button>
            </div>
          </div>
        </div>
      )}

      {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{err}</p>}
      {msg && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-600">{msg}</p>}
    </div>
  )
}

// ── Workflow back-navigation ─────────────────────────────────────
// Linear "happy-path" order. Terminal/branch statuses are excluded.
const STATUS_ORDER = [
  'inquiry',
  'quote_created',
  'quote_sent',
  'accepted',
  'payment_pending',
  'payment_received',
  'payment_approved',
  'confirmed',
  'invoice_generated',
  'invoice_sent',
  'pickup_scheduled',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'trip_created',
  'completed',
] as const

const SORT_OPTIONS = [
  { value: 'newest',    label: 'Newest First' },
  { value: 'oldest',   label: 'Oldest First' },
  { value: 'date_desc',label: 'Date (Newest → Oldest)' },
  { value: 'date_asc', label: 'Date (Oldest → Newest)' },
  { value: 'updated',  label: 'Recently Updated' },
  { value: 'name_asc', label: 'Customer Name (A–Z)' },
  { value: 'name_desc',label: 'Customer Name (Z–A)' },
]

function sortBookings(arr: Booking[], sortBy: string): Booking[] {
  return [...arr].sort((a, b) => {
    switch (sortBy) {
      case 'oldest':    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      case 'date_desc': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      case 'date_asc':  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      case 'updated':   return new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime()
      case 'name_asc':  return (a.customer_name ?? '').localeCompare(b.customer_name ?? '')
      case 'name_desc': return (b.customer_name ?? '').localeCompare(a.customer_name ?? '')
      default:          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime() // newest
    }
  })
}

export default function AdminDashboard() {
  const router = useRouter()
  const [adminKey, setAdminKey]       = useState('')
  const [authed, setAuthed]           = useState(false)
  const [stats, setStats]             = useState<Stats | null>(null)
  const [bookings, setBookings]       = useState<Booking[]>([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [filter, setFilter]           = useState('all')
  const [phaseFilter, setPhaseFilter] = useState('all')
  // Set when a Dashboard Analytics / Monthly Inquiry Statistics KPI card is
  // clicked — takes over the bookings-table query in fetchData below,
  // independent of the filter/phaseFilter dropdown-and-pills. Cleared
  // whenever those dropdowns/pills are used manually.
  const [kpiView, setKpiView]         = useState<KpiView | null>(null)
  const [sort, setSort]               = useState('newest')
  const [expanded, setExpanded]       = useState<string | null>(null)
  const [editTarget, setEditTarget]   = useState<Booking | null>(null)
  const [crmStats, setCrmStats]       = useState<{
    total_leads: number; unbooked_leads: number; pending_quotes: number; today_dispatch: number
    revenue_this_month: number
  } | null>(null)
  // Sales Follow-up & Reminder System — see
  // app/api/admin/sales-followup-summary/route.ts + lib/sales-followup-reminders.ts.
  // Independent, self-contained endpoint — doesn't touch dashboard-analytics.
  const [followupSummary, setFollowupSummary] = useState<{
    quotesPending: number; followupPending: number
    overdueQuotes: number; overdueFollowups: number
    todaysFollowups: number; tomorrowsFollowups: number
  } | null>(null)
  // ── Revenue Report — period selector (Current Month / Last Month /
  // Custom Range / Select Month). Independent of the main fetchData/
  // crmStats poll above (which always reports the true current month via
  // revenue_this_month) — this hits app/api/admin/crm-stats's optional
  // date_from/date_to params to compute revenue for whatever period is
  // selected here. Same "paid" definition as Revenue This Month, just a
  // different window.
  const [revenuePeriod, setRevenuePeriod] = useState<'current' | 'last' | 'custom' | 'month'>('current')
  const [revenueCustomFrom, setRevenueCustomFrom] = useState('')
  const [revenueCustomTo,   setRevenueCustomTo]   = useState('')
  const [revenueMonth,      setRevenueMonth]       = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [revenueReport, setRevenueReport] = useState<{ amount: number; count: number } | null>(null)
  const [revenueLoading, setRevenueLoading] = useState(false)
  // Single source of truth for "how many inquiries do we actually have" —
  // see app/api/admin/dashboard-analytics/route.ts. Counts each lead once
  // (a lead is created for every inquiry regardless of source — website,
  // contact form, admin entry, Skybird — and a booking never exists without
  // one), bucketed by its linked booking's status.
  const [analytics, setAnalytics] = useState<{
    total_inquiries: number; total_completed: number; total_active: number
    total_pending: number; total_cancelled: number; total_rejected: number
    current_month_total_inquiries: number; last_month_total_inquiries: number
    current_month_completed: number; last_month_completed: number
    debug?: {
      leads_total_including_deleted: number; soft_deleted_count: number; deleted_at_supported: boolean
      bookings_total: number; bookings_without_lead: number
    }
  } | null>(null)
  const [tripStats, setTripStats]     = useState<{
    total: number; active: number; delivered: number
    totalIncome: number; totalExpense: number; netProfit: number
  } | null>(null)
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(20)

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key)
    setAuthed(true)
    // Restore sort preference
    const savedSort = sessionStorage.getItem('bagdrop_dashboard_sort')
    if (savedSort) setSort(savedSort)
  }, [router])

  function handleSortChange(val: string) {
    setSort(val)
    sessionStorage.setItem('bagdrop_dashboard_sort', val)
  }

  const fetchData = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    let qs = '?key=' + adminKey
    if (kpiView) {
      // KPI card click — overrides filter/phaseFilter entirely.
      if (kpiView.statuses) qs += '&statuses=' + kpiView.statuses.join(',')
      if (kpiView.requireQuote) qs += '&require_quote=true'
      if (kpiView.month) {
        const { from, to } = monthWindowISO(kpiView.month === 'current' ? 0 : -1)
        qs += '&date_from=' + encodeURIComponent(from) + '&date_to=' + encodeURIComponent(to)
      }
      if (kpiView.completedMonth) {
        const { from, to } = monthWindowDateOnly(kpiView.completedMonth === 'current' ? 0 : -1)
        qs += '&completed_from=' + encodeURIComponent(from) + '&completed_to=' + encodeURIComponent(to)
      }
    } else if (filter === 'cancelled') {
      // Explicitly requested — show cancelled
      qs += '&status=cancelled'
    } else if (filter !== 'all') {
      qs += '&status=' + filter
    } else if (phaseFilter !== 'all') {
      const phase = WORKFLOW_PHASES.find(p => p.label === phaseFilter)
      if (phase) qs += '&statuses=' + phase.statuses.join(',')
    } else {
      // Default: hide cancelled from normal view
      qs += '&exclude_status=cancelled'
    }
    if (search) qs += '&search=' + encodeURIComponent(search)

    const [sr, br, cr, tr, ar, fr] = await Promise.all([
      fetch('/api/admin/stats?key=' + adminKey),
      fetch('/api/admin/bookings' + qs),
      fetch('/api/admin/crm-stats?key=' + adminKey),
      fetch('/api/admin/trip-sheets?limit=200&key=' + adminKey),
      fetch('/api/admin/dashboard-analytics?key=' + adminKey),
      fetch('/api/admin/sales-followup-summary?key=' + adminKey),
    ])
    if (sr.ok) setStats(await sr.json())
    if (br.ok) setBookings((await br.json()).bookings ?? [])
    if (cr.ok) setCrmStats(await cr.json())
    if (ar.ok) setAnalytics(await ar.json())
    if (fr.ok) setFollowupSummary(await fr.json())
    if (tr.ok) {
      const td = await tr.json()
      const sheets = td.trip_sheets ?? []
      // totalIncome/totalExpense computed once and netProfit derived
      // directly from those two variables (rather than three separate
      // .reduce() passes over `sheets`) — was previously recomputing income
      // and expense a second time inline for the netProfit line, which
      // *should* always agree with the totalIncome/totalExpense cards next
      // to it, but any future edit to one sum without the other risked the
      // three drifting apart, exactly matching the reported Dashboard vs.
      // Trip Sheets page mismatch. Also coerces with Number(...) — Postgres
      // numeric columns can come back from Supabase as strings, and
      // `sum + (s.total_income || 0)` silently does string concatenation
      // instead of addition when that happens. Number(...) guarantees a
      // real numeric sum either way. Now uses the exact same
      // totalIncome - totalExpense formula as app/(admin)/admin/trip-sheets/page.tsx.
      const totalIncome  = sheets.reduce((sum: number, s: Record<string, unknown>) => sum + (Number(s.total_income)  || 0), 0)
      const totalExpense = sheets.reduce((sum: number, s: Record<string, unknown>) => sum + (Number(s.total_expense) || 0), 0)
      setTripStats({
        total:        sheets.length,
        active:       sheets.filter((s: Record<string,string>) => !['completed','cancelled','delivered'].includes(s.status)).length,
        delivered:    sheets.filter((s: Record<string,string>) => ['delivered','completed'].includes(s.status)).length,
        totalIncome,
        totalExpense,
        netProfit:    totalIncome - totalExpense,
      })
    }
    setLoading(false)
  }, [adminKey, filter, phaseFilter, search, kpiView])

  useEffect(() => { if (authed) fetchData() }, [authed, fetchData])

  // Reset to page 1 whenever filters, search, sort, or the active KPI view changes
  useEffect(() => { setPage(1) }, [filter, phaseFilter, search, sort, pageSize, kpiView])

  // ── Revenue Report — resolves the selected period into a date_from/
  // date_to window and fetches the paid-bookings total for it.
  const fetchRevenueReport = useCallback(async () => {
    if (!adminKey) return
    let from: string
    let to: string | null = null
    if (revenuePeriod === 'current') {
      const w = monthWindowISO(0); from = w.from; to = w.to
    } else if (revenuePeriod === 'last') {
      const w = monthWindowISO(-1); from = w.from; to = w.to
    } else if (revenuePeriod === 'month') {
      if (!revenueMonth) return
      const [y, m] = revenueMonth.split('-').map(Number)
      from = new Date(y, m - 1, 1).toISOString()
      to   = new Date(y, m, 1).toISOString()
    } else {
      // custom range — "to" is inclusive of the whole selected day, so the
      // exclusive upper bound is one day past it.
      if (!revenueCustomFrom) return
      from = new Date(revenueCustomFrom).toISOString()
      to   = revenueCustomTo ? new Date(new Date(revenueCustomTo).getTime() + 86400000).toISOString() : null
    }
    setRevenueLoading(true)
    let qs = '?key=' + adminKey + '&date_from=' + encodeURIComponent(from)
    if (to) qs += '&date_to=' + encodeURIComponent(to)
    const res = await fetch('/api/admin/crm-stats' + qs)
    if (res.ok) {
      const d = await res.json()
      setRevenueReport({ amount: d.revenue_period_amount ?? 0, count: d.revenue_period_count ?? 0 })
    }
    setRevenueLoading(false)
  }, [adminKey, revenuePeriod, revenueCustomFrom, revenueCustomTo, revenueMonth])

  useEffect(() => { if (authed) fetchRevenueReport() }, [authed, fetchRevenueReport])

  if (!authed) return null

  // ── Pagination derived values ──────────────────────────────────
  const sortedBookings = sortBookings(bookings, sort)
  const totalPages     = Math.max(1, Math.ceil(sortedBookings.length / pageSize))
  const pagedBookings  = sortedBookings.slice((page - 1) * pageSize, page * pageSize)
  const showingFrom    = sortedBookings.length === 0 ? 0 : (page - 1) * pageSize + 1
  const showingTo      = Math.min(page * pageSize, sortedBookings.length)

  const phases = ['all', ...WORKFLOW_PHASES.map(p => p.label)]

  return (
    <>
      {editTarget && (
        <EditModal
          booking={editTarget}
          adminKey={adminKey}
          onSaved={() => { setEditTarget(null); fetchData() }}
                 onClose={() => setEditTarget(null)}
        />
      )}

      <div className="border-b border-orange-100 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Dashboard &amp; Bookings</h1>
        <p className="mt-0.5 text-sm text-gray-400">Full booking lifecycle management</p>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">

        {/* Group / Wedding Booking module — standalone link card,
            deliberately NOT wired into the Dashboard Analytics KPI grid
            below (that grid is driven by app/api/admin/dashboard-analytics/
            route.ts's per-lead counts; a Group Booking is one lead/booking
            regardless of its guest/bag count, so it's already included in
            every number there — this card is purely a visibility/shortcut
            addition, touching none of that existing logic). */}
        <a href="/admin/group-bookings"
          className="mb-6 flex items-center justify-between rounded-xl border border-pink-100 bg-pink-50 px-5 py-3.5 text-sm shadow-sm hover:bg-pink-100 transition-colors">
          <span className="font-semibold text-pink-800">Group / Wedding Bookings — large multi-guest bookings with individual bag tracking</span>
          <span className="font-bold text-pink-700">Open →</span>
        </a>

        {/* Dashboard Analytics — unified inquiry KPIs. Single source of truth:
            app/api/admin/dashboard-analytics/route.ts counts each lead once
            (the Dashboard and Leads tabs describe the same inquiries — a
            lead is created for every inquiry regardless of source, and a
            booking never exists without one), bucketed by its linked
            booking's status. All-time. Every card below is clickable and
            filters the bookings table further down to exactly the records
            behind that number. */}
        <div className="mb-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">Dashboard Analytics</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              {
                label: 'Total Inquiries', value: analytics?.total_inquiries ?? '—',
                icon: <Users className="h-4 w-4" />, color: '#2563eb', bg: '#dbeafe',
                href: '/admin/leads' as string | undefined, onClick: undefined as (() => void) | undefined,
              },
              {
                label: 'Total Completed Bookings', value: analytics?.total_completed ?? '—',
                icon: <CheckCircle className="h-4 w-4" />, color: '#16a34a', bg: '#dcfce7',
                href: undefined as string | undefined,
                onClick: () => { setKpiView(null); setPhaseFilter('all'); setFilter('completed') },
              },
              {
                label: 'Total Confirmed Bookings', value: analytics?.total_active ?? '—',
                icon: <Truck className="h-4 w-4" />, color: '#0891b2', bg: '#cffafe',
                href: undefined as string | undefined,
                onClick: () => { setFilter('all'); setPhaseFilter('all'); setKpiView({ statuses: ACTIVE_BOOKING_STATUSES, label: 'Total Confirmed Bookings', requireQuote: true }) },
              },
              {
                label: 'Total Pending Inquiries', value: analytics?.total_pending ?? '—',
                icon: <Clock className="h-4 w-4" />, color: '#d97706', bg: '#fef3c7',
                href: undefined as string | undefined,
                onClick: () => { setFilter('all'); setPhaseFilter('all'); setKpiView({ statuses: PENDING_BOOKING_STATUSES, label: 'Total Pending Inquiries' }) },
              },
              {
                label: 'Total Rejected', value: analytics?.total_rejected ?? '—',
                icon: <X className="h-4 w-4" />, color: '#dc2626', bg: '#fee2e2',
                href: undefined as string | undefined,
                onClick: () => { setFilter('all'); setPhaseFilter('all'); setKpiView({ statuses: REJECTED_BOOKING_STATUSES, label: 'Quote Rejected' }) },
              },
              {
                label: 'Revenue This Month',
                value: crmStats
                  ? ('Rs.' + crmStats.revenue_this_month.toLocaleString('en-IN', { maximumFractionDigits: 0 }))
                  : '—',
                icon: <IndianRupee className="h-4 w-4" />, color: '#7c3aed', bg: '#ede9fe',
                href: '/admin/customers' as string | undefined, onClick: undefined as (() => void) | undefined,
              },
            ].map(c => {
              const body = (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 leading-tight">{c.label}</p>
                    <div style={{ color: c.color, background: c.bg }} className="rounded-lg p-1.5 shrink-0">{c.icon}</div>
                  </div>
                  <p className="mt-1.5 text-lg font-bold text-gray-900">{c.value}</p>
                </>
              )
              if (c.onClick) {
                return (
                  <button key={c.label} onClick={c.onClick}
                    className="rounded-xl border border-gray-100 bg-white p-3 text-left shadow-sm hover:border-orange-200 transition-colors">
                    {body}
                  </button>
                )
              }
              return (
                <Link key={c.label} href={c.href!}
                  className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm hover:border-orange-200 transition-colors">
                  {body}
                </Link>
              )
            })}
          </div>

          {/* Monthly Inquiry Statistics — same unified dataset, split by the
              originating lead's created_at (This Month vs Last Month). Also
              clickable — filters the bookings table by the same calendar
              month plus (for the two "Completed" cards) status=completed. */}
          <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-widest text-gray-400">Monthly Inquiry Statistics</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: 'Current Month Total Inquiries', value: analytics?.current_month_total_inquiries ?? '—',
                color: '#2563eb', bg: '#dbeafe',
                onClick: () => { setFilter('all'); setPhaseFilter('all'); setKpiView({ month: 'current' as const, statuses: NON_REJECTED_STATUSES, label: 'Current Month Total Inquiries' }) },
              },
              {
                label: 'Current Month Completed Bookings', value: analytics?.current_month_completed ?? '—',
                color: '#16a34a', bg: '#dcfce7',
                onClick: () => { setFilter('all'); setPhaseFilter('all'); setKpiView({ completedMonth: 'current' as const, statuses: ['completed'], label: 'Current Month Completed Bookings' }) },
              },
              {
                label: 'Last Month Total Inquiries', value: analytics?.last_month_total_inquiries ?? '—',
                color: '#0891b2', bg: '#cffafe',
                onClick: () => { setFilter('all'); setPhaseFilter('all'); setKpiView({ month: 'last' as const, statuses: NON_REJECTED_STATUSES, label: 'Last Month Total Inquiries' }) },
              },
              {
                label: 'Last Month Completed Bookings', value: analytics?.last_month_completed ?? '—',
                color: '#14532d', bg: '#bbf7d0',
                onClick: () => { setFilter('all'); setPhaseFilter('all'); setKpiView({ completedMonth: 'last' as const, statuses: ['completed'], label: 'Last Month Completed Bookings' }) },
              },
            ].map(c => (
              <button key={c.label} onClick={c.onClick}
                className="rounded-xl border border-gray-100 bg-white p-3 text-left shadow-sm hover:border-orange-200 transition-colors">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 leading-tight">{c.label}</p>
                <p className="mt-1.5 text-lg font-bold" style={{ color: c.color }}>{c.value}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Sales Follow-up — Automated reminder system summary. See
            app/api/admin/sales-followup-summary/route.ts +
            lib/sales-followup-reminders.ts. Each card links to the Leads
            tab pre-filtered to exactly those inquiries via the new
            ?followup= query param (app/(admin)/admin/leads/page.tsx). */}
        <div className="mb-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">Sales Follow-up</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Quotes Pending',     value: followupSummary?.quotesPending      ?? '—', color: '#d97706', bg: '#fef3c7', param: 'quotes_pending' },
              { label: 'Follow-up Pending',  value: followupSummary?.followupPending    ?? '—', color: '#ea580c', bg: '#ffedd5', param: 'followup_pending' },
              { label: 'Overdue Quotes',     value: followupSummary?.overdueQuotes      ?? '—', color: '#dc2626', bg: '#fee2e2', param: 'overdue_quotes' },
              { label: 'Overdue Follow-ups', value: followupSummary?.overdueFollowups   ?? '—', color: '#dc2626', bg: '#fee2e2', param: 'overdue_followups' },
              { label: "Today's Follow-ups", value: followupSummary?.todaysFollowups    ?? '—', color: '#2563eb', bg: '#dbeafe', param: 'today_followups' },
              { label: "Tomorrow's Follow-ups", value: followupSummary?.tomorrowsFollowups ?? '—', color: '#0891b2', bg: '#cffafe', param: 'tomorrow_followups' },
            ].map(c => (
              <Link key={c.label} href={`/admin/leads?followup=${c.param}`}
                className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm hover:border-orange-200 transition-colors">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 leading-tight">{c.label}</p>
                  <div style={{ color: c.color, background: c.bg }} className="rounded-lg p-1.5 shrink-0">
                    <Clock className="h-4 w-4" />
                  </div>
                </div>
                <p className="mt-1.5 text-lg font-bold text-gray-900">{c.value}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Revenue Report — period selector. Same "paid" definition as the
            Revenue This Month KPI card above, just over a chosen window.
            See fetchRevenueReport() / app/api/admin/crm-stats's optional
            date_from/date_to params. */}
        <div className="mb-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">Revenue Report</p>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap gap-2">
              {([
                { value: 'current', label: 'Current Month' },
                { value: 'last',    label: 'Last Month' },
                { value: 'custom',  label: 'Custom Range' },
                { value: 'month',   label: 'Select Month' },
              ] as const).map(o => (
                <button key={o.value} onClick={() => setRevenuePeriod(o.value)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    revenuePeriod === o.value
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>

            {revenuePeriod === 'custom' && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input type="date" value={revenueCustomFrom} onChange={e => setRevenueCustomFrom(e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
                <span className="text-xs text-gray-400">to</span>
                <input type="date" value={revenueCustomTo} onChange={e => setRevenueCustomTo(e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
              </div>
            )}

            {revenuePeriod === 'month' && (
              <div className="mb-3">
                <input type="month" value={revenueMonth} onChange={e => setRevenueMonth(e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
              </div>
            )}

            <div className="flex items-end gap-6">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Revenue</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {revenueLoading
                    ? '…'
                    : revenueReport
                      ? 'Rs.' + revenueReport.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })
                      : '—'}
                </p>
              </div>
              <div>
                {/* Sourced from the same "Paid" dataset as the Payments page
                    (see crm-stats/route.ts) — real payments.paid rows plus
                    synthetic entries for confirmed bookings paid without a
                    logged payment row. */}
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Paid Payments</p>
                <p className="mt-1 text-lg font-semibold text-gray-600">
                  {revenueLoading ? '…' : revenueReport?.count ?? '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Trip Operations quick stats */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Trip Operations</p>
            <Link href="/admin/trip-sheets" className="text-xs font-semibold text-orange-500 hover:text-orange-600">View all →</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Total Trips',   value: tripStats?.total ?? '—',    color: '#f97316', bg: '#fff7ed' },
              { label: 'Active Trips',  value: tripStats?.active ?? '—',   color: '#2563eb', bg: '#dbeafe' },
              { label: 'Delivered',     value: tripStats?.delivered ?? '—', color: '#16a34a', bg: '#dcfce7' },
              { label: 'Total Income',  value: tripStats ? '₹' + tripStats.totalIncome.toLocaleString('en-IN')  : '—', color: '#16a34a', bg: '#f0fdf4' },
              { label: 'Total Expense', value: tripStats ? '₹' + tripStats.totalExpense.toLocaleString('en-IN') : '—', color: '#dc2626', bg: '#fef2f2' },
              { label: 'Net Profit',    value: tripStats ? (tripStats.netProfit >= 0 ? '₹' : '-₹') + Math.abs(tripStats.netProfit).toLocaleString('en-IN') : '—', color: (tripStats?.netProfit ?? 0) >= 0 ? '#16a34a' : '#dc2626', bg: (tripStats?.netProfit ?? 0) >= 0 ? '#f0fdf4' : '#fef2f2' },
            ].map(c => (
              <Link key={c.label} href="/admin/trip-sheets"
                className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm hover:border-orange-200 transition-colors">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{c.label}</p>
                <p className="mt-1.5 text-lg font-bold" style={{ color: c.color }}>{c.value}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Active KPI card filter — shown when a Dashboard Analytics / Monthly
            Inquiry Statistics card above has been clicked. */}
        {kpiView && (
          <div className="mb-3 flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700">
            <span>Showing: {kpiView.label}</span>
            <button onClick={() => setKpiView(null)} className="text-orange-500 underline hover:text-orange-700">
              Clear filter
            </button>
          </div>
        )}

        {/* Workflow phase filter pills */}
        <div className="mb-3 flex flex-wrap gap-2">
          {phases.map(p => (
            <button key={p} onClick={() => { setPhaseFilter(p); setFilter('all'); setKpiView(null) }}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                phaseFilter === p
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {p === 'all' ? 'All Phases' : p}
            </button>
          ))}
        </div>

        {/* Search + status filter + sort */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search by name, phone, or tracking ID..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 shadow-sm placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
          </div>
          <div className="relative">
            <select value={filter} onChange={e => { setFilter(e.target.value); setPhaseFilter('all'); setKpiView(null) }}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-gray-700 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400">
              <option value="all">All statuses</option>
              {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                <option key={val} value={val}>{cfg.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
          <div className="relative">
            <ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <select value={sort} onChange={e => handleSortChange(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-8 text-sm font-medium text-gray-700 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400">
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
          <button onClick={fetchData}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        {/* Bookings table */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
            </div>
          ) : bookings.length === 0 ? (
            <div className="py-24 text-center text-sm text-gray-400">No bookings found</div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['Tracking', 'Customer', 'Route', 'Source', 'Service', 'Pickup Date', 'Bags', 'Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pagedBookings.map(b => (
                    <Fragment key={b.id}>
                      <tr onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                        className="cursor-pointer hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-xs font-bold text-orange-600">{b.tracking_id}</span>
                            {b.tracking_id?.startsWith('BDA-') && (
                              <>
                                {/* Derive lead number from booking tracking ID: BDA-2026-0001 → BDL-2026-0001 */}
                                <span className="font-mono text-[10px] text-blue-600 font-semibold">
                                  {b.tracking_id.replace(/^BDA-/, 'BDL-')}
                                </span>
                                {!b.lead_id && (
                                  <span className="inline-flex w-fit items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">
                                    <Users className="h-2.5 w-2.5" /> Lead
                                  </span>
                                )}
                              </>
                            )}
                            {/* Preview/Edit Quote — previously only shown for
                                BDA-prefixed bookings, which hid it for the
                                large majority of real (BD-prefixed website)
                                bookings that also have a quote. Now shown for
                                any booking with a lead_id. Both point at the
                                existing quote pages (no new pages built) —
                                Preview opens the same view the customer's
                                quote link shows; Edit reuses the same
                                lead_id+edit=true route the Leads tab's own
                                Edit Quote pencil button already uses, so
                                editing here can't create a duplicate lead or
                                reset the booking's workflow status/history. */}
                            {b.lead_id && (
                              <div className="flex gap-1">
                                <Link href={`/admin/quotes/view/${b.lead_id}`}
                                  className="inline-flex w-fit items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
                                  onClick={e => e.stopPropagation()}>
                                  <FileText className="h-2.5 w-2.5" /> Preview Quote
                                </Link>
                                <Link href={`/admin/quotes/new?lead_id=${b.lead_id}&edit=true`}
                                  className="inline-flex w-fit items-center gap-0.5 rounded-full bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                                  onClick={e => e.stopPropagation()}>
                                  <Pencil className="h-2.5 w-2.5" /> Edit Quote
                                </Link>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-gray-900">{formatCustomerName(b.title, b.customer_name) || b.customer_name}</p>
                          <p className="text-xs text-gray-400">{formatDate(b.created_at)}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {b.from_city} &rarr; {b.to_city}
                        </td>
                        <td className="px-4 py-3">
                          {/* Source of truth: the linked lead's real `source`
                              value (leads.source), attached server-side in
                              app/api/admin/bookings/route.ts — NOT a guess
                              from the tracking_id prefix. `bookings` has no
                              source column of its own; the old prefix-based
                              heuristic here mislabeled every website/
                              contact-form inquiry as "Lead" even though the
                              Leads tab (reading leads.source directly)
                              correctly showed "Website" for the same
                              inquiry. See lib/lead-source.ts for the full
                              writeup — this must stay in sync with the
                              Leads table's own source rendering (app/
                              (admin)/admin/leads/page.tsx), which resolves
                              through the same SOURCE_LABELS map. */}
                          {(() => {
                            const src = resolveSource(b.source)
                            return (
                              <span style={{ color: src.color, background: src.bg }}
                                className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap">
                                {src.label}
                              </span>
                            )
                          })()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{b.service_label}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{formatDateOnly(b.pickup_date)}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">{b.total_bags}</td>
                        <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                      </tr>
                      {expanded === b.id && (
                        <tr className="bg-orange-50/40">
                          <td colSpan={8} className="px-4 py-5">
                            <div className="flex flex-wrap items-start gap-4">

                              {/* ── Booking details grid ── */}
                              <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4 min-w-0">
                                <DetailRow icon={<Phone className="h-3.5 w-3.5 text-orange-500" />}       label="Phone"      val={b.customer_phone || 'Not provided'} />
                                <DetailRow icon={<Mail className="h-3.5 w-3.5 text-orange-500" />}        label="Email"      val={b.customer_email || 'Not provided'} />
                                <DetailRow icon={<Clock className="h-3.5 w-3.5 text-orange-500" />}       label="Time Slot"  val={b.time_slot || 'Not specified'} />
                                <DetailRow icon={<Hash className="h-3.5 w-3.5 text-orange-500" />}        label="Booking ID" val={b.id.slice(0, 8) + '...'} />
                                {b.pickup_address && <DetailRow icon={<MapPin className="h-3.5 w-3.5 text-orange-500" />}   label="Pickup"   val={b.pickup_address} />}
                                {b.drop_address   && <DetailRow icon={<MapPin className="h-3.5 w-3.5 text-orange-500" />}   label="Drop"     val={b.drop_address} />}
                                {b.notes          && <DetailRow icon={<Calendar className="h-3.5 w-3.5 text-orange-500" />} label="Notes"    val={b.notes} />}
                                {/* Cancellation record — read back from status_history
                                    (see lastHistoryEntryTo above), not a dedicated column.
                                    Only ever shown once b.status is actually 'cancelled',
                                    so this never appears for an active booking. */}
                                {b.status === 'cancelled' && (() => {
                                  const entry = lastHistoryEntryTo(b.status_history, 'cancelled')
                                  return (
                                    <>
                                      <DetailRow icon={<X className="h-3.5 w-3.5 text-red-500" />} label="Cancellation Reason"
                                        val={entry?.note || 'Not recorded'} />
                                      <DetailRow icon={<Clock className="h-3.5 w-3.5 text-red-500" />} label="Cancelled At"
                                        val={entry?.timestamp ? new Date(entry.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'} />
                                    </>
                                  )
                                })()}
                              </div>

                              {/* —— Right panel: Actions only —— */}
                              <div className="flex shrink-0 flex-col gap-3 min-w-[160px]">

                                {/* General actions */}
                                <div className="flex flex-col gap-2">
                                  <button
                                    onClick={e => { e.stopPropagation(); setEditTarget(b) }}
                                    className="flex items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 py-2 text-xs font-semibold text-orange-600 shadow-sm hover:bg-orange-50 hover:border-orange-400 transition-colors">
                                    <Pencil className="h-3.5 w-3.5" />
                                    {STATUS_CONFIG[b.status]?.locked ? 'View Details' : 'Edit Booking'}
                                  </button>
                                  <Link
                                    // Passes this exact inquiry through to the Leads tab so it opens
                                    // already scrolled-to and highlighted — see the open_booking_id/
                                    // open_lead_id handling in app/(admin)/admin/leads/page.tsx.
                                    // booking_id is always present and reliably linked (leads.booking_id
                                    // is the maintained direction — see app/api/admin/leads/route.ts's
                                    // comment); lead_id is included too when the booking happens to have
                                    // it, as a second, redundant way to resolve the same lead.
                                    href={`/admin/leads?open_booking_id=${encodeURIComponent(b.id)}${b.lead_id ? `&open_lead_id=${encodeURIComponent(b.lead_id)}` : ''}`}
                                    onClick={e => e.stopPropagation()}
                                    className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors">
                                    <FileText className="h-3.5 w-3.5" />
                                    Manage in Leads →
                                  </Link>
                                </div>

                                {/* Cancel Booking — unconfirmed inquiries only (founder
                                    spec 2026-08-31): lets Admin manually close an inquiry
                                    we can't/won't fulfill (out of service area, route
                                    unsupported, customer declined, etc.) with a required
                                    reason, instead of leaving it sitting as a stale
                                    inquiry forever. Component itself refuses to render
                                    outside UNCONFIRMED_BOOKING_STATUSES as a defensive
                                    backstop — this wrapper condition is the primary gate.
                                    Deliberately does NOT appear for confirmed/ongoing/
                                    completed bookings — see components/admin/
                                    CancelBookingPanel.tsx's module comment. */}
                                {UNCONFIRMED_BOOKING_STATUSES.includes(b.status) && (
                                  <div onClick={e => e.stopPropagation()}>
                                    <CancelBookingPanel
                                      adminKey={adminKey}
                                      target={{ bookingId: b.id, bookingStatus: b.status, trackingId: b.tracking_id }}
                                      onCancelled={fetchData}
                                    />
                                  </div>
                                )}

                                {/* Follow Up — Quote Created / Quote Sent only, per spec.
                                    Purely an extra manual communication option: never
                                    changes b.status, payment status, or sends any other
                                    notification. See FollowUpPanel above. */}
                                {(b.status === 'quote_created' || b.status === 'quote_sent') && (
                                  <div onClick={e => e.stopPropagation()}>
                                    <FollowUpPanel
                                      adminKey={adminKey}
                                      target={{
                                        bookingId: b.id,
                                        refLabel: b.tracking_id,
                                        title: b.title,
                                        name: b.customer_name,
                                        phone: b.customer_phone || null,
                                        email: b.customer_email || null,
                                        pickupLocation: b.pickup_address || b.from_city,
                                        deliveryLocation: b.drop_address || b.to_city,
                                      }}
                                    />
                                  </div>
                                )}

                                {/* Review — Completed bookings only, per founder spec
                                    (2026-08-22). Purely an extra manual action: never
                                    changes b.status, payment status, or triggers any
                                    existing workflow, and never interferes with the
                                    Follow Up action above (mutually exclusive statuses
                                    anyway). See components/admin/ReviewPanel.tsx. */}
                                {b.status === 'completed' && (
                                  <div onClick={e => e.stopPropagation()}>
                                    <ReviewPanel
                                      adminKey={adminKey}
                                      target={{
                                        bookingId: b.id,
                                        bookingStatus: b.status,
                                        title: b.title,
                                        name: b.customer_name,
                                        phone: b.customer_phone || null,
                                        email: b.customer_email || null,
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Pagination controls ── */}
            <div className="flex flex-col items-center gap-3 border-t border-gray-100 px-4 py-3 sm:flex-row sm:justify-between">
              {/* Left: count + page size selector */}
              <div className="flex items-center gap-3 text-sm text-gray-500">
                {sortedBookings.length > 0 ? (
                  <span>Showing <strong className="text-gray-700">{showingFrom}–{showingTo}</strong> of <strong className="text-gray-700">{sortedBookings.length}</strong> bookings</span>
                ) : (
                  <span>0 bookings</span>
                )}
                <div className="relative">
                  <select
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                    className="appearance-none rounded-lg border border-gray-200 bg-white py-1.5 pl-3 pr-7 text-xs font-medium text-gray-600 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                  >
                    <option value={20}>20 / page</option>
                    <option value={50}>50 / page</option>
                    <option value={100}>100 / page</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
                </div>
              </div>

              {/* Right: page buttons */}
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Prev
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(n => n === 1 || n === totalPages || (n >= page - 2 && n <= page + 2))
                    .map((n, idx, arr) => (
                      <Fragment key={n}>
                        {idx > 0 && arr[idx - 1] !== n - 1 && (
                          <span className="px-1 text-xs text-gray-400">…</span>
                        )}
                        <button
                          onClick={() => setPage(n)}
                          className={`min-w-[32px] rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                            page === n
                              ? 'border-orange-400 bg-orange-500 text-white'
                              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {n}
                        </button>
                      </Fragment>
                    ))}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
            </>
          )}
        </div>

        {/* Workflow reference strip */}
        <div className="mt-6 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400">Booking Workflow</p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {Object.entries(STATUS_CONFIG).map(([key, cfg], i, arr) => (
              <Fragment key={key}>
                <span style={{ color: cfg.color, background: cfg.bg }}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold">
                  {cfg.icon}{cfg.label}
                  {cfg.locked && <Lock className="h-2.5 w-2.5" />}
                </span>
                {i < arr.length - 1 && <span className="text-gray-300">&rarr;</span>}
              </Fragment>
            ))}
          </div>
          <p className="mt-2 flex items-center gap-1 text-xs text-gray-400">
            <Lock className="h-3 w-3 text-green-700" />
            <span className="font-semibold text-green-700">Completed</span>
            &nbsp;status is locked &mdash; no further changes allowed.
          </p>
        </div>

        <p className="mt-3 text-center text-xs text-gray-400">
          Click any row to expand full booking details
        </p>
      </main>
    </>
  )
}
