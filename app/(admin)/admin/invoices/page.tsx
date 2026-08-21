'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Receipt, Search, RefreshCw, ChevronDown, Eye,
  Download, Mail, MessageCircle, CheckCircle, Clock, FileText, Loader2,
  X, ExternalLink, Plus, Pencil,
} from 'lucide-react'
import { formatCustomerName } from '@/lib/constants'
import type { InvoicePDFLineItem, InvoicePDFProps } from './[id]/InvoicePDF'

interface Invoice {
  id:                string
  invoice_number:    string | null
  booking_id:        string | null
  title?:            string | null
  customer_name:     string
  customer_phone:    string
  customer_email:    string | null
  from_city:         string
  to_city:           string
  total_bags:        number
  base_amount:       number
  cgst:              number
  sgst:              number
  total_amount:      number
  payment_status:    string
  payment_method:    string | null
  payment_reference: string | null
  sent_email:        boolean
  sent_whatsapp:     boolean
  invoice_date:      string
  created_at:        string
  // false = a completed inquiry with no real invoice row yet (see the
  // merged bookings+invoices logic in GET /api/admin/invoices) — shown
  // with a "Generate Invoice" action instead of Download/Email/WhatsApp.
  generated:          boolean
}

const PAY_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  paid:    { label: 'Paid',    color: '#16a34a', bg: '#dcfce7' },
  pending: { label: 'Pending', color: '#d97706', bg: '#fef3c7' },
  failed:  { label: 'Failed',  color: '#dc2626', bg: '#fee2e2' },
}

function Badge({ status }: { status: string }) {
  const c = PAY_STATUS[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6' }
  return (
    <span style={{ color: c.color, background: c.bg }}
      className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold">
      {c.label}
    </span>
  )
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtRs(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })
}
// Same "what's still owed" logic as InvoicePDF.tsx's balanceDue prop —
// paid means fully settled (0 due), anything else is the full total still
// outstanding. Matches the Balance Due column in Zoho Books.
function balanceDue(inv: Pick<Invoice, 'payment_status' | 'total_amount'>) {
  return inv.payment_status === 'paid' ? 0 : Number(inv.total_amount ?? 0)
}

// ── Invoice Detail panel ────────────────────────────────────────
// Zoho Books-style invoice detail view, opened by clicking an invoice
// number in the table below (same pattern as PaymentReceiptPanel on the
// Payments tab). Shows: a "Payments Received" count bar (real payments
// rows for this invoice's booking — never fabricated), the actual
// generated PDF embedded inline (react-pdf's PDFViewer, the exact same
// component + props the Download/Email/print flows already use — so this
// preview can never visually drift from what actually gets sent), a More
// Information block (Consignment No / Bags / Pickup & Delivery Date — all
// real invoice fields, no invented "Salesperson" line since that data
// isn't cleanly separable from the P.O.# field in this schema), and a
// Journal section: the fully deterministic double-entry every invoice
// produces (Sales credited, Accounts Receivable debited by the same
// total, Output CGST/SGST/IGST credited) — same reasoning as the Payment
// Receipt panel's Journal section, not fabricated data.
interface InvoiceDetail {
  id: string; invoice_number: string; booking_id: string | null
  po_number?: string | null
  title?: string | null
  customer_name: string; customer_phone: string; customer_email: string | null; customer_address: string | null
  customer_type?: string | null
  business_name?: string | null
  gst_number?: string | null
  service_type: string | null; from_city: string; to_city: string; total_bags: number
  base_amount: number; cgst: number; sgst: number; igst?: number; total_amount: number
  payment_status: string; payment_method: string | null; payment_reference: string | null
  notes: string | null; invoice_date: string; created_at: string
  due_date?: string | null; place_of_supply?: string | null; consignment_no?: string | null
  pickup_date?: string | null; delivery_date?: string | null
  line_items?: InvoicePDFLineItem[] | null
}

function buildInvoicePdfProps(invoice: InvoiceDetail): InvoicePDFProps {
  const lineItems: InvoicePDFLineItem[] = Array.isArray(invoice.line_items) ? invoice.line_items : []
  return {
    invoiceNumber: invoice.invoice_number,
    invoiceDate:   invoice.invoice_date,
    dueDate:       invoice.due_date ?? null,
    terms:         'Due on Receipt',
    poNumber:      invoice.po_number ?? null,
    placeOfSupply: invoice.place_of_supply ?? null,
    consignmentNo: invoice.consignment_no ?? null,
    totalBags:     invoice.total_bags ?? null,
    pickupDate:    invoice.pickup_date ?? null,
    deliveryDate:  invoice.delivery_date ?? null,
    billToName:    invoice.customer_type === 'business' && invoice.business_name
      ? invoice.business_name
      : (formatCustomerName(invoice.title, invoice.customer_name) || invoice.customer_name),
    billToAddress: invoice.customer_address ?? null,
    billToPhone:   invoice.customer_phone ?? null,
    billToEmail:   invoice.customer_email ?? null,
    billToGstin:   invoice.gst_number ?? null,
    shipToLabel:   'Ship To',
    shipToLines:   [invoice.to_city, 'India'].filter(Boolean) as string[],
    lineItems,
    subtotal:      Number(invoice.base_amount ?? 0),
    cgst:          Number(invoice.cgst ?? 0),
    sgst:          Number(invoice.sgst ?? 0),
    igst:          Number(invoice.igst ?? 0),
    total:         Number(invoice.total_amount ?? 0),
    paymentMade:   invoice.payment_status === 'paid' ? Number(invoice.total_amount ?? 0) : 0,
    balanceDue:    invoice.payment_status === 'paid' ? 0 : Number(invoice.total_amount ?? 0),
    notes:         invoice.notes ?? null,
    termsText:     null,
    paid:          invoice.payment_status === 'paid',
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfModules = { PDFViewer: any; InvoicePDF: any }

function InvoiceDetailPanel({ invoiceId, adminKey, onClose }: { invoiceId: string; adminKey: string; onClose: () => void }) {
  const [invoice, setInvoice]         = useState<InvoiceDetail | null>(null)
  const [loading, setLoading]         = useState(true)
  const [err, setErr]                 = useState('')
  const [paymentsCount, setPaymentsCount] = useState<number | null>(null)
  const [pdfMods, setPdfMods]         = useState<PdfModules | null>(null)

  // Remark (invoices.notes) — editable here since the PATCH API already
  // supports a `notes` field (founder spec, 2026-08-21: Invoice Remark).
  const [editingRemark, setEditingRemark] = useState(false)
  const [remarkDraft,   setRemarkDraft]   = useState('')
  const [savingRemark,  setSavingRemark]  = useState(false)

  function startEditRemark() {
    setRemarkDraft(invoice?.notes ?? '')
    setEditingRemark(true)
  }

  async function saveRemark() {
    if (!invoice) return
    setSavingRemark(true)
    try {
      const res = await fetch(`/api/admin/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ notes: remarkDraft.trim() || null }),
      })
      if (res.ok) {
        setInvoice(prev => prev ? { ...prev, notes: remarkDraft.trim() || null } : prev)
        setEditingRemark(false)
      } else {
        alert('Failed to save remark')
      }
    } catch {
      alert('Network error — please try again')
    } finally {
      setSavingRemark(false)
    }
  }

  useEffect(() => {
    Promise.all([import('@react-pdf/renderer'), import('./[id]/InvoicePDF')]).then(
      ([{ PDFViewer }, mod]) => setPdfMods({ PDFViewer, InvoicePDF: mod.default })
    )
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true); setErr(''); setPaymentsCount(null)
    fetch(`/api/admin/invoices/${invoiceId}?key=${adminKey}`)
      .then(r => r.json())
      .then(async d => {
        if (cancelled) return
        const inv = d.invoice as InvoiceDetail | null
        setInvoice(inv)
        setLoading(false)
        if (inv?.booking_id) {
          const pRes = await fetch(`/api/admin/payments?booking_id=${inv.booking_id}&key=${adminKey}`)
          if (!cancelled && pRes.ok) {
            const pd = await pRes.json()
            setPaymentsCount(Array.isArray(pd.payments) ? pd.payments.length : 0)
          }
        } else if (!cancelled) {
          setPaymentsCount(0)
        }
      })
      .catch(() => { if (!cancelled) { setErr('Failed to load invoice'); setLoading(false) } })
    return () => { cancelled = true }
  }, [invoiceId, adminKey])

  const { PDFViewer, InvoicePDF } = pdfMods ?? {}

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="flex h-full w-full max-w-5xl flex-col bg-gray-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3.5">
          <h2 className="text-base font-bold text-gray-900">
            {invoice?.invoice_number ? invoice.invoice_number : 'Invoice'} — Tax Invoice
          </h2>
          <div className="flex items-center gap-2">
            {invoice && (
              <a href={`/admin/invoices/${invoice.id}/print?key=${adminKey}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                <ExternalLink className="h-3.5 w-3.5" /> Open Full View / Download
              </a>
            )}
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-400">Loading invoice…</div>
        ) : err || !invoice ? (
          <div className="flex flex-1 items-center justify-center text-sm text-red-500">{err || 'Invoice not found'}</div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Payments Received bar — matches Zoho's tab strip above the invoice */}
            <div className="border-b border-gray-200 bg-white px-6 py-2.5 text-sm font-semibold text-gray-700">
              Payments Received {paymentsCount ?? '—'}
            </div>

            {/* Embedded PDF preview — the exact same generated document the
                Download/Email/WhatsApp flows send, not a separate approximation. */}
            <div className="mx-auto my-6 h-[850px] w-full max-w-3xl overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              {PDFViewer && InvoicePDF ? (
                <PDFViewer style={{ width: '100%', height: '100%', border: 'none' }} showToolbar={false}>
                  <InvoicePDF {...buildInvoicePdfProps(invoice)} />
                </PDFViewer>
              ) : (
                <div className="flex h-full items-center justify-center text-gray-400">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Rendering invoice…
                </div>
              )}
            </div>

            <div className="mx-auto mb-8 max-w-3xl space-y-6 px-1">
              {/* More Information */}
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <p className="mb-3 text-sm font-bold text-gray-800">More Information</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  {invoice.consignment_no && (
                    <p><span className="text-gray-500">Consignment No: </span><span className="font-medium text-gray-800">{invoice.consignment_no}</span></p>
                  )}
                  <p><span className="text-gray-500">No Of Bags: </span><span className="font-medium text-gray-800">{invoice.total_bags ?? '—'}</span></p>
                  <p><span className="text-gray-500">Pickup Date: </span><span className="font-medium text-gray-800">{fmtDate(invoice.pickup_date ?? null)}</span></p>
                  <p><span className="text-gray-500">Delivery Date: </span><span className="font-medium text-gray-800">{fmtDate(invoice.delivery_date ?? null)}</span></p>
                </div>
              </div>

              {/* Remark — invoices.notes. Optional, admin-editable field
                  (founder spec, 2026-08-21). Also shows on the printed
                  invoice PDF (InvoicePDF.tsx already renders `notes`). */}
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-800">Remark</p>
                  {!editingRemark && (
                    <button onClick={startEditRemark}
                      className="flex items-center gap-1 text-xs font-medium text-orange-600 hover:underline">
                      <Pencil className="h-3 w-3" /> {invoice.notes ? 'Edit' : 'Add remark'}
                    </button>
                  )}
                </div>
                {editingRemark ? (
                  <div className="space-y-2">
                    <textarea
                      value={remarkDraft}
                      onChange={e => setRemarkDraft(e.target.value)}
                      rows={3}
                      placeholder="Optional note shown on this invoice…"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                    />
                    <div className="flex items-center gap-2">
                      <button onClick={saveRemark} disabled={savingRemark}
                        className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-60">
                        {savingRemark ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={() => setEditingRemark(false)} disabled={savingRemark}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-700">{invoice.notes || <span className="text-gray-300">No remark added.</span>}</p>
                )}
              </div>

              {/* Journal — the deterministic double-entry every invoice
                  produces (Sales credited, Accounts Receivable debited,
                  Output GST credited) — see component-level comment above. */}
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <div className="mb-4 border-b border-gray-200">
                  <span className="inline-block border-b-2 border-blue-600 pb-2 text-sm font-semibold text-blue-700">Journal</span>
                </div>
                <p className="mb-3 text-xs text-gray-400">
                  Amount is displayed in your base currency{' '}
                  <span className="ml-1 rounded bg-green-600 px-1.5 py-0.5 text-[10px] font-bold text-white">INR</span>
                </p>
                <p className="mb-2 text-sm font-bold text-gray-800">Invoice — {invoice.invoice_number}</p>
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-left text-gray-500">
                        <th className="px-3 py-2 font-semibold">Account</th>
                        <th className="px-3 py-2 text-right font-semibold">Debit</th>
                        <th className="px-3 py-2 text-right font-semibold">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-gray-100">
                        <td className="px-3 py-2 text-gray-700">Accounts Receivable</td>
                        <td className="px-3 py-2 text-right text-gray-800">{fmtRs2(Number(invoice.total_amount))}</td>
                        <td className="px-3 py-2 text-right text-gray-400">0.00</td>
                      </tr>
                      <tr className="border-t border-gray-100">
                        <td className="px-3 py-2 text-gray-700">Sales</td>
                        <td className="px-3 py-2 text-right text-gray-400">0.00</td>
                        <td className="px-3 py-2 text-right text-gray-800">{fmtRs2(Number(invoice.base_amount))}</td>
                      </tr>
                      {Number(invoice.cgst) > 0 && (
                        <tr className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-700">Output CGST</td>
                          <td className="px-3 py-2 text-right text-gray-400">0.00</td>
                          <td className="px-3 py-2 text-right text-gray-800">{fmtRs2(Number(invoice.cgst))}</td>
                        </tr>
                      )}
                      {Number(invoice.sgst) > 0 && (
                        <tr className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-700">Output SGST</td>
                          <td className="px-3 py-2 text-right text-gray-400">0.00</td>
                          <td className="px-3 py-2 text-right text-gray-800">{fmtRs2(Number(invoice.sgst))}</td>
                        </tr>
                      )}
                      {Number(invoice.igst ?? 0) > 0 && (
                        <tr className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-700">Output IGST</td>
                          <td className="px-3 py-2 text-right text-gray-400">0.00</td>
                          <td className="px-3 py-2 text-right text-gray-800">{fmtRs2(Number(invoice.igst))}</td>
                        </tr>
                      )}
                      <tr className="border-t border-gray-200 bg-gray-50 font-bold text-gray-800">
                        <td className="px-3 py-2">Total</td>
                        <td className="px-3 py-2 text-right">{fmtRs2(Number(invoice.total_amount))}</td>
                        <td className="px-3 py-2 text-right">{fmtRs2(Number(invoice.total_amount))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function fmtRs2(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function InvoicesPage() {
  const router = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [authed,   setAuthed]   = useState(false)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading,  setLoading]  = useState(false)
  const [filter,   setFilter]   = useState('all')
  const [search,   setSearch]   = useState('')
  const [sending,  setSending]  = useState<string | null>(null)
  const [generating, setGenerating] = useState<string | null>(null)
  const [viewingInvoiceId, setViewingInvoiceId] = useState<string | null>(null)

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key')
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)
  }, [router])

  const fetchInvoices = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    const qs = `?key=${adminKey}${filter !== 'all' ? '&status=' + filter : ''}${search ? '&search=' + encodeURIComponent(search) : ''}`
    const res = await fetch('/api/admin/invoices' + qs)
    if (res.ok) setInvoices((await res.json()).invoices ?? [])
    setLoading(false)
  }, [adminKey, filter, search])

  useEffect(() => { if (authed) fetchInvoices() }, [authed, fetchInvoices])

  function printInvoice(id: string) {
    window.open(`/admin/invoices/${id}/print`, '_blank')
  }

  async function markSent(id: string, type: 'email' | 'whatsapp') {
    setSending(id + type)
    await fetch(`/api/admin/invoices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(type === 'email' ? { sent_email: true } : { sent_whatsapp: true }),
    })
    setSending(null)
    fetchInvoices()
  }

  // Assigns the next number from the local BLS26 series and creates the
  // real invoice row for a completed booking that doesn't have one yet —
  // same POST used by the per-booking "Generate Invoice" step in the
  // booking workflow, just triggered from this list so the backlog can be
  // worked through in order (the list is sorted oldest → newest for
  // exactly this reason).
  async function generateInvoice(bookingId: string) {
    setGenerating(bookingId)
    try {
      const res = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ booking_id: bookingId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { alert(d.error ?? 'Failed to generate invoice'); return }
    } catch {
      alert('Network error — please try again')
    } finally {
      setGenerating(null)
      fetchInvoices()
    }
  }

  const totalRevenue = invoices.filter(i => i.payment_status === 'paid').reduce((s, i) => s + Number(i.total_amount), 0)
  const notGeneratedCount = invoices.filter(i => !i.generated).length

  if (!authed) return null

  return (
    <>
      {viewingInvoiceId && (
        <InvoiceDetailPanel invoiceId={viewingInvoiceId} adminKey={adminKey} onClose={() => setViewingInvoiceId(null)} />
      )}

      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Invoices</h1>
            <p className="mt-0.5 text-sm text-gray-400">{invoices.length} completed inquiries · {fmtRs(totalRevenue)} collected</p>
          </div>
          <button onClick={() => router.push('/admin/invoices/new')}
            className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600">
            <Plus className="h-4 w-4" /> New Invoice
          </button>
        </div>
      </div>

      <div className="px-6 py-6">
        {/* Summary cards */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Completed Inquiries', value: invoices.length,                                                 color: '#2563eb', bg: '#dbeafe' },
            { label: 'Not Generated',  value: notGeneratedCount,                                                     color: '#dc2626', bg: '#fee2e2' },
            { label: 'Paid',           value: invoices.filter(i => i.payment_status === 'paid').length,             color: '#16a34a', bg: '#dcfce7' },
            { label: 'Revenue',        value: fmtRs(totalRevenue),                                                  color: '#FF6300', bg: '#fff7f0' },
          ].map(c => (
            <div key={c.label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500">{c.label}</p>
              <p className="mt-1.5 text-xl font-bold" style={{ color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, phone, or invoice number…"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm shadow-sm placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
          </div>
          <div className="relative">
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-gray-700 shadow-sm focus:border-orange-400 focus:outline-none">
              <option value="all">All</option>
              <option value="not_generated">Not Generated</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
          <button onClick={fetchInvoices} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 shadow-sm">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-gray-400">Loading invoices…</div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Receipt className="mb-3 h-10 w-10 text-gray-200" />
              <p className="text-sm text-gray-400">No completed inquiries yet — this list fills up once a booking's workflow reaches Completed.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Invoice #', 'Customer', 'Route', 'Amount', 'GST', 'Total', 'Balance Due', 'Status', 'Date', 'Sent', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {invoices.map(inv => (
                    <tr key={inv.id} className={inv.generated ? 'hover:bg-orange-50/30 transition-colors' : 'bg-amber-50/40 hover:bg-amber-50/70 transition-colors'}>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-orange-600">
                        {inv.generated ? (
                          <button onClick={() => setViewingInvoiceId(inv.id)}
                            className="inline-flex items-center gap-1.5 hover:underline">
                            <FileText className="h-3 w-3 shrink-0" /> {inv.invoice_number}
                          </button>
                        ) : (
                          <span className="text-amber-600">Not generated</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{formatCustomerName(inv.title, inv.customer_name) || inv.customer_name}</p>
                        <p className="text-xs text-gray-400">{inv.customer_phone}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{inv.from_city} → {inv.to_city}</td>
                      <td className="px-4 py-3 text-gray-700">{fmtRs(inv.base_amount)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmtRs(inv.cgst + inv.sgst)}</td>
                      <td className="px-4 py-3 font-bold text-gray-900">{fmtRs(inv.total_amount)}</td>
                      <td className="px-4 py-3">
                        {balanceDue(inv) > 0
                          ? <span className="font-semibold text-red-600">{fmtRs(balanceDue(inv))}</span>
                          : <span className="text-gray-400">{fmtRs(0)}</span>}
                      </td>
                      <td className="px-4 py-3"><Badge status={inv.payment_status} /></td>
                      <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(inv.invoice_date)}</td>
                      <td className="px-4 py-3">
                        {inv.generated ? (
                          <div className="flex gap-1">
                            <div title={inv.sent_email ? "Email sent" : "Email not sent"}>
                              {inv.sent_email ? (
                                  <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                                ) : (
                                  <Clock className="h-3.5 w-3.5 text-gray-300" />
                                )}
                              </div>
                           <div title={inv.sent_whatsapp ? "WhatsApp sent" : "WhatsApp not sent"}>
                                {inv.sent_whatsapp ? (
                                  <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                                ) : (
                                  <Clock className="h-3.5 w-3.5 text-gray-300" />
                                )}
                           </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {inv.generated ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => printInvoice(inv.id)} title="Download PDF"
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-500 transition-colors">
                              <Download className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => markSent(inv.id, 'email')} disabled={sending === inv.id + 'email' || inv.sent_email}
                              title="Mark email sent"
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-green-50 hover:text-green-500 transition-colors disabled:opacity-40">
                              <Mail className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => markSent(inv.id, 'whatsapp')} disabled={sending === inv.id + 'whatsapp' || inv.sent_whatsapp}
                              title="Mark WhatsApp sent"
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-green-50 hover:text-green-500 transition-colors disabled:opacity-40">
                              <MessageCircle className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => inv.booking_id && generateInvoice(inv.booking_id)}
                            disabled={generating === inv.booking_id || !inv.booking_id}
                            title="Assigns the next number in the BLS26 series and creates the invoice"
                            className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                          >
                            {generating === inv.booking_id
                              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                              : <><FileText className="h-3.5 w-3.5" /> Generate Invoice</>}
                          </button>
                        )}
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
