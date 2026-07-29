'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, RefreshCw, Search } from 'lucide-react'

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new:       { label: 'New',       color: '#0369a1', bg: '#e0f2fe' },
  contacted: { label: 'Contacted', color: '#d97706', bg: '#fef3c7' },
  qualified: { label: 'Qualified', color: '#7c3aed', bg: '#ede9fe' },
  converted: { label: 'Converted', color: '#16a34a', bg: '#dcfce7' },
  lost:      { label: 'Lost',      color: '#dc2626', bg: '#fee2e2' },
}

interface SkybirdLead {
  id: string
  lead_number: string | null
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

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_skybird_key') ?? ''
    if (!key) { router.replace('/skybird/login'); return }
    setSkybirdKey(key)
    setAuthed(true)
  }, [router])

  const fetchLeads = useCallback(async () => {
    if (!skybirdKey) return
    setLoading(true)
    const params = new URLSearchParams({ key: skybirdKey })
    if (search) params.set('search', search)
    const res = await fetch(`/api/skybird/leads?${params.toString()}`)
    if (res.ok) {
      const data = await res.json()
      setLeads(data.leads ?? [])
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
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leads.map(l => (
              <tr key={l.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-700">{l.lead_number ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{l.name}</div>
                  <div className="text-xs text-gray-500">{l.phone}</div>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {l.from_city || l.to_city ? `${l.from_city ?? '—'} → ${l.to_city ?? '—'}` : '—'}
                </td>
                <td className="px-4 py-3 text-gray-700">{l.bags_count}</td>
                <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                <td className="px-4 py-3 text-gray-700">
                  {l.bookings ? (
                    <div>
                      <div className="font-mono text-xs">{l.bookings.tracking_id}</div>
                      <div className="text-xs text-gray-500 capitalize">{l.bookings.status?.replace(/-/g, ' ')}</div>
                    </div>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {new Date(l.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
              </tr>
            ))}
            {!loading && leads.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">No inquiries yet. Click "New Inquiry" to submit your first one.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
