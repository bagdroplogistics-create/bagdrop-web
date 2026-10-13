'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  FileText, Plus, Search, RefreshCw, ChevronDown,
  Eye, Download, Loader2, Trash2, IndianRupee, Package,
  User, MapPin, CheckCircle2, Pencil, Building2, Printer, AlertTriangle,
} from 'lucide-react'
import { LR_STATUS_LABELS, LR_CHARGE_FIELDS } from '@/lib/lr-constants'
import { formatCustomerName } from '@/lib/constants'
import { indianFinancialYear } from '@/lib/financial-year'

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
  branch_code:     string | null
  branch_name:     string | null
  financial_year:  string | null
  // Joined from the linked booking / inquiry by GET /api/admin/lrs
  tracking_id?:    string | null
  inquiry_id?:     string | null
  lead_id?:        string | null
  customer_name?:  string | null
  customer_phone?: string | null
  service_type?:   string | null
  pickup_date?:    string | null
  delivery_date?:  string | null
}

interface BranchOption {
  id:          string
  branch_code: string
  branch_name: string
}

// Last 3 FY labels (current + 2 prior) — enough to cover any LR generated
// since this feature shipped without hardcoding years that will go stale.
function recentFinancialYears(): string[] {
  const { startYear } = indianFinancialYear()
  return [0, 1, 2].map(back => {
    const y = startYear - back
    return `${y}-${String((y + 1) % 100).padStart(2, '0')}`
  })
}

// Confirmed bookings that don't have an LR yet — the queue of "confirmed
// incoming inquiries" ready to be turned into an LR/GC with one click.
interface ConfirmedBooking {
  id:            string
  tracking_id:   string
  title?:        string | null
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
  // "View LR" (the eye icon below) — opens the actual generated Lorry
  // Receipt document in a new tab, same PDF viewLr()/downloadLr() below
  // both build. Separate loading flag from `downloading` so the two
  // buttons' spinners never get confused about which row is busy.
  const [viewingLr, setViewingLr] = useState<string | null>(null)
  const [printingLr, setPrintingLr] = useState<string | null>(null)
  // Pagination — same pattern as the Leads / Dashboard tables
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // Completed inquiries → GC backfill (dry-run first, then confirm)
  interface BackfillFlag { booking_id: string; tracking_id: string | null; customer_name: string | null; from_city: string | null; reasons: string[] }
  interface BackfillPlan {
    completed_total: number; already_have_lr: number; missing_lr: number; ready_count: number; flagged_count: number
    flagged: BackfillFlag[]
    ready?: { booking_id: string; tracking_id: string | null; customer_name: string | null; from_city: string | null; pickup_date: string | null; branch_code: string }[]
  }
  const [backfillPlan, setBackfillPlan] = useState<BackfillPlan | null>(null)
  const [backfillBusy, setBackfillBusy] = useState(false)
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null)

  // Branch-Wise LR filters — spec section 10. "All Branches" (branchFilter
  // === 'all') deliberately omits branch_id from the query entirely rather
  // than sending it empty, so a branch-scoped key still only ever sees its
  // own branch (enforced server-side regardless of what's sent — see
  // app/api/admin/lrs/route.ts).
  const [branches,     setBranches]     = useState<BranchOption[]>([])
  const [branchFilter, setBranchFilter] = useState('all')
  const [fyFilter,     setFyFilter]     = useState('all')
  const fyOptions = recentFinancialYears()

  // Confirmed-bookings queue
  const [confirmedBookings, setConfirmedBookings] = useState<ConfirmedBooking[]>([])
  const [loadingQueue, setLoadingQueue] = useState(true)
  const [generatingId, setGeneratingId] = useState<string | null>(null)

  const totalPages  = Math.max(1, Math.ceil(lrs.length / pageSize))
  const pagedLrs    = lrs.slice((page - 1) * pageSize, page * pageSize)
  const showingFrom  = lrs.length === 0 ? 0 : (page - 1) * pageSize + 1
  const showingTo    = Math.min(page * pageSize, lrs.length)

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
    let qs = '?key=' + adminKey + '&limit=5000'   // server default is 50 — would hide older GCs
    if (filter !== 'all') qs += '&status=' + filter
    if (search) qs += '&search=' + encodeURIComponent(search)
    if (branchFilter !== 'all') qs += '&branch_id=' + branchFilter
    if (fyFilter !== 'all') qs += '&financial_year=' + encodeURIComponent(fyFilter)
    const res = await fetch('/api/admin/lrs' + qs)
    if (res.ok) setLrs((await res.json()).lrs ?? [])
    setLoading(false)
  }, [adminKey, filter, search, branchFilter, fyFilter])

  const fetchBranches = useCallback(async () => {
    if (!adminKey) return
    const res = await fetch(`/api/admin/branches?key=${adminKey}`)
    if (res.ok) setBranches((await res.json()).branches ?? [])
  }, [adminKey])

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
        fetch(`/api/admin/lrs?key=${adminKey}&limit=5000&slim=1`),
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
          id: b.id, tracking_id: b.tracking_id, title: b.title ?? null, customer_name: b.customer_name,
          from_city: b.from_city ?? null, to_city: b.to_city ?? null,
          total_bags: b.total_bags ?? null, total_amount: b.total_amount ?? null,
          pickup_date: b.pickup_date ?? null,
        }))
      setConfirmedBookings(pending)
    } catch { /* non-fatal — queue just stays empty */ }
    setLoadingQueue(false)
  }, [adminKey])

  useEffect(() => { if (authed) { fetchLrs(); fetchQueue(); fetchBranches() } }, [authed, fetchLrs, fetchQueue, fetchBranches])
  // Back to page 1 whenever the filters / search / page size change
  useEffect(() => { setPage(1) }, [filter, search, branchFilter, fyFilter, pageSize])

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

  // Shared by downloadLr() and viewLr() below — fetches the full LR row and
  // renders it through the exact same LRPDF component both actions use, so
  // "View" and "Download" can never show two different documents for the
  // same LR. Returns the built blob plus the LR row (viewLr needs
  // lr.lr_number too, for the tab's fallback filename).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function buildLrPdfBlob(id: string): Promise<{ blob: Blob; lr: any }> {
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
        sizeL: lr.size_l, sizeW: lr.size_w, sizeH: lr.size_h, privateMark: lr.private_mark, tiTag: lr.ti_tag,
        charges, subTotal: lr.sub_total, igstAmount: lr.igst_amount,
        cgstAmount: lr.cgst_amount, sgstAmount: lr.sgst_amount, totalAmount: lr.total_amount,
        insuranceByCustomer: lr.insurance_by_customer, gstPayableBy: lr.gst_payable_by,
        paymentTerms: lr.payment_terms, lrType: lr.lr_type, deliveryAt: lr.delivery_at,
        remarks: lr.remarks, preparedBy: lr.prepared_by,
        branchName: lr.branch_name ?? null, branchAddress: lr.branch_address ?? null,
        branchGstNumber: lr.branch_gst_number ?? null, branchContactNumber: lr.branch_contact_number ?? null,
        branchEmail: lr.branch_email ?? null,
      })
    ).toBlob()

    return { blob, lr }
  }

  async function downloadLr(id: string) {
    setDownloading(id)
    try {
      const { blob, lr } = await buildLrPdfBlob(id)
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

  // "View LR" — opens the actual Lorry Receipt PDF in a new tab, instead of
  // the "Edit LR" details/form page (Pencil icon, unchanged, still links to
  // /admin/lrs/[id]). Founder-reported 2026-09-07: clicking the eye icon
  // should open the LR document itself.
  //
  // Opens a blank tab SYNCHRONOUSLY on click, then navigates it to the
  // blob URL once the PDF is built — building the PDF is async (a fetch +
  // a react-pdf render), and calling window.open() only after an await
  // would no longer be seen as a direct result of the user's click, so
  // most browsers' popup blockers would silently swallow it. Opening the
  // tab first (still inside the synchronous click handler) and filling it
  // in afterward avoids that entirely.
  async function viewLr(id: string) {
    const win = window.open('', '_blank')
    setViewingLr(id)
    try {
      const { blob } = await buildLrPdfBlob(id)
      const url = URL.createObjectURL(blob)
      if (win) {
        win.location.href = url
      } else {
        // Popup blocked even before the PDF existed (rare — usually means
        // the browser blocks ALL popups from this site) — fall back to a
        // normal download so the admin still gets the document somehow.
        const link = document.createElement('a')
        link.href = url
        link.download = 'LR.pdf'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
      // Revoked later, not immediately — the new tab still needs to load
      // this blob: URL after we hand it the address.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      win?.close()
      console.error('LR PDF generation failed:', e)
      alert('Could not open the LR PDF. Please try again.')
    } finally {
      setViewingLr(null)
    }
  }

  // Print: same PDF as View/Download, loaded into a hidden iframe and sent to
  // the browser's print dialog.
  async function printLr(id: string) {
    setPrintingLr(id)
    try {
      const { blob } = await buildLrPdfBlob(id)
      const url = URL.createObjectURL(blob)
      const iframe = document.createElement('iframe')
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
      iframe.src = url
      iframe.onload = () => {
        try { iframe.contentWindow?.focus(); iframe.contentWindow?.print() } catch { window.open(url, '_blank') }
        setTimeout(() => { document.body.removeChild(iframe); URL.revokeObjectURL(url) }, 60_000)
      }
      document.body.appendChild(iframe)
    } catch (e) {
      console.error('LR print failed:', e)
      alert('Could not prepare the LR for printing. Please try again.')
    } finally {
      setPrintingLr(null)
    }
  }

  async function runBackfill(dryRun: boolean) {
    setBackfillBusy(true); setBackfillMsg(null)
    try {
      if (dryRun) {
        const res = await fetch('/api/admin/lrs/backfill-completed', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
          body: JSON.stringify({ dry_run: true }),
        })
        const d = await res.json()
        if (!res.ok) { setBackfillMsg(d.error ?? 'Could not check completed inquiries'); return }
        setBackfillPlan(d)
        return
      }
      let createdTotal = 0
      const failures: string[] = []
      // Small batches: each GC takes several database round-trips, and a big
      // batch can exceed the server's time limit (that showed up as a bare
      // "Network error"). Already-created GCs are never repeated, so if a
      // request does fail you can simply click Check → Generate again.
      for (let i = 0; i < 120; i++) {
        setBackfillMsg(`Generating… ${createdTotal} done`)
        const res = await fetch('/api/admin/lrs/backfill-completed', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
          body: JSON.stringify({ dry_run: false, batch_size: 5 }),
        })
        let d: { error?: string; created?: unknown[]; failed?: { tracking_id: string | null; booking_id: string; error: string }[]; remaining?: number } = {}
        try { d = await res.json() } catch { failures.push(`Server returned HTTP ${res.status} (timeout?) — click Check again to continue`); break }
        if (!res.ok) { failures.push(d.error ?? `HTTP ${res.status}`); break }
        createdTotal += d.created?.length ?? 0
        for (const f of d.failed ?? []) failures.push(`${f.tracking_id ?? f.booking_id}: ${f.error}`)
        if (!d.remaining || (d.created?.length ?? 0) === 0) break
      }
      setBackfillMsg(`Generated ${createdTotal} GC${createdTotal === 1 ? '' : 's'}.` + (failures.length ? ` ${failures.length} problem(s): ${failures.slice(0, 3).join(' | ')}` : ''))
      setBackfillPlan(null)
      fetchLrs(); fetchQueue()
    } catch {
      setBackfillMsg('Network error — some GCs may already have been created. Refresh, then click Check Completed Inquiries to continue.')
      fetchLrs()
    } finally {
      setBackfillBusy(false)
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
                        <div className="flex items-center gap-1.5 text-sm text-gray-800"><User className="h-3.5 w-3.5 text-gray-400" />{formatCustomerName(b.title, b.customer_name) || b.customer_name}</div>
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

        {/* ── Completed inquiries without a GC ── */}
        <div className="mb-6 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-gray-800">Completed Inquiries — GC Backfill</h2>
              <p className="text-xs text-gray-500">Finds Completed bookings that have no LR/GC and generates one using the pickup branch&apos;s numbering. Incomplete records are flagged, not generated.</p>
            </div>
            <button onClick={() => runBackfill(true)} disabled={backfillBusy}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
              {backfillBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Check Completed Inquiries
            </button>
          </div>
          {backfillMsg && <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-emerald-700">{backfillMsg}</p>}
          {backfillPlan && (
            <div className="mt-3 space-y-3 text-xs text-gray-700">
              <p>
                {backfillPlan.completed_total} completed · {backfillPlan.already_have_lr} already have a GC ·{' '}
                <b>{backfillPlan.ready_count} ready to generate</b> · <b className="text-amber-600">{backfillPlan.flagged_count} need review</b>
              </p>
              {backfillPlan.ready_count > 0 && (
                <button onClick={() => { if (confirm(`Generate ${backfillPlan.ready_count} GC document(s)? Numbers are issued per pickup branch and cannot be reused.`)) runBackfill(false) }}
                  disabled={backfillBusy}
                  className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                  Generate {backfillPlan.ready_count} GC{backfillPlan.ready_count === 1 ? '' : 's'} now
                </button>
              )}
              {backfillPlan.flagged.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="mb-1 flex items-center gap-1.5 font-semibold text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> Needs review (no GC created)</p>
                  <ul className="max-h-48 space-y-1 overflow-y-auto">
                    {backfillPlan.flagged.map(f => (
                      <li key={f.booking_id}><span className="font-mono font-bold">{f.tracking_id ?? f.booking_id}</span> {f.customer_name ? `— ${f.customer_name}` : ''}: {f.reasons.join('; ')}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search GC no., inquiry / tracking ID, customer, phone, route, vehicle…"
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
          <div className="relative">
            <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-gray-700 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400">
              <option value="all">All branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.branch_name} ({b.branch_code})</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
          <div className="relative">
            <select value={fyFilter} onChange={e => setFyFilter(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-gray-700 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400">
              <option value="all">All financial years</option>
              {fyOptions.map(fy => <option key={fy} value={fy}>FY {fy}</option>)}
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
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['GC No.', 'Branch', 'Booking / Tracking ID', 'Customer', 'Phone', 'From / Pickup', 'To / Delivery', 'Bags', 'Pickup Date', 'Delivery Date', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pagedLrs.map(l => {
                    const st = LR_STATUS_LABELS[l.status] ?? { label: l.status, color: '#6b7280', bg: '#f3f4f6' }
                    return (
                      <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/admin/lrs/${l.id}`} className="font-mono text-xs font-bold text-orange-500 hover:text-orange-600">
                            {l.lr_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                          {l.branch_code
                            ? <div className="flex items-center gap-1"><Building2 className="h-3 w-3 text-gray-400" /> {l.branch_code}</div>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">{l.tracking_id ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{l.customer_name ?? l.consignor_name ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{l.customer_phone ?? '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{l.from_city ?? '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{l.to_city ?? '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{l.total_bags ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(l.pickup_date ?? l.lr_date ?? null)}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(l.delivery_date ?? null)}</td>
                        <td className="px-4 py-3">
                          <span style={{ color: st.color, background: st.bg }}
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap">
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => viewLr(l.id)} disabled={viewingLr === l.id}
                              title="View LR"
                              className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors disabled:opacity-40">
                              {viewingLr === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                            <Link href={`/admin/lrs/${l.id}`}
                              title="Edit LR"
                              className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 transition-colors">
                              <Pencil className="h-3.5 w-3.5" />
                            </Link>
                            <button onClick={() => downloadLr(l.id)} disabled={downloading === l.id}
                              title="Download LR PDF"
                              className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-green-50 hover:text-green-600 hover:border-green-200 transition-colors disabled:opacity-40">
                              {downloading === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                            </button>
                            <button onClick={() => printLr(l.id)} disabled={printingLr === l.id}
                              title="Print LR/GC"
                              className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200 transition-colors disabled:opacity-40">
                              {printingLr === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
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

            <div className="flex flex-col items-center gap-3 border-t border-gray-100 px-4 py-3 sm:flex-row sm:justify-between">
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span>Showing <strong className="text-gray-700">{showingFrom}–{showingTo}</strong> of <strong className="text-gray-700">{lrs.length}</strong> GCs</span>
                <div className="relative">
                  <select
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                    className="appearance-none rounded-lg border border-gray-200 bg-white py-1.5 pl-3 pr-7 text-xs font-medium text-gray-600 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                  >
                    <option value={20}>20 / page</option>
                    <option value={50}>50 / page</option>
                    <option value={100}>100 / page</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
                </div>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    ← Prev
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(n => n === 1 || n === totalPages || (n >= page - 2 && n <= page + 2))
                    .map((n, idx, arr) => (
                      <Fragment key={n}>
                        {idx > 0 && arr[idx - 1] !== n - 1 && <span className="px-1 text-xs text-gray-400">…</span>}
                        <button onClick={() => setPage(n)}
                          className={`min-w-[32px] rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                            page === n ? 'border-orange-400 bg-orange-500 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                          }`}>
                          {n}
                        </button>
                      </Fragment>
                    ))}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    Next →
                  </button>
                </div>
              )}
            </div>
          </>
          )}
        </div>
      </main>
    </>
  )
}
