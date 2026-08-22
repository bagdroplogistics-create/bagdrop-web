'use client'

// ============================================================================
// BAGDROP — Operations Center
//
// REWORKED 2026-08-22 per founder spec: this page now shows ONLY confirmed
// and upcoming bookings — the information the Operations Team needs to
// prepare and execute a booking. It answers one question: "what confirmed
// bookings are coming up, and what does Ops need to do for them?"
//
// Removed entirely (not hidden) vs. the previous version: the "Today's
// Inquiries" tab (lead/pre-confirmation data), the "Today's Operations" tab
// (duplicated the same bookings the main table already covers), the tab
// navigation itself, and every sales/financial summary widget (pending
// quotes, pending payments, monthly revenue, active partners, conversion
// rate). All of that is Leads-tab / Reports-Dashboard territory, neither of
// which this change touches. The backing route
// (app/api/admin/reports/operations/route.ts) now scopes every query to
// confirmed-through-trip_created bookings, so pre-confirmation and
// completed bookings can never reach this page even indirectly.
//
// "Driver Details Shared" relevance is gated by shouldShowDriverDetailsStep()
// (lib/service-type.ts) — Doorstep→Airport and Airport→Airport only — the
// same rule the Booking Workflow page and its PATCH route use, per the
// founder's explicit "keep existing service-type workflow rules" note.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle, RefreshCw, Loader2, Calendar, Link2, Unlink,
  ExternalLink, CheckCircle2, X, ListFilter,
} from 'lucide-react'
import { formatCustomerName } from '@/lib/constants'
import { shouldShowDriverDetailsStep } from '@/lib/service-type'

// ── Types (mirror the API response shape) ──────────────────────────────────
interface BookingLike {
  id: string; tracking_id: string; status: string
  title?: string | null
  customer_name: string | null; customer_phone: string | null
  service_type: string | null; service_label: string | null
  from_city: string | null; to_city: string | null
  pickup_address: string | null; drop_address: string | null
  pickup_date: string | null; delivery_date: string | null; time_slot: string | null
  total_bags: number | null; total_amount: number | null
  payment_status: string | null
  driver_name: string | null; driver_phone: string | null
  notes: string | null; pickup_instructions: string | null
  created_at: string
}
interface OverdueBooking extends BookingLike {
  overdue_reasons: Array<{ code: string; label: string }>
}
interface Alert { severity: 'high' | 'medium'; message: string; count: number }
interface CalendarStatus { connected: boolean; email: string | null; calendarId: string | null }
interface Widgets {
  todays_pickups: number; todays_deliveries: number
  delivered_today: number; upcoming_pickups_7d: number
}
interface OpsData {
  upcoming_bookings: BookingLike[]
  upcoming_range: { from: string; to: string | null; preset: string }
  overdue: OverdueBooking[]
  alerts: Alert[]
  widgets: Widgets
}

// Trimmed to only the statuses that can actually appear here (confirmed
// through trip_created) — inquiry/quote/payment/cancelled/rejected/completed
// statuses can never reach this page (see the API route), so they're
// deliberately not in this map.
const STATUS_LABEL: Record<string, string> = {
  confirmed:             'Confirmed',
  indemnity_bond_sent:   'Bond Sent',
  indemnity_bond_signed: 'Bond Signed',
  invoice_generated:     'Invoice Generated',
  invoice_sent:          'Invoice Sent',
  pickup_scheduled:      'Pickup Scheduled',
  picked_up:             'Picked Up',
  in_transit:            'In Transit',
  out_for_delivery:      'Out for Delivery',
  driver_details_shared: 'Driver Details Shared',
  delivered:             'Delivered',
  trip_created:          'Trip Sheet Created',
}
function statusLabel(s: string) { return STATUS_LABEL[s] ?? s }

const PAYMENT_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  paid:                 { label: 'Paid',            color: 'bg-green-100 text-green-700' },
  partially_paid:       { label: 'Partially Paid',  color: 'bg-orange-100 text-orange-700' },
  pending_verification: { label: 'Under Verification', color: 'bg-amber-100 text-amber-700' },
  approved_pending:     { label: 'Approved (Unpaid)', color: 'bg-amber-100 text-amber-700' },
  pending:              { label: 'Pending',          color: 'bg-gray-100 text-gray-600' },
  refunded:             { label: 'Refunded',         color: 'bg-purple-100 text-purple-700' },
}
function paymentBadge(status: string | null) {
  if (!status) return null
  const cfg = PAYMENT_STATUS_LABEL[status] ?? { label: status, color: 'bg-gray-100 text-gray-600' }
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.color}`}>{cfg.label}</span>
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
function daysUntil(pickupDate: string | null): number | null {
  if (!pickupDate) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const pickup = new Date(pickupDate + 'T00:00:00')
  return Math.round((pickup.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}
function truncate(s: string | null, n = 26): string {
  if (!s) return '—'
  return s.length > n ? s.slice(0, n) + '…' : s
}
function opsNotes(b: BookingLike): string | null {
  const parts: string[] = []
  if (b.notes?.trim()) parts.push(b.notes.trim())
  if (shouldShowDriverDetailsStep(b.service_type) && b.pickup_instructions?.trim()) {
    parts.push(`Pickup instructions: ${b.pickup_instructions.trim()}`)
  }
  return parts.length ? parts.join(' · ') : null
}

const RANGE_OPTS = [
  { value: 'all',       label: 'All Upcoming' },
  { value: 'today',     label: 'Today' },
  { value: 'tomorrow',  label: 'Tomorrow' },
  { value: 'next3',     label: 'Next 3 Days' },
  { value: 'next7',     label: 'Next 7 Days' },
  { value: 'custom',    label: 'Custom Range' },
]

export default function OperationsCenterPage() {
  const router = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [authed, setAuthed]     = useState(false)
  const [data, setData]         = useState<OpsData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [range, setRange]       = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')

  // ── Extra filters — client-side, applied over whatever the date-range
  // query already returned. Kept client-side deliberately: these are
  // conveniences for scanning an already-small confirmed/upcoming list, not
  // a reason to add more server round-trips. ──────────────────────────────
  const [showFilters, setShowFilters]     = useState(false)
  const [svcFilter, setSvcFilter]         = useState('')
  const [statusFilter, setStatusFilter]   = useState('')
  const [driverFilter, setDriverFilter]   = useState('')
  const [pickupQ, setPickupQ]             = useState('')
  const [deliveryQ, setDeliveryQ]         = useState('')

  // ── Google Calendar (shared "Bagdrop Ops" calendar) ──────────────────────
  const [calStatus, setCalStatus]   = useState<CalendarStatus | null>(null)
  const [calLoading, setCalLoading] = useState(false)
  const [calSyncing, setCalSyncing] = useState(false)
  const [calBanner, setCalBanner]   = useState('')

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)

    // The OAuth callback redirects back here with ?calendar_connected=1 or
    // ?calendar_error=<code> — surface it once, then clean the URL.
    const params = new URLSearchParams(window.location.search)
    if (params.get('calendar_connected')) setCalBanner('Google Calendar connected. Confirmed bookings will now sync automatically.')
    else if (params.get('calendar_error')) setCalBanner(`Google Calendar connection failed (${params.get('calendar_error')}). Please try again.`)
    if (params.has('calendar_connected') || params.has('calendar_error')) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [router])

  const fetchCalStatus = useCallback(async (key: string) => {
    if (!key) return
    setCalLoading(true)
    try {
      const res = await fetch(`/api/admin/google-calendar/status?key=${encodeURIComponent(key)}`)
      const json = await res.json().catch(() => null)
      if (res.ok && json) setCalStatus(json)
    } catch { /* non-fatal — card just shows "not connected" */ }
    setCalLoading(false)
  }, [])

  useEffect(() => { if (adminKey) fetchCalStatus(adminKey) }, [adminKey, fetchCalStatus])

  const handleCalConnect = () => {
    window.location.href = `/api/admin/google-calendar/connect?key=${encodeURIComponent(adminKey)}`
  }
  const handleCalDisconnect = async () => {
    if (!confirm('Disconnect the shared Bagdrop Ops calendar? New confirmed bookings will stop syncing until reconnected.')) return
    setCalLoading(true)
    try {
      await fetch(`/api/admin/google-calendar/disconnect?key=${encodeURIComponent(adminKey)}`, { method: 'POST' })
    } catch { /* ignore */ }
    await fetchCalStatus(adminKey)
  }
  const handleCalSyncNow = async () => {
    setCalSyncing(true)
    setCalBanner('')
    try {
      const res = await fetch(`/api/admin/google-calendar/sync-now?key=${encodeURIComponent(adminKey)}`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (res.ok) setCalBanner(`Synced ${json.synced ?? 0} of ${json.total ?? 0} upcoming confirmed bookings to the calendar.`)
      else setCalBanner(json?.error ?? 'Sync failed.')
    } catch {
      setCalBanner('Network error while syncing.')
    }
    setCalSyncing(false)
  }

  const fetchData = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ key: adminKey, range })
    if (range === 'custom' && customFrom && customTo) {
      params.set('from', customFrom); params.set('to', customTo)
    }
    try {
      const res = await fetch(`/api/admin/reports/operations?${params.toString()}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json?.error ?? 'Failed to load'); setData(null) }
      else setData(json)
    } catch {
      setError('Network error while loading the Operations Center.')
    }
    setLoading(false)
  }, [adminKey, range, customFrom, customTo])

  useEffect(() => { if (authed) fetchData() }, [authed, fetchData])

  // ── Distinct filter options, derived from whatever the date range
  // already returned (not hardcoded — matches whatever service types /
  // statuses / drivers actually exist in the current data). ──────────────
  const serviceTypeOptions = useMemo(() => {
    const set = new Set<string>()
    ;(data?.upcoming_bookings ?? []).forEach(b => { if (b.service_type) set.add(b.service_type) })
    return Array.from(set).sort()
  }, [data])
  const statusOptions = useMemo(() => {
    const set = new Set<string>()
    ;(data?.upcoming_bookings ?? []).forEach(b => set.add(b.status))
    return Array.from(set)
  }, [data])
  const driverOptions = useMemo(() => {
    const set = new Set<string>()
    ;(data?.upcoming_bookings ?? []).forEach(b => { if (b.driver_name) set.add(b.driver_name) })
    return Array.from(set).sort()
  }, [data])

  const filteredBookings = useMemo(() => {
    if (!data) return []
    return data.upcoming_bookings.filter(b => {
      if (svcFilter && b.service_type !== svcFilter) return false
      if (statusFilter && b.status !== statusFilter) return false
      if (driverFilter && b.driver_name !== driverFilter) return false
      if (pickupQ && !(`${b.pickup_address ?? ''} ${b.from_city ?? ''}`).toLowerCase().includes(pickupQ.toLowerCase())) return false
      if (deliveryQ && !(`${b.drop_address ?? ''} ${b.to_city ?? ''}`).toLowerCase().includes(deliveryQ.toLowerCase())) return false
      return true
    })
  }, [data, svcFilter, statusFilter, driverFilter, pickupQ, deliveryQ])

  const activeExtraFilters = [svcFilter, statusFilter, driverFilter, pickupQ, deliveryQ].filter(Boolean).length

  if (!authed || (loading && !data)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-orange-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Operations Center</h1>
            <p className="text-xs text-gray-500">Confirmed and upcoming bookings only — what Ops needs to prepare for and execute.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/reports" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50">
              ← Revenue Reports
            </Link>
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>
        )}

        {data && (
          <>
            {/* ── Needs Attention ── */}
            {data.alerts.length > 0 && (
              <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Needs Attention</p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {data.alerts.map((a, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium ${
                        a.severity === 'high'
                          ? 'border-red-200 bg-red-50 text-red-700'
                          : 'border-amber-200 bg-white text-amber-700'
                      }`}
                    >
                      <span>{a.message}</span>
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${a.severity === 'high' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}`}>
                        {a.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Overdue bookings — the actual rows behind the alerts above ── */}
            {data.overdue.length > 0 && (
              <div className="mb-5 overflow-hidden rounded-xl border border-red-200 bg-white shadow-sm">
                <div className="border-b border-red-100 bg-red-50 px-4 py-2.5">
                  <p className="text-xs font-bold text-red-700">⚠️ Overdue / Needs Action ({data.overdue.length})</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 text-left text-[10px] font-bold uppercase tracking-wide text-gray-400">
                        <th className="px-4 py-2.5">Customer</th>
                        <th className="px-4 py-2.5">Booking ID</th>
                        <th className="px-4 py-2.5">Route</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5">Pickup Date</th>
                        <th className="px-4 py-2.5">Issues</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.overdue.map(b => (
                        <tr
                          key={b.id}
                          onClick={() => router.push(`/admin?highlight=${b.id}`)}
                          className="cursor-pointer border-b border-red-50 bg-red-50/40 last:border-0 hover:bg-red-50"
                        >
                          <td className="px-4 py-3 font-medium text-gray-800">{(formatCustomerName(b.title, b.customer_name) || b.customer_name) ?? '—'}</td>
                          <td className="px-4 py-3 font-mono text-xs text-red-600">{b.tracking_id}</td>
                          <td className="px-4 py-3 text-xs text-gray-600">{b.from_city ?? '—'} → {b.to_city ?? '—'}</td>
                          <td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">{statusLabel(b.status)}</span></td>
                          <td className="px-4 py-3 text-xs text-gray-600">{fmtDate(b.pickup_date)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {b.overdue_reasons.map(r => (
                                <span key={r.code} className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">{r.label}</span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Summary — ops-only counts ── */}
            <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Today's Pickups", value: data.widgets.todays_pickups, color: '#d97706', bg: '#fef3c7' },
                { label: "Today's Deliveries", value: data.widgets.todays_deliveries, color: '#16a34a', bg: '#dcfce7' },
                { label: 'Delivered Today', value: data.widgets.delivered_today, color: '#059669', bg: '#d1fae5' },
                { label: 'Upcoming Pickups (7d)', value: data.widgets.upcoming_pickups_7d, color: '#0891b2', bg: '#cffafe' },
              ].map(w => (
                <div key={w.label} className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 leading-tight">{w.label}</p>
                  <p className="mt-1 text-lg font-bold" style={{ color: w.color }}>{w.value}</p>
                </div>
              ))}
            </div>

            {/* ── Google Calendar (shared "Bagdrop Ops" calendar) ── */}
            <div className="mb-5 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-orange-500" />
                  <p className="text-xs font-bold text-gray-700">Bagdrop Ops Calendar</p>
                  {calStatus?.connected ? (
                    <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                      <CheckCircle2 className="h-3 w-3" /> Connected{calStatus.email ? ` — ${calStatus.email}` : ''}
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">Not connected</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {calStatus?.connected ? (
                    <>
                      <button
                        onClick={handleCalSyncNow}
                        disabled={calSyncing}
                        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${calSyncing ? 'animate-spin' : ''}`} /> Sync Now
                      </button>
                      <button
                        onClick={handleCalDisconnect}
                        disabled={calLoading}
                        className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Unlink className="h-3.5 w-3.5" /> Disconnect
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleCalConnect}
                      disabled={calLoading}
                      className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                    >
                      <Link2 className="h-3.5 w-3.5" /> Connect Google Calendar
                    </button>
                  )}
                </div>
              </div>

              {calBanner && (
                <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-orange-50 px-4 py-2 text-xs font-medium text-orange-700">
                  <span>{calBanner}</span>
                  <button onClick={() => setCalBanner('')} className="text-orange-400 hover:text-orange-600"><X className="h-3.5 w-3.5" /></button>
                </div>
              )}

              {calStatus?.connected ? (
                <div className="p-4">
                  <p className="mb-2 text-xs text-gray-500">
                    Every confirmed booking automatically appears here as an all-day event on its pickup date. Team members can see reminders on their own phone by subscribing to this calendar —
                    open Google Calendar → <strong>Other calendars → Subscribe by URL / Search for people</strong> → enter <span className="font-mono text-gray-700">{calStatus.email}</span>.
                  </p>
                  {calStatus.email && (
                    <div className="overflow-hidden rounded-lg border border-gray-200">
                      <iframe
                        src={`https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calStatus.email)}&ctz=Asia%2FKolkata&mode=AGENDA`}
                        style={{ border: 0 }}
                        width="100%"
                        height="400"
                        title="Bagdrop Ops Calendar"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 text-xs text-gray-500">
                  Connect one Google account (any Bagdrop team Gmail works) to auto-create a calendar event for every confirmed booking — customer name, booking ID, pickup date, addresses, and contact number included.
                  Everyone else can subscribe to that one shared calendar afterward for reminders on their own devices. Admin only.
                  <a href="https://calendar.google.com" target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-orange-600 hover:underline">
                    Open Google Calendar <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>

            {/* ── Confirmed & Upcoming Bookings ── */}
            <p className="mb-3 text-xs text-gray-400">
              Only bookings the customer has confirmed — inquiries, quotes (created, sent, awaiting approval, rejected, or expired), payment-pending bookings, and cancelled bookings are excluded. Completed bookings are excluded too; find those in the Leads tab.
            </p>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {RANGE_OPTS.map(o => (
                <button
                  key={o.value}
                  onClick={() => setRange(o.value)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    range === o.value ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {o.label}
                </button>
              ))}
              {range === 'custom' && (
                <div className="flex items-center gap-2">
                  <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" />
                  <span className="text-xs text-gray-400">to</span>
                  <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" />
                  <button onClick={fetchData} className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600">Apply</button>
                </div>
              )}
              <button
                onClick={() => setShowFilters(v => !v)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  showFilters || activeExtraFilters > 0 ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                <ListFilter className="h-3.5 w-3.5" /> Filters
                {activeExtraFilters > 0 && <span className="rounded-full bg-orange-200 px-1.5 py-0.5 text-[10px] font-bold text-orange-800">{activeExtraFilters}</span>}
              </button>
              <span className="text-xs text-gray-400 ml-auto">
                {fmtDate(data.upcoming_range.from)} — {data.upcoming_range.to ? fmtDate(data.upcoming_range.to) : 'no end date'}
              </span>
            </div>

            {showFilters && (
              <div className="mb-3 grid grid-cols-1 gap-2 rounded-xl border border-gray-200 bg-white p-3 sm:grid-cols-3 lg:grid-cols-5">
                <select value={svcFilter} onChange={e => setSvcFilter(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs">
                  <option value="">All Service Types</option>
                  {serviceTypeOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs">
                  <option value="">All Statuses</option>
                  {statusOptions.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
                </select>
                <select value={driverFilter} onChange={e => setDriverFilter(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs">
                  <option value="">All Drivers</option>
                  {driverOptions.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <input type="text" placeholder="Pickup location contains…" value={pickupQ} onChange={e => setPickupQ(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" />
                <input type="text" placeholder="Delivery location contains…" value={deliveryQ} onChange={e => setDeliveryQ(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" />
              </div>
            )}

            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-left text-[10px] font-bold uppercase tracking-wide text-gray-400">
                      <th className="px-4 py-2.5">Customer</th>
                      <th className="px-4 py-2.5">Booking ID</th>
                      <th className="px-4 py-2.5">Service Type</th>
                      <th className="px-4 py-2.5">Pickup</th>
                      <th className="px-4 py-2.5">Pickup Location</th>
                      <th className="px-4 py-2.5">Delivery</th>
                      <th className="px-4 py-2.5">Delivery Location</th>
                      <th className="px-4 py-2.5">Route</th>
                      <th className="px-4 py-2.5">Bags</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Driver</th>
                      <th className="px-4 py-2.5">Days to Pickup</th>
                      <th className="px-4 py-2.5">Payment</th>
                      <th className="px-4 py-2.5">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBookings.length === 0 && (
                      <tr><td colSpan={14} className="px-4 py-8 text-center text-sm text-gray-400">
                        {data.upcoming_bookings.length === 0 ? 'No confirmed bookings scheduled in this range.' : 'No bookings match the current filters.'}
                      </td></tr>
                    )}
                    {filteredBookings.map(b => {
                      const days = daysUntil(b.pickup_date)
                      const showDriver = shouldShowDriverDetailsStep(b.service_type)
                      const notes = opsNotes(b)
                      return (
                        <tr
                          key={b.id}
                          onClick={() => router.push(`/admin?highlight=${b.id}`)}
                          className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-orange-50/60"
                        >
                          <td className="px-4 py-3 font-medium text-gray-800">
                            {(formatCustomerName(b.title, b.customer_name) || b.customer_name) ?? '—'}
                            <div className="text-xs text-gray-400">{b.customer_phone ?? '—'}</div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-orange-600">{b.tracking_id}</td>
                          <td className="px-4 py-3 text-xs text-gray-600">{b.service_label ?? b.service_type ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {fmtDate(b.pickup_date)}
                            {b.time_slot && <div className="text-[11px] text-gray-400">{b.time_slot}</div>}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600" title={b.pickup_address ?? undefined}>{truncate(b.pickup_address)}</td>
                          <td className="px-4 py-3 text-xs text-gray-600">{fmtDate(b.delivery_date)}</td>
                          <td className="px-4 py-3 text-xs text-gray-600" title={b.drop_address ?? undefined}>{truncate(b.drop_address)}</td>
                          <td className="px-4 py-3 text-xs text-gray-600">{b.from_city ?? '—'} → {b.to_city ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-gray-600">{b.total_bags ?? '—'}</td>
                          <td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">{statusLabel(b.status)}</span></td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {!showDriver ? (
                              <span className="text-gray-300" title="Not required for this service type">—</span>
                            ) : b.driver_name ? (
                              <>
                                <div className="text-gray-700">{b.driver_name}</div>
                                {b.driver_phone && <div className="text-[11px] text-gray-400">{b.driver_phone}</div>}
                              </>
                            ) : (
                              <span className="text-red-500 font-semibold">Unassigned</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold">
                            {days === null ? '—' : days < 0 ? <span className="text-red-600">Overdue</span> : days === 0 ? <span className="text-orange-600">Today</span> : `${days}d`}
                          </td>
                          <td className="px-4 py-3">{paymentBadge(b.payment_status) ?? <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-3 max-w-[160px] text-xs text-gray-500" title={notes ?? undefined}>{notes ? truncate(notes, 30) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
