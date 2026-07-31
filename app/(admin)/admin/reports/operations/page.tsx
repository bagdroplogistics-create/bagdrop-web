'use client'

// ============================================================================
// BAGDROP — Operations Center (Reports & Dashboard Enhancements, Phase 1)
// New module, additive only — does not touch the existing Dashboard
// (app/(admin)/admin/page.tsx) or any booking-status workflow logic. Pulls
// from GET /api/admin/reports/operations, which is read-only.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle, RefreshCw, Inbox, CalendarClock, AlertOctagon, ClipboardList,
  Loader2, ChevronRight, Plane, Truck, UserX, FileWarning, Clock,
  Calendar, Link2, Unlink, ExternalLink, CheckCircle2, X,
} from 'lucide-react'

// ── Types (mirror the API response shape) ──────────────────────────────────
interface TodayInquiry {
  id: string; lead_number: string | null; customer_name: string; phone: string
  booking_id: string | null; tracking_id: string | null
  service_type: string | null; from_city: string | null; to_city: string | null
  pickup_date: string | null; status: string; assigned_to: string | null; has_quote: boolean
}
interface BookingLike {
  id: string; tracking_id: string; status: string
  customer_name: string | null; customer_phone: string | null
  service_type: string | null; service_label: string | null
  from_city: string | null; to_city: string | null
  pickup_date: string | null; delivery_date: string | null; time_slot: string | null
  total_bags: number | null; total_amount: number | null
  driver_name: string | null; created_at: string
}
interface OverdueBooking extends BookingLike {
  overdue_reasons: Array<{ code: string; label: string }>
}
interface Alert { severity: 'high' | 'medium'; message: string; count: number }
interface CalendarStatus { connected: boolean; email: string | null; calendarId: string | null }
interface Widgets {
  todays_inquiries: number; todays_pickups: number; todays_deliveries: number
  upcoming_pickups_7d: number; pending_quotes: number; pending_payments: number
  pending_driver_assign: number; pending_documents: number
  completed_deliveries_today: number; monthly_revenue: number
  active_partners: number; conversion_rate: number
}
interface OpsData {
  todays_inquiries: TodayInquiry[]
  todays_inquiries_totals: { total: number; pending_quotes: number; pending_payments: number; confirmed: number }
  upcoming_bookings: BookingLike[]
  upcoming_range: { from: string; to: string; preset: string }
  overdue: OverdueBooking[]
  todays_ops: {
    pickups: BookingLike[]; airport_collections: BookingLike[]; deliveries: BookingLike[]
    driver_assign_pending: number; driver_details_pending: number
    indemnity_pending: number; documents_pending: number
  }
  alerts: Alert[]
  widgets: Widgets
}

const STATUS_LABEL: Record<string, string> = {
  inquiry: 'Inquiry', quote_created: 'Quote Pending', quote_sent: 'Quote Sent',
  accepted: 'Awaiting Approval', payment_pending: 'Payment Pending', payment_received: 'Payment Received',
  payment_approved: 'Payment Approved', confirmed: 'Confirmed', indemnity_bond_sent: 'Bond Sent',
  indemnity_bond_signed: 'Bond Signed', invoice_generated: 'Invoice Generated', invoice_sent: 'Invoice Sent',
  pickup_scheduled: 'Pickup Scheduled', picked_up: 'Picked Up', in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery', driver_details_shared: 'Driver Details Shared',
  delivered: 'Delivered', trip_created: 'Trip Created', completed: 'Completed',
  rejected: 'Rejected', cancelled: 'Cancelled',
}
function statusLabel(s: string) { return STATUS_LABEL[s] ?? s }

function fmtRs(n: number) { return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }) }
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

const RANGE_OPTS = [
  { value: 'all',       label: 'All Upcoming' },
  { value: 'today',     label: 'Today' },
  { value: 'tomorrow',  label: 'Tomorrow' },
  { value: 'next3',     label: 'Next 3 Days' },
  { value: 'next7',     label: 'Next 7 Days' },
  { value: 'custom',    label: 'Custom Range' },
]

const TABS = [
  { key: 'inquiries', label: 'Pickup Today',   icon: Inbox },
  { key: 'upcoming',  label: 'Upcoming Confirmed Bookings', icon: CalendarClock },
  { key: 'overdue',   label: 'Missed / Overdue',     icon: AlertOctagon },
  { key: 'ops',       label: "Today's Operations",   icon: ClipboardList },
] as const
type TabKey = typeof TABS[number]['key']

export default function OperationsCenterPage() {
  const router = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [authed, setAuthed]     = useState(false)
  const [data, setData]         = useState<OpsData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [tab, setTab]           = useState<TabKey>('inquiries')
  const [range, setRange]       = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')

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
            <p className="text-xs text-gray-500">Today&apos;s activity, upcoming bookings, and anything that needs attention — refreshed on load.</p>
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
            {/* ── Alerts ── */}
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
                      onClick={() => setTab(a.message.toLowerCase().includes('overdue') || a.message.toLowerCase().includes('driver') || a.message.toLowerCase().includes('indemnity') ? 'overdue' : 'upcoming')}
                      className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        a.severity === 'high'
                          ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                          : 'border-amber-200 bg-white text-amber-700 hover:bg-amber-100'
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

            {/* ── Summary widgets ── */}
            <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: 'Inquiries — Pickup Today', value: data.widgets.todays_inquiries, color: '#2563eb', bg: '#dbeafe' },
                { label: "Today's Pickups", value: data.widgets.todays_pickups, color: '#d97706', bg: '#fef3c7' },
                { label: "Today's Deliveries", value: data.widgets.todays_deliveries, color: '#16a34a', bg: '#dcfce7' },
                { label: 'Upcoming Confirmed Pickups (7d)', value: data.widgets.upcoming_pickups_7d, color: '#0891b2', bg: '#cffafe' },
                { label: 'Pending Quotes', value: data.widgets.pending_quotes, color: '#7c3aed', bg: '#ede9fe' },
                { label: 'Pending Payments', value: data.widgets.pending_payments, color: '#dc2626', bg: '#fee2e2' },
                { label: 'Driver Assign Pending', value: data.widgets.pending_driver_assign, color: '#ea580c', bg: '#ffedd5' },
                { label: 'Documents Pending', value: data.widgets.pending_documents, color: '#be185d', bg: '#fce7f3' },
                { label: 'Delivered Today', value: data.widgets.completed_deliveries_today, color: '#059669', bg: '#d1fae5' },
                { label: 'Monthly Revenue', value: fmtRs(data.widgets.monthly_revenue), color: '#16a34a', bg: '#f0fdf4' },
                { label: 'Active Partners', value: data.widgets.active_partners, color: '#4f46e5', bg: '#eef2ff' },
                { label: 'Conversion Rate', value: data.widgets.conversion_rate + '%', color: '#0369a1', bg: '#e0f2fe' },
              ].map(w => (
                <div key={w.label} className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 leading-tight">{w.label}</p>
                  <p className="mt-1 text-lg font-bold" style={{ color: w.color }}>{w.value}</p>
                </div>
              ))}
            </div>

            {/* ── Tabs ── */}
            <div className="mb-4 flex flex-wrap gap-2">
              {TABS.map(t => {
                const Icon = t.icon
                const count = t.key === 'inquiries' ? data.todays_inquiries.length
                            : t.key === 'upcoming'   ? data.upcoming_bookings.length
                            : t.key === 'overdue'    ? data.overdue.length
                            : data.todays_ops.pickups.length + data.todays_ops.deliveries.length
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                      tab === t.key ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" /> {t.label}
                    <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tab === t.key ? 'bg-orange-200 text-orange-800' : 'bg-gray-100 text-gray-500'}`}>{count}</span>
                  </button>
                )
              })}
            </div>

            {/* ── Pickup Today (was "Today's Inquiries") ──────────────────
                Redefined at the user's request: this now lists inquiries
                whose PICKUP DATE is today (not ones merely created today) —
                a don't-miss-it reminder list for Ops, since an inquiry can
                sit around for weeks before its actual pickup day arrives.
                Every row here qualifies by definition, so every row gets
                the urgent treatment rather than singling any out. ── */}
            {tab === 'inquiries' && (
              <div>
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                  <span><strong>Pickup scheduled for today.</strong> Make sure none of these are missed.</span>
                </div>
                <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: 'Pickups Today', value: data.todays_inquiries_totals.total },
                    { label: 'Pending Quotes', value: data.todays_inquiries_totals.pending_quotes },
                    { label: 'Pending Payments', value: data.todays_inquiries_totals.pending_payments },
                    { label: 'Confirmed Bookings', value: data.todays_inquiries_totals.confirmed },
                  ].map(c => (
                    <div key={c.label} className="rounded-lg border border-gray-100 bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase text-gray-400">{c.label}</p>
                      <p className="text-base font-bold text-gray-800">{c.value}</p>
                    </div>
                  ))}
                </div>
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50 text-left text-[10px] font-bold uppercase tracking-wide text-gray-400">
                          <th className="px-4 py-2.5">Customer</th>
                          <th className="px-4 py-2.5">Booking / Inquiry ID</th>
                          <th className="px-4 py-2.5">Service</th>
                          <th className="px-4 py-2.5">Route</th>
                          <th className="px-4 py-2.5">Pickup Date</th>
                          <th className="px-4 py-2.5">Status</th>
                          <th className="px-4 py-2.5">Assigned Staff</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.todays_inquiries.length === 0 && (
                          <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">No pickups scheduled for today.</td></tr>
                        )}
                        {data.todays_inquiries.map(l => (
                          <tr key={l.id} className="border-b border-gray-50 border-l-2 border-l-amber-400 last:border-b-0 bg-amber-50/30 hover:bg-amber-50">
                            <td className="px-4 py-3 font-medium text-gray-800">{l.customer_name}<div className="text-xs text-gray-400">{l.phone}</div></td>
                            <td className="px-4 py-3">
                              <Link href={l.booking_id ? `/admin?highlight=${l.booking_id}` : '#'} className="font-mono text-xs text-orange-600 hover:underline">
                                {l.tracking_id ?? l.lead_number ?? '—'}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600">{l.service_type ?? '—'}</td>
                            <td className="px-4 py-3 text-xs text-gray-600">{l.from_city ?? '—'} → {l.to_city ?? '—'}</td>
                            <td className="px-4 py-3 text-xs">
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-700">
                                <Clock className="h-3 w-3" /> Today
                              </span>
                            </td>
                            <td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">{statusLabel(l.status)}</span></td>
                            <td className="px-4 py-3 text-xs text-gray-400">{l.assigned_to ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── Upcoming Confirmed Bookings ── */}
            {tab === 'upcoming' && (
              <div>
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

                <p className="mb-3 text-xs text-gray-400">
                  Only bookings the customer has confirmed — quotes still awaiting acceptance, rejected quotes, and inquiries that never converted are excluded.
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
                  <span className="text-xs text-gray-400 ml-auto">
                    {fmtDate(data.upcoming_range.from)} — {data.upcoming_range.to ? fmtDate(data.upcoming_range.to) : 'no end date'}
                  </span>
                </div>
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50 text-left text-[10px] font-bold uppercase tracking-wide text-gray-400">
                          <th className="px-4 py-2.5">Customer</th>
                          <th className="px-4 py-2.5">Booking ID</th>
                          <th className="px-4 py-2.5">Service</th>
                          <th className="px-4 py-2.5">Pickup Date</th>
                          <th className="px-4 py-2.5">Pickup Time</th>
                          <th className="px-4 py-2.5">Delivery Date</th>
                          <th className="px-4 py-2.5">Route</th>
                          <th className="px-4 py-2.5">Status</th>
                          <th className="px-4 py-2.5">Driver</th>
                          <th className="px-4 py-2.5">Days to Pickup</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.upcoming_bookings.length === 0 && (
                          <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-400">No confirmed bookings scheduled in this range.</td></tr>
                        )}
                        {data.upcoming_bookings.map(b => {
                          const days = daysUntil(b.pickup_date)
                          return (
                            <tr
                              key={b.id}
                              onClick={() => router.push(`/admin?highlight=${b.id}`)}
                              className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-orange-50/60"
                            >
                              <td className="px-4 py-3 font-medium text-gray-800">{b.customer_name ?? '—'}</td>
                              <td className="px-4 py-3 font-mono text-xs text-orange-600">{b.tracking_id}</td>
                              <td className="px-4 py-3 text-xs text-gray-600">{b.service_label ?? b.service_type ?? '—'}</td>
                              <td className="px-4 py-3 text-xs text-gray-600">{fmtDate(b.pickup_date)}</td>
                              <td className="px-4 py-3 text-xs text-gray-600">{b.time_slot ?? '—'}</td>
                              <td className="px-4 py-3 text-xs text-gray-600">{fmtDate(b.delivery_date)}</td>
                              <td className="px-4 py-3 text-xs text-gray-600">{b.from_city ?? '—'} → {b.to_city ?? '—'}</td>
                              <td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">{statusLabel(b.status)}</span></td>
                              <td className="px-4 py-3 text-xs text-gray-500">{b.driver_name ?? <span className="text-gray-300">Unassigned</span>}</td>
                              <td className="px-4 py-3 text-xs font-semibold">
                                {days === null ? '—' : days < 0 ? <span className="text-red-600">Overdue</span> : days === 0 ? <span className="text-orange-600">Today</span> : `${days}d`}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── Missed / Overdue ── */}
            {tab === 'overdue' && (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 text-left text-[10px] font-bold uppercase tracking-wide text-gray-400">
                        <th className="px-4 py-2.5">Customer</th>
                        <th className="px-4 py-2.5">Route</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5">Pickup Date</th>
                        <th className="px-4 py-2.5">Issues</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.overdue.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">Nothing overdue — all clear.</td></tr>
                      )}
                      {data.overdue.map(b => (
                        <tr key={b.id} className="border-b border-red-50 bg-red-50/40 last:border-0 hover:bg-red-50">
                          <td className="px-4 py-3 font-medium text-gray-800">{b.customer_name ?? '—'}<div className="font-mono text-xs text-red-600">{b.tracking_id}</div></td>
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

            {/* ── Today's Operational Tasks ── */}
            {tab === 'ops' && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Today's Pickups", value: data.todays_ops.pickups.length, icon: Truck, color: '#d97706' },
                    { label: 'Airport Collections', value: data.todays_ops.airport_collections.length, icon: Plane, color: '#0891b2' },
                    { label: "Today's Deliveries", value: data.todays_ops.deliveries.length, icon: ChevronRight, color: '#16a34a' },
                    { label: 'Driver Assign Pending', value: data.todays_ops.driver_assign_pending, icon: UserX, color: '#dc2626' },
                    { label: 'Driver Details Pending', value: data.todays_ops.driver_details_pending, icon: Clock, color: '#ea580c' },
                    { label: 'Indemnity Bonds Pending', value: data.todays_ops.indemnity_pending, icon: FileWarning, color: '#7c3aed' },
                    { label: 'Documents Pending Approval', value: data.todays_ops.documents_pending, icon: FileWarning, color: '#be185d' },
                  ].map(c => {
                    const Icon = c.icon
                    return (
                      <div key={c.label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                        <Icon className="h-4 w-4" style={{ color: c.color }} />
                        <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{c.label}</p>
                        <p className="text-xl font-bold" style={{ color: c.color }}>{c.value}</p>
                      </div>
                    )
                  })}
                </div>

                {[
                  { title: "Today's Pickups", rows: data.todays_ops.pickups },
                  { title: "Today's Deliveries", rows: data.todays_ops.deliveries },
                ].map(section => (
                  <div key={section.title} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="border-b border-gray-100 px-4 py-2.5"><p className="text-xs font-bold text-gray-700">{section.title}</p></div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50 text-left text-[10px] font-bold uppercase tracking-wide text-gray-400">
                            <th className="px-4 py-2">Customer</th>
                            <th className="px-4 py-2">Route</th>
                            <th className="px-4 py-2">Service</th>
                            <th className="px-4 py-2">Driver</th>
                            <th className="px-4 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.rows.length === 0 && (
                            <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-gray-400">Nothing scheduled for today.</td></tr>
                          )}
                          {section.rows.map(b => (
                            <tr key={b.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                              <td className="px-4 py-2.5 font-medium text-gray-800">{b.customer_name ?? '—'}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-600">{b.from_city ?? '—'} → {b.to_city ?? '—'}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-600">{b.service_label ?? b.service_type ?? '—'}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-500">{b.driver_name ?? <span className="text-red-500 font-semibold">Unassigned</span>}</td>
                              <td className="px-4 py-2.5"><span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">{statusLabel(b.status)}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
