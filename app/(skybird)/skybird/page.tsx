'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, RefreshCw, Search, AlertTriangle, Pencil, Lock, ChevronDown } from 'lucide-react'
import { formatCustomerName } from '@/lib/constants'

// Lead funnel status (new/contacted/.../lost) — separate concept from the
// booking workflow status below. Not part of the SKYBIRD-BOOKING-WORKFLOW-001
// spec; left exactly as-is.
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new:       { label: 'New',       color: '#0369a1', bg: '#e0f2fe' },
  contacted: { label: 'Contacted', color: '#d97706', bg: '#fef3c7' },
  qualified: { label: 'Qualified', color: '#7c3aed', bg: '#ede9fe' },
  converted: { label: 'Converted', color: '#16a34a', bg: '#dcfce7' },
  lost:      { label: 'Lost',      color: '#dc2626', bg: '#fee2e2' },
}

// ── Booking workflow status — kept in sync with STATUS_CONFIG in
// app/(admin)/admin/page.tsx (the canonical Bagdrop Admin Dashboard status
// vocabulary). Labels/order only — Skybird has no need for the admin's
// lucide icons here. If a status is ever added/renamed there, mirror it
// here too. See SKYBIRD-BOOKING-WORKFLOW-001 spec: "Inspect the actual
// Bagdrop Admin code/database/API and use the statuses currently
// implemented there."
const BOOKING_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; locked?: boolean }> = {
  inquiry:               { label: 'New Inquiry',          color: '#92400e', bg: '#fef3c7' },
  quote_created:         { label: 'Quote Created',        color: '#4f46e5', bg: '#eef2ff' },
  quote_sent:            { label: 'Quote Sent',           color: '#6d28d9', bg: '#ede9fe' },
  accepted:              { label: 'Quote Accepted',       color: '#0891b2', bg: '#cffafe' },
  rejected:              { label: 'Quote Rejected',       color: '#dc2626', bg: '#fee2e2' },
  closed:                { label: 'Inquiry Closed',       color: '#6b7280', bg: '#f3f4f6' },
  payment_pending:       { label: 'Payment Requested',    color: '#d97706', bg: '#fef3c7' },
  payment_received:      { label: 'Payment Received',     color: '#059669', bg: '#d1fae5' },
  payment_approved:      { label: 'Admin Approved',       color: '#059669', bg: '#d1fae5' },
  confirmed:             { label: 'Booking Confirmed',    color: '#2563eb', bg: '#dbeafe' },
  invoice_generated:     { label: 'Invoice Generated',    color: '#7c3aed', bg: '#ede9fe' },
  invoice_sent:          { label: 'Invoice Sent',         color: '#6d28d9', bg: '#ede9fe' },
  pickup_scheduled:      { label: 'Pickup Scheduled',     color: '#7c3aed', bg: '#ede9fe' },
  picked_up:             { label: 'Bags Picked Up',       color: '#7c3aed', bg: '#ede9fe' },
  in_transit:            { label: 'In Transit',           color: '#0891b2', bg: '#cffafe' },
  out_for_delivery:      { label: 'Out for Delivery',     color: '#ea580c', bg: '#ffedd5' },
  driver_details_shared: { label: 'Driver Details Shared', color: '#0369a1', bg: '#e0f2fe' },
  indemnity_bond_sent:   { label: 'Indemnity Bond Sent',  color: '#b45309', bg: '#fef3c7' },
  indemnity_bond_signed: { label: 'Indemnity Bond Signed', color: '#65a30d', bg: '#ecfccb' },
  delivered:             { label: 'Delivered',            color: '#16a34a', bg: '#dcfce7' },
  trip_created:          { label: 'Trip Sheet Created',   color: '#0891b2', bg: '#cffafe' },
  completed:             { label: 'Completed',            color: '#14532d', bg: '#bbf7d0', locked: true },
  cancelled:             { label: 'Cancelled',            color: '#dc2626', bg: '#fee2e2' },
}

// Mirrors PRE_QUOTE_STATUSES in app/(admin)/admin/page.tsx's StatusSelect —
// a booking still at 'inquiry' has no quote yet, so there's nothing
// meaningful for Skybird to advance it to; enforced again server-side in
// app/api/skybird/bookings/[id]/status/route.ts.
const PRE_QUOTE_STATUSES = ['inquiry', 'pending']

function BookingStatusSelect({ bookingId, current, skybirdKey, onUpdate }: {
  bookingId: string; current: string; skybirdKey: string; onUpdate: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const cfg = BOOKING_STATUS_CONFIG[current]
  const isLocked   = cfg?.locked === true
  const isPreQuote = PRE_QUOTE_STATUSES.includes(current)

  if (isLocked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2.5 py-1 text-xs font-semibold text-green-800">
        <Lock className="h-3 w-3" /> Completed
      </span>
    )
  }

  if (isPreQuote) {
    return (
      <div className="space-y-0.5">
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 cursor-not-allowed select-none">
          <Lock className="h-3 w-3" />
          {cfg?.label ?? current}
        </span>
        <p className="text-[10px] text-amber-600 leading-tight max-w-[150px]">Awaiting quote from Bagdrop</p>
      </div>
    )
  }

  async function change(next: string) {
    if (next === current || loading) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/skybird/bookings/${bookingId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-skybird-key': skybirdKey },
        body: JSON.stringify({ status: next }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) setError(d?.error ?? 'Failed to update status')
    } catch {
      setError('Network error while updating status')
    }
    setLoading(false)
    onUpdate()
  }

  return (
    <div>
      <div className="relative inline-block">
        <select
          value={current}
          onChange={e => change(e.target.value)}
          disabled={loading}
          className="appearance-none rounded-lg border border-gray-200 bg-white py-1.5 pl-2.5 pr-7 text-xs font-medium text-gray-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400 disabled:opacity-50 cursor-pointer"
        >
          {Object.entries(BOOKING_STATUS_CONFIG).map(([val, c]) => (
            <option key={val} value={val}>{c.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
      </div>
      {error && <p className="mt-1 text-[10px] text-red-500 max-w-[150px]">{error}</p>}
    </div>
  )
}

interface SkybirdLead {
  id: string
  lead_number: string | null
  title?: string | null
  name: string
  phone: string
  email: string | null
  service_interest: string | null
  from_city: string | null
  to_city: string | null
  pickup_date: string | null
  delivery_date: string | null
  bags_count: number
  flight_number: string | null
  status: string
  notes: string | null
  created_at: string
  booking_id: string | null
  bookings?: { tracking_id: string; status: string; total_amount: number | null; payment_status: string | null } | null
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6' }
  return (
    <span style={{ color: cfg.color, background: cfg.bg }}
      className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold">
      {cfg.label}
    </span>
  )
}

export default function SkybirdDashboardPage() {
  const router = useRouter()
  const [skybirdKey, setSkybirdKey] = useState('')
  const [authed, setAuthed] = useState(false)

  const [leads, setLeads]     = useState<SkybirdLead[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch]   = useState('')
  const [fetchError, setFetchError] = useState('')

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_skybird_key') ?? ''
    if (!key) { router.replace('/skybird/login'); return }
    setSkybirdKey(key)
    setAuthed(true)
  }, [router])

  const fetchLeads = useCallback(async () => {
    if (!skybirdKey) return
    setLoading(true)
    setFetchError('')
    const params = new URLSearchParams({ key: skybirdKey })
    if (search) params.set('search', search)
    try {
      const res = await fetch(`/api/skybird/leads?${params.toString()}`)
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setFetchError(data?.error ?? `Could not load inquiries (${res.status}).`)
        setLeads([])
      } else {
        setLeads(data?.leads ?? [])
      }
    } catch {
      setFetchError('Network error while loading inquiries.')
      setLeads([])
    }
    setLoading(false)
  }, [skybirdKey, search])

  useEffect(() => { if (authed) fetchLeads() }, [authed, fetchLeads])

  if (!authed) return null

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-gray-900">Your Inquiries</h1>
          <p className="text-sm text-gray-500">Customer booking inquiries submitted through Skybird</p>
        </div>
        <Link
          href="/skybird/new"
          className="flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New Inquiry
        </Link>
      </div>

      {fetchError && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {fetchError}
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or phone"
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
          />
        </div>
        <button onClick={() => fetchLeads()} className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Inquiry #</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Route</th>
              <th className="px-4 py-3">Bags</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Booking</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leads.map(l => {
              // Editable only while the underlying booking is still at
              // 'inquiry' — once BagDrop has started quoting/confirming it,
              // corrections go through Bagdrop support instead (see
              // app/api/skybird/bookings/[id]/route.ts PATCH for the same
              // guard enforced server-side).
              const canEdit = !!l.booking_id && (l.bookings?.status ?? 'inquiry') === 'inquiry'
              return (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{l.lead_number ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{formatCustomerName(l.title, l.name) || l.name}</div>
                    <div className="text-xs text-gray-500">{l.phone}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {l.from_city || l.to_city ? `${l.from_city ?? '—'} → ${l.to_city ?? '—'}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{l.bags_count}</td>
                  <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                  <td className="px-4 py-3 text-gray-700">
                    {l.bookings && l.booking_id ? (
                      <div className="space-y-1">
                        <div className="font-mono text-xs">{l.bookings.tracking_id}</div>
                        <BookingStatusSelect
                          bookingId={l.booking_id}
                          current={l.bookings.status}
                          skybirdKey={skybirdKey}
                          onUpdate={fetchLeads}
                        />
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(l.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3">
                    {canEdit ? (
                      <Link
                        href={`/skybird/edit/${l.booking_id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Link>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {!loading && !fetchError && leads.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">No inquiries yet. Click "New Inquiry" to submit your first one.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
