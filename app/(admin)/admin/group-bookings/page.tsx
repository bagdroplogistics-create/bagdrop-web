'use client'

// BAGDROP — Group / Wedding Booking list.
//
// Every Group Booking shows as ONE row here regardless of how many guests
// or bags it has (spec section 29: "Do not show 150 rows.") — guest/bag
// detail lives one click away on the detail page
// (app/(admin)/admin/group-bookings/[id]/page.tsx). This is a dedicated
// list rather than mixed into the existing Leads table on purpose: the
// Leads table has deep assumptions baked in (one lead = one customer, one
// quote) that a 100-guest wedding doesn't fit, and mixing row shapes there
// risked breaking that table for ordinary individual bookings. The linked
// `leads`/`bookings` row still exists underneath every Group Booking (see
// app/api/admin/group-bookings/route.ts), so it also appears in Payments/
// LR/Tripsheet/Invoice exactly like any other booking.

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Users2, Plus, Search, RefreshCw, Luggage, ChevronRight } from 'lucide-react'
import { formatCustomerName } from '@/lib/constants'

interface GroupBookingRow {
  booking_id: string
  group_booking_number: string
  event_name: string
  event_type: string | null
  primary_contact_name: string
  primary_contact_number: string
  event_date: string | null
  pickup_city: string | null
  delivery_city: string | null
  estimated_total_bags: number | null
  final_total_bags: number | null
  guest_count: number
  bag_count: number
  created_at: string
  booking: {
    id: string
    tracking_id: string
    status: string
    payment_status: string | null
    total_amount: number | null
    is_test?: boolean
  } | null
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  inquiry:            { label: 'Inquiry',           color: '#92400e', bg: '#fef3c7' },
  quote_created:       { label: 'Quote Created',     color: '#4f46e5', bg: '#eef2ff' },
  quote_sent:          { label: 'Quote Sent',        color: '#6d28d9', bg: '#ede9fe' },
  accepted:            { label: 'Quote Accepted',    color: '#0891b2', bg: '#cffafe' },
  payment_pending:     { label: 'Payment Requested', color: '#d97706', bg: '#fef3c7' },
  payment_received:    { label: 'Payment Received',  color: '#059669', bg: '#d1fae5' },
  confirmed:           { label: 'Confirmed',         color: '#2563eb', bg: '#dbeafe' },
  completed:           { label: 'Completed',         color: '#14532d', bg: '#bbf7d0' },
  cancelled:           { label: 'Cancelled',         color: '#dc2626', bg: '#fee2e2' },
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function GroupBookingsPage() {
  const router = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [authed, setAuthed]     = useState(false)
  const [rows, setRows]         = useState<GroupBookingRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key)
    setAuthed(true)
  }, [router])

  const fetchRows = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    const qs = search ? `?search=${encodeURIComponent(search)}&key=${adminKey}` : `?key=${adminKey}`
    const res = await fetch('/api/admin/group-bookings' + qs, { headers: { 'x-admin-key': adminKey } })
    if (res.ok) setRows((await res.json()).group_bookings ?? [])
    setLoading(false)
  }, [adminKey, search])

  useEffect(() => { if (authed) fetchRows() }, [authed, fetchRows])

  if (!authed) return null

  return (
    <>
      <div className="border-b border-orange-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
              <Users2 className="h-5 w-5 text-orange-500" /> Group / Wedding Bookings
            </h1>
            <p className="mt-0.5 text-sm text-gray-400">Large multi-guest bookings — one record, many guests, many individually tracked bags</p>
          </div>
          <button onClick={() => router.push('/admin/group-bookings/new')}
            className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors">
            <Plus className="h-4 w-4" /> New Group Booking
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search by Group Booking ID, Event Name, Contact Name, or Mobile…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 shadow-sm placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
          </div>
          <button onClick={fetchRows}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-24 text-center">
              <p className="text-sm text-gray-400">No group bookings yet</p>
              <button onClick={() => router.push('/admin/group-bookings/new')}
                className="mt-3 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors">
                Create First Group Booking
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['Group Booking ID', 'Event', 'Primary Contact', 'Route', 'Guests', 'Bags', 'Status', 'Date', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map(g => {
                    const meta = STATUS_LABELS[g.booking?.status ?? ''] ?? { label: g.booking?.status ?? '—', color: '#6b7280', bg: '#f3f4f6' }
                    const totalBags = g.final_total_bags ?? g.estimated_total_bags ?? g.bag_count
                    return (
                      <tr key={g.booking_id} onClick={() => router.push(`/admin/group-bookings/${g.booking_id}`)}
                        className="cursor-pointer hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-bold text-pink-700">{g.group_booking_number}</span>
                          <div className="text-[11px] text-gray-400">{g.booking?.tracking_id}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-gray-900">{g.event_name}</p>
                            {g.booking?.is_test && (
                              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">Test</span>
                            )}
                          </div>
                          {g.event_type && <p className="text-xs text-gray-400">{g.event_type}</p>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {formatCustomerName(undefined, g.primary_contact_name) || g.primary_contact_name}
                          <div className="text-xs text-gray-400">{g.primary_contact_number}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {g.pickup_city && g.delivery_city ? `${g.pickup_city} → ${g.delivery_city}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-medium text-gray-700">{g.guest_count}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 text-sm font-semibold text-gray-700">
                            <Luggage className="h-3.5 w-3.5 text-gray-400" />
                            {g.bag_count > 0 ? `${g.bag_count} / ${totalBags}` : totalBags}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span style={{ color: meta.color, background: meta.bg }}
                            className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold">
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(g.event_date ?? g.created_at)}</td>
                        <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-gray-300" /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
