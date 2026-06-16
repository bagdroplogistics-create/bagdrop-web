'use client'

import { useEffect, useState, useCallback, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import {
  Package, Clock, CheckCircle, Truck, LogOut,
  Search, ChevronDown, RefreshCw, TrendingUp,
  MapPin, Calendar, Phone, Mail, Hash,
} from 'lucide-react'

interface Booking {
  id: string
  tracking_id: string
  status: string
  customer_name: string
  customer_email: string
  customer_phone: string
  service_label: string
  from_city: string
  to_city: string
  pickup_date: string | null
  time_slot: string | null
  total_bags: number
  total_amount: number
  created_at: string
}

interface Stats {
  total: number
  pending: number
  confirmed: number
  in_transit: number
  delivered: number
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending:    { label: 'Pending',    color: '#d97706', bg: '#fef3c7', icon: <Clock className="h-3 w-3" /> },
  confirmed:  { label: 'Confirmed',  color: '#2563eb', bg: '#dbeafe', icon: <CheckCircle className="h-3 w-3" /> },
  picked_up:  { label: 'Picked Up',  color: '#7c3aed', bg: '#ede9fe', icon: <Package className="h-3 w-3" /> },
  in_transit: { label: 'In Transit', color: '#0891b2', bg: '#cffafe', icon: <Truck className="h-3 w-3" /> },
  delivered:  { label: 'Delivered',  color: '#16a34a', bg: '#dcfce7', icon: <CheckCircle className="h-3 w-3" /> },
  cancelled:  { label: 'Cancelled',  color: '#dc2626', bg: '#fee2e2', icon: <Clock className="h-3 w-3" /> },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6', icon: null }
  return (
    <span style={{ color: cfg.color, background: cfg.bg }}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold">
      {cfg.icon}{cfg.label}
    </span>
  )
}

function StatusSelect({ id, current, adminKey, onUpdate }: {
  id: string; current: string; adminKey: string; onUpdate: () => void
}) {
  const [loading, setLoading] = useState(false)
  async function change(next: string) {
    if (next === current || loading) return
    setLoading(true)
    await fetch('/api/admin/bookings/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ status: next }),
    })
    setLoading(false)
    onUpdate()
  }
  return (
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
  )
}

export default function AdminDashboard() {
  const router = useRouter()
  const [adminKey, setAdminKey]   = useState('')
  const [authed, setAuthed]       = useState(false)
  const [stats, setStats]         = useState<Stats | null>(null)
  const [bookings, setBookings]   = useState<Booking[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [filter, setFilter]       = useState('all')
  const [expanded, setExpanded]   = useState<string | null>(null)

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key)
    setAuthed(true)
  }, [router])

  const fetchData = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    const qs = '?key=' + adminKey + (filter !== 'all' ? '&status=' + filter : '') + (search ? '&search=' + encodeURIComponent(search) : '')
    const [sr, br] = await Promise.all([
      fetch('/api/admin/stats?key=' + adminKey),
      fetch('/api/admin/bookings' + qs),
    ])
    if (sr.ok) setStats(await sr.json())
    if (br.ok) setBookings((await br.json()).bookings ?? [])
    setLoading(false)
  }, [adminKey, filter, search])

  useEffect(() => { if (authed) fetchData() }, [authed, fetchData])

  function logout() {
    sessionStorage.removeItem('bagdrop_admin_key')
    router.replace('/admin/login')
  }

  function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  if (!authed) return null

  const statCards = [
    { label: 'Total',      value: stats?.total ?? 0,      icon: <Package className="h-5 w-5" />,     color: '#FF6300', bg: '#fff7f0' },
    { label: 'Pending',    value: stats?.pending ?? 0,    icon: <Clock className="h-5 w-5" />,        color: '#d97706', bg: '#fef3c7' },
    { label: 'Confirmed',  value: stats?.confirmed ?? 0,  icon: <CheckCircle className="h-5 w-5" />,  color: '#2563eb', bg: '#dbeafe' },
    { label: 'In Transit', value: stats?.in_transit ?? 0, icon: <Truck className="h-5 w-5" />,       color: '#0891b2', bg: '#cffafe' },
    { label: 'Delivered',  value: stats?.delivered ?? 0,  icon: <TrendingUp className="h-5 w-5" />,  color: '#16a34a', bg: '#dcfce7' },
  ]

  return (
    <>
      {/* Admin header bar — full width */}
      <div className="w-full border-b border-orange-200 bg-orange-50">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-orange-600 sm:text-3xl">
              Admin Dashboard
            </h1>
            <p className="mt-0.5 text-sm text-orange-400">Bagdrop Booking Management</p>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 rounded-lg border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-orange-600 shadow-sm hover:bg-orange-50 hover:border-orange-400 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Sub-header: bookings count + refresh */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">All Bookings</h2>
            <p className="mt-0.5 text-sm text-gray-500">Manage and track booking inquiries</p>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        {/* Stat cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {statCards.map(c => (
            <div key={c.label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500">{c.label}</p>
                <div style={{ color: c.color, background: c.bg }} className="rounded-lg p-1.5">
                  {c.icon}
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900">{c.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, phone, or tracking ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 shadow-sm placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
          </div>
          <div className="relative">
            <select
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-gray-700 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
            >
              <option value="all">All statuses</option>
              {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                <option key={val} value={val}>{cfg.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
            </div>
          ) : bookings.length === 0 ? (
            <div className="py-24 text-center text-sm text-gray-400">No bookings found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['Tracking', 'Customer', 'Route', 'Service', 'Date', 'Bags', 'Status', 'Update'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {bookings.map(b => (
                    <Fragment key={b.id}>
                      <tr
                        onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                        className="cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-bold text-orange-600">{b.tracking_id}</span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-gray-900">{b.customer_name}</p>
                          <p className="text-xs text-gray-400">{formatDate(b.created_at)}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {b.from_city}<span className="mx-1 text-gray-400">{String.fromCharCode(8594)}</span>{b.to_city}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{b.service_label}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{formatDate(b.pickup_date)}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">{b.total_bags}</td>
                        <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <StatusSelect id={b.id} current={b.status} adminKey={adminKey} onUpdate={fetchData} />
                        </td>
                      </tr>
                      {expanded === b.id && (
                        <tr className="bg-orange-50/50">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                              {[
                                { icon: <Phone className="h-3.5 w-3.5 text-orange-500" />, label: 'Phone',     val: b.customer_phone },
                                { icon: <Mail className="h-3.5 w-3.5 text-orange-500" />,  label: 'Email',     val: b.customer_email },
                                { icon: <Clock className="h-3.5 w-3.5 text-orange-500" />, label: 'Time Slot', val: b.time_slot || 'Not specified' },
                                { icon: <Hash className="h-3.5 w-3.5 text-orange-500" />,  label: 'Booking ID',val: b.id.slice(0, 8) + '...' },
                              ].map(r => (
                                <div key={r.label} className="flex items-start gap-2">
                                  <span className="mt-0.5">{r.icon}</span>
                                  <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{r.label}</p>
                                    <p className="text-sm font-medium text-gray-800">{r.val}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="mt-3 text-center text-xs text-gray-400">
          Click any row to expand details — click again to collapse
        </p>
      </main>
    </>
  )
}
