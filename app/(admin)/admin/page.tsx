'use client'

import { useEffect, useState, useCallback, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import {
  Package, Clock, CheckCircle, Truck,
  Search, ChevronDown, RefreshCw, TrendingUp,
  MapPin, Calendar, Phone, Mail, Hash, Pencil, X, Save,
  Users, FileText, IndianRupee, Lock, AlertCircle,
  FileCheck, CreditCard, Receipt, Download, ArrowUpDown, ArrowRight,
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
  payment_status: string | null
  payment_reference: string | null
  notes: string | null
  created_at: string
  updated_at?: string | null
  rejection_reason?: string | null
  rejection_comment?: string | null
  source?: string | null
  status_history?: Array<{
    from: string | null
    to: string
    timestamp: string
    changed_by: string
    note: string | null
  }> | null
}

interface Stats {
  total: number
  new_inquiries: number
  in_progress: number
  in_transit: number
  delivered: number
  revenue: number
}

// ── Full booking workflow — 20 statuses ───────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode; locked?: boolean }> = {
  // Phase 1: Inquiry
  inquiry:           { label: 'New Inquiry',         color: '#92400e', bg: '#fef3c7', icon: <AlertCircle className="h-3 w-3" /> },
  // Phase 2: Quote
  quote_created:     { label: 'Quote Created',       color: '#4f46e5', bg: '#eef2ff', icon: <FileCheck className="h-3 w-3" /> },
  quote_sent:        { label: 'Quote Sent',          color: '#6d28d9', bg: '#ede9fe', icon: <FileText className="h-3 w-3" /> },
  accepted:          { label: 'Quote Accepted',      color: '#0891b2', bg: '#cffafe', icon: <CheckCircle className="h-3 w-3" /> },
  rejected:          { label: 'Quote Rejected',      color: '#dc2626', bg: '#fee2e2', icon: <X className="h-3 w-3" /> },
  closed:            { label: 'Inquiry Closed',      color: '#6b7280', bg: '#f3f4f6', icon: <X className="h-3 w-3" /> },
  // Phase 3: Payment
  payment_pending:   { label: 'Payment Requested',  color: '#d97706', bg: '#fef3c7', icon: <CreditCard className="h-3 w-3" /> },
  payment_received:  { label: 'Payment Received',   color: '#059669', bg: '#d1fae5', icon: <CheckCircle className="h-3 w-3" /> },
  payment_approved:  { label: 'Admin Approved',     color: '#059669', bg: '#d1fae5', icon: <CheckCircle className="h-3 w-3" /> },
  // Phase 4: Booking
  confirmed:         { label: 'Booking Confirmed',  color: '#2563eb', bg: '#dbeafe', icon: <CheckCircle className="h-3 w-3" /> },
  invoice_generated: { label: 'Invoice Generated',  color: '#7c3aed', bg: '#ede9fe', icon: <Receipt className="h-3 w-3" /> },
  invoice_sent:      { label: 'Invoice Sent',       color: '#6d28d9', bg: '#ede9fe', icon: <FileText className="h-3 w-3" /> },
  // Phase 5: Operations
  pickup_scheduled:  { label: 'Pickup Scheduled',   color: '#7c3aed', bg: '#ede9fe', icon: <Calendar className="h-3 w-3" /> },
  picked_up:         { label: 'Bags Picked Up',     color: '#7c3aed', bg: '#ede9fe', icon: <Package className="h-3 w-3" /> },
  in_transit:        { label: 'In Transit',         color: '#0891b2', bg: '#cffafe', icon: <Truck className="h-3 w-3" /> },
  out_for_delivery:  { label: 'Out for Delivery',   color: '#ea580c', bg: '#ffedd5', icon: <Truck className="h-3 w-3" /> },
  delivered:         { label: 'Delivered',          color: '#16a34a', bg: '#dcfce7', icon: <CheckCircle className="h-3 w-3" /> },
  trip_created:      { label: 'Trip Sheet Created', color: '#0891b2', bg: '#cffafe', icon: <Truck className="h-3 w-3" /> },
  // Phase 6: Final
  completed:         { label: 'Completed',          color: '#14532d', bg: '#bbf7d0', icon: <CheckCircle className="h-3 w-3" />, locked: true },
  cancelled:         { label: 'Cancelled',          color: '#dc2626', bg: '#fee2e2', icon: <X className="h-3 w-3" /> },
}

const WORKFLOW_PHASES = [
  { label: 'Inquiry',    statuses: ['inquiry'] },
  { label: 'Quote',      statuses: ['quote_created','quote_sent','accepted','rejected','closed'] },
  { label: 'Payment',    statuses: ['payment_pending','payment_received','payment_approved'] },
  { label: 'Booking',    statuses: ['confirmed','invoice_generated','invoice_sent'] },
  { label: 'Operations', statuses: ['pickup_scheduled','picked_up','in_transit','out_for_delivery'] },
  { label: 'Closed',     statuses: ['delivered','trip_created','completed','cancelled'] },
]

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6', icon: null }
  return (
    <span style={{ color: cfg.color, background: cfg.bg }}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap">
      {cfg.icon}{cfg.label}
      {cfg.locked && <Lock className="h-2.5 w-2.5 ml-0.5" />}
    </span>
  )
}

// Statuses that require a quote before any status change is allowed
const PRE_QUOTE_STATUSES = ['inquiry', 'pending']

function StatusSelect({ id, current, adminKey, onUpdate }: {
  id: string; current: string; adminKey: string; onUpdate: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isLocked = STATUS_CONFIG[current]?.locked === true

  // Lock dropdown for pre-quote statuses — quote must be created first via Leads tab
  const isPreQuote = PRE_QUOTE_STATUSES.includes(current)

  if (isLocked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-green-50 border border-green-200 px-3 py-1.5 text-xs font-semibold text-green-800">
        <Lock className="h-3 w-3" /> Completed
      </span>
    )
  }

  if (isPreQuote) {
    return (
      <div className="space-y-1">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 cursor-not-allowed select-none">
          <Lock className="h-3 w-3" />
          {STATUS_CONFIG[current]?.label ?? current}
        </span>
        <p className="text-[10px] text-amber-600 leading-tight max-w-[160px]">
          Create a quote first via Leads tab → New Quote
        </p>
      </div>
    )
  }

  async function change(next: string) {
    if (next === current || loading) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/admin/bookings/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ status: next }),
    })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Failed')
    }
    setLoading(false)
    onUpdate()
  }

  return (
    <div>
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
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
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


interface EditForm {
  customer_name: string; customer_phone: string; customer_email: string
  total_bags: string; pickup_date: string; pickup_address: string
  drop_address: string; notes: string
}

function EditModal({ booking, adminKey, onSaved, onClose }: {
  booking: Booking; adminKey: string; onSaved: () => void; onClose: () => void
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
  const isLocked = STATUS_CONFIG[booking.status]?.locked === true

  function set(key: keyof EditForm, val: string) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSave() {
    setSaving(true); setSaveError(null)
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
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        {isLocked && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm font-medium text-green-800">
            <Lock className="h-4 w-4" /> This booking is completed. Details are read-only.
          </div>
        )}
        <div className="space-y-4 p-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Customer Name</label>
              <input type="text" value={form.customer_name} disabled={isLocked}
                onChange={e => set('customer_name', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:bg-gray-50 disabled:text-gray-500" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Mobile</label>
              <div className="flex gap-1.5">
                <span className="flex items-center rounded-lg border border-gray-200 bg-gray-50 px-2 text-xs font-semibold text-gray-500 select-none">+91</span>
                <input type="tel" inputMode="numeric" value={form.customer_phone} disabled={isLocked}
                  onChange={e => set('customer_phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:bg-gray-50 disabled:text-gray-500" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Email</label>
              <input type="email" value={form.customer_email} disabled={isLocked}
                onChange={e => set('customer_email', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:bg-gray-50 disabled:text-gray-500" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Total Bags</label>
              <input type="number" min={1} max={99} value={form.total_bags} disabled={isLocked}
                onChange={e => set('total_bags', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:bg-gray-50 disabled:text-gray-500" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Pickup Date</label>
              <input type="date" value={form.pickup_date} disabled={isLocked}
                onChange={e => set('pickup_date', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:bg-gray-50 disabled:text-gray-500" />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Pickup Address</label>
              <input type="text" value={form.pickup_address} disabled={isLocked}
                onChange={e => set('pickup_address', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:bg-gray-50 disabled:text-gray-500" />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Drop Address</label>
              <input type="text" value={form.drop_address} disabled={isLocked}
                onChange={e => set('drop_address', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:bg-gray-50 disabled:text-gray-500" />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Notes / Special Instructions</label>
              <textarea rows={3} value={form.notes} disabled={isLocked}
                onChange={e => set('notes', e.target.value)}
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:bg-gray-50 disabled:text-gray-500" />
            </div>
          </div>
          {saveError && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{saveError}</p>}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            {isLocked ? 'Close' : 'Cancel'}
          </button>
          {!isLocked && (
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-50 transition-colors">
              {saving
                ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                : <Save className="h-3.5 w-3.5" />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Workflow is managed entirely from the Leads (Quote Management) module
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function QuotePaymentPanel({ booking, adminKey, onUpdate }: {
  booking: Booking; adminKey: string; onUpdate: () => void
}) {
  return null
}
// ── Dead code below — kept for reference only, never called ──────
function _QuotePaymentPanelLEGACY({ booking, adminKey, onUpdate }: {
  booking: Booking; adminKey: string; onUpdate: () => void
}) {
  const [basePrice,      setBasePrice]      = useState('')
  const [utr,            setUtr]            = useState('')
  const [upiId,          setUpiId]          = useState('')
  const [loading,        setLoading]        = useState(false)
  const [err,            setErr]            = useState('')
  const [msg,            setMsg]            = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReason,   setRejectReason]   = useState('')
  const [rejectComment,  setRejectComment]  = useState('')
  const [invoiceData,    setInvoiceData]    = useState<{
    id: string; invoice_number: string; base_amount: number; cgst: number; sgst: number; total_amount: number
  } | null>(null)

  const s = booking.status

  const PANEL_STATUSES = [
    'inquiry', 'quote_created', 'accepted', 'quote_sent', 'rejected',
    'payment_pending', 'payment_received', 'payment_approved',
    'confirmed', 'invoice_generated', 'invoice_sent',
    'pickup_scheduled', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'trip_created',
  ]

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!['inquiry','quote_created','accepted','quote_sent','payment_pending','payment_received'].includes(s)) return
    fetch('/api/admin/settings?key=' + adminKey)
      .then(r => r.json())
      .then(d => { if (d.settings?.payment_upi) setUpiId(d.settings.payment_upi) })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, adminKey])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (s !== 'invoice_generated') { setInvoiceData(null); return }
    fetch(`/api/admin/invoices?key=${adminKey}&booking_id=${booking.id}`)
      .then(r => r.json())
      .then(d => { if (d.invoices?.[0]) setInvoiceData(d.invoices[0]) })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, adminKey, booking.id])

  if (!PANEL_STATUSES.includes(s)) return null

  const base   = parseFloat(basePrice) || 0
  const cgst   = parseFloat((base * 0.025).toFixed(2))
  const sgst   = parseFloat((base * 0.025).toFixed(2))
  const total  = parseFloat((base + cgst + sgst).toFixed(2))
  const amount = Number(booking.total_amount)
  const upiLink  = upiId && amount > 0 ? `upi://pay?pa=${upiId}&pn=Bagdrop&am=${amount}&cu=INR&tn=${booking.tracking_id}` : ''
  const upiQrUrl = upiLink ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiLink)}` : null

  // ── Stage step tracker ──────────────────────────────────────────
  const STAGE_ORDER  = ['inquiry', 'quote', 'payment', 'booking', 'ops']
  const STAGE_LABELS = ['Inquiry', 'Quote', 'Payment', 'Booking', 'Operations']
  const STAGE_MAP: Record<string, string> = {
    inquiry: 'inquiry',
    quote_created:'quote', quote_sent:'quote', accepted:'quote', rejected:'quote', closed:'quote',
    payment_pending:'payment', payment_received:'payment', payment_approved:'payment',
    confirmed:'booking', invoice_generated:'booking', invoice_sent:'booking',
    trip_created:'ops',
    pickup_scheduled:'ops', picked_up:'ops', in_transit:'ops', out_for_delivery:'ops', delivered:'ops',
  }
  const curStage = STAGE_MAP[s] ?? 'inquiry'
  const curIdx   = STAGE_ORDER.indexOf(curStage)

  // ── API helpers ─────────────────────────────────────────────────
  async function patchBooking(body: Record<string, unknown>) {
    setLoading(true); setErr('')
    const res = await fetch('/api/admin/bookings/' + booking.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(body),
    })
    const d = await res.json()
    if (!res.ok) { setErr(d.error ?? 'Failed'); setLoading(false); return false }
    setLoading(false); onUpdate(); return true
  }

  async function sendQuote() {
    if (base <= 0) { setErr('Enter a valid base price'); return }
    setLoading(true); setErr('')
    const qRes = await fetch('/api/admin/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({
        booking_id: booking.id, customer_name: booking.customer_name,
        customer_phone: booking.customer_phone, customer_email: booking.customer_email,
        service_type: booking.service_label || 'Baggage Delivery',
        from_city: booking.from_city, to_city: booking.to_city,
        pickup_date: booking.pickup_date, total_bags: booking.total_bags,
        base_price: base, status: 'sent', notes: `Booking ${booking.tracking_id}`,
      }),
    })
    const qData = await qRes.json()
    if (!qRes.ok) { setErr('Quote creation failed: ' + (qData.error ?? 'Unknown')); setLoading(false); return }
    const emailSent = qData.email_sent === true
    await patchBooking({ status: 'quote_sent', total_amount: total })
    setMsg(emailSent
      ? `Quote ${qData.quote?.quote_number ?? ''} created & emailed to ${booking.customer_email} ✓`
      : `Quote ${qData.quote?.quote_number ?? ''} created. Email not sent (no email or service unavailable).`)
  }

  async function acceptQuote()  { await patchBooking({ status: 'accepted' }) }

  async function rejectQuote() {
    if (!rejectReason) { setErr('Select a rejection reason'); return }
    const ok = await patchBooking({
      status: 'rejected',
      rejection_reason:  rejectReason,
      rejection_comment: rejectComment.trim() || null,
    })
    if (ok) { setShowRejectForm(false); setMsg('Quote rejected and recorded.') }
  }

  async function verifyPayment() {
    if (!utr.trim()) { setErr('Enter UTR / reference number'); return }
    const ok = await patchBooking({
      status: 'payment_received', payment_status: 'paid',
      payment_method: 'upi', payment_reference: utr.trim(),
    })
    if (ok) setMsg('✅ Payment received! Generate invoice & confirm booking below.')
  }

  async function adminApprovePayLater() {
    const ok = await patchBooking({ status: 'payment_approved', approved_without_payment: true })
    if (ok) setMsg('✅ Admin approved (Pay Later). Generate invoice & confirm booking.')
  }

  async function generateInvoiceAndConfirm() {
    setLoading(true); setErr(''); setMsg('')
    let invoiceNumber = ''; let emailSent = false
    try {
      const invRes = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ booking_id: booking.id, send_email: true }),
      })
      const invData = await invRes.json()
      invoiceNumber = invData.invoice?.invoice_number ?? ''
      emailSent     = invData.email_sent === true
    } catch { /* non-critical */ }
    await patchBooking({ status: 'confirmed' })
    const parts = ['🎉 Booking confirmed!']
    if (invoiceNumber) parts.push(`Invoice ${invoiceNumber} generated.`)
    if (emailSent) parts.push(`Emailed to ${booking.customer_email}.`)
    else if (invoiceNumber) parts.push('(No email — not sent.)')
    setMsg(parts.join(' '))
    setLoading(false)
  }

  async function generateInvoice() {
    setLoading(true); setErr(''); setMsg('')
    try {
      const invRes = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ booking_id: booking.id }),
      })
      const invData = await invRes.json()
      if (!invRes.ok) { setErr(invData.error ?? 'Invoice generation failed'); setLoading(false); return }
      setInvoiceData(invData.invoice)
      await patchBooking({ status: 'invoice_generated' })
      setMsg(`Invoice ${invData.invoice?.invoice_number ?? ''} generated.`)
    } catch {
      setErr('Failed to generate invoice'); setLoading(false)
    }
  }

  async function sendInvoiceToCustomer() {
    setLoading(true); setErr(''); setMsg('')
    try {
      const invRes = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ booking_id: booking.id, send_email: true }),
      })
      const invData = await invRes.json()
      if (!invRes.ok) { setErr(invData.error ?? 'Failed'); setLoading(false); return }
      await patchBooking({ status: 'invoice_sent' })
      setMsg(invData.email_sent
        ? `✅ Invoice emailed to ${booking.customer_email}`
        : 'Invoice marked as sent (no email address on file).')
    } catch {
      setErr('Failed'); setLoading(false)
    }
  }

  async function markInvoiceSent() {
    const ok = await patchBooking({ status: 'invoice_sent' })
    if (ok) setMsg('Invoice marked as sent.')
  }

  function sharePaymentWhatsApp() {
    const phone = booking.customer_phone.replace(/\D/g, '')
    const e164  = phone.startsWith('91') ? phone : '91' + phone
    const upi   = upiId || 'BAGDROP1717@IOB'
    const upiDeepLink = `upi://pay?pa=${upi}&pn=Bagdrop&am=${amount}&cu=INR&tn=${booking.tracking_id}`
    const qrImgUrl    = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiDeepLink)}`
    const message = [
      `Hi ${booking.customer_name}! 🧳`, ``,
      `Your Bagdrop quote for *${booking.from_city} → ${booking.to_city}* is ready for payment.`, ``,
      `💰 *Amount Due: ₹${amount.toLocaleString('en-IN')}*`, ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `💳 *Pay via UPI*`, `UPI ID: *${upi}*`, `📲 Tap to Pay: ${upiDeepLink}`, ``,
      `📷 *Scan QR Code to Pay:*`, qrImgUrl,
      `━━━━━━━━━━━━━━━━━━━━`, ``,
      `Reference: ${booking.tracking_id}`, ``,
      `Once payment is done, reply with a screenshot and we will confirm your booking.`, ``,
      `_Bagdrop — Baggage Delivered. Journey Simplified._`,
    ].join('\n')
    window.open(`https://wa.me/${e164}?text=${encodeURIComponent(message)}`, '_blank')
  }

  async function sendPaymentViaWhatsApp() {
    await patchBooking({ status: 'payment_pending' })
    sharePaymentWhatsApp()
  }

  async function sharePaymentEmail() {
    if (!booking.customer_email) { setErr('No email address on this booking.'); return }
    setLoading(true); setErr('')
    try {
      const res = await fetch('/api/admin/bookings/' + booking.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ send_payment_email: true }),
      })
      if (res.ok) setMsg(`Payment request emailed to ${booking.customer_email} ✓`)
      else        setErr('Could not send email. Check Resend config.')
    } catch { setErr('Error sending email.') }
    setLoading(false)
  }

  // ── Inline quote price builder ──────────────────────────────────
  const QuoteBuilder = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Base Price (₹)</label>
        <input type="number" min={0} placeholder="e.g. 2000" value={basePrice}
          onChange={e => setBasePrice(e.target.value)}
          className="w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
      </div>
      {base > 0 && (
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5">
          <div className="flex gap-5 text-xs text-gray-500">
            <span>CGST 2.5%: <strong className="text-gray-700">₹{cgst.toFixed(2)}</strong></span>
            <span>SGST 2.5%: <strong className="text-gray-700">₹{sgst.toFixed(2)}</strong></span>
          </div>
          <p className="mt-1 text-lg font-bold text-gray-900">Total: ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
        </div>
      )}
    </div>
  )

  // ── Rejection form ──────────────────────────────────────────────
  const RejectForm = (
    <div className="rounded-xl border border-red-100 bg-red-50 p-4 space-y-3">
      <p className="text-xs font-bold uppercase tracking-widest text-red-500">Record Rejection Reason</p>
      <select value={rejectReason} onChange={e => setRejectReason(e.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400">
        <option value="">Select reason…</option>
        <option>Price too high</option>
        <option>Chose another provider</option>
        <option>Trust issue</option>
        <option>Service not required</option>
        <option>Timeline not suitable</option>
        <option>Changed travel plans</option>
        <option>No response from customer</option>
        <option>Other</option>
      </select>
      <textarea rows={2} value={rejectComment} onChange={e => setRejectComment(e.target.value)}
        placeholder="Optional comment…"
        className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400" />
      <div className="flex gap-2">
        <button onClick={rejectQuote} disabled={loading || !rejectReason}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40 transition-colors">
          Confirm Rejection
        </button>
        <button onClick={() => setShowRejectForm(false)}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )

  return (
    <div className="mt-4 rounded-xl border border-orange-100 bg-white p-4 shadow-sm" onClick={e => e.stopPropagation()}>

      {/* ── Step progress tracker ── */}
      <div className="mb-4 flex items-center gap-1 overflow-x-auto pb-1">
        {STAGE_LABELS.map((label, i) => {
          const key = STAGE_ORDER[i]
          const isActive = key === curStage
          const isPast   = i < curIdx
          return (
            <div key={key} className="flex items-center gap-1 shrink-0">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
                isActive ? 'bg-orange-500 text-white' :
                isPast   ? 'bg-green-100 text-green-700' :
                           'bg-gray-100 text-gray-400'
              }`}>
                {isPast ? '✓' : `${i + 1}.`} {label}
              </span>
              {i < 4 && <span className="text-gray-200 text-[10px]">›</span>}
            </div>
          )
        })}
      </div>

      {/* ── INQUIRY: Create & Send Quote ── */}
      {s === 'inquiry' && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-500">🔍 New Inquiry — Set Price & Create Quote</p>
          {QuoteBuilder}
          <button onClick={sendQuote} disabled={loading || base <= 0}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-purple-700 disabled:opacity-40 transition-colors">
            <FileText className="h-3.5 w-3.5" />
            {loading ? 'Sending...' : 'Create & Send Quote →'}
          </button>
        </div>
      )}



      {/* ── QUOTE ACCEPTED: removed — managed via status dropdown ── */}

      {/* ── QUOTE REJECTED: Details & close ── */}
      {s === 'rejected' && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-red-400">✗ Quote Rejected</p>
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 space-y-1.5">
            <p className="text-sm text-red-700">
              <span className="font-semibold">Reason: </span>
              {booking.rejection_reason || <span className="italic text-red-400">Not recorded</span>}
            </p>
            {booking.rejection_comment && (
              <p className="text-sm text-red-600"><span className="font-semibold">Comment: </span>{booking.rejection_comment}</p>
            )}
          </div>
          {!showRejectForm ? (
            <div className="flex gap-2">
              <button onClick={() => setShowRejectForm(true)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors">
                {booking.rejection_reason ? 'Update Reason' : 'Record Reason'}
              </button>
              <button onClick={() => patchBooking({ status: 'closed' })} disabled={loading}
                className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-200 transition-colors">
                Close Inquiry
              </button>
            </div>
          ) : (
            <div>{RejectForm}</div>
          )}
        </div>
      )}

      {/* ── PAYMENT REQUESTED: QR + Verify ── */}
      {s === 'payment_pending' && (
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-amber-500">💳 Payment Requested — Awaiting Customer Payment</p>
          <div className="flex flex-wrap gap-6">
            <div className="flex flex-col items-center gap-2 shrink-0">
              {upiQrUrl ? (
                <>
                  <img src={upiQrUrl} alt="UPI QR Code" className="rounded-xl border-2 border-orange-100 shadow-md" width={160} height={160} />
                  <p className="text-[11px] font-mono font-bold text-gray-600">{upiId}</p>
                  <p className="text-sm font-bold text-gray-800">₹{amount.toLocaleString('en-IN')}</p>
                </>
              ) : (
                <div className="flex h-[160px] w-[160px] items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-center text-xs text-gray-400 p-4">
                  Set UPI ID in<br />Settings → Payment
                </div>
              )}
            </div>
            <div className="flex-1 min-w-[240px] space-y-3">
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 mb-1">Payment Details</p>
                <p className="text-sm font-mono font-bold text-amber-900">{upiId || '(Set UPI in Settings)'}</p>
                <p className="text-lg font-bold text-amber-900">₹{amount.toLocaleString('en-IN')}</p>
                <p className="text-[10px] text-amber-600 mt-0.5">Ref: {booking.tracking_id}</p>
              </div>
              <div className="space-y-2">
                <button onClick={sharePaymentWhatsApp} disabled={!upiId}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-40 transition-colors">
                  <span>📲</span> Resend Payment Request via WhatsApp
                </button>
                <button onClick={sharePaymentEmail} disabled={loading || !booking.customer_email || !upiId}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40 transition-colors">
                  <span>📧</span> Send via Email
                </button>
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">UTR / Payment Reference No.</label>
                <input type="text" placeholder="12-digit UTR or reference" value={utr}
                  onChange={e => setUtr(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400" />
              </div>
              <button onClick={verifyPayment} disabled={loading || !utr.trim()}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-40 transition-colors">
                <CheckCircle className="h-3.5 w-3.5" />
                {loading ? 'Processing...' : 'Mark Payment Received ✓'}
              </button>
              <div className="border-t border-gray-100 pt-2">
                <button onClick={adminApprovePayLater} disabled={loading}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors">
                  🏦 Admin Approve — Pay Later (no payment received)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PAYMENT RECEIVED / ADMIN APPROVED: Generate Invoice + Confirm ── */}
      {(s === 'payment_received' || s === 'payment_approved') && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-green-500">
            {s === 'payment_received' ? '✅ Payment Received — Generate Invoice & Confirm Booking' : '🏦 Admin Approved — Generate Invoice & Confirm Booking'}
          </p>
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-5 py-3">
              <CheckCircle className="h-6 w-6 text-green-600 shrink-0" />
              <div>
                <p className="text-sm font-bold text-green-800">
                  {s === 'payment_received' ? 'Payment Received' : 'Admin Approved (Pay Later)'}
                </p>
                <p className="text-xs text-green-600">₹{amount.toLocaleString('en-IN')}</p>
                {booking.payment_reference && (
                  <p className="text-[10px] font-mono text-green-500 mt-0.5">UTR: {booking.payment_reference}</p>
                )}
              </div>
            </div>
            <div className="flex-1 rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
              <p className="text-sm font-bold text-blue-800">Next: Generate Invoice & Confirm Booking</p>
              <p className="text-xs text-blue-600">
                This will generate an invoice, email it{booking.customer_email ? ` to ${booking.customer_email}` : ''}, and confirm the booking.
              </p>
              <button onClick={generateInvoiceAndConfirm} disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-40 transition-colors">
                <Receipt className="h-4 w-4" />
                {loading ? 'Processing...' : 'Generate Invoice & Confirm Booking →'}
              </button>
              {!booking.customer_email && (
                <p className="text-[10px] text-blue-400">⚠ No email — invoice will be generated but not emailed.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── BOOKING CONFIRMED: Generate Invoice ── */}
      {s === 'confirmed' && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-500">🎉 Booking Confirmed — Generate Invoice</p>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
            <p className="text-sm text-blue-700">
              Generate a GST invoice for this booking. You will be able to preview, download, and email it to the customer in the next step.
            </p>
            <button onClick={generateInvoice} disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-40 transition-colors">
              <Receipt className="h-4 w-4" />
              {loading ? 'Generating...' : 'Generate Invoice →'}
            </button>
          </div>
        </div>
      )}

      {/* ── INVOICE GENERATED: Preview + Download + Send ── */}
      {s === 'invoice_generated' && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-purple-500">🧾 Invoice Generated — Review & Send</p>
          {invoiceData ? (
            <div className="rounded-xl border border-purple-100 bg-purple-50 p-4 space-y-3">
              {/* Invoice summary */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-purple-400">Invoice Number</p>
                  <p className="text-xl font-bold font-mono text-purple-800 mt-0.5">{invoiceData.invoice_number}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-purple-400">Total Amount</p>
                  <p className="text-xl font-bold text-green-700 mt-0.5">₹{Number(invoiceData.total_amount).toLocaleString('en-IN')}</p>
                </div>
              </div>
              {/* GST breakdown */}
              <div className="grid grid-cols-3 gap-2 text-xs text-center">
                <div className="rounded-lg bg-white border border-purple-100 px-2 py-2">
                  <p className="text-purple-400 font-semibold mb-0.5">Base Amount</p>
                  <p className="font-bold text-gray-700">₹{Number(invoiceData.base_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="rounded-lg bg-white border border-purple-100 px-2 py-2">
                  <p className="text-purple-400 font-semibold mb-0.5">CGST 2.5%</p>
                  <p className="font-bold text-gray-700">₹{Number(invoiceData.cgst).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="rounded-lg bg-white border border-purple-100 px-2 py-2">
                  <p className="text-purple-400 font-semibold mb-0.5">SGST 2.5%</p>
                  <p className="font-bold text-gray-700">₹{Number(invoiceData.sgst).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                </div>
              </div>
              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-1">
                <a href={`/admin/invoices/${invoiceData.id}/print?key=${adminKey}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-white px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50 transition-colors">
                  <Download className="h-3.5 w-3.5" /> View / Download Invoice
                </a>
                {booking.customer_email ? (
                  <button onClick={sendInvoiceToCustomer} disabled={loading}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-40 transition-colors">
                    <Mail className="h-3.5 w-3.5" />
                    {loading ? 'Sending...' : `Send Invoice to Customer →`}
                  </button>
                ) : (
                  <button onClick={sendInvoiceToCustomer} disabled={loading}
                    className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100 disabled:opacity-40 transition-colors">
                    <CheckCircle className="h-3.5 w-3.5" />
                    {loading ? '...' : 'Mark Invoice as Sent →'}
                  </button>
                )}
              </div>
              {!booking.customer_email && (
                <p className="text-[10px] text-purple-400">⚠ No email on file — will mark as sent without emailing.</p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-purple-100 bg-purple-50 p-4 text-center">
              <p className="text-sm text-purple-500">Loading invoice details...</p>
            </div>
          )}
        </div>
      )}

      {/* ── INVOICE SENT: Schedule Pickup ── */}
      {s === 'invoice_sent' && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-green-500">✅ Invoice Sent — Schedule Customer Pickup</p>
          <div className="rounded-xl border border-orange-100 bg-orange-50 p-4 space-y-3">
            <p className="text-sm text-orange-700">Invoice has been sent. Coordinate with the customer to schedule bag pickup.</p>
            <button onClick={() => patchBooking({ status: 'pickup_scheduled' })} disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-40 transition-colors">
              <Calendar className="h-4 w-4" />
              {loading ? 'Updating...' : 'Pickup Scheduled →'}
            </button>
          </div>
        </div>
      )}

      {/* ── PICKUP SCHEDULED: Confirm bags collected ── */}
      {s === 'pickup_scheduled' && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-violet-500">📅 Pickup Scheduled — Confirm When Collected</p>
          <div className="rounded-xl border border-violet-100 bg-violet-50 p-4 space-y-3">
            <p className="text-sm text-violet-700">Once your team has collected the bags from the customer, mark them as picked up.</p>
            <button onClick={() => patchBooking({ status: 'picked_up' })} disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-40 transition-colors">
              <Package className="h-4 w-4" />
              {loading ? 'Updating...' : 'Bags Picked Up →'}
            </button>
          </div>
        </div>
      )}

      {/* ── PICKED UP: Mark in transit ── */}
      {s === 'picked_up' && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-500">📦 Bags Picked Up — Mark In Transit</p>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
            <p className="text-sm text-blue-700">Bags have been collected. Mark as in transit once the shipment is on the way.</p>
            <button onClick={() => patchBooking({ status: 'in_transit' })} disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-40 transition-colors">
              <Truck className="h-4 w-4" />
              {loading ? 'Updating...' : 'In Transit →'}
            </button>
          </div>
        </div>
      )}

      {/* ── IN TRANSIT: Out for delivery ── */}
      {s === 'in_transit' && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-600">🚚 In Transit — Mark Out for Delivery</p>
          <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-4 space-y-3">
            <p className="text-sm text-cyan-700">Shipment is in transit. Mark as out for delivery when the delivery agent is on the way to the customer.</p>
            <button onClick={() => patchBooking({ status: 'out_for_delivery' })} disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-cyan-700 disabled:opacity-40 transition-colors">
              <Truck className="h-4 w-4" />
              {loading ? 'Updating...' : 'Out for Delivery →'}
            </button>
          </div>
        </div>
      )}

      {/* ── OUT FOR DELIVERY: Confirm delivery ── */}
      {s === 'out_for_delivery' && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-500">🛵 Out for Delivery — Confirm Delivered</p>
          <div className="rounded-xl border border-orange-100 bg-orange-50 p-4 space-y-3">
            <p className="text-sm text-orange-700">Delivery agent is on the way. Mark as delivered once bags reach the customer.</p>
            <button onClick={() => patchBooking({ status: 'delivered' })} disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-40 transition-colors">
              <CheckCircle className="h-4 w-4" />
              {loading ? 'Updating...' : 'Delivered ✓'}
            </button>
          </div>
        </div>
      )}

      {/* ── DELIVERED: Create trip sheet ── */}
      {s === 'delivered' && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-green-600">🎉 Delivered — Create Trip Sheet</p>
          <div className="rounded-xl border border-green-100 bg-green-50 p-4 space-y-3">
            <p className="text-sm text-green-700">
              Bags delivered. Now create a trip sheet to log delivery expenses for this booking.
            </p>
            <Link href="/admin/trip-sheets/new"
              onClick={async (e) => {
                e.preventDefault()
                await patchBooking({ status: 'trip_created' })
                window.location.href = '/admin/trip-sheets/new'
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors">
              <Truck className="h-4 w-4" /> Create Trip Sheet →
            </Link>
          </div>
        </div>
      )}

      {/* ── TRIP SHEET CREATED: Mark completed ── */}
      {s === 'trip_created' && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-600">📋 Trip Sheet Created — Close Booking</p>
          <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-4 space-y-3">
            <p className="text-sm text-cyan-700">
              Trip sheet has been created and expenses logged. Mark this booking as completed to close it.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/trip-sheets/new"
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-200 bg-white px-4 py-2.5 text-sm font-semibold text-cyan-700 hover:bg-cyan-50 transition-colors">
                <Truck className="h-3.5 w-3.5" /> View / Edit Trip Sheet
              </Link>
              <button onClick={() => patchBooking({ status: 'completed' })} disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-40 transition-colors">
                <CheckCircle className="h-4 w-4" />
                {loading ? '...' : 'Mark Completed ✓'}
              </button>
            </div>
          </div>
        </div>
      )}

      {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{err}</p>}
      {msg && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-600">{msg}</p>}
    </div>
  )
}

// ── Workflow back-navigation ─────────────────────────────────────
// Linear "happy-path" order. Terminal/branch statuses are excluded.
const STATUS_ORDER = [
  'inquiry',
  'quote_created',
  'quote_sent',
  'accepted',
  'payment_pending',
  'payment_received',
  'payment_approved',
  'confirmed',
  'invoice_generated',
  'invoice_sent',
  'pickup_scheduled',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'trip_created',
  'completed',
] as const

const SORT_OPTIONS = [
  { value: 'newest',    label: 'Newest First' },
  { value: 'oldest',   label: 'Oldest First' },
  { value: 'date_desc',label: 'Date (Newest → Oldest)' },
  { value: 'date_asc', label: 'Date (Oldest → Newest)' },
  { value: 'updated',  label: 'Recently Updated' },
  { value: 'name_asc', label: 'Customer Name (A–Z)' },
  { value: 'name_desc',label: 'Customer Name (Z–A)' },
]

function sortBookings(arr: Booking[], sortBy: string): Booking[] {
  return [...arr].sort((a, b) => {
    switch (sortBy) {
      case 'oldest':    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      case 'date_desc': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      case 'date_asc':  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      case 'updated':   return new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime()
      case 'name_asc':  return (a.customer_name ?? '').localeCompare(b.customer_name ?? '')
      case 'name_desc': return (b.customer_name ?? '').localeCompare(a.customer_name ?? '')
      default:          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime() // newest
    }
  })
}

export default function AdminDashboard() {
  const router = useRouter()
  const [adminKey, setAdminKey]       = useState('')
  const [authed, setAuthed]           = useState(false)
  const [stats, setStats]             = useState<Stats | null>(null)
  const [bookings, setBookings]       = useState<Booking[]>([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [filter, setFilter]           = useState('all')
  const [phaseFilter, setPhaseFilter] = useState('all')
  const [sort, setSort]               = useState('newest')
  const [expanded, setExpanded]       = useState<string | null>(null)
  const [editTarget, setEditTarget]   = useState<Booking | null>(null)
  const [crmStats, setCrmStats]       = useState<{
    total_leads: number; pending_quotes: number; today_dispatch: number; revenue_this_month: number
  } | null>(null)
  const [tripStats, setTripStats]     = useState<{
    total: number; active: number; delivered: number
    totalIncome: number; totalExpense: number; netProfit: number
  } | null>(null)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key)
    setAuthed(true)
    // Restore sort preference
    const savedSort = sessionStorage.getItem('bagdrop_dashboard_sort')
    if (savedSort) setSort(savedSort)
  }, [router])

  function handleSortChange(val: string) {
    setSort(val)
    sessionStorage.setItem('bagdrop_dashboard_sort', val)
  }

  const fetchData = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    let qs = '?key=' + adminKey
    if (filter === 'cancelled') {
      // Explicitly requested — show cancelled
      qs += '&status=cancelled'
    } else if (filter !== 'all') {
      qs += '&status=' + filter
    } else if (phaseFilter !== 'all') {
      const phase = WORKFLOW_PHASES.find(p => p.label === phaseFilter)
      if (phase) qs += '&statuses=' + phase.statuses.join(',')
    } else {
      // Default: hide cancelled from normal view
      qs += '&exclude_status=cancelled'
    }
    if (search) qs += '&search=' + encodeURIComponent(search)
    const [sr, br, cr, tr, allR] = await Promise.all([
      fetch('/api/admin/stats?key=' + adminKey),
      fetch('/api/admin/bookings' + qs),
      fetch('/api/admin/crm-stats?key=' + adminKey),
      fetch('/api/admin/trip-sheets?limit=200&key=' + adminKey),
      fetch('/api/admin/bookings?key=' + adminKey + '&limit=2000'),
    ])
    if (sr.ok) setStats(await sr.json())
    if (br.ok) setBookings((await br.json()).bookings ?? [])
    if (cr.ok) setCrmStats(await cr.json())
    if (allR.ok) {
      const allData = await allR.json()
      const counts: Record<string, number> = {}
      for (const b of (allData.bookings ?? [])) {
        counts[b.status] = (counts[b.status] ?? 0) + 1
      }
      setStatusCounts(counts)
    }
    if (tr.ok) {
      const td = await tr.json()
      const sheets = td.trip_sheets ?? []
      setTripStats({
        total:        sheets.length,
        active:       sheets.filter((s: Record<string,string>) => !['completed','cancelled','delivered'].includes(s.status)).length,
        delivered:    sheets.filter((s: Record<string,string>) => ['delivered','completed'].includes(s.status)).length,
        totalIncome:  sheets.reduce((sum: number, s: Record<string,number>) => sum + (s.total_income  || 0), 0),
        totalExpense: sheets.reduce((sum: number, s: Record<string,number>) => sum + (s.total_expense || 0), 0),
        netProfit:    sheets.reduce((sum: number, s: Record<string,number>) => sum + (s.net_profit    || 0), 0),
      })
    }
    setLoading(false)
  }, [adminKey, filter, phaseFilter, search])

  useEffect(() => { if (authed) fetchData() }, [authed, fetchData])

  function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  if (!authed) return null

  const statCards = [
    { label: 'Total Bookings', value: stats?.total ?? 0,         icon: <Package className="h-5 w-5" />,     color: '#FF6300', bg: '#fff7f0' },
    { label: 'New Inquiries',  value: stats?.new_inquiries ?? 0, icon: <AlertCircle className="h-5 w-5" />, color: '#d97706', bg: '#fef3c7' },
    { label: 'In Progress',    value: stats?.in_progress ?? 0,   icon: <CheckCircle className="h-5 w-5" />, color: '#2563eb', bg: '#dbeafe' },
    { label: 'In Transit',     value: stats?.in_transit ?? 0,    icon: <Truck className="h-5 w-5" />,       color: '#0891b2', bg: '#cffafe' },
    { label: 'Delivered',      value: stats?.delivered ?? 0,     icon: <TrendingUp className="h-5 w-5" />,  color: '#16a34a', bg: '#dcfce7' },
  ]

  const phases = ['all', ...WORKFLOW_PHASES.map(p => p.label)]

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
        <h1 className="text-xl font-bold text-gray-900">Dashboard &amp; Bookings</h1>
        <p className="mt-0.5 text-sm text-gray-400">Full booking lifecycle management</p>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">

        {/* Stat cards */}
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

        {/* ── Booking Funnel — 12 clickable status cards ── */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Booking Funnel</p>
            <span className="text-[10px] text-gray-400">Click any card to filter</span>
          </div>
          {/* Row 1: Inquiry → Quote */}
          <div className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {[
              { key: 'inquiry',       label: 'New Inquiries',   color: '#92400e', bg: '#fef3c7' },
              { key: 'quote_created', label: 'Quotes Created',  color: '#4f46e5', bg: '#eef2ff' },
              { key: 'quote_sent',    label: 'Quotes Sent',     color: '#6d28d9', bg: '#ede9fe' },
              { key: 'accepted',      label: 'Quotes Accepted', color: '#059669', bg: '#d1fae5' },
              { key: 'rejected',      label: 'Quotes Rejected', color: '#dc2626', bg: '#fee2e2' },
              { key: 'payment_pending', label: 'Payment Pending', color: '#d97706', bg: '#fef3c7' },
            ].map(c => (
              <button key={c.key} onClick={() => { setFilter(c.key); setPhaseFilter('all') }}
                className={`rounded-xl border p-3 text-left shadow-sm transition-all hover:border-orange-300 hover:shadow ${
                  filter === c.key ? 'border-orange-400 bg-orange-50 ring-1 ring-orange-300' : 'border-gray-100 bg-white'
                }`}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 leading-tight">{c.label}</p>
                <p className="mt-1 text-xl font-bold" style={{ color: c.color }}>
                  {statusCounts[c.key] ?? 0}
                </p>
              </button>
            ))}
          </div>
          {/* Row 2: Payment → Closed */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {[
              { key: 'payment_received', label: 'Payment Received',   color: '#059669', bg: '#d1fae5' },
              { key: 'confirmed',        label: 'Booking Confirmed',  color: '#2563eb', bg: '#dbeafe' },
              { key: 'in_transit',       label: 'In Transit',         color: '#0891b2', bg: '#cffafe' },
              { key: 'out_for_delivery', label: 'Out for Delivery',   color: '#ea580c', bg: '#ffedd5' },
              { key: 'delivered',        label: 'Delivered',          color: '#16a34a', bg: '#dcfce7' },
              { key: 'completed',        label: 'Completed',          color: '#14532d', bg: '#bbf7d0' },
            ].map(c => (
              <button key={c.key} onClick={() => { setFilter(c.key); setPhaseFilter('all') }}
                className={`rounded-xl border p-3 text-left shadow-sm transition-all hover:border-orange-300 hover:shadow ${
                  filter === c.key ? 'border-orange-400 bg-orange-50 ring-1 ring-orange-300' : 'border-gray-100 bg-white'
                }`}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 leading-tight">{c.label}</p>
                <p className="mt-1 text-xl font-bold" style={{ color: c.color }}>
                  {statusCounts[c.key] ?? 0}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* CRM quick links */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total Leads',       value: crmStats?.total_leads ?? '—',      icon: <Users className="h-4 w-4" />,       color: '#2563eb', bg: '#dbeafe', href: '/admin/leads' },
            { label: "Today's Dispatch",  value: crmStats?.today_dispatch ?? '—',   icon: <Package className="h-4 w-4" />,     color: '#7c3aed', bg: '#ede9fe', href: '/admin' },
            { label: 'Pending Quotes',    value: crmStats?.pending_quotes ?? '—',   icon: <FileText className="h-4 w-4" />,    color: '#ea580c', bg: '#ffedd5', href: '/admin/leads' },
            {
              label: 'Revenue This Month',
              value: crmStats
                ? ('Rs.' + crmStats.revenue_this_month.toLocaleString('en-IN', { maximumFractionDigits: 0 }))
                : '—',
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

        {/* Trip Operations quick stats */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Trip Operations</p>
            <Link href="/admin/trip-sheets" className="text-xs font-semibold text-orange-500 hover:text-orange-600">View all →</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Total Trips',   value: tripStats?.total ?? '—',    color: '#f97316', bg: '#fff7ed' },
              { label: 'Active Trips',  value: tripStats?.active ?? '—',   color: '#2563eb', bg: '#dbeafe' },
              { label: 'Delivered',     value: tripStats?.delivered ?? '—', color: '#16a34a', bg: '#dcfce7' },
              { label: 'Total Income',  value: tripStats ? '₹' + tripStats.totalIncome.toLocaleString('en-IN')  : '—', color: '#16a34a', bg: '#f0fdf4' },
              { label: 'Total Expense', value: tripStats ? '₹' + tripStats.totalExpense.toLocaleString('en-IN') : '—', color: '#dc2626', bg: '#fef2f2' },
              { label: 'Net Profit',    value: tripStats ? (tripStats.netProfit >= 0 ? '₹' : '-₹') + Math.abs(tripStats.netProfit).toLocaleString('en-IN') : '—', color: (tripStats?.netProfit ?? 0) >= 0 ? '#16a34a' : '#dc2626', bg: (tripStats?.netProfit ?? 0) >= 0 ? '#f0fdf4' : '#fef2f2' },
            ].map(c => (
              <Link key={c.label} href="/admin/trip-sheets"
                className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm hover:border-orange-200 transition-colors">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{c.label}</p>
                <p className="mt-1.5 text-lg font-bold" style={{ color: c.color }}>{c.value}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Workflow phase filter pills */}
        <div className="mb-3 flex flex-wrap gap-2">
          {phases.map(p => (
            <button key={p} onClick={() => { setPhaseFilter(p); setFilter('all') }}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                phaseFilter === p
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {p === 'all' ? 'All Phases' : p}
            </button>
          ))}
        </div>

        {/* Search + status filter + sort */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search by name, phone, or tracking ID..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 shadow-sm placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
          </div>
          <div className="relative">
            <select value={filter} onChange={e => { setFilter(e.target.value); setPhaseFilter('all') }}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-gray-700 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400">
              <option value="all">All statuses</option>
              {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                <option key={val} value={val}>{cfg.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
          <div className="relative">
            <ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <select value={sort} onChange={e => handleSortChange(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-8 text-sm font-medium text-gray-700 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400">
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
          <button onClick={fetchData}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        {/* Bookings table */}
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
                    {['Tracking', 'Customer', 'Route', 'Source', 'Service', 'Date', 'Bags', 'Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sortBookings(bookings, sort).map(b => (
                    <Fragment key={b.id}>
                      <tr onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                        className="cursor-pointer hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-xs font-bold text-orange-600">{b.tracking_id}</span>
                            {b.tracking_id?.startsWith('BDA-') && (
                              <span className="inline-flex w-fit items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">
                                <Users className="h-2.5 w-2.5" /> Lead
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-gray-900">{b.customer_name}</p>
                          <p className="text-xs text-gray-400">{formatDate(b.created_at)}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {b.from_city} &rarr; {b.to_city}
                        </td>
                        <td className="px-4 py-3">
                          {(() => {
                            const tid = b.tracking_id ?? ''
                            const src = tid.startsWith('BDA-') ? { label: 'Lead', color: '#2563eb', bg: '#dbeafe' }
                                      : tid.startsWith('BDQ-') ? { label: 'Quote', color: '#7c3aed', bg: '#ede9fe' }
                                      : { label: 'Website', color: '#16a34a', bg: '#dcfce7' }
                            return (
                              <span style={{ color: src.color, background: src.bg }}
                                className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap">
                                {src.label}
                              </span>
                            )
                          })()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{b.service_label}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{formatDate(b.pickup_date)}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">{b.total_bags}</td>
                        <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                      </tr>
                      {expanded === b.id && (
                        <tr className="bg-orange-50/40">
                          <td colSpan={8} className="px-4 py-5">
                            <div className="flex flex-wrap items-start gap-4">

                              {/* ── Booking details grid ── */}
                              <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4 min-w-0">
                                <DetailRow icon={<Phone className="h-3.5 w-3.5 text-orange-500" />}       label="Phone"      val={b.customer_phone || 'Not provided'} />
                                <DetailRow icon={<Mail className="h-3.5 w-3.5 text-orange-500" />}        label="Email"      val={b.customer_email || 'Not provided'} />
                                <DetailRow icon={<Clock className="h-3.5 w-3.5 text-orange-500" />}       label="Time Slot"  val={b.time_slot || 'Not specified'} />
                                <DetailRow icon={<Hash className="h-3.5 w-3.5 text-orange-500" />}        label="Booking ID" val={b.id.slice(0, 8) + '...'} />
                                {b.pickup_address && <DetailRow icon={<MapPin className="h-3.5 w-3.5 text-orange-500" />}   label="Pickup"   val={b.pickup_address} />}
                                {b.drop_address   && <DetailRow icon={<MapPin className="h-3.5 w-3.5 text-orange-500" />}   label="Drop"     val={b.drop_address} />}
                                {b.notes          && <DetailRow icon={<Calendar className="h-3.5 w-3.5 text-orange-500" />} label="Notes"    val={b.notes} />}
                              </div>

                              {/* —— Right panel: Workflow + Actions —— */}
                              <div className="flex shrink-0 flex-col gap-3 min-w-[220px]">

                                {/* Workflow actions */}
                                <div className="rounded-xl border border-orange-100 bg-white p-3 shadow-sm space-y-2" onClick={e => e.stopPropagation()}>
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Workflow</p>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <StatusSelect id={b.id} current={b.status} adminKey={adminKey} onUpdate={fetchData} />
                                  </div>
                                </div>

                                {/* General actions */}
                                <div className="flex flex-col gap-2">
                                  <button
                                    onClick={e => { e.stopPropagation(); setEditTarget(b) }}
                                    className="flex items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 py-2 text-xs font-semibold text-orange-600 shadow-sm hover:bg-orange-50 hover:border-orange-400 transition-colors">
                                    <Pencil className="h-3.5 w-3.5" />
                                    {STATUS_CONFIG[b.status]?.locked ? 'View Details' : 'Edit Booking'}
                                  </button>
                                  <Link
                                    href="/admin/leads"
                                    onClick={e => e.stopPropagation()}
                                    className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors">
                                    <FileText className="h-3.5 w-3.5" />
                                    Manage in Leads →
                                  </Link>
                                </div>

                                {/* Status history — last 4 entries */}
                                {b.status_history && b.status_history.length > 0 && (
                                  <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Status History</p>
                                    <ol className="space-y-1.5">
                                      {[...b.status_history].reverse().slice(0, 4).map((h, i) => (
                                        <li key={i} className="flex flex-col gap-0.5">
                                          <div className="flex items-center gap-1 text-[10px] text-gray-500">
                                            {h.from && (
                                              <span style={{ color: STATUS_CONFIG[h.from]?.color ?? '#6b7280', background: STATUS_CONFIG[h.from]?.bg ?? '#f3f4f6' }}
                                                className="rounded px-1.5 py-0.5 font-semibold text-[9px]">
                                                {STATUS_CONFIG[h.from]?.label ?? h.from}
                                              </span>
                                            )}
                                            {h.from && <ArrowRight className="h-2.5 w-2.5 text-gray-300 shrink-0" />}
                                            <span style={{ color: STATUS_CONFIG[h.to]?.color ?? '#6b7280', background: STATUS_CONFIG[h.to]?.bg ?? '#f3f4f6' }}
                                              className="rounded px-1.5 py-0.5 font-semibold text-[9px]">
                                              {STATUS_CONFIG[h.to]?.label ?? h.to}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                                            <span>{new Date(h.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} {new Date(h.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                                            {h.changed_by && <span className="text-gray-300">·</span>}
                                            {h.changed_by && <span className="capitalize">{h.changed_by}</span>}
                                          </div>
                                          {h.note && h.note !== 'Status reverted by admin' && (
                                            <p className="text-[10px] text-gray-400 italic truncate max-w-[200px]">{h.note}</p>
                                          )}
                                        </li>
                                      ))}
                                    </ol>
                                  </div>
                                )}
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

        {/* Workflow reference strip */}
        <div className="mt-6 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400">Booking Workflow</p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {Object.entries(STATUS_CONFIG).map(([key, cfg], i, arr) => (
              <Fragment key={key}>
                <span style={{ color: cfg.color, background: cfg.bg }}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold">
                  {cfg.icon}{cfg.label}
                  {cfg.locked && <Lock className="h-2.5 w-2.5" />}
                </span>
                {i < arr.length - 1 && <span className="text-gray-300">&rarr;</span>}
              </Fragment>
            ))}
          </div>
          <p className="mt-2 flex items-center gap-1 text-xs text-gray-400">
            <Lock className="h-3 w-3 text-green-700" />
            <span className="font-semibold text-green-700">Completed</span>
            &nbsp;status is locked &mdash; no further changes allowed.
          </p>
        </div>

        <p className="mt-3 text-center text-xs text-gray-400">
          Click any row to expand full booking details
        </p>
      </main>
    </>
  )
}
