'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  CreditCard, Search, RefreshCw, ChevronDown,
  CheckCircle, XCircle, Clock, AlertCircle, Plus, X, Save, FileText, Loader2,
  Paperclip, Trash2, Upload, Download, GitMerge,
} from 'lucide-react'
import { getRoleFromSession, can } from '@/lib/roles'
import type { AdminRole } from '@/lib/admin-auth'
import { formatCustomerName } from '@/lib/constants'
import { INVOICE_COMPANY, INVOICE_BANK } from '@/lib/company-info'
import { amountInWords } from '@/lib/number-to-words'
import { countsTowardTotalPaid } from '@/lib/payment-ledger'

interface Payment {
  id:                string
  payment_id:        string
  booking_id:        string | null
  title?:            string | null
  customer_name:     string
  customer_phone:    string
  amount:            number
  payment_method:    string
  payment_status:    string
  payment_reference: string | null
  notes:             string | null
  verified_by:       string | null
  verified_at:       string | null
  refund_amount:     number | null
  created_at:        string
  // Not a real row in `payments` -- derived from a confirmed booking that
  // has no payment logged yet (see app/api/admin/payments/route.ts). Has no
  // real payments.id to Verify/Refund against; the id is "booking:<uuid>"
  // purely so the frontend has a stable React key.
  is_synthetic?:     boolean
  // Matches Zoho Books' Payments Received columns — computed server-side,
  // see the enrichment in GET /api/admin/payments.
  invoice_number?:   string | null
  unused_amount?:    number
  // Files uploaded via the Record Payment form's Attachments field — see
  // supabase/migrations/20260818c_payment_attachments.sql and
  // app/api/admin/payments/[id]/attachments/route.ts. Absent/undefined for
  // synthetic booking-derived rows and any payment created before this
  // column existed.
  attachments?: { url: string; filename: string; size: number; type: string; uploaded_at: string }[]
}

// This filter/badge set covers two different value spaces that GET
// /api/admin/payments merges into one list: real `payments` rows (own
// status can be pending / pending_verification / paid / rejected / failed /
// refunded) and synthetic per-booking rows for confirmed bookings with no
// logged payment (status here is the booking's own derived aggregate —
// pending / partially_paid / pending_verification / approved_pending /
// paid). partially_paid, pending_verification and rejected were added by
// the Full/Partial/VIP/Verification payment-accounting rework (2026-08-19)
// — see lib/payment-status.ts.
const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending:              { label: 'Pending',              color: '#d97706', bg: '#fef3c7', icon: <Clock className="h-3 w-3" /> },
  partially_paid:       { label: 'Partially Paid',        color: '#ea580c', bg: '#ffedd5', icon: <Clock className="h-3 w-3" /> },
  pending_verification: { label: 'Under Verification',    color: '#d97706', bg: '#fef3c7', icon: <Clock className="h-3 w-3" /> },
  approved_pending:     { label: 'Approved (Unpaid)',     color: '#d97706', bg: '#fef3c7', icon: <Clock className="h-3 w-3" /> },
  paid:                 { label: 'Paid',                  color: '#16a34a', bg: '#dcfce7', icon: <CheckCircle className="h-3 w-3" /> },
  rejected:             { label: 'Rejected',              color: '#dc2626', bg: '#fee2e2', icon: <XCircle className="h-3 w-3" /> },
  failed:               { label: 'Failed',                color: '#dc2626', bg: '#fee2e2', icon: <XCircle className="h-3 w-3" /> },
  refunded:             { label: 'Refunded',              color: '#7c3aed', bg: '#ede9fe', icon: <AlertCircle className="h-3 w-3" /> },
}

const METHOD_LABELS: Record<string, string> = {
  upi: 'UPI', qr: 'QR Code', bank: 'Bank Transfer', cash: 'Cash',
}

function Badge({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6', icon: null }
  return (
    <span style={{ color: c.color, background: c.bg }}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold">
      {c.icon}{c.label}
    </span>
  )
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtRs(n: number) { return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }) }

// ── Record Payment modal ────────────────────────────────────────
// Zoho Books "Invoice Payment" / "Customer Advance" layout — Customer
// Name search, Amount Received, Bank Charges, Payment Date, an
// auto-generated Payment#, Payment Mode, Deposit To, Reference#, a Tax
// Deducted toggle, an Unpaid Invoices table to apply the payment against
// (Invoice Payment tab only), and a running Amount Received / Used /
// Excess summary. Deliberately has NO Attachments section — this app has
// no file-upload storage wired up for payments, and a button that looks
// like it uploads but silently does nothing would be worse than not
// having it; a real Attachments feature is a separate follow-up if wanted.
interface PaymentFormPrefill {
  booking_id?: string; customer_name?: string; customer_phone?: string
  amount?: string; payment_status?: string; notes?: string
}

interface CustomerSearchResult {
  title: string | null; name: string; phone: string; email: string | null
}

interface UnpaidInvoiceRow {
  id: string; invoice_number: string; invoice_date: string | null
  total_amount: number; booking_id: string | null
}

function todayStr() { return new Date().toISOString().slice(0, 10) }

function RecordPaymentModal({ adminKey, initial, onSaved, onClose }: { adminKey: string; initial?: PaymentFormPrefill; onSaved: () => void; onClose: () => void }) {
  const [tab, setTab] = useState<'invoice' | 'advance'>('invoice')

  const [form, setForm] = useState({
    customer_name: initial?.customer_name ?? '',
    customer_phone: initial?.customer_phone ?? '',
    amount: initial?.amount ?? '',
    bank_charges: '',
    payment_date: todayStr(),
    payment_method: 'upi',
    payment_reference: '',
    notes: initial?.notes ?? '',
  })
  const [taxDeducted, setTaxDeducted] = useState(false)
  const [tdsAmount,   setTdsAmount]   = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  // ── Customer search (skipped entirely when `initial` already pins the
  // exact booking/customer — the "Log Payment" flow from a synthetic row) ──
  const customerLocked = !!initial
  const [custQ,       setCustQ]       = useState('')
  const [custResults,  setCustResults] = useState<CustomerSearchResult[]>([])
  const [custOpen,     setCustOpen]    = useState(false)
  const [custLoading,  setCustLoading] = useState(false)

  useEffect(() => {
    if (customerLocked || !custOpen) return
    setCustLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/customers/search?key=${adminKey}&q=${encodeURIComponent(custQ.trim())}`)
        const j   = await res.json()
        setCustResults(res.ok ? (j.customers ?? []) : [])
      } catch { setCustResults([]) }
      setCustLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [custQ, custOpen, adminKey, customerLocked])

  function pickCustomer(c: CustomerSearchResult) {
    setForm(f => ({ ...f, customer_name: c.name, customer_phone: c.phone }))
    setCustQ(''); setCustResults([]); setCustOpen(false)
  }

  // ── Unpaid invoices for the selected customer (Invoice Payment tab) ──
  const [unpaidInvoices,  setUnpaidInvoices]  = useState<UnpaidInvoiceRow[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<UnpaidInvoiceRow | null>(null)
  const [appliedAmount,   setAppliedAmount]   = useState('')

  useEffect(() => {
    if (customerLocked || tab !== 'invoice' || !form.customer_phone.trim()) {
      setUnpaidInvoices([]); setSelectedInvoice(null); setAppliedAmount(''); return
    }
    setInvoicesLoading(true)
    const t = setTimeout(async () => {
      try {
        const qs  = new URLSearchParams({ key: adminKey, search: form.customer_phone.trim(), limit: '100' })
        const res = await fetch(`/api/admin/invoices?${qs}`)
        const j   = await res.json()
        const rows: UnpaidInvoiceRow[] = res.ok
          ? (j.invoices ?? [])
              .filter((r: { generated?: boolean; payment_status?: string }) => r.generated && r.payment_status !== 'paid')
              .map((r: { id: string; invoice_number: string; invoice_date: string | null; total_amount: number; booking_id: string | null }) => ({
                id: r.id, invoice_number: r.invoice_number, invoice_date: r.invoice_date,
                total_amount: Number(r.total_amount ?? 0), booking_id: r.booking_id,
              }))
          : []
        setUnpaidInvoices(rows)
      } catch { setUnpaidInvoices([]) }
      setInvoicesLoading(false)
    }, 300)
    return () => clearTimeout(t)
  }, [form.customer_phone, tab, adminKey, customerLocked])

  function toggleInvoice(row: UnpaidInvoiceRow) {
    if (selectedInvoice?.id === row.id) {
      setSelectedInvoice(null); setAppliedAmount('')
    } else {
      setSelectedInvoice(row)
      const received = Number(form.amount) || 0
      setAppliedAmount(String(Math.min(received || row.total_amount, row.total_amount)))
    }
  }

  const amountReceived = Number(form.amount) || 0
  const amountUsed      = selectedInvoice ? (Number(appliedAmount) || 0) : 0
  const amountExcess    = Math.max(0, amountReceived - amountUsed)

  // ── Attachments ──────────────────────────────────────────────────
  // Files are picked here and held as plain browser File objects (there's
  // no payments.id to upload against until the row is actually inserted),
  // then uploaded one-by-one to /api/admin/payments/{id}/attachments right
  // after a successful save — same "create row, then attach" ordering
  // app/api/admin/bookings/[id]/payment-proof/route.ts uses server-side.
  // Same allowed-type / size / count limits as that route, enforced here
  // too so a bad file is rejected before the user even hits Save.
  const MAX_ATTACHMENTS  = 5
  const MAX_ATTACH_BYTES = 10 * 1024 * 1024
  const ALLOWED_ATTACH_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])

  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [uploadingAttachments, setUploadingAttachments] = useState(false)

  function addFiles(files: FileList | null) {
    if (!files) return
    setErr('')
    const next = [...pendingFiles]
    for (const f of Array.from(files)) {
      if (next.length >= MAX_ATTACHMENTS) { setErr(`Maximum ${MAX_ATTACHMENTS} attachments per payment.`); break }
      if (!ALLOWED_ATTACH_TYPES.has(f.type)) { setErr(`${f.name}: unsupported file type (use JPG/PNG/WEBP/HEIC or PDF).`); continue }
      if (f.size > MAX_ATTACH_BYTES) { setErr(`${f.name}: file too large (max 10MB).`); continue }
      next.push(f)
    }
    setPendingFiles(next)
  }
  function removeFile(idx: number) { setPendingFiles(fs => fs.filter((_, i) => i !== idx)) }
  function fmtBytes(n: number) { return n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB` }

  async function save(status: 'pending' | 'paid') {
    if (!form.customer_name.trim() || !form.customer_phone.trim()) { setErr('Select or enter a customer.'); return }
    if (!amountReceived) { setErr('Amount Received is required.'); return }
    if (!form.payment_date) { setErr('Payment Date is required.'); return }
    setSaving(true); setErr('')

    const bookingId = initial?.booking_id || (tab === 'invoice' ? selectedInvoice?.booking_id : null) || ''

    const res = await fetch('/api/admin/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({
        customer_name:      form.customer_name.trim(),
        customer_phone:     form.customer_phone.trim(),
        amount:             amountReceived,
        bank_charges:       form.bank_charges ? Number(form.bank_charges) : 0,
        payment_date:       form.payment_date,
        payment_method:     form.payment_method,
        payment_reference:  form.payment_reference.trim(),
        notes:              form.notes.trim(),
        booking_id:         bookingId,
        tds_deducted:       taxDeducted,
        tds_amount:         taxDeducted ? (tdsAmount ? Number(tdsAmount) : null) : null,
        payment_status:     status,
      }),
    })
    if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error ?? 'Failed to save payment'); setSaving(false); return }

    const { payment } = await res.json()

    if (pendingFiles.length > 0 && payment?.id) {
      setUploadingAttachments(true)
      for (const f of pendingFiles) {
        const fd = new FormData()
        fd.append('file', f)
        try {
          const upRes = await fetch(`/api/admin/payments/${payment.id}/attachments`, {
            method: 'POST', headers: { 'x-admin-key': adminKey }, body: fd,
          })
          if (!upRes.ok) console.error('[RecordPaymentModal] attachment upload failed:', await upRes.text())
        } catch (e) {
          // Payment itself is already saved — an attachment failure shouldn't
          // block the flow or lose the recorded payment, just log it.
          console.error('[RecordPaymentModal] attachment upload error:', e)
        }
      }
      setUploadingAttachments(false)
    }

    onSaved()
  }

  const inp    = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400'
  const sel    = inp + ' bg-white'
  const inpRO  = inp + ' cursor-not-allowed bg-gray-50 text-gray-400'
  const lbl    = 'mb-1.5 block text-xs font-semibold text-gray-600'
  const reqLbl = lbl + ' after:ml-0.5 after:text-red-400 after:content-["*"]'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 pt-4">
          <div className="flex gap-6">
            {(['invoice', 'advance'] as const).map(t => (
              <button key={t} onClick={() => !customerLocked && setTab(t)}
                disabled={customerLocked}
                className={`border-b-2 pb-3 text-sm font-semibold ${tab === t ? 'border-orange-500 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                {t === 'invoice' ? 'Invoice Payment' : 'Customer Advance'}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="mb-2"><X className="h-5 w-5 text-gray-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {initial && (
            <p className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
              Prefilled from a confirmed booking with no payment logged yet.
            </p>
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {/* Customer Name */}
            <div className="relative col-span-2">
              <label className={reqLbl}>Customer Name</label>
              {customerLocked ? (
                <input value={`${form.customer_name} · ${form.customer_phone}`} readOnly className={inpRO} />
              ) : (
                <>
                  <input
                    value={form.customer_name}
                    onChange={e => { setForm(f => ({ ...f, customer_name: e.target.value })); setCustQ(e.target.value) }}
                    onFocus={() => setCustOpen(true)}
                    onBlur={() => setTimeout(() => setCustOpen(false), 160)}
                    placeholder="Select Customer" className={inp} />
                  {custOpen && (
                    <div className="absolute left-0 top-full z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl">
                      {custLoading ? (
                        <div className="px-3 py-3 text-xs text-gray-400">Searching…</div>
                      ) : custResults.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-gray-400">No customers found</div>
                      ) : custResults.map(c => (
                        <button key={c.phone} onMouseDown={() => pickCustomer(c)}
                          className="block w-full border-b border-gray-50 px-3 py-2 text-left last:border-0 hover:bg-orange-50">
                          <p className="text-sm font-semibold text-gray-800">{formatCustomerName(c.title, c.name) || c.name}</p>
                          <p className="text-xs text-gray-400">{c.phone}{c.email ? ` · ${c.email}` : ''}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div>
              <label className={reqLbl}>Amount Received</label>
              <input type="number" value={form.amount} onChange={set('amount')} placeholder="0.00" className={inp} />
            </div>
            <div>
              <label className={lbl}>Bank Charges (if any)</label>
              <input type="number" value={form.bank_charges} onChange={set('bank_charges')} placeholder="0.00" className={inp} />
            </div>

            <div>
              <label className={reqLbl}>Payment Date</label>
              <input type="date" value={form.payment_date} onChange={set('payment_date')} className={inp} />
            </div>
            <div>
              <label className={lbl}>Payment#</label>
              <input value="Auto-generated on save" readOnly className={inpRO} />
            </div>

            <div>
              <label className={lbl}>Payment Mode</label>
              <select value={form.payment_method} onChange={set('payment_method')} className={sel}>
                {Object.entries(METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className={reqLbl}>Deposit To</label>
              <select value="bank" disabled className={sel + ' cursor-not-allowed text-gray-500'}>
                <option value="bank">{INVOICE_BANK.bankName}</option>
              </select>
            </div>

            <div>
              <label className={lbl}>Reference#</label>
              <input value={form.payment_reference} onChange={set('payment_reference')} placeholder="UTR / Cheque No." className={inp} />
            </div>
            <div>
              <label className={lbl}>Tax deducted?</label>
              <div className="flex items-center gap-4 pt-2 text-sm text-gray-700">
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={!taxDeducted} onChange={() => setTaxDeducted(false)} /> No Tax deducted
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={taxDeducted} onChange={() => setTaxDeducted(true)} /> Yes, TDS
                </label>
              </div>
              {taxDeducted && (
                <input type="number" value={tdsAmount} onChange={e => setTdsAmount(e.target.value)}
                  placeholder="TDS amount (₹)" className={inp + ' mt-2'} />
              )}
            </div>
          </div>

          {/* Unpaid Invoices */}
          {tab === 'invoice' && !customerLocked && (
            <div className="mt-6">
              <p className="mb-2 text-sm font-bold text-gray-800">Unpaid Invoices</p>
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-500">
                      <th className="px-3 py-2 font-semibold">Date</th>
                      <th className="px-3 py-2 font-semibold">Invoice Number</th>
                      <th className="px-3 py-2 text-right font-semibold">Invoice Amount</th>
                      <th className="px-3 py-2 text-right font-semibold">Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!form.customer_phone.trim() ? (
                      <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">Select a customer to see their unpaid invoices.</td></tr>
                    ) : invoicesLoading ? (
                      <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">Loading…</td></tr>
                    ) : unpaidInvoices.length === 0 ? (
                      <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">There are no unpaid invoices for this customer.</td></tr>
                    ) : unpaidInvoices.map(row => (
                      <tr key={row.id} onClick={() => toggleInvoice(row)}
                        className={`cursor-pointer border-t border-gray-100 ${selectedInvoice?.id === row.id ? 'bg-orange-50' : 'hover:bg-gray-50'}`}>
                        <td className="px-3 py-2 text-gray-600">{fmtDate(row.invoice_date)}</td>
                        <td className="px-3 py-2 font-mono font-bold text-orange-600">{row.invoice_number}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{fmtRs(row.total_amount)}</td>
                        <td className="px-3 py-2 text-right">
                          {selectedInvoice?.id === row.id ? (
                            <input type="number" value={appliedAmount} onClick={e => e.stopPropagation()}
                              onChange={e => setAppliedAmount(e.target.value)}
                              className="w-24 rounded border border-orange-300 px-2 py-1 text-right text-xs" />
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex flex-col items-end gap-1 text-xs">
                <div className="flex w-56 justify-between"><span className="text-gray-500">Amount Received</span><span className="font-semibold text-gray-800">{fmtRs(amountReceived)}</span></div>
                <div className="flex w-56 justify-between"><span className="text-gray-500">Amount used for Payments</span><span className="font-semibold text-gray-800">{fmtRs(amountUsed)}</span></div>
                <div className="flex w-56 justify-between"><span className="text-gray-500">Amount Refunded</span><span className="font-semibold text-gray-800">₹0</span></div>
                <div className="flex w-56 justify-between border-t border-gray-200 pt-1"><span className="font-semibold text-amber-600">Amount in Excess</span><span className="font-bold text-amber-600">{fmtRs(amountExcess)}</span></div>
              </div>
            </div>
          )}

          <div className="mt-6">
            <label className={lbl}>Notes (internal use)</label>
            <textarea value={form.notes} onChange={set('notes')} rows={2} className={inp} placeholder="Any additional notes…" />
          </div>

          <div className="mt-6">
            <label className={lbl}>Attachments</label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 px-4 py-4 text-sm text-gray-500 hover:border-orange-300 hover:bg-orange-50/50">
              <Upload className="h-4 w-4" />
              Upload File
              <span className="text-xs text-gray-400">(JPG, PNG, PDF · max 10MB · up to {MAX_ATTACHMENTS})</span>
              <input type="file" className="hidden" multiple
                accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,application/pdf"
                onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
            </label>

            {pendingFiles.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {pendingFiles.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs">
                    <span className="flex items-center gap-2 truncate text-gray-700">
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span className="truncate">{f.name}</span>
                      <span className="shrink-0 text-gray-400">{fmtBytes(f.size)}</span>
                    </span>
                    <button onClick={() => removeFile(i)} className="shrink-0 text-gray-400 hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {err && <p className="mt-3 text-xs text-red-500">{err}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={() => save('pending')} disabled={saving || uploadingAttachments}
            className="rounded-lg border border-gray-200 px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Save as Draft
          </button>
          <button onClick={() => save('paid')} disabled={saving || uploadingAttachments}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
            <Save className="h-4 w-4" />
            {uploadingAttachments ? 'Uploading attachments…' : saving ? 'Saving…' : 'Save as Paid'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Payment Receipt panel ───────────────────────────────────────
// Zoho Books-style "Payment Receipt" detail view, opened by clicking a
// payment's Payment# in the table below. Mirrors Zoho's own layout field-
// for-field: company header, PAYMENT RECEIPT title, Payment Date/Reference
// Number/Payment Mode + a green Amount Received box, Amount Received In
// Words, Received From (customer + billing address) / Authorized
// Signature, a "Payment for" table linking the invoice it was applied to,
// Deposit To / Notes, and a Journal section. The Journal entry is the one
// fully deterministic double-entry every accounting system produces for a
// simple invoice payment — Debit the deposit account, Credit Accounts
// Receivable, both equal to the payment amount — so showing it isn't
// inventing data, just the mechanical consequence of the payment amount
// and deposit account this app already knows for certain.
interface PaymentReceiptInvoice {
  invoice_number: string; invoice_date: string | null; total_amount: number; customer_address: string | null
}
interface PaymentReceiptDetail {
  payment: Payment
  invoice: PaymentReceiptInvoice | null
  customer_address: string | null
  unused_amount: number
}

function fmtRs2(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDateLong(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function PaymentReceiptPanel({ paymentId, adminKey, onClose }: { paymentId: string; adminKey: string; onClose: () => void }) {
  const [detail,  setDetail]  = useState<PaymentReceiptDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true); setErr('')
    fetch(`/api/admin/payments/${paymentId}?key=${adminKey}`)
      .then(async res => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not load payment')
        return res.json()
      })
      .then(j => { if (!cancelled) setDetail(j) })
      .catch(e => { if (!cancelled) setErr(e.message ?? 'Could not load payment') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [paymentId, adminKey])

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="flex h-full w-full max-w-3xl flex-col bg-gray-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3.5">
          <h2 className="text-base font-bold text-gray-900">
            Payment Receipt {detail?.payment.payment_id ? `— ${detail.payment.payment_id}` : ''}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-orange-400" /></div>
          ) : err ? (
            <div className="flex items-center justify-center py-24 text-sm text-red-500">{err}</div>
          ) : detail ? (
            <div className="relative mx-auto max-w-2xl overflow-hidden rounded-lg border border-gray-200 bg-white px-10 pb-10 pt-16 shadow-sm">
              {detail.payment.payment_status === 'paid' && (
                // Corner ribbon — confined to a small clipped box right in the
                // top-left corner (classic "folded corner" pattern) instead of
                // a long diagonal banner cutting across the card, which used
                // to sit right on top of the logo/company name. The extra
                // pt-16 on the card above (was p-10 on all sides) also gives
                // the ribbon clear space above the logo row.
                <div className="absolute left-0 top-0 h-24 w-24 overflow-hidden">
                  <div className="absolute left-[-32px] top-[18px] w-[120px] rotate-[-45deg] bg-green-600 py-1 text-center shadow-sm">
                    <span className="text-[11px] font-bold tracking-widest text-white">Paid</span>
                  </div>
                </div>
              )}

              {/* Company header */}
              <div className="flex items-start gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/logo-icon.png" alt="" className="h-14 w-11 shrink-0" />
                <div>
                  <p className="text-base font-bold text-gray-900">{INVOICE_COMPANY.name}</p>
                  <p className="mt-1 text-xs text-gray-500">{INVOICE_COMPANY.addressLine1}</p>
                  <p className="text-xs text-gray-500">{INVOICE_COMPANY.addressLine2}</p>
                  <p className="text-xs text-gray-500">GSTIN: {INVOICE_COMPANY.gstin}</p>
                  <p className="text-xs text-gray-500">{INVOICE_COMPANY.phone} · {INVOICE_COMPANY.email}</p>
                  <p className="text-xs text-gray-500">{INVOICE_COMPANY.web}</p>
                </div>
              </div>

              <div className="my-6 border-t border-gray-200" />
              <h3 className="text-center text-lg font-bold tracking-wide text-gray-900">PAYMENT RECEIPT</h3>
              <div className="my-6 border-t border-gray-200" />

              {/* Payment meta + Amount box */}
              <div className="flex items-start justify-between gap-6">
                <div className="space-y-2 text-sm">
                  <div className="flex gap-6"><span className="w-40 text-gray-500">Payment Date</span><span className="font-semibold text-gray-900">{fmtDateLong(detail.payment.created_at)}</span></div>
                  <div className="flex gap-6"><span className="w-40 text-gray-500">Reference Number</span><span className="font-semibold text-gray-900">{detail.payment.payment_reference || '—'}</span></div>
                  <div className="flex gap-6"><span className="w-40 text-gray-500">Payment Mode</span><span className="font-semibold text-gray-900">{METHOD_LABELS[detail.payment.payment_method] ?? detail.payment.payment_method}</span></div>
                  <div className="flex gap-6"><span className="w-40 text-gray-500">Amount Received In Words</span><span className="font-semibold text-gray-900">{amountInWords(Number(detail.payment.amount))}</span></div>
                </div>
                <div className="shrink-0 rounded-lg bg-green-600 px-6 py-4 text-center">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-green-100">Amount Received</p>
                  <p className="mt-1 text-xl font-bold text-white">{fmtRs2(detail.payment.amount)}</p>
                </div>
              </div>

              <div className="my-6 border-t border-gray-200" />

              {/* Received From / Signature */}
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Received From</p>
                  <p className="font-semibold text-blue-700">{formatCustomerName(detail.payment.title, detail.payment.customer_name) || detail.payment.customer_name}</p>
                  {detail.customer_address && (
                    <p className="mt-1 max-w-xs whitespace-pre-line text-xs text-gray-500">{detail.customer_address}</p>
                  )}
                  {detail.payment.customer_phone && <p className="mt-1 text-xs text-gray-500">{detail.payment.customer_phone}</p>}
                </div>
                <div className="mt-8 shrink-0 text-center">
                  <div className="w-36 border-t border-gray-300 pt-1.5 text-xs font-semibold text-gray-600">Authorized Signature</div>
                </div>
              </div>

              {/* Payment for */}
              <div className="mt-8">
                <p className="mb-2 text-sm font-bold text-gray-800">Payment for</p>
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-left text-gray-500">
                        <th className="px-3 py-2 font-semibold">Invoice Number</th>
                        <th className="px-3 py-2 font-semibold">Invoice Date</th>
                        <th className="px-3 py-2 text-right font-semibold">Invoice Amount</th>
                        <th className="px-3 py-2 text-right font-semibold">Payment Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.invoice ? (
                        <tr className="border-t border-gray-100">
                          <td className="px-3 py-2 font-mono font-bold text-orange-600">{detail.invoice.invoice_number}</td>
                          <td className="px-3 py-2 text-gray-700">{fmtDateLong(detail.invoice.invoice_date)}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{fmtRs2(detail.invoice.total_amount)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmtRs2(Number(detail.payment.amount) - detail.unused_amount)}</td>
                        </tr>
                      ) : (
                        <tr className="border-t border-gray-100">
                          <td colSpan={4} className="px-3 py-3 text-center text-gray-400">
                            {detail.unused_amount > 0 ? 'Not yet applied to an invoice — fully unused' : 'No linked invoice'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {detail.unused_amount > 0 && (
                  <p className="mt-1.5 text-right text-xs font-semibold text-amber-600">Unused Amount: {fmtRs2(detail.unused_amount)}</p>
                )}
              </div>

              <div className="my-6 border-t border-gray-200" />

              <div className="space-y-1 text-xs">
                <p><span className="font-semibold text-gray-700">Deposit To:</span> <span className="text-gray-500">{INVOICE_BANK.bankName}</span></p>
                {detail.payment.notes && (
                  <p><span className="font-semibold text-gray-700">Notes:</span> <span className="text-gray-500">{detail.payment.notes}</span></p>
                )}
              </div>

              {!!detail.payment.attachments?.length && (
                <>
                  <div className="my-6 border-t border-gray-200" />
                  <div>
                    <p className="mb-2 text-xs font-semibold text-gray-700">Attachments</p>
                    <div className="space-y-1.5">
                      {detail.payment.attachments.map(a => (
                        <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs hover:bg-gray-100">
                          <span className="flex items-center gap-2 truncate text-gray-700">
                            <Paperclip className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                            <span className="truncate">{a.filename}</span>
                          </span>
                          <Download className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        </a>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="my-6 border-t border-gray-200" />

              {/* Journal — see the component-level comment above for why
                  this is a real, deterministic double-entry and not
                  fabricated ledger data. */}
              <div>
                <div className="mb-4 border-b border-gray-200">
                  <span className="inline-block border-b-2 border-blue-600 pb-2 text-sm font-semibold text-blue-700">Journal</span>
                </div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs text-gray-400">
                    Amount is displayed in your base currency{' '}
                    <span className="ml-1 rounded bg-green-600 px-1.5 py-0.5 text-[10px] font-bold text-white">INR</span>
                  </p>
                  <div className="flex overflow-hidden rounded-md border border-gray-200 text-xs">
                    <span className="bg-gray-100 px-3 py-1 font-medium text-gray-700">Accrual</span>
                    <span className="px-3 py-1 text-gray-400">Cash</span>
                  </div>
                </div>
                <p className="mb-2 text-sm font-bold text-gray-800">
                  {detail.invoice ? `Invoice Payment  -  ${detail.invoice.invoice_number}` : 'Payment'}
                </p>
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
                        <td className="px-3 py-2 text-gray-700">{INVOICE_BANK.bankName}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{fmtRs2(detail.payment.amount)}</td>
                        <td className="px-3 py-2 text-right text-gray-700">0.00</td>
                      </tr>
                      <tr className="border-t border-gray-100">
                        <td className="px-3 py-2 text-blue-700">Accounts Receivable</td>
                        <td className="px-3 py-2 text-right text-gray-700">0.00</td>
                        <td className="px-3 py-2 text-right text-gray-700">{fmtRs2(detail.payment.amount)}</td>
                      </tr>
                      <tr className="border-t-2 border-gray-300 font-bold text-gray-900">
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-right">{fmtRs2(detail.payment.amount)}</td>
                        <td className="px-3 py-2 text-right">{fmtRs2(detail.payment.amount)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────
export default function PaymentsPage() {
  const router = useRouter()
  const [adminKey,  setAdminKey]  = useState('')
  const [role,      setRole]      = useState<AdminRole>(null)
  const [authed,    setAuthed]    = useState(false)
  const [payments,  setPayments]  = useState<Payment[]>([])
  const [loading,   setLoading]   = useState(false)
  const [filter,    setFilter]    = useState('all')
  const [search,    setSearch]    = useState('')
  const [showModal, setShowModal] = useState(false)
  const [modalPrefill, setModalPrefill] = useState<PaymentFormPrefill | undefined>(undefined)
  const [updating,  setUpdating]  = useState<string | null>(null)
  // Payment Receipt panel — set to a real payments.id to open it; never
  // opened for synthetic (is_synthetic) rows, which have no real row to
  // fetch a receipt for.
  const [viewingPaymentId, setViewingPaymentId] = useState<string | null>(null)
  const [fixingDuplicates, setFixingDuplicates] = useState(false)

  // One-time cleanup utility (2026-08-26, founder-reported: BDP-2026-0008/
  // 0009, BDP-2026-0006/0007 showing as separate "Paid" rows for the same
  // real payment) — see app/api/admin/payments/fix-duplicate-uploads/
  // route.ts for the full explanation and the safety scoping (only merges
  // an unambiguous upload+non-upload pair on the same booking; anything
  // more complex is left for manual review, never guessed at). Uses
  // window.confirm/alert rather than a custom modal since this is a rare,
  // explicit utility action, not a everyday workflow step — matches this
  // page's existing refundPayment() convention just above.
  async function fixDuplicatePayments() {
    setFixingDuplicates(true)
    try {
      const previewRes = await fetch(`/api/admin/payments/fix-duplicate-uploads?key=${adminKey}`, {
        headers: { 'x-admin-key': adminKey },
      })
      const preview = await previewRes.json().catch(() => ({}))
      if (!previewRes.ok) { alert(preview.error ?? 'Scan failed'); return }

      if (!preview.fixable || preview.fixable.length === 0) {
        alert(preview.ambiguousCount > 0
          ? `No safe-to-auto-fix duplicates found. ${preview.ambiguousCount} booking(s) have a more complex payment pattern (more than 2 payments) and need manual review in the list below.`
          : 'No duplicate payments found — nothing to fix.')
        return
      }

      type FixablePreview = { customer_name: string; amount: number }
      const summary = (preview.fixable as FixablePreview[])
        .map(p => `• ${p.customer_name} — ${fmtRs(p.amount)}`)
        .join('\n')
      const confirmed = window.confirm(
        `Found ${preview.fixable.length} duplicate payment pair(s):\n\n${summary}\n\n` +
        `Each pair will be merged into a single entry (the payment-proof row is kept and upgraded; the redundant manually-recorded row is removed). ` +
        `No customer's actual paid amount changes. Proceed?`
      )
      if (!confirmed) return

      const fixRes = await fetch(`/api/admin/payments/fix-duplicate-uploads?key=${adminKey}`, {
        method: 'POST',
        headers: { 'x-admin-key': adminKey },
      })
      const result = await fixRes.json().catch(() => ({}))
      if (!fixRes.ok) { alert(result.error ?? 'Fix failed'); return }

      alert(
        `Merged ${result.mergedCount} duplicate payment pair(s).` +
        (result.failed?.length ? ` ${result.failed.length} failed — check server logs.` : '') +
        (result.ambiguousCount ? ` ${result.ambiguousCount} booking(s) still need manual review.` : '')
      )
      fetchPayments()
    } catch {
      alert('Network error — please try again')
    } finally {
      setFixingDuplicates(false)
    }
  }

  function openLogPaymentModal(p: Payment) {
    setModalPrefill({
      booking_id: p.booking_id ?? '',
      customer_name: p.customer_name,
      customer_phone: p.customer_phone,
      amount: String(p.amount),
      payment_status: p.payment_status === 'paid' ? 'paid' : 'pending',
      notes: 'Logged from confirmed booking (previously untracked in Payments)',
    })
    setShowModal(true)
  }

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key')
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key)
    setRole(getRoleFromSession())
    setAuthed(true)
  }, [router])

  const fetchPayments = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    const qs = `?key=${adminKey}${filter !== 'all' ? '&status=' + filter : ''}${search ? '&search=' + encodeURIComponent(search) : ''}`
    const res = await fetch('/api/admin/payments' + qs)
    if (res.ok) setPayments((await res.json()).payments ?? [])
    setLoading(false)
  }, [adminKey, filter, search])

  useEffect(() => { if (authed) fetchPayments() }, [authed, fetchPayments])

  async function verifyPayment(id: string) {
    setUpdating(id)
    await fetch(`/api/admin/payments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ payment_status: 'paid' }),
    })
    setUpdating(null)
    fetchPayments()
  }

  async function refundPayment(id: string) {
    const reason = prompt('Reason for refund?')
    if (!reason) return
    setUpdating(id)
    await fetch(`/api/admin/payments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ payment_status: 'refunded', refund_reason: reason }),
    })
    setUpdating(null)
    fetchPayments()
  }

  // countsTowardTotalPaid excludes payment_method === 'upload' rows — a
  // payment-proof screenshot is a verification record (proof a payment
  // already logged elsewhere happened), never its own ledger entry, even
  // once Accounts approves it (see lib/payment-ledger.ts, 2026-08-24 fix
  // for the BDA-2026-0124 double-count).
  const totalPaid    = payments.filter(countsTowardTotalPaid).reduce((s, p) => s + Number(p.amount), 0)
  // Pending = confirmed/logged payments not yet paid and not refunded
  // (pending + approved_pending) — same definition used by the Payment
  // report in Reports & Analytics, so the two numbers agree. Upload rows
  // excluded here too — they're a verification trail, not money owed.
  const totalPending = payments.filter(p => p.payment_method !== 'upload' && p.payment_status !== 'paid' && p.payment_status !== 'refunded').reduce((s, p) => s + Number(p.amount), 0)

  if (!authed) return null

  return (
    <>
      {showModal && (
        <RecordPaymentModal adminKey={adminKey} initial={modalPrefill}
          onSaved={() => { setShowModal(false); setModalPrefill(undefined); fetchPayments() }}
          onClose={() => { setShowModal(false); setModalPrefill(undefined) }} />
      )}

      {viewingPaymentId && (
        <PaymentReceiptPanel paymentId={viewingPaymentId} adminKey={adminKey} onClose={() => setViewingPaymentId(null)} />
      )}

      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Payments</h1>
            <p className="mt-0.5 text-sm text-gray-400">{payments.length} transactions · {fmtRs(totalPaid)} collected</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fixDuplicatePayments} disabled={fixingDuplicates}
              title="Scans for a payment-proof upload and a manually-recorded payment that duplicate the same real payment, and merges each pair into one entry"
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60">
              {fixingDuplicates ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
              Fix Duplicate Payments
            </button>
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">
              <Plus className="h-4 w-4" /> New
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-6">
        {/* Summary */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total',         value: payments.length,                                             color: '#2563eb', bg: '#dbeafe' },
            { label: 'Collected',     value: fmtRs(totalPaid),                                           color: '#16a34a', bg: '#dcfce7' },
            { label: 'Pending',       value: fmtRs(totalPending),                                        color: '#d97706', bg: '#fef3c7' },
            { label: 'Refunded',      value: payments.filter(p => p.payment_status === 'refunded').length, color: '#7c3aed', bg: '#ede9fe' },
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
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, phone, or payment ID…"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm shadow-sm placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
          </div>
          <div className="relative">
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-gray-700 shadow-sm focus:border-orange-400 focus:outline-none">
              <option value="all">All</option>
              {Object.entries(STATUS_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
          <button onClick={fetchPayments} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 shadow-sm">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-gray-400">Loading payments…</div>
          ) : payments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <CreditCard className="mb-3 h-10 w-10 text-gray-200" />
              <p className="text-sm text-gray-400">No payments recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Date', 'Payment#', 'Reference#', 'Customer Name', 'Invoice#', 'Mode', 'Amount', 'Unused Amount', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {payments.map(p => (
                    <tr key={p.id} className={`transition-colors hover:bg-orange-50/30 ${p.is_synthetic ? 'bg-blue-50/20' : ''}`}>
                      <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(p.created_at)}</td>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-orange-600">
                        {/* Synthetic (booking-derived, no payment logged yet) rows have no
                            real payments.id, so there's no receipt to fetch — clicking opens
                            the same Log Payment flow as the Actions column's button instead
                            of a 404. Real rows open the actual Payment Receipt panel. */}
                        <button onClick={() => p.is_synthetic ? openLogPaymentModal(p) : setViewingPaymentId(p.id)}
                          className="inline-flex items-center gap-1.5 hover:underline">
                          <FileText className="h-3 w-3 shrink-0" /> {p.payment_id}
                        </button>
                        {p.is_synthetic && (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                            From Booking
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{p.is_synthetic ? 'No payment logged yet' : (p.payment_reference || '—')}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{formatCustomerName(p.title, p.customer_name) || p.customer_name}</p>
                        <p className="text-xs text-gray-400">{p.customer_phone}</p>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {p.invoice_number
                          ? <span className="font-mono font-bold text-orange-600">{p.invoice_number}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{METHOD_LABELS[p.payment_method] ?? p.payment_method}</td>
                      <td className="px-4 py-3 font-bold text-gray-900">{fmtRs(p.amount)}</td>
                      <td className="px-4 py-3 text-xs">
                        {(p.unused_amount ?? 0) > 0
                          ? <span className="font-semibold text-amber-600">{fmtRs(p.unused_amount ?? 0)}</span>
                          : <span className="text-gray-400">₹0</span>}
                      </td>
                      <td className="px-4 py-3"><Badge status={p.payment_status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {p.is_synthetic ? (
                            <button onClick={() => openLogPaymentModal(p)}
                              className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-100">
                              Log Payment
                            </button>
                          ) : (
                            <>
                              {p.payment_status === 'pending' && (
                                <button onClick={() => verifyPayment(p.id)} disabled={updating === p.id}
                                  className="rounded-lg bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-600 hover:bg-green-100 disabled:opacity-40">
                                  {updating === p.id ? '…' : 'Verify'}
                                </button>
                              )}
                              {p.payment_status === 'paid' && can('ISSUE_REFUND', role) && (
                                <button onClick={() => refundPayment(p.id)} disabled={updating === p.id}
                                  className="rounded-lg bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-600 hover:bg-purple-100 disabled:opacity-40">
                                  Refund
                                </button>
                              )}
                            </>
                          )}
                        </div>
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
