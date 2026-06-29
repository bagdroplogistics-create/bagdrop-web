'use client'

import { useEffect, useState, useCallback, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import {
  Package, Clock, CheckCircle, Truck,
  Search, ChevronDown, RefreshCw, TrendingUp,
  MapPin, Calendar, Phone, Mail, Hash, Pencil, X, Save,
  Users, FileText, UserCheck, IndianRupee, Receipt, Lock,
  FileCheck, CreditCard, AlertCircle,
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
}

interface Stats {
  total: number
  new_inquiries: number
  in_progress: number
  in_transit: number
  delivered: number
  revenue: number
}

// ── Full 17-status workflow ────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode; locked?: boolean }> = {
  // Phase 1: Inquiry
  inquiry:             { label: 'Inquiry',            color: '#92400e', bg: '#fef3c7', icon: <AlertCircle className="h-3 w-3" /> },
  document_collection: { label: 'Docs Collection',    color: '#7c3aed', bg: '#ede9fe', icon: <FileText className="h-3 w-3" /> },
  pending:             { label: 'Pending Review',      color: '#d97706', bg: '#fef3c7', icon: <Clock className="h-3 w-3" /> },
  review:              { label: 'Under Review',        color: '#2563eb', bg: '#dbeafe', icon: <FileCheck className="h-3 w-3" /> },
  accepted:            { label: 'Accepted',            color: '#0891b2', bg: '#cffafe', icon: <CheckCircle className="h-3 w-3" /> },
  rejected:            { label: 'Rejected',            color: '#dc2626', bg: '#fee2e2', icon: <X className="h-3 w-3" /> },
  // Phase 2: Quote & Payment
  quote_sent:          { label: 'Quote Sent',          color: '#6d28d9', bg: '#ede9fe', icon: <FileText className="h-3 w-3" /> },
  payment_pending:     { label: 'Payment Pending',     color: '#d97706', bg: '#fef3c7', icon: <CreditCard className="h-3 w-3" /> },
  payment_approved:    { label: 'Admin Approved',      color: '#059669', bg: '#d1fae5', icon: <CheckCircle className="h-3 w-3" /> },
  // Phase 3: Operations
  confirmed:           { label: 'Confirmed',           color: '#2563eb', bg: '#dbeafe', icon: <CheckCircle className="h-3 w-3" /> },
  pickup_scheduled:    { label: 'Pickup Scheduled',    color: '#7c3aed', bg: '#ede9fe', icon: <Calendar className="h-3 w-3" /> },
  picked_up:           { label: 'Picked Up',           color: '#7c3aed', bg: '#ede9fe', icon: <Package className="h-3 w-3" /> },
  in_transit:          { label: 'In Transit',          color: '#0891b2', bg: '#cffafe', icon: <Truck className="h-3 w-3" /> },
  out_for_delivery:    { label: 'Out for Delivery',    color: '#ea580c', bg: '#ffedd5', icon: <Truck className="h-3 w-3" /> },
  delivered:           { label: 'Delivered',           color: '#16a34a', bg: '#dcfce7', icon: <CheckCircle className="h-3 w-3" /> },
  // Phase 4: Final (LOCKED)
  completed:           { label: 'Completed',           color: '#14532d', bg: '#bbf7d0', icon: <CheckCircle className="h-3 w-3" />, locked: true },
  cancelled:           { label: 'Cancelled',           color: '#dc2626', bg: '#fee2e2', icon: <X className="h-3 w-3" /> },
}

const WORKFLOW_PHASES = [
  { label: 'Inquiry',     statuses: ['inquiry','document_collection','pending','review','accepted','rejected'] },
  { label: 'Quote & Pay', statuses: ['quote_sent','payment_pending','payment_approved'] },
  { label: 'Operations',  statuses: ['confirmed','pickup_scheduled','picked_up','in_transit','out_for_delivery'] },
  { label: 'Closed',      statuses: ['delivered','completed','cancelled'] },
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

function StatusSelect({ id, current, adminKey, onUpdate }: {
  id: string; current: string; adminKey: string; onUpdate: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isLocked = STATUS_CONFIG[current]?.locked === true

  if (isLocked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-green-50 border border-green-200 px-3 py-1.5 text-xs font-semibold text-green-800">
        <Lock className="h-3 w-3" /> Completed
      </span>
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
    <button onClick={generate} disabled={state === 'loading'}
      className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 shadow-sm hover:bg-gray-50 hover:border-gray-400 transition-colors disabled:opacity-50">
      <Receipt className="h-3.5 w-3.5" />
      {state === 'loading' ? 'Generating...' : 'Generate Invoice'}
    </button>
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

// ── Quote & Payment Action Panel ─────────────────────────────────
// Shows contextual actions in the expanded row based on booking status:
// accepted → build quote | quote_sent → request payment | payment_pending → QR + verify | payment_approved → confirm
function QuotePaymentPanel({ booking, adminKey, onUpdate }: {
  booking: Booking; adminKey: string; onUpdate: () => void
}) {
  const [basePrice, setBasePrice] = useState('')
  const [utr, setUtr]             = useState('')
  const [upiId, setUpiId]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [err, setErr]             = useState('')
  const [msg, setMsg]             = useState('')

  const s = booking.status

  // Fetch UPI ID from settings when we need to show QR
  useEffect(() => {
    if (!['accepted', 'quote_sent', 'payment_pending'].includes(s)) return
    fetch('/api/admin/settings?key=' + adminKey)
      .then(r => r.json())
      .then(d => { if (d.settings?.payment_upi) setUpiId(d.settings.payment_upi) })
      .catch(() => {})
  }, [s, adminKey])

  // Only show for these 4 statuses
  if (!['accepted', 'quote_sent', 'payment_pending', 'payment_approved'].includes(s)) return null

  const base  = parseFloat(basePrice) || 0
  const cgst  = parseFloat((base * 0.025).toFixed(2))
  const sgst  = parseFloat((base * 0.025).toFixed(2))
  const total = parseFloat((base + cgst + sgst).toFixed(2))

  async function patchBooking(body: Record<string, unknown>) {
    setLoading(true); setErr('')
    const res = await fetch('/api/admin/bookings/' + booking.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(body),
    })
    const d = await res.json()
    if (!res.ok) { setErr(d.error ?? 'Failed'); setLoading(false); return false }
    setLoading(false)
    onUpdate()
    return true
  }

  async function sendQuote() {
    if (base <= 0) { setErr('Enter a valid base price'); return }
    setLoading(true); setErr('')

    // Step 1: Create quote record + send email
    const qRes = await fetch('/api/admin/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({
        booking_id:     booking.id,
        customer_name:  booking.customer_name,
        customer_phone: booking.customer_phone,
        customer_email: booking.customer_email,
        service_type:   booking.service_label || 'Baggage Delivery',
        from_city:      booking.from_city,
        to_city:        booking.to_city,
        pickup_date:    booking.pickup_date,
        total_bags:     booking.total_bags,
        base_price:     base,
        status:         'sent',
        notes:          `Booking ${booking.tracking_id}`,
      }),
    })
    const qData = await qRes.json()
    if (!qRes.ok) {
      setErr('Quote creation failed: ' + (qData.error ?? 'Unknown error'))
      setLoading(false)
      return
    }

    // Step 2: Only advance booking status if quote was created successfully
    const emailSent = qData.email_sent === true
    await patchBooking({ status: 'quote_sent', total_amount: total })
    if (emailSent) {
      setMsg(`Quote ${qData.quote?.quote_number ?? ''} created & emailed to ${booking.customer_email} ✓`)
    } else {
      setMsg(`Quote ${qData.quote?.quote_number ?? ''} created. No email sent (customer email not set or email service unavailable).`)
    }
  }

  async function requestPayment() {
    await patchBooking({ status: 'payment_pending' })
  }

  async function verifyPayment() {
    if (!utr.trim()) { setErr('Enter UTR / reference number'); return }
    setLoading(true); setErr(''); setMsg('')

    // Mark payment received — moves to payment_approved
    const ok = await patchBooking({
      status:            'payment_approved',
      payment_status:    'paid',
      payment_method:    'upi',
      payment_reference: utr.trim(),
    })
    if (!ok) { setLoading(false); return }

    setMsg('✅ Payment marked as received! Now generate the invoice and confirm the booking below.')
    setLoading(false)
  }

  async function generateInvoiceAndConfirm() {
    setLoading(true); setErr(''); setMsg('')

    // Step 1 — Generate invoice + email to customer
    let invoiceNumber = ''
    let emailSent     = false
    try {
      const invRes = await fetch('/api/admin/invoices', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ booking_id: booking.id, send_email: true }),
      })
      const invData = await invRes.json()
      invoiceNumber = invData.invoice?.invoice_number ?? ''
      emailSent     = invData.email_sent === true
    } catch { /* non-critical */ }

    // Step 2 — Confirm booking
    await patchBooking({ status: 'confirmed' })

    const parts = ['🎉 Booking confirmed!']
    if (invoiceNumber) parts.push(`Invoice ${invoiceNumber} generated.`)
    if (emailSent)       parts.push(`Sent to ${booking.customer_email}.`)
    else if (invoiceNumber) parts.push('(No email on file — not sent.)')
    setMsg(parts.join(' '))
    setLoading(false)
  }

  async function confirmBooking() {
    await patchBooking({ status: 'confirmed' })
  }

  function sharePaymentWhatsApp() {
    const phone      = booking.customer_phone.replace(/\D/g, '')
    const e164       = phone.startsWith('91') ? phone : '91' + phone
    const upi        = upiId || 'BAGDROP1717@IOB'
    const upiDeepLink = `upi://pay?pa=${upi}&pn=Bagdrop&am=${amount}&cu=INR&tn=${booking.tracking_id}`
    const qrImgUrl   = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiDeepLink)}`
    const message = [
      `Hi ${booking.customer_name}! 🧳`,
      ``,
      `Your Bagdrop quote for *${booking.from_city} → ${booking.to_city}* is ready for payment.`,
      ``,
      `💰 *Amount Due: ₹${amount.toLocaleString('en-IN')}*`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `💳 *Pay via UPI*`,
      `UPI ID: *${upi}*`,
      `📲 Tap to Pay: ${upiDeepLink}`,
      ``,
      `📷 *Scan QR Code to Pay:*`,
      qrImgUrl,
      `━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `Reference: ${booking.tracking_id}`,
      ``,
      `Once payment is done, reply with a screenshot and we will confirm your booking.`,
      ``,
      `_Bagdrop — Baggage Delivered. Journey Simplified._`,
    ].join('\n')
    window.open(`https://wa.me/${e164}?text=${encodeURIComponent(message)}`, '_blank')
  }

  async function sendPaymentRequestViaWhatsApp() {
    await patchBooking({ status: 'payment_pending' })
    sharePaymentWhatsApp()
  }

  async function sharePaymentEmail() {
    if (!booking.customer_email) { setErr('No email address on this booking.'); return }
    setLoading(true); setErr('')
    try {
      const res = await fetch('/api/admin/bookings/' + booking.id, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ send_payment_email: true }),
      })
      if (res.ok) setMsg(`Payment request emailed to ${booking.customer_email} ✓`)
      else        setErr('Could not send email. Check Resend config.')
    } catch { setErr('Error sending email.') }
    setLoading(false)
  }

  const amount = Number(booking.total_amount)
  const upiLink = `upi://pay?pa=${upiId}&pn=Bagdrop&am=${amount}&cu=INR&tn=${booking.tracking_id}`
  const upiQrUrl = upiId && amount > 0
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiLink)}`
    : null

  return (
    <div className="mt-4 rounded-xl border border-orange-100 bg-white p-4 shadow-sm" onClick={e => e.stopPropagation()}>

      {/* ── ACCEPTED: Build Quote ── */}
      {s === 'accepted' && (
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-orange-400">
            💼 Create &amp; Send Quote
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Base Price (₹)</label>
              <input
                type="number" min={0} placeholder="e.g. 2000"
                value={basePrice} onChange={e => setBasePrice(e.target.value)}
                className="w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
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
            <button onClick={sendQuote} disabled={loading || base <= 0}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-purple-700 disabled:opacity-40 transition-colors">
              <FileText className="h-3.5 w-3.5" />
              {loading ? 'Sending...' : 'Send Quote →'}
            </button>
          </div>
        </div>
      )}

      {/* ── QUOTE SENT: Show amount + Request Payment via WhatsApp ── */}
      {s === 'quote_sent' && (
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-purple-400">
            📄 Quote Sent — Request Payment
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <div className="rounded-xl border border-purple-100 bg-purple-50 px-5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-purple-500">Quote Amount</p>
              <p className="text-2xl font-bold text-purple-900">₹{amount.toLocaleString('en-IN')}</p>
            </div>
            {/* QR preview */}
            {upiQrUrl && (
              <div className="flex flex-col items-center gap-1">
                <img src={upiQrUrl} alt="UPI QR" width={100} height={100}
                  className="rounded-xl border border-purple-100 shadow-sm" />
                <p className="text-[10px] font-mono text-gray-500">{upiId}</p>
              </div>
            )}
            <div className="space-y-2">
              <p className="text-xs text-gray-500">Customer has received the quote. Send payment request with QR code via WhatsApp.</p>
              <button onClick={sendPaymentRequestViaWhatsApp} disabled={loading || !upiId}
                className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-40 transition-colors">
                <span>📲</span>
                {loading ? 'Updating...' : 'Send Payment Request via WhatsApp'}
              </button>
              <button onClick={requestPayment} disabled={loading}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-600 shadow-sm hover:bg-gray-50 disabled:opacity-40 transition-colors">
                <CreditCard className="h-3 w-3" />
                {loading ? '...' : 'Mark as Payment Pending (no WhatsApp)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PAYMENT PENDING: QR Code + Verify ── */}
      {s === 'payment_pending' && (
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-amber-500">
            💳 Awaiting Payment — Share QR with Customer
          </p>
          <div className="flex flex-wrap gap-6">
            {/* QR Code */}
            <div className="flex flex-col items-center gap-2">
              {upiQrUrl ? (
                <>
                  <img src={upiQrUrl} alt="UPI QR Code"
                    className="rounded-xl border-2 border-orange-100 shadow-md"
                    width={180} height={180} />
                  <p className="text-[11px] font-mono font-bold text-gray-600">{upiId}</p>
                  <p className="text-sm font-bold text-gray-800">₹{amount.toLocaleString('en-IN')}</p>
                </>
              ) : (
                <div className="flex h-[180px] w-[180px] items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-center text-xs text-gray-400 p-4">
                  Set UPI ID in<br />Settings → Payment
                </div>
              )}
            </div>
            {/* Payment verification */}
            <div className="flex-1 min-w-[240px] space-y-3">
              {/* UPI details card */}
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 mb-1">Payment Details</p>
                <p className="text-sm font-mono font-bold text-amber-900">{upiId || '(Set UPI in Settings)'}</p>
                <p className="text-lg font-bold text-amber-900">₹{amount.toLocaleString('en-IN')}</p>
                <p className="text-[10px] text-amber-600 mt-0.5">Ref: {booking.tracking_id}</p>
              </div>

              {/* Share buttons */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Send Payment Request To Customer</p>
                <button onClick={sharePaymentWhatsApp} disabled={!upiId}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-40 transition-colors">
                  <span>📲</span> Send Payment Request via WhatsApp
                </button>
                <button onClick={sharePaymentEmail} disabled={loading || !booking.customer_email || !upiId}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40 transition-colors">
                  <span>📧</span> Send via Email
                </button>
                {!booking.customer_email && (
                  <p className="text-[10px] text-gray-400">No email on file — WhatsApp only.</p>
                )}
              </div>

              {/* UTR entry */}
              <div className="space-y-1">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">UTR / Payment Reference No.</label>
                <input type="text" placeholder="12-digit UTR or reference" value={utr}
                  onChange={e => setUtr(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400" />
              </div>

              {/* Verify button */}
              <button onClick={verifyPayment} disabled={loading || !utr.trim()}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-40 transition-colors">
                <CheckCircle className="h-3.5 w-3.5" />
                {loading ? 'Processing...' : 'Mark Payment Received → Auto-Confirm'}
              </button>
              <p className="text-[10px] text-gray-400 text-center">This will generate the invoice, email it to the customer, and confirm the booking automatically.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── PAYMENT APPROVED: Generate Invoice + Confirm ── */}
      {s === 'payment_approved' && (
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-green-500">
            ✅ Payment Received — Generate Invoice &amp; Confirm Booking
          </p>
          <div className="flex flex-wrap items-start gap-4">
            {/* Payment summary card */}
            <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-5 py-3">
              <CheckCircle className="h-6 w-6 text-green-600 shrink-0" />
              <div>
                <p className="text-sm font-bold text-green-800">Payment Received</p>
                <p className="text-xs text-green-600">₹{amount.toLocaleString('en-IN')}</p>
                {booking.payment_reference && (
                  <p className="text-[10px] font-mono text-green-500 mt-0.5">UTR: {booking.payment_reference}</p>
                )}
              </div>
            </div>
            {/* Action card */}
            <div className="flex-1 rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
              <div>
                <p className="text-sm font-bold text-blue-800">Next Step: Generate &amp; Send Invoice</p>
                <p className="text-xs text-blue-600 mt-0.5">
                  This will generate an invoice, email it to the customer{booking.customer_email ? ` (${booking.customer_email})` : ''}, and confirm their booking with Bagdrop.
                </p>
              </div>
              <button onClick={generateInvoiceAndConfirm} disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-40 transition-colors">
                <Receipt className="h-4 w-4" />
                {loading ? 'Processing...' : 'Generate Invoice & Confirm Booking →'}
              </button>
              {!booking.customer_email && (
                <p className="text-[10px] text-blue-400">⚠ No email on file — invoice will be generated but not emailed.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{err}</p>}
      {msg && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-600">{msg}</p>}
    </div>
  )
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
  const [expanded, setExpanded]       = useState<string | null>(null)
  const [editTarget, setEditTarget]   = useState<Booking | null>(null)
  const [crmStats, setCrmStats]       = useState<{
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
    let qs = '?key=' + adminKey
    if (filter !== 'all') {
      qs += '&status=' + filter
    } else if (phaseFilter !== 'all') {
      const phase = WORKFLOW_PHASES.find(p => p.label === phaseFilter)
      if (phase) qs += '&statuses=' + phase.statuses.join(',')
    }
    if (search) qs += '&search=' + encodeURIComponent(search)
    const [sr, br, cr] = await Promise.all([
      fetch('/api/admin/stats?key=' + adminKey),
      fetch('/api/admin/bookings' + qs),
      fetch('/api/admin/crm-stats?key=' + adminKey),
    ])
    if (sr.ok) setStats(await sr.json())
    if (br.ok) setBookings((await br.json()).bookings ?? [])
    if (cr.ok) setCrmStats(await cr.json())
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

        {/* CRM quick links */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total Leads',       value: crmStats?.total_leads ?? '—',      icon: <Users className="h-4 w-4" />,       color: '#2563eb', bg: '#dbeafe', href: '/admin/leads' },
            { label: 'Active Customers',  value: crmStats?.active_customers ?? '—', icon: <UserCheck className="h-4 w-4" />,   color: '#16a34a', bg: '#dcfce7', href: '/admin/customers' },
            { label: 'Pending Quotes',    value: crmStats?.pending_quotes ?? '—',   icon: <FileText className="h-4 w-4" />,    color: '#7c3aed', bg: '#ede9fe', href: '/admin/quotes' },
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

        {/* Search + status filter */}
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
                    {['Tracking', 'Customer', 'Route', 'Service', 'Date', 'Bags', 'Status', 'Change Status'].map(h => (
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
                        <td className="px-4 py-3 text-sm text-gray-600">{b.service_label}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{formatDate(b.pickup_date)}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">{b.total_bags}</td>
                        <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <StatusSelect id={b.id} current={b.status} adminKey={adminKey} onUpdate={fetchData} />
                        </td>
                      </tr>
                      {expanded === b.id && (
                        <tr className="bg-orange-50/40">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="flex flex-wrap items-start gap-4">
                              <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4">
                                <DetailRow icon={<Phone className="h-3.5 w-3.5 text-orange-500" />}       label="Phone"      val={b.customer_phone || 'Not provided'} />
                                <DetailRow icon={<Mail className="h-3.5 w-3.5 text-orange-500" />}        label="Email"      val={b.customer_email || 'Not provided'} />
                                <DetailRow icon={<Clock className="h-3.5 w-3.5 text-orange-500" />}       label="Time Slot"  val={b.time_slot || 'Not specified'} />
                                <DetailRow icon={<Hash className="h-3.5 w-3.5 text-orange-500" />}        label="Booking ID" val={b.id.slice(0, 8) + '...'} />
                                <DetailRow icon={<IndianRupee className="h-3.5 w-3.5 text-orange-500" />} label="Amount"     val={b.total_amount ? 'Rs.' + Number(b.total_amount).toLocaleString('en-IN') : 'Not set'} />
                                {b.pickup_address && <DetailRow icon={<MapPin className="h-3.5 w-3.5 text-orange-500" />}   label="Pickup"   val={b.pickup_address} />}
                                {b.drop_address   && <DetailRow icon={<MapPin className="h-3.5 w-3.5 text-orange-500" />}   label="Drop"     val={b.drop_address} />}
                                {b.notes          && <DetailRow icon={<Calendar className="h-3.5 w-3.5 text-orange-500" />} label="Notes"    val={b.notes} />}
                              </div>
                              <div className="flex shrink-0 flex-col gap-2">
                                <button
                                  onClick={e => { e.stopPropagation(); setEditTarget(b) }}
                                  className="flex items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 py-2 text-xs font-semibold text-orange-600 shadow-sm hover:bg-orange-50 hover:border-orange-400 transition-colors">
                                  <Pencil className="h-3.5 w-3.5" />
                                  {STATUS_CONFIG[b.status]?.locked ? 'View Details' : 'Edit'}
                                </button>
                                {/* Show Generate Invoice only after payment is received */}
                                {(['confirmed','pickup_scheduled','picked_up','in_transit','out_for_delivery','delivered','completed'].includes(b.status) && b.payment_status === 'paid') && (
                                  <GenerateInvoiceButton bookingId={b.id} adminKey={adminKey} />
                                )}
                              </div>
                            </div>
                            {/* Quote & Payment action panel */}
                            <QuotePaymentPanel booking={b} adminKey={adminKey} onUpdate={fetchData} />
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
