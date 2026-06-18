'use client'

import { useEffect, useState, useCallback, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import {
  Package, Clock, CheckCircle, Truck, LogOut,
  Search, ChevronDown, RefreshCw, TrendingUp,
  MapPin, Calendar, Phone, Mail, Hash, Pencil, X, Save,
  Users, FileText, UserCheck, IndianRupee, Receipt,
} from 'lucide-react'
import Link from 'next/link'

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
  pickup_address: string | null
  drop_address: string | null
  time_slot: string | null
  total_bags: number
  total_amount: number
  notes: string | null
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
  pending:           { label: 'Pending',           color: '#d97706', bg: '#fef3c7', icon: <Clock className="h-3 w-3" /> },
  confirmed:         { label: 'Confirmed',         color: '#2563eb', bg: '#dbeafe', icon: <CheckCircle className="h-3 w-3" /> },
  picked_up:         { label: 'Picked Up',         color: '#7c3aed', bg: '#ede9fe', icon: <Package className="h-3 w-3" /> },
  in_transit:        { label: 'In Transit',        color: '#0891b2', bg: '#cffafe', icon: <Truck className="h-3 w-3" /> },
  out_for_delivery:  { label: 'Out for Delivery',  color: '#ea580c', bg: '#ffedd5', icon: <Truck className="h-3 w-3" /> },
  delivered:         { label: 'Delivered',         color: '#16a34a', bg: '#dcfce7', icon: <CheckCircle className="h-3 w-3" /> },
  cancelled:         { label: 'Cancelled',         color: '#dc2626', bg: '#fee2e2', icon: <X className="h-3 w-3" /> },
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

function GenerateInvoiceButton({ bookingId, adminKey }: { bookingId: string; adminKey: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  async function generate(e: React.MouseEvent) {
    e.stopPropagation()
    setState('loading')
    try {
      const res = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ booking_id: bookingId }),
      })
      const d = await res.json()
      if (!res.ok) { setState('error'); setMsg(d.error ?? 'Failed'); return }
      setState('done')
      setMsg(d.action === 'updated' ? 'Invoice updated!' : 'Created ' + (d.invoice?.invoice_number ?? ''))
      setTimeout(() => setState('idle'), 4000)
    } catch {
      setState('error')
      setMsg('Network error')
    }
  }

  if (state === 'done') return (
    <span className="flex items-center gap-1 rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">
      <CheckCircle className="h-3.5 w-3.5" /> {msg}
    </span>
  )
  if (state === 'error') return (
    <span className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
      {msg}
    </span>
  )
  return (
    <button
      onClick={generate}
      disabled={state === 'loading'}
      className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 shadow-sm hover:bg-gray-50 hover:border-gray-400 transition-colors disabled:opacity-50"
    >
      <Receipt className="h-3.5 w-3.5" />
      {state === 'loading' ? 'Generating...' : 'Generate Invoice'}
    </button>
  )
}

interface EditForm {
  customer_name:  string
  customer_phone: string
  customer_email: string
  total_bags:     string
  pickup_date:    string
  pickup_address: string
  drop_address:   string
  notes:          string
}

function EditModal({
  booking, adminKey, onSaved, onClose,
}: {
  booking: Booking
  adminKey: string
  onSaved: () => void
  onClose: () => void
}) {
  const [form, setForm] = useState<EditForm>({
    customer_name:  booking.customer_name,
    customer_phone: booking.customer_phone?.replace('+91', '') ?? '',
    customer_email: booking.customer_email ?? '',
    total_bags:     String(booking.total_bags),
    pickup_date:    booking.pickup_date?.slice(0, 10) ?? '',
    pickup_address: booking.pickup_address ?? '',
    drop_address:   booking.drop_address ?? '',
    notes:          booking.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function set(key: keyof EditForm, val: string) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/admin/bookings/' + booking.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({
          customer_name:  form.customer_name.trim(),
          customer_phone: form.customer_phone.replace(/\D/g, ''),
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
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Customer Name</label>
              <input type="text" value={form.customer_name} onChange={e => set('customer_name', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Mobile (10 digits)</label>
              <div className="flex gap-1.5">
                <span className="flex items-center rounded-lg border border-gray-200 bg-gray-50 px-2 text-xs font-semibold text-gray-500 select-none">+91</span>
                <input type="tel" inputMode="numeric" value={form.customer_phone}
                  onChange={e => set('customer_phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Email (optional)</label>
              <input type="email" value={form.customer_email} onChange={e => set('customer_email', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Total Bags</label>
              <input type="number" min={1} max={99} value={form.total_bags} onChange={e => set('total_bags', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Pickup Date</label>
              <input type="date" value={form.pickup_date} onChange={e => set('pickup_date', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Pickup Address</label>
              <input type="text" value={form.pickup_address} onChange={e => set('pickup_address', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Drop Address</label>
              <input type="text" value={form.drop_address} onChange={e => set('drop_address', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Notes / Instructions</label>
              <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
            </div>
          </div>
          {saveError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{saveError}</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-50 transition-colors">
            {saving
              ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              : <Save className="h-3.5 w-3.5" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const router = useRouter()
  const [adminKey, setAdminKey]     = useState('')
  const [authed, setAuthed]         = useState(false)
  const [stats, setStats]           = useState<Stats | null>(null)
  const [bookings, setBookings]     = useState<Booking[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filter, setFilter]         = useState('all')
  const [expanded, setExpanded]     = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<Booking | null>(null)
  const [crmStats, setCrmStats]     = useState<{
    total_leads: number; pending_quotes: number; active_customers: number; revenue_this_month: number
  } | null>(null)

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
    const [sr, br, cr] = await Promise.all([
      fetch('/api/admin/stats?key=' + adminKey),
      fetch('/api/admin/bookings' + qs),
      fetch('/api/admin/crm-stats?key=' + adminKey),
    ])
    if (sr.ok) setStats(await sr.json())
    if (br.ok) setBookings((await br.json()).bookings ?? [])
    if (cr.ok) setCrmStats(await cr.json())
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
    { label: 'Total',      value: stats?.total ?? 0,      icon: <Package className="h-5 w-5" />,    color: '#FF6300', bg: '#fff7f0' },
    { label: 'Pending',    value: stats?.pending ?? 0,    icon: <Clock className="h-5 w-5" />,       color: '#d97706', bg: '#fef3c7' },
    { label: 'Confirmed',  value: stats?.confirmed ?? 0,  icon: <CheckCircle className="h-5 w-5" />, color: '#2563eb', bg: '#dbeafe' },
    { label: 'In Transit', value: stats?.in_transit ?? 0, icon: <Truck className="h-5 w-5" />,      color: '#0891b2', bg: '#cffafe' },
    { label: 'Delivered',  value: stats?.delivered ?? 0,  icon: <TrendingUp className="h-5 w-5" />, color: '#16a34a', bg: '#dcfce7' },
  ]

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
        <h1 className="text-xl font-bold text-gray-900">Bookings</h1>
        <p className="mt-0.5 text-sm text-gray-400">Manage all booking inquiries</p>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">All Bookings</h2>
            <p className="mt-0.5 text-sm text-gray-500">Manage and track booking inquiries</p>
          </div>
          <button onClick={fetchData}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {statCards.map(c => (
            <div key={c.label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500">{c.label}</p>
                <div style={{ color: c.color, background: c.bg }} className="rounded-lg p-1.5">{c.icon}</div>
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900">{c.value}</p>
            </div>
          ))}
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total Leads',         value: crmStats?.total_leads ?? '—',    icon: <Users className="h-4 w-4" />,       color: '#2563eb', bg: '#dbeafe', href: '/admin/leads' },
            { label: 'Active Customers',     value: crmStats?.active_customers ?? '—', icon: <UserCheck className="h-4 w-4" />, color: '#16a34a', bg: '#dcfce7', href: '/admin/customers' },
            { label: 'Pending Quotes',       value: crmStats?.pending_quotes ?? '—', icon: <FileText className="h-4 w-4" />,    color: '#7c3aed', bg: '#ede9fe', href: '/admin/quotes' },
            {
              label: 'Revenue This Month',
              value: crmStats ? ('Rs.' + crmStats.revenue_this_month.toLocaleString('en-IN', { maximumFractionDigits: 0 })) : '—',
              icon: <IndianRupee className="h-4 w-4" />, color: '#d97706', bg: '#fef3c7', href: '/admin/customers',
            },
          ].map(c => (
            <Link key={c.label} href={c.href}
              className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm hover:border-orange-200 transition-colors">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500">{c.label}</p>
                <div style={{ color: c.color, background: c.bg }} className="rounded-lg p-1.5">{c.icon}</div>
              </div>
              <p className="mt-2 text-xl font-bold text-gray-900">{c.value}</p>
            </Link>
          ))}
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search by name, email, phone, or tracking ID..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 shadow-sm placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
          </div>
          <div className="relative">
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-gray-700 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400">
              <option value="all">All statuses</option>
              {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                <option key={val} value={val}>{cfg.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </div>

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
                      <tr onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                        className="cursor-pointer hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-bold text-orange-600">{b.tracking_id}</span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-gray-900">{b.customer_name}</p>
                          <p className="text-xs text-gray-400">{formatDate(b.created_at)}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {b.from_city} &rarr; {b.to_city}
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
                            <div className="flex flex-wrap items-start gap-4">
                              <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4">
                                <DetailRow icon={<Phone className="h-3.5 w-3.5 text-orange-500" />} label="Phone"      val={b.customer_phone || 'Not provided'} />
                                <DetailRow icon={<Mail  className="h-3.5 w-3.5 text-orange-500" />} label="Email"      val={b.customer_email || 'Not provided'} />
                                <DetailRow icon={<Clock className="h-3.5 w-3.5 text-orange-500" />} label="Time Slot"  val={b.time_slot || 'Not specified'} />
                                <DetailRow icon={<Hash  className="h-3.5 w-3.5 text-orange-500" />} label="Booking ID" val={b.id.slice(0, 8) + '...'} />
                                {b.pickup_address && <DetailRow icon={<MapPin className="h-3.5 w-3.5 text-orange-500" />} label="Pickup" val={b.pickup_address} />}
                                {b.drop_address   && <DetailRow icon={<MapPin className="h-3.5 w-3.5 text-orange-500" />} label="Drop"   val={b.drop_address} />}
                                {b.notes          && <DetailRow icon={<Calendar className="h-3.5 w-3.5 text-orange-500" />} label="Notes" val={b.notes} />}
                              </div>
                              <div className="flex shrink-0 flex-col gap-2">
                                <button
                                  onClick={e => { e.stopPropagation(); setEditTarget(b) }}
                                  className="flex items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 py-2 text-xs font-semibold text-orange-600 shadow-sm hover:bg-orange-50 hover:border-orange-400 transition-colors"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  Edit
                                </button>
                                <GenerateInvoiceButton bookingId={b.id} adminKey={adminKey} />
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
          )}
        </div>
        <p className="mt-3 text-center text-xs text-gray-400">
          Click any row to expand details — click Edit to modify booking
        </p>
      </main>
    </>
  )
}
