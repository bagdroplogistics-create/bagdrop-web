'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Truck, Plus, Search, RefreshCw, ChevronDown,
  Eye, Pencil, Trash2, Download, Loader2, TrendingUp, TrendingDown, IndianRupee,
  Package, CheckCircle, Clock, MapPin,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────
interface TripSheet {
  id:            string
  trip_number:   string
  booking_id:    string | null
  customer_name: string | null
  customer_phone:string | null
  service_label: string | null
  from_city:     string | null
  to_city:       string | null
  pickup_date:   string | null
  delivery_date: string | null
  vendor:        string | null
  driver_name:   string | null
  status:        string
  total_expense: number
  total_income:  number
  net_profit:    number
  created_by:    string
  created_at:    string
}

// ── Status config ─────────────────────────────────────────────
const TRIP_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  created:          { label: 'Created',           color: '#6b7280', bg: '#f3f4f6' },
  pickup_assigned:  { label: 'Pickup Assigned',   color: '#d97706', bg: '#fef3c7' },
  picked_up:        { label: 'Picked Up',         color: '#7c3aed', bg: '#ede9fe' },
  in_transit:       { label: 'In Transit',        color: '#2563eb', bg: '#dbeafe' },
  at_airport:       { label: 'At Airport',        color: '#0891b2', bg: '#cffafe' },
  out_for_delivery: { label: 'Out for Delivery',  color: '#ea580c', bg: '#ffedd5' },
  delivered:        { label: 'Delivered',         color: '#16a34a', bg: '#dcfce7' },
  completed:        { label: 'Completed',         color: '#15803d', bg: '#bbf7d0' },
  cancelled:        { label: 'Cancelled',         color: '#dc2626', bg: '#fee2e2' },
}

function fmt(n: number | null | undefined) {
  return '₹' + (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Main page ─────────────────────────────────────────────────
export default function TripSheetsPage() {
  const router = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [authed,   setAuthed]   = useState(false)
  const [sheets,   setSheets]   = useState<TripSheet[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState('all')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)

  // Summary totals
  const totalIncome  = sheets.reduce((s, t) => s + (t.total_income  || 0), 0)
  const totalExpense = sheets.reduce((s, t) => s + (t.total_expense || 0), 0)
  const netProfit    = totalIncome - totalExpense

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)
  }, [router])

  const fetchSheets = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    let qs = '?key=' + adminKey
    if (filter !== 'all') qs += '&status=' + filter
    if (search) qs += '&search=' + encodeURIComponent(search)
    const res = await fetch('/api/admin/trip-sheets' + qs)
    if (res.ok) setSheets((await res.json()).trip_sheets ?? [])
    setLoading(false)
  }, [adminKey, filter, search])

  useEffect(() => { if (authed) fetchSheets() }, [authed, fetchSheets])

  async function deleteSheet(id: string) {
    if (!confirm('Delete this trip sheet? This cannot be undone.')) return
    setDeleting(id)
    await fetch('/api/admin/trip-sheets/' + id, {
      method: 'DELETE', headers: { 'x-admin-key': adminKey },
    })
    setDeleting(null)
    fetchSheets()
  }

  async function downloadTripSheet(id: string) {
    setDownloading(id)
    try {
      const res = await fetch(`/api/admin/trip-sheets/${id}?key=${encodeURIComponent(adminKey)}`)
      if (!res.ok) throw new Error('Could not load trip sheet')
      const { trip_sheet: ts } = await res.json()

      const { pdf } = await import('@react-pdf/renderer')
      const { default: TripSheetPDF } = await import('./TripSheetPDF')

      const blob = await pdf(
        TripSheetPDF({
          tripNumber:        ts.trip_number,
          createdAt:         ts.created_at,
          status:            ts.status,
          bookingId:         ts.booking_id,
          customerName:      ts.customer_name,
          customerPhone:     ts.customer_phone,
          customerEmail:     ts.customer_email,
          fromCity:          ts.from_city,
          toCity:            ts.to_city,
          pickupAddress:     ts.pickup_address,
          dropAddress:       ts.drop_address,
          pickupDate:        ts.pickup_date,
          deliveryDate:      ts.delivery_date,
          totalBags:         ts.total_bags,
          serviceLabel:      ts.service_label,
          vendor:            ts.vendor,
          driverName:        ts.driver_name,
          vehicleNumber:     ts.vehicle_number,
          consignmentNumber: ts.consignment_number,
          luggageCode:       ts.luggage_code,
          cloakRoomNumber:   ts.cloak_room_number,
          pickupPerson:      ts.pickup_person,
          pickupContact:     ts.pickup_contact,
          deliveryPerson:    ts.delivery_person,
          deliveryContact:   ts.delivery_contact,
          expenses:          ts.trip_expenses ?? [],
          quoteAmount:       ts.quote_amount ?? 0,
          additionalCharges: ts.additional_charges ?? 0,
          discount:          ts.discount ?? 0,
          taxAmount:         ts.tax_amount ?? 0,
          totalIncome:       ts.total_income ?? 0,
          totalExpense:      ts.total_expense ?? 0,
          netProfit:         ts.net_profit ?? 0,
          paymentStatus:     ts.payment_status,
          notes:             ts.notes,
          remarks:           ts.remarks,
        })
      ).toBlob()

      const url  = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href     = url
      link.download = `${ts.trip_number}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Trip sheet PDF generation failed:', e)
      alert('Could not generate the trip sheet PDF. Please try again.')
    } finally {
      setDownloading(null)
    }
  }

  if (!authed) return null

  return (
    <>
      {/* Header */}
      <div className="border-b border-orange-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Trip Sheets</h1>
            <p className="mt-0.5 text-sm text-gray-400">Track every trip from pickup to delivery</p>
          </div>
          <Link href="/admin/trip-sheets/new"
            className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors">
            <Plus className="h-4 w-4" /> New Trip Sheet
          </Link>
        </div>
      </div>

      <main className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6">

        {/* Summary cards */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Total Trips',    value: sheets.length,       icon: <Truck className="h-4 w-4" />,         color: '#f97316', bg: '#fff7ed' },
            { label: 'Total Income',   value: fmt(totalIncome),    icon: <TrendingUp className="h-4 w-4" />,    color: '#16a34a', bg: '#f0fdf4' },
            { label: 'Total Expense',  value: fmt(totalExpense),   icon: <TrendingDown className="h-4 w-4" />, color: '#dc2626', bg: '#fef2f2' },
            { label: 'Net Profit',     value: fmt(netProfit),      icon: <IndianRupee className="h-4 w-4" />,  color: netProfit >= 0 ? '#16a34a' : '#dc2626', bg: netProfit >= 0 ? '#f0fdf4' : '#fef2f2' },
          ].map(c => (
            <div key={c.label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <span style={{ color: c.color, background: c.bg }} className="flex h-8 w-8 items-center justify-center rounded-lg">
                  {c.icon}
                </span>
                <span className="text-xs font-semibold text-gray-500">{c.label}</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{c.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search by customer, trip no., driver…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm shadow-sm placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
          </div>
          <div className="relative">
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-gray-700 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400">
              <option value="all">All statuses</option>
              {Object.entries(TRIP_STATUS).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
          <button onClick={fetchSheets}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 shadow-sm transition-colors">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
            </div>
          ) : sheets.length === 0 ? (
            <div className="py-24 text-center">
              <Truck className="mx-auto h-12 w-12 text-gray-200 mb-3" />
              <p className="text-sm font-semibold text-gray-500">No trip sheets yet</p>
              <p className="text-xs text-gray-400 mt-1">Create a trip sheet once a booking is confirmed</p>
              <Link href="/admin/trip-sheets/new"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors">
                <Plus className="h-4 w-4" /> New Trip Sheet
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['Trip #', 'Customer', 'Route', 'Service', 'Pickup', 'Delivery', 'Vendor / Driver', 'Status', 'Income', 'Expense', 'Profit', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sheets.map(s => {
                    const st = TRIP_STATUS[s.status] ?? { label: s.status, color: '#6b7280', bg: '#f3f4f6' }
                    const profit = s.net_profit ?? (s.total_income - s.total_expense)
                    return (
                      <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/admin/trip-sheets/${s.id}`}
                            className="font-mono text-xs font-bold text-orange-500 hover:text-orange-600">
                            {s.trip_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-gray-900">{s.customer_name ?? '—'}</p>
                          <p className="text-xs text-gray-400">{s.customer_phone ?? ''}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {s.from_city && s.to_city ? `${s.from_city} → ${s.to_city}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{s.service_label ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          <div className="flex items-center gap-1"><Package className="h-3 w-3" /> {fmtDate(s.pickup_date)}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          <div className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {fmtDate(s.delivery_date)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-medium text-gray-700">{s.vendor ?? '—'}</p>
                          <p className="text-xs text-gray-400">{s.driver_name ?? ''}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span style={{ color: st.color, background: st.bg }}
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap">
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-green-700">{fmt(s.total_income)}</td>
                        <td className="px-4 py-3 text-sm font-medium text-red-600">{fmt(s.total_expense)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-sm font-bold ${profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                            {profit >= 0 ? '+' : ''}{fmt(profit)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Link href={`/admin/trip-sheets/${s.id}`}
                              className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors">
                              <Eye className="h-3.5 w-3.5" />
                            </Link>
                            <Link href={`/admin/trip-sheets/${s.id}?tab=edit`}
                              className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-100 hover:text-orange-600 transition-colors">
                              <Pencil className="h-3.5 w-3.5" />
                            </Link>
                            <button onClick={() => downloadTripSheet(s.id)} disabled={downloading === s.id}
                              title="Download trip sheet"
                              className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-green-50 hover:text-green-600 hover:border-green-200 transition-colors disabled:opacity-40">
                              {downloading === s.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Download className="h-3.5 w-3.5" />}
                            </button>
                            <button onClick={() => deleteSheet(s.id)} disabled={deleting === s.id}
                              className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors disabled:opacity-40">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
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
