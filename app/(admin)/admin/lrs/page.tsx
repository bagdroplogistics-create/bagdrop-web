'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  FileText, Plus, Search, RefreshCw, ChevronDown,
  Eye, Download, Loader2, Trash2, Truck, IndianRupee, Package,
  User, MapPin, CheckCircle2,
} from 'lucide-react'
import { LR_STATUS_LABELS, LR_CHARGE_FIELDS } from '@/lib/lr-constants'

interface LR {
  id:              string
  lr_number:       string
  lr_date:         string | null
  booking_id:      string | null
  status:          string
  from_city:       string | null
  to_city:         string | null
  vehicle_number:  string | null
  consignor_name:  string | null
  consignee_name:  string | null
  total_bags:      number | null
  total_amount:    number
  created_at:      string
}

// Confirmed bookings that don't have an LR yet — the queue of "confirmed
// incoming inquiries" ready to be turned into an LR/GC with one click.
interface ConfirmedBooking {
  id:            string
  tracking_id:   string
  customer_name: string
  from_city:     string | null
  to_city:       string | null
  total_bags:    number | null
  total_amount:  number | null
  pickup_date:   string | null
}

function fmt(n: number | null | undefined) {
  return '₹' + (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function LRsPage() {
  const router = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [authed,   setAuthed]   = useState(false)
  const [lrs,      setLrs]      = useState<LR[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState('all')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)

  // Confirmed-bookings queue
  const [confirmedBookings, setConfirmedBookings] = useState<ConfirmedBooking[]>([])
  const [loadingQueue, setLoadingQueue] = useState(true)
  const [generatingId, setGeneratingId] = useState<string | null>(null)

  const totalAmount = lrs.reduce((s, l) => s + (l.total_amount || 0), 0)
  const totalBags   = lrs.reduce((s, l) => s + (l.total_bags || 0), 0)

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)
  }, [router])

  const fetchLrs = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    let qs = '?key=' + adminKey
    if (filter !== 'all') qs += '&status=' + filter
    if (search) qs += '&search=' + encodeURIComponent(search)
    const res = await fetch('/api/admin/lrs' + qs)
    if (res.ok) setLrs((await res.json()).lrs ?? [])
    setLoading(false)
  }, [adminKey, filter, search])

  // Confirmed bookings still waiting on an LR — cross-referenced against
  // every LR ever generated (not just the current filtered/searched view
  // above), so a booking already covered by an LR never shows up twice
  // regardless of what filter/search is active on the main table.
  const fetchQueue = useCallback(async () => {
    if (!adminKey) return
    setLoadingQueue(true)
    try {
      const [bookingsRes, allLrsRes] = await Promise.all([
        fetch(`/api/admin/bookings?key=${adminKey}&status=confirmed&limit=200`),
        fetch(`/api/admin/lrs?key=${adminKey}&limit=1000`),
      ])
      const bookingsData = bookingsRes.ok ? await bookingsRes.json() : { bookings: [] }
      const lrsData      = allLrsRes.ok  ? await allLrsRes.json()  : { lrs: [] }
      const coveredBookingIds = new Set(
        (lrsData.lrs ?? []).map((l: LR) => l.booking_id).filter(Boolean)
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pending: ConfirmedBooking[] = (bookingsData.bookings ?? [])
        .filter((b: { id: string }) => !coveredBookingIds.has(b.id))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((b: any) => ({
          id: b.id, tracking_id: b.tracking_id, customer_name: b.customer_name,
          from_city: b.from_city ?? null, to_city: b.to_city ?? null,
          total_bags: b.total_bags ?? null, total_amount: b.total_amount ?? null,
          pickup_date: b.pickup_date ?? null,
        }))
      setConfirmedBookings(pending)
    } catch { /* non-fatal — queue just stays empty */ }
    setLoadingQueue(false)
  }, [adminKey])

  useEffect(() => { if (authed) { fetchLrs(); fetchQueue() } }, [authed, fetchLrs, fetchQueue])

  async function generateLr(bookingId: string) {
    setGeneratingId(bookingId)
    try {
      const res = await fetch('/api/admin/lrs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ booking_id: bookingId }),
      })
      const d = await res.json()
      if (!res.ok) { alert(d.error ?? 'Could not generate LR'); setGeneratingId(null); return }
      router.push(`/admin/lrs/${d.lr.id}`)
    } catch {
      alert('Network error — please try again')
      setGeneratingId(null)
    }
  }

  async function deleteLr(id: string) {
    if (!confirm('Delete this LR? This cannot be undone.')) return
    setDeleting(id)
    await fetch('/api/admin/lrs/' + id, { method: 'DELETE', headers: { 'x-admin-key': adminKey } })
    setDeleting(null)
    fetchLrs()
    fetchQueue()
  }

  async function downloadLr(id: string) {
    setDownloading(id)
    try {
      const res = await fetch(`/api/admin/lrs/${id}?key=${encodeURIComponent(adminKey)}`)
      if (!res.ok) throw new Error('Could not load LR')
      const { lr } = await res.json()

      const { pdf } = await import('@react-pdf/renderer')
      const { default: LRPDF } = await import('@/components/admin/LRPDF')

      const charges: Record<string, number> = {}
      for (const f of LR_CHARGE_FIELDS) charges[f.key] = lr[f.key] ?? 0

      const blob = await pdf(
        LRPDF({
          lrNumber: lr.lr_number, lrDate: lr.lr_date, status: lr.status,
          bookingOffice: lr.booking_office, vehicleNumber: lr.vehicle_number,
          fromCity: lr.from_city, toCity: lr.to_city, mode: lr.mode,
          consignorName: lr.consignor_name, consignorAddress: lr.consignor_address,
          consignorMobile: lr.consignor_mobile, consignorGstin: lr.consignor_gstin,
          consigneeName: lr.consignee_name, consigneeAddress: lr.consignee_address,
          consigneeMobile: lr.consignee_mobile, consigneeGstin: lr.consignee_gstin,
          billedToName: lr.billed_to_name, billedToGstin: lr.billed_to_gstin,
          deliveryAddress: lr.delivery_address,
          invoiceNumber: lr.invoice_number, invoiceValue: lr.invoice_value, ewayBillNumber: lr.eway_bill_number,
          totalBags: lr.total_bags, contentDescription: lr.content_description,
          actualWeight: lr.actual_weight, chargeableWeight: lr.chargeable_weight,
          sizeL: lr.size_l, sizeW: lr.size_w, sizeH: lr.size_h, privateMark: lr.private_mark,
          charges, subTotal: lr.sub_total, igstAmount: lr.igst_amount,
          cgstAmount: lr.cgst_amount, sgstAmount: lr.sgst_amount, totalAmount: lr.total_amount,
          insuranceByCustomer: lr.insurance_by_customer, gstPayableBy: lr.gst_payable_by,
          paymentTerms: lr.payment_terms, lrType: lr.lr_type, deliveryAt: lr.delivery_at,
          remarks: lr.remarks, preparedBy: lr.prepared_by,
        })
      ).toBlob()

      const url  = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${lr.lr_number}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('LR PDF generation failed:', e)
      alert('Could not generate the LR PDF. Please try again.')
    } finally {
      setDownloading(null)
    }
  }

  if (!authed) return null

  return (
    <>
      <div className="border-b border-orange-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">LR / GC Management</h1>
            <p className="mt-0.5 text-sm text-gray-400">Generate and track Lorry Receipts / Goods Consignments</p>
          </div>
          <Link href="/admin/lrs/new"
            className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors">
            <Plus className="h-4 w-4" /> New LR
          </Link>
        </div>
      </div>

      <main className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6">

        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[
            { label: 'Total LRs',     value: lrs.length,      icon: <FileText className="h-4 w-4" />,     color: '#f97316', bg: '#fff7ed' },
            { label: 'Total Bags',    value: totalBags,        icon: <Package className="h-4 w-4" />,      color: '#2563eb', bg: '#eff6ff' },
            { label: 'Total Value',   value: fmt(totalAmount), icon: <IndianRupee className="h-4 w-4" />,  color: '#16a34a', bg: '#f0fdf4' },
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

        {/* ── Confirmed bookings awaiting an LR ── */}
        <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50/40 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50 px-5 py-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-blue-500" />
              <h2 className="text-sm font-bold text-gray-800">Confirmed Bookings — Awaiting LR</h2>
              {!loadingQueue && (
                <span className="rounded-full bg-blue-500 px-2 py-0.5 text-xs font-bold text-white">{confirmedBookings.length}</span>
              )}
            </div>
            <button onClick={fetchQueue} className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700">
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          </div>

          {loadingQueue ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
            </div>
          ) : confirmedBookings.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-gray-400">
              No confirmed bookings waiting on an LR right now — new confirmed inquiries will show up here automatically.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-blue-100">
                <thead>
                  <tr>
                    {['Tracking ID', 'Customer', 'Route', 'Bags', 'Amount', ''].map(h => (
                      <th key={h} className="px-5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-blue-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-50 bg-white">
                  {confirmedBookings.map(b => (
                    <tr key={b.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs font-bold text-orange-500">{b.tracking_id}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5 text-sm text-gray-800"><User className="h-3.5 w-3.5 text-gray-400" />{b.customer_name}</div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5 text-sm text-gray-600 whitespace-nowrap"><MapPin className="h-3.5 w-3.5 text-gray-400" />{b.from_city ?? '—'} → {b.to_city ?? '—'}</div>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-700">{b.total_bags ?? '—'}</td>
                      <td className="px-5 py-3 text-sm font-semibold text-gray-900">{fmt(b.total_amount)}</td>
                      <td className="px-5 py-3">
                        <button onClick={() => generateLr(b.id)} disabled={generatingId === b.id}
                          className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors disabled:opacity-50 whitespace-nowrap">
                          {generatingId === b.id
                            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                            : <><FileText className="h-3.5 w-3.5" /> Generate LR</>}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search by GC no., consignor, consignee, vehicle…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm shadow-sm placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
          </div>
          <div className="relative">
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-gray-700 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400">
              <option value="all">All statuses</option>
              {Object.entries(LR_STATUS_LABELS).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
          <button onClick={fetchLrs}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 shadow-sm transition-colors">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
            </div>
          ) : lrs.length === 0 ? (
            <div className="py-24 text-center">
              <FileText className="mx-auto h-12 w-12 text-gray-200 mb-3" />
              <p className="text-sm font-semibold text-gray-500">No LRs yet</p>
              <p className="text-xs text-gray-400 mt-1">Generate one from a confirmed booking, or create it manually</p>
              <Link href="/admin/lrs/new"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors">
                <Plus className="h-4 w-4" /> New LR
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['GC No.', 'Date', 'Consignor', 'Consignee', 'Route', 'Vehicle', 'Bags', 'Amount', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {lrs.map(l => {
                    const st = LR_STATUS_LABELS[l.status] ?? { label: l.status, color: '#6b7280', bg: '#f3f4f6' }
                    return (
                      <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/admin/lrs/${l.id}`} className="font-mono text-xs font-bold text-orange-500 hover:text-orange-600">
                            {l.lr_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(l.lr_date)}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{l.consignor_name ?? '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{l.consignee_name ?? '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {l.from_city && l.to_city ? `${l.from_city} → ${l.to_city}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                          <div className="flex items-center gap-1"><Truck className="h-3 w-3" /> {l.vehicle_number ?? '—'}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{l.total_bags ?? '—'}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">{fmt(l.total_amount)}</td>
                        <td className="px-4 py-3">
                          <span style={{ color: st.color, background: st.bg }}
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap">
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Link href={`/admin/lrs/${l.id}`}
                              className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors">
                              <Eye className="h-3.5 w-3.5" />
                            </Link>
                            <button onClick={() => downloadLr(l.id)} disabled={downloading === l.id}
                              title="Download LR PDF"
                              className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-green-50 hover:text-green-600 hover:border-green-200 transition-colors disabled:opacity-40">
                              {downloading === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                            </button>
                            <button onClick={() => deleteLr(l.id)} disabled={deleting === l.id}
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
