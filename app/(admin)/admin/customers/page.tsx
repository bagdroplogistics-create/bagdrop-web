'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { UserCheck, Search, RefreshCw, X, Phone, Mail, IndianRupee, Package } from 'lucide-react'

interface Booking {
  id:           string
  tracking_id:  string
  from_city:    string
  to_city:      string
  created_at:   string
  status:       string
  total_amount: number
}

interface Customer {
  phone:          string
  name:           string
  email:          string
  total_bookings: number
  total_spent:    number
  last_booking:   string
  first_booking:  string
  bookings:       Booking[]
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatRupees(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

function ProfileModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between bg-gradient-to-r from-orange-500 to-orange-400 px-6 py-5 text-white">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-xl font-black mb-2">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <h2 className="text-xl font-bold">{customer.name}</h2>
            <p className="text-sm text-orange-100">{customer.phone}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
          {[
            { label: 'Bookings',     value: customer.total_bookings },
            { label: 'Total Spent',  value: formatRupees(customer.total_spent) },
            { label: 'Customer Since', value: formatDate(customer.first_booking) },
          ].map(s => (
            <div key={s.label} className="py-4 text-center">
              <p className="text-lg font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Contact */}
        <div className="flex gap-4 px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Phone className="h-4 w-4 text-orange-400" />
            <a href={`tel:${customer.phone}`} className="hover:text-orange-500">{customer.phone}</a>
          </div>
          {customer.email && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Mail className="h-4 w-4 text-orange-400" />
              <a href={`mailto:${customer.email}`} className="hover:text-orange-500">{customer.email}</a>
            </div>
          )}
        </div>

        {/* Booking history */}
        <div className="px-6 py-4 max-h-64 overflow-y-auto">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">Booking History</p>
          {customer.bookings.length === 0 ? (
            <p className="text-sm text-gray-400">No bookings</p>
          ) : (
            <div className="space-y-2">
              {customer.bookings.map(b => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{b.tracking_id}</p>
                    <p className="text-xs text-gray-400">{b.from_city} → {b.to_city} · {formatDate(b.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">{formatRupees(b.total_amount)}</p>
                    <p className="text-xs capitalize text-gray-400">{b.status.replace('_', ' ')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 px-6 py-3 text-right">
          <button onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CustomersPage() {
  const router  = useRouter()
  const [adminKey,  setAdminKey]  = useState('')
  const [authed,    setAuthed]    = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading,   setLoading]   = useState(false)
  const [search,    setSearch]    = useState('')
  const [selected,  setSelected]  = useState<Customer | null>(null)

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key')
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)
  }, [router])

  const fetchCustomers = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    const qs  = `?key=${adminKey}${search ? '&search=' + encodeURIComponent(search) : ''}`
    const res = await fetch('/api/admin/customers' + qs)
    if (res.ok) setCustomers((await res.json()).customers ?? [])
    setLoading(false)
  }, [adminKey, search])

  useEffect(() => { if (authed) fetchCustomers() }, [authed, fetchCustomers])

  if (!authed) return null

  const totalRevenue = customers.reduce((s, c) => s + c.total_spent, 0)

  return (
    <>
      {selected && <ProfileModal customer={selected} onClose={() => setSelected(null)} />}

      {/* Page header */}
      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Customers</h1>
            <p className="mt-0.5 text-sm text-gray-400">{customers.length} unique customers · {formatRupees(totalRevenue)} total revenue</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-6">
        {/* Summary stats */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total Customers',  value: customers.length,           icon: <UserCheck className="h-5 w-5" />, color: '#2563eb', bg: '#dbeafe' },
            { label: 'Total Revenue',    value: formatRupees(totalRevenue), icon: <IndianRupee className="h-5 w-5" />, color: '#16a34a', bg: '#dcfce7' },
            { label: 'Avg. Bookings',    value: customers.length > 0 ? (customers.reduce((s,c) => s + c.total_bookings, 0) / customers.length).toFixed(1) : '0', icon: <Package className="h-5 w-5" />, color: '#7c3aed', bg: '#ede9fe' },
            { label: 'Avg. Spend',       value: customers.length > 0 ? formatRupees(totalRevenue / customers.length) : '₹0', icon: <IndianRupee className="h-5 w-5" />, color: '#d97706', bg: '#fef3c7' },
          ].map(c => (
            <div key={c.label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500">{c.label}</p>
                <div style={{ color: c.color, background: c.bg }} className="rounded-lg p-1.5">{c.icon}</div>
              </div>
              <p className="mt-2 text-xl font-bold text-gray-900">{c.value}</p>
            </div>
          ))}
        </div>

        {/* Search + refresh */}
        <div className="mb-4 flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, phone, or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm shadow-sm placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
          </div>
          <button onClick={fetchCustomers} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 shadow-sm">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-gray-400">Loading customers…</div>
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <UserCheck className="mb-3 h-10 w-10 text-gray-200" />
              <p className="text-sm text-gray-400">No customers yet. Complete some bookings first.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Customer', 'Phone', 'Email', 'Bookings', 'Total Spent', 'Last Booking', 'Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {customers.map(c => (
                    <tr key={c.phone} className="hover:bg-orange-50/30 transition-colors cursor-pointer" onClick={() => setSelected(c)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-600">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-semibold text-gray-900">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{c.phone}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{c.email || '—'}</td>
                      <td className="px-4 py-3 text-center font-bold text-gray-900">{c.total_bookings}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{formatRupees(c.total_spent)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(c.last_booking)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={e => { e.stopPropagation(); setSelected(c) }}
                          className="text-xs text-orange-500 font-semibold hover:underline"
                        >
                          View Profile
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
