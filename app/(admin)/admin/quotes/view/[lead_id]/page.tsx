'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Printer, Download,
  CheckCircle, Clock, AlertCircle, Send,
  Package, Loader2, ChevronRight,
  FileText, Mail, ExternalLink, Truck,
  RotateCcw,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineItem {
  name:        string
  description: string
  quantity:    number
  rate:        number
  tax_pct:     number
  hsn_or_sac:  string
  amount:      number
}

interface Lead {
  id: string
  lead_number: string
  name: string
  phone: string
  email: string | null
  from_city: string | null
  to_city: string | null
  bags_count: number | null
  pickup_date: string | null
  delivery_date: string | null
  pickup_time: string | null
  pickup_address: string | null
  drop_address: string | null
  flight_number: string | null
  pnr: string | null
  flight_time: string | null
  notes: string | null
  // Internal quote fields
  quote_number: string | null
  quote_line_items: LineItem[] | null
  quote_total: number | null
  quote_subtotal: number | null
  quote_tax: number | null
  quote_date: string | null
  quote_expiry_date: string | null
  quote_notes: string | null
  quote_terms: string | null
  quote_subject: string | null
  salesperson_name: string | null
  agent_name: string | null
  // Compat
  zoho_estimate_number: string | null
  booking_id: string | null
  created_at: string
}

interface Booking {
  id: string
  tracking_id: string
  status: string
  payment_status: string | null
  payment_reference: string | null
  total_amount: number | null
  customer_email: string | null
  customer_phone: string | null
  rejection_reason: string | null
  rejection_comment: string | null
}

interface Invoice {
  id:                string
  invoice_number:    string
  booking_id:        string | null
  customer_name:     string
  customer_email:    string | null
  base_amount:       number
  cgst:              number
  sgst:              number
  total_amount:      number
  payment_status:    string
  payment_method:    string | null
  payment_reference: string | null
  invoice_date:      string
  sent_email:        boolean | null
  created_at:        string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  try {
    return new Date(d.includes('T') ? d : d + 'T00:00:00')
      .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch { return d }
}

function fmtDateTime(d: string | null | undefined) {
  if (!d) return '—'
  try {
    const iso = d.includes('T') ? d : d.replace(' ', 'T')
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    })
  } catch { return d }
}

function fmtRs(n: number | null | undefined) {
  if (n == null) return '—'
  return '₹ ' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function toWords(n: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  if (!n || n <= 0) return 'Zero Rupees Only'
  function b100(x: number) { return x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : '') }
  function b1000(x: number) { return x < 100 ? b100(x) : ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + b100(x % 100) : '') }
  const r = Math.floor(n)
  let result = ''
  if (r >= 10000000) result += b1000(Math.floor(r / 10000000)) + ' Crore '
  if (r % 10000000 >= 100000) result += b1000(Math.floor((r % 10000000) / 100000)) + ' Lakh '
  if (r % 100000 >= 1000) result += b1000(Math.floor((r % 100000) / 1000)) + ' Thousand '
  if (r % 1000 >= 100) result += ones[Math.floor((r % 1000) / 100)] + ' Hundred '
  if (r % 100 > 0) result += b100(r % 100) + ' '
  return result.trim() + ' Rupees Only'
}

// ── Booking Workflow ──────────────────────────────────────────────────────────

// Full 17-step sequential workflow — each step only enables when booking is at the correct preceding status
const STATUS_STEPS = [
  { key: 'inquiry',          label: 'New Inquiry' },
  { key: 'quote_created',    label: 'Quote Created' },
  { key: 'quote_sent',       label: 'Quote Sent' },
  { key: 'accepted',         label: 'Quote Accepted' },
  { key: 'payment_pending',  label: 'Payment Requested' },
  { key: 'payment_received', label: 'Payment Received' },
  { key: 'confirmed',        label: 'Booking Confirmed' },
  { key: 'invoice_generated',label: 'Invoice Generated' },
  { key: 'invoice_sent',     label: 'Invoice Sent' },
  { key: 'pickup_scheduled', label: 'Pickup Scheduled' },
  { key: 'picked_up',        label: 'Bags Picked Up' },
  { key: 'in_transit',       label: 'In Transit' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'delivered',        label: 'Delivered' },
  { key: 'trip_created',     label: 'Trip Sheet Created' },
  { key: 'completed',        label: 'Completed' },
]

// Ordered status progression for gating checks
const STATUS_ORDER = [
  'inquiry', 'quote_created', 'quote_sent', 'accepted',
  'payment_pending', 'payment_received', 'payment_approved',
  'confirmed', 'invoice_generated', 'invoice_sent',
  'pickup_scheduled', 'picked_up', 'in_transit',
  'out_for_delivery', 'delivered', 'trip_created', 'completed',
]

const NO_BACK_STATUSES = new Set(['completed', 'cancelled', 'rejected'])

function getPreviousStatus(current: string): string | null {
  const idx = STATUS_ORDER.indexOf(current)
  if (idx <= 0) return null
  return STATUS_ORDER[idx - 1]
}

const STATUS_LABEL: Record<string, string> = {
  quote_created:    'Quote Created',
  quote_sent:       'Quote Sent',
  payment_pending:  'Payment Received',
  payment_approved: 'Payment Approved',
  confirmed:        'Booking Confirmed',
  pickup_scheduled: 'Pickup Scheduled',
  picked_up:        'Picked Up',
  in_transit:       'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered:        'Delivered',
  completed:        'Completed',
  cancelled:        'Cancelled',
  rejected:         'Rejected',
  inquiry:          'Inquiry',
  accepted:         'Accepted',
}

const STATUS_COLOR: Record<string, string> = {
  quote_created:    'bg-blue-100 text-blue-700',
  quote_sent:       'bg-purple-100 text-purple-700',
  payment_pending:  'bg-yellow-100 text-yellow-700',
  payment_approved: 'bg-emerald-100 text-emerald-700',
  confirmed:        'bg-green-100 text-green-700',
  pickup_scheduled: 'bg-teal-100 text-teal-700',
  picked_up:        'bg-cyan-100 text-cyan-700',
  in_transit:       'bg-indigo-100 text-indigo-700',
  delivered:        'bg-green-100 text-green-700',
  completed:        'bg-gray-100 text-gray-700',
  cancelled:        'bg-red-100 text-red-700',
  rejected:         'bg-red-100 text-red-700',
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function QuoteViewPage() {
  const { lead_id } = useParams<{ lead_id: string }>()
  const router = useRouter()

  const [key, setKey]         = useState('')
  const [lead, setLead]       = useState<Lead | null>(null)
  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const [downloading,     setDownloading]     = useState(false)
  const [invoice,         setInvoice]         = useState<Invoice | null>(null)
  const [genInvoice,      setGenInvoice]      = useState(false)
  const [resendingEmail,  setResendingEmail]  = useState(false)

  // Workflow action states
  const [acting, setActing]                     = useState<string | null>(null)
  const [actionSuccess, setActionSuccess]       = useState<string | null>(null)
  const [actionError, setActionError]           = useState<string | null>(null)
  const [paymentRef, setPaymentRef]             = useState('')
  const [showPaymentInput, setShowPaymentInput] = useState(false)
  const [upiId, setUpiId]                       = useState('')
  const [rejectReason, setRejectReason]         = useState('')
  const [rejectComment, setRejectComment]       = useState('')
  const [showRejectForm, setShowRejectForm]     = useState(false)

  // Back button state
  const [backOpen, setBackOpen]     = useState(false)
  const [backReason, setBackReason] = useState('')

  // ── Load data ─────────────────────────────────────────────────────

  const loadAll = useCallback(async (adminKey: string) => {
    setLoading(true)
    setError('')

    // 1. Fetch lead (contains all quote data)
    const lr = await fetch(`/api/admin/leads/${lead_id}?key=${encodeURIComponent(adminKey)}`)
    const ld = await lr.json().catch(() => ({}))
    if (!lr.ok || !ld.lead) { setError('Lead not found'); setLoading(false); return }
    const l: Lead = ld.lead
    setLead(l)

    // 2. Fetch linked booking + invoice in parallel
    if (l.booking_id) {
      Promise.all([
        fetch(`/api/admin/bookings/${l.booking_id}?key=${encodeURIComponent(adminKey)}`).then(r => r.json()),
        fetch(`/api/admin/invoices?booking_id=${l.booking_id}&key=${encodeURIComponent(adminKey)}`).then(r => r.json()),
      ]).then(([bd, id]) => {
        if (bd.booking)    setBooking(bd.booking as Booking)
        if (id.invoices?.[0]) setInvoice(id.invoices[0] as Invoice)
      }).catch(() => {})
    }

    setLoading(false)
  }, [lead_id])

  useEffect(() => {
    const k = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    setKey(k)
    if (!k) { setError('Unauthorized — please log in to admin panel'); setLoading(false); return }
    loadAll(k)
    // Load UPI ID for payment QR
    fetch('/api/admin/settings?key=' + encodeURIComponent(k))
      .then(r => r.json())
      .then(d => { if (d.settings?.payment_upi) setUpiId(d.settings.payment_upi) })
      .catch(() => {})
  }, [loadAll])

  // ── PDF Download ──────────────────────────────────────────────────

  async function downloadPDF() {
    if (!lead || downloading) return
    setDownloading(true)
    try {
      const qn         = lead.quote_number ?? lead.zoho_estimate_number ?? lead.lead_number
      const lineItems  = lead.quote_line_items ?? []
      const subtotal   = lead.quote_subtotal   ?? lineItems.reduce((s, i) => s + i.amount, 0)
      const taxTotal   = lead.quote_tax        ?? Math.round(subtotal * 5) / 100
      const grandTotal = lead.quote_total      ?? (subtotal + taxTotal)

      const { pdf }                        = await import('@react-pdf/renderer')
      const { default: QuotePDF }          = await import('./QuotePDF')

      const blob = await pdf(
        QuotePDF({
          quoteNumber:   qn,
          quoteDate:     lead.quote_date,
          expiryDate:    lead.quote_expiry_date,
          leadNumber:    lead.lead_number,
          salesperson:   lead.salesperson_name,
          agentName:     lead.agent_name,
          customerName:  lead.name,
          customerPhone: lead.phone,
          customerEmail: lead.email,
          fromCity:      lead.from_city,
          toCity:        lead.to_city,
          bagsCount:     lead.bags_count,
          pickupDate:    lead.pickup_date,
          pickupTime:    lead.pickup_time,
          deliveryDate:  lead.delivery_date,
          flightNumber:  lead.flight_number,
          pnr:           lead.pnr,
          pickupAddress: lead.pickup_address,
          dropAddress:   lead.drop_address,
          lineItems,
          subtotal,
          tax:      taxTotal,
          total:    grandTotal,
          notes:    lead.quote_notes ?? lead.notes,
          terms:    lead.quote_terms,
        })
      ).toBlob()

      const url  = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href     = url
      link.download = `${qn}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('PDF generation failed:', e)
      alert('PDF generation failed. Try the Print button instead.')
    } finally {
      setDownloading(false)
    }
  }

  // ── Workflow actions ──────────────────────────────────────────────

  async function patchBooking(actionKey: string, payload: Record<string, unknown>): Promise<boolean> {
    if (!booking || !key) return false
    setActing(actionKey)
    setActionSuccess(null)
    setActionError(null)
    try {
      const r = await fetch(`/api/admin/bookings/${booking.id}?key=${encodeURIComponent(key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok) {
        setBooking(prev => prev ? { ...prev, ...(d.booking ?? payload) } : prev)
        setActionSuccess(actionKey)
        setTimeout(() => setActionSuccess(null), 4000)
        return true
      } else {
        setActionError(d.error ?? 'Action failed')
        return false
      }
    } catch { setActionError('Network error'); return false }
    finally { setActing(null) }
  }

  // ── Invoice generation + email ────────────────────────────────────

  async function generateAndSendInvoice(bookingId: string, sendEmail = true) {
    if (!key) return
    setGenInvoice(true)
    try {
      const r = await fetch('/api/admin/invoices', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
        body: JSON.stringify({ booking_id: bookingId, send_email: sendEmail }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.invoice) setInvoice(d.invoice as Invoice)
    } catch (e) { console.error('[generateAndSendInvoice]', e) }
    finally { setGenInvoice(false) }
  }

  async function resendInvoiceEmail() {
    if (!invoice || !key) return
    setResendingEmail(true)
    try {
      const r = await fetch('/api/admin/invoices', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
        body: JSON.stringify({ booking_id: invoice.booking_id, send_email: true }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.invoice) setInvoice(d.invoice as Invoice)
    } catch {}
    finally { setResendingEmail(false) }
  }

  // ── Step-gated workflow functions ─────────────────────────────────

  // Helper: is booking at or past a given status in the linear sequence?
  function atOrPast(targetStatus: string): boolean {
    if (!booking) return false
    const cur = STATUS_ORDER.indexOf(booking.status)
    const tgt = STATUS_ORDER.indexOf(targetStatus)
    return cur >= tgt
  }

  // Helper: is booking exactly at a status (or one of a list)?
  function atStatus(...statuses: string[]): boolean {
    return statuses.includes(booking?.status ?? '')
  }

  async function doSendQuote() {
    // Resend quote email + advance to quote_sent
    await patchBooking('send_quote', { status: 'quote_sent', send_quote_email: true })
  }

  async function doMarkQuoteAccepted() {
    await patchBooking('accept_quote', { status: 'accepted' })
  }

  async function doMarkQuoteRejected() {
    if (!rejectReason) { setActionError('Select a rejection reason'); return }
    const ok = await patchBooking('reject_quote', {
      status: 'rejected',
      rejection_reason: rejectReason,
      rejection_comment: rejectComment.trim() || null,
    })
    if (ok) setShowRejectForm(false)
  }

  async function doSendPaymentRequest() {
    const ok = await patchBooking('send_payment', {
      status: 'payment_pending',
      send_payment_email: !!booking?.customer_email,
    })
    if (ok && booking) {
      // Open WhatsApp with payment link
      const amt = Number(booking.total_amount ?? 0)
      const upi = upiId || 'BAGDROP1717@IOB'
      const phone = (booking.customer_phone ?? '').replace(/\D/g, '')
      const e164 = phone.startsWith('91') ? phone : '91' + phone
      const upiLink = `upi://pay?pa=${upi}&pn=Bagdrop&am=${amt}&cu=INR&tn=${booking.tracking_id}`
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiLink)}`
      const msg = [
        `Hi! 🧳 Your Bagdrop quote is ready for payment.`,
        `💰 *Amount Due: ₹${amt.toLocaleString('en-IN')}*`,
        `UPI ID: *${upi}*`,
        `📲 Pay: ${upiLink}`,
        `QR: ${qrUrl}`,
        `Ref: ${booking.tracking_id}`,
        `Reply with screenshot once paid. — Bagdrop`,
      ].join('\n')
      window.open(`https://wa.me/${e164}?text=${encodeURIComponent(msg)}`, '_blank')
    }
  }

  async function doMarkPaymentReceived() {
    const ok = await patchBooking('mark_payment', {
      status: 'payment_received',
      payment_status: 'paid',
      ...(paymentRef ? { payment_reference: paymentRef } : {}),
    })
    setShowPaymentInput(false)
    setPaymentRef('')
    if (ok && booking?.id) await generateAndSendInvoice(booking.id, !!booking.customer_email)
  }

  async function doAdminApprove() {
    const ok = await patchBooking('admin_approve', {
      status: 'payment_approved',
      approved_without_payment: true,
    })
    if (ok && booking?.id && !invoice) await generateAndSendInvoice(booking.id, !!booking?.customer_email)
  }

  async function doConfirmBooking() {
    // Generate invoice first if not already done, then confirm
    if (!invoice && booking?.id) await generateAndSendInvoice(booking.id, false)
    await patchBooking('confirm', { status: 'confirmed' })
  }

  async function doGenerateInvoice() {
    if (!booking?.id) return
    await generateAndSendInvoice(booking.id, false)
    await patchBooking('gen_invoice', { status: 'invoice_generated' })
  }

  async function doSendInvoice() {
    setResendingEmail(true)
    try {
      if (booking?.id) {
        // If invoice already exists, just resend the email — don't regenerate
        if (invoice) {
          const r = await fetch('/api/admin/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
            body: JSON.stringify({ booking_id: booking.id, send_email: true }),
          })
          const d = await r.json().catch(() => ({}))
          if (r.ok && d.invoice) setInvoice(d.invoice as Invoice)
        } else {
          // No invoice yet — generate + send
          await generateAndSendInvoice(booking.id, true)
        }
      }
    } finally { setResendingEmail(false) }
    await patchBooking('send_invoice', { status: 'invoice_sent' })
  }

  async function doSchedulePickup()    { await patchBooking('schedule_pickup',    { status: 'pickup_scheduled' }) }
  async function doMarkPickedUp()      { await patchBooking('mark_picked_up',     { status: 'picked_up' }) }
  async function doMarkInTransit()     { await patchBooking('mark_in_transit',    { status: 'in_transit' }) }
  async function doMarkOutForDelivery(){ await patchBooking('mark_out_delivery',  { status: 'out_for_delivery' }) }
  async function doMarkDelivered()     { await patchBooking('mark_delivered',     { status: 'delivered' }) }
  async function doMarkCompleted()     { await patchBooking('mark_completed',     { status: 'completed' }) }

  async function doMoveBack() {
    if (!booking) return
    const prev = getPreviousStatus(booking.status)
    if (!prev) return
    const ok = await patchBooking('move_back', {
      status: prev,
      reason: backReason.trim() || 'Status reverted by admin',
    })
    if (ok) { setBackOpen(false); setBackReason('') }
  }

  // ── Render ────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-7 w-7 animate-spin text-orange-400" />
    </div>
  )

  if (error || !lead) return (
    <div className="flex h-screen flex-col items-center justify-center gap-3">
      <AlertCircle className="h-8 w-8 text-red-400" />
      <p className="text-sm text-gray-600">{error || 'Lead not found'}</p>
      <button onClick={() => router.push('/admin/leads')} className="text-sm text-orange-500 underline">← Back to Leads</button>
    </div>
  )

  // Use internal stored data
  const quoteNumber = lead.quote_number ?? lead.zoho_estimate_number ?? lead.lead_number
  const lineItems   = lead.quote_line_items ?? []
  const subtotal    = lead.quote_subtotal   ?? lineItems.reduce((s, i) => s + i.amount, 0)
  const taxTotal    = lead.quote_tax        ?? Math.round(subtotal * 5) / 100
  const grandTotal  = lead.quote_total      ?? (subtotal + taxTotal)
  const quoteDate   = lead.quote_date       ?? lead.created_at

  // Back button computed values
  const prevStatus = booking ? getPreviousStatus(booking.status) : null
  const canGoBack  = !!(prevStatus && booking && !NO_BACK_STATUSES.has(booking.status))
  const prevLabel  = prevStatus ? (STATUS_LABEL[prevStatus] ?? prevStatus) : ''
  const curLabel   = booking ? (STATUS_LABEL[booking.status] ?? booking.status) : ''

  return (
    <>
      {/* ── Back confirmation modal ── */}
      {backOpen && prevStatus && booking && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => { setBackOpen(false); setBackReason('') }} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-bold text-gray-800">Move Back to Previous Step?</h3>
              </div>
              <p className="mt-1 text-xs text-gray-500">This will revert the booking status and log the change.</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2.5">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_COLOR[booking.status] ?? 'bg-gray-100 text-gray-600'}`}>{curLabel}</span>
                <span className="text-xs text-gray-400">→</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_COLOR[prevStatus] ?? 'bg-gray-100 text-gray-600'}`}>{prevLabel}</span>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">Reason (optional)</label>
                <input
                  type="text"
                  autoFocus
                  value={backReason}
                  onChange={e => setBackReason(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doMoveBack()}
                  placeholder="e.g. Customer requested change"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
              </div>
              {actionError && acting === null && (
                <p className="text-xs text-red-600 font-medium">{actionError}</p>
              )}
            </div>
            <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
              <button
                onClick={doMoveBack}
                disabled={!!acting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-40"
              >
                {acting === 'move_back' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                {acting === 'move_back' ? 'Reverting…' : 'Confirm Revert'}
              </button>
              <button
                onClick={() => { setBackOpen(false); setBackReason('') }}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Print-only styles ── */}
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-page { box-shadow: none !important; margin: 0 !important; }
        }
      `}</style>

      {/* ── Top bar (no-print) ── */}
      <div className="no-print sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/admin/leads')}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
            <ArrowLeft className="h-4 w-4" /> Leads
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
          <span className="text-sm font-semibold text-gray-800">{quoteNumber}</span>
          {booking?.status && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[booking.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {STATUS_LABEL[booking.status] ?? booking.status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
          <button onClick={downloadPDF} disabled={downloading}
            className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-60">
            {downloading
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
              : <><Download className="h-3.5 w-3.5" /> Download PDF</>
            }
          </button>
        </div>
      </div>

      <div className="min-h-screen bg-gray-100 pb-12 pt-6">

        {/* ═══════════════════════════════════════════════════════════
            PRINTABLE QUOTE DOCUMENT
        ════════════════════════════════════════════════════════════ */}
        <div className="print-page mx-auto max-w-3xl overflow-hidden rounded-lg bg-white shadow-lg">

          {/* Orange header */}
          <div style={{ background: '#f97316', padding: '28px 36px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1 }}>BAGDROP</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.8)', marginTop: '3px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                India&apos;s Digital Baggage Infrastructure
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.75)', letterSpacing: '2px', textTransform: 'uppercase' }}>
                Service Estimate
              </div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#fff', marginTop: '2px' }}>
                {quoteNumber}
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)', marginTop: '3px' }}>
                Date: {fmtDate(quoteDate)}
                {lead.quote_expiry_date ? ` · Valid till: ${fmtDate(lead.quote_expiry_date)}` : ''}
              </div>
            </div>
          </div>

          {/* Meta strip */}
          <div style={{ background: '#fff7ed', borderBottom: '1px solid #fed7aa', padding: '10px 36px', display: 'flex', gap: '28px', flexWrap: 'wrap', fontSize: '11px' }}>
            {[
              { label: 'GSTIN',    value: '24BDMPS7461P1ZM' },
              { label: 'SAC Code', value: '996511' },
              { label: 'Lead #',   value: lead.lead_number },
              ...(lead.salesperson_name ? [{ label: 'Salesperson', value: lead.salesperson_name }] : []),
              ...(lead.agent_name       ? [{ label: 'Agent',       value: lead.agent_name       }] : []),
            ].map(f => (
              <div key={f.label}>
                <div style={{ fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', letterSpacing: '0.8px', fontSize: '9px' }}>{f.label}</div>
                <div style={{ fontWeight: 600, color: '#111', marginTop: '2px' }}>{f.value}</div>
              </div>
            ))}
          </div>

          {/* Customer + Journey */}
          <div style={{ padding: '24px 36px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

            <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '14px 16px', borderLeft: '3px solid #f97316' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#9ca3af', marginBottom: '8px' }}>Bill To</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#111' }}>{lead.name}</div>
              <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '3px' }}>{lead.phone}</div>
              {lead.email && <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{lead.email}</div>}
            </div>

            <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '14px 16px', borderLeft: '3px solid #111' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#9ca3af', marginBottom: '8px' }}>Journey Details</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '9px', color: '#9ca3af', textTransform: 'uppercase' }}>From</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#111', textTransform: 'uppercase' }}>{lead.from_city ?? '—'}</div>
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ flex: 1, height: '1px', background: '#d1d5db' }} />
                  <span style={{ fontSize: '18px' }}>✈</span>
                  <div style={{ flex: 1, height: '1px', background: '#d1d5db' }} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '9px', color: '#9ca3af', textTransform: 'uppercase' }}>To</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#111', textTransform: 'uppercase' }}>{lead.to_city ?? '—'}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', fontSize: '11px', color: '#4b5563' }}>
                <div><span style={{ color: '#9ca3af' }}>Pickup: </span><strong>{fmtDate(lead.pickup_date)}</strong></div>
                {lead.pickup_time && <div><span style={{ color: '#9ca3af' }}>Time: </span><strong>{lead.pickup_time}</strong></div>}
                <div><span style={{ color: '#9ca3af' }}>Delivery: </span><strong>{fmtDate(lead.delivery_date)}</strong></div>
                <div><span style={{ color: '#9ca3af' }}>Bags: </span><strong>{lead.bags_count ?? '—'}</strong></div>
                {lead.flight_number && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ color: '#9ca3af' }}>Flight: </span>
                    <strong>{lead.flight_number}{lead.pnr ? ` / ${lead.pnr}` : ''}</strong>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Addresses */}
          {(lead.pickup_address || lead.drop_address) && (
            <div style={{ padding: '12px 36px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '11px' }}>
              {lead.pickup_address && (
                <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', color: '#9ca3af', marginBottom: '4px' }}>Pickup Address</div>
                  <div style={{ color: '#374151' }}>{lead.pickup_address}</div>
                </div>
              )}
              {lead.drop_address && (
                <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', color: '#9ca3af', marginBottom: '4px' }}>Delivery Address</div>
                  <div style={{ color: '#374151' }}>{lead.drop_address}</div>
                </div>
              )}
            </div>
          )}

          {/* Line Items Table */}
          <div style={{ padding: '20px 36px 0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#111827', color: '#fff' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, borderRadius: '6px 0 0 0' }}>#</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700 }}>Description</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>Qty</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>Rate</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>Tax</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, borderRadius: '0 6px 0 0' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.length > 0 ? lineItems.map((li, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 14px', color: '#9ca3af' }}>{idx + 1}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 700, color: '#111' }}>{li.name}</div>
                      {li.description && <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{li.description}</div>}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', color: '#374151' }}>{li.quantity}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: '#374151' }}>{fmtRs(li.rate)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', color: '#6b7280', fontSize: '11px' }}>
                      GST {li.tax_pct ?? 5}%
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#111' }}>{fmtRs(li.amount)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6} style={{ padding: '20px 14px', textAlign: 'center', color: '#9ca3af', fontSize: '12px' }}>
                      No line items — generate a quote first.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals + Payment */}
          <div style={{ padding: '16px 36px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>

            {/* Payment details */}
            <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '14px 16px' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#9ca3af', marginBottom: '8px' }}>Payment Details</div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, fontSize: '11px', color: '#374151', lineHeight: '1.8' }}>
                  <div><span style={{ color: '#9ca3af' }}>Bank: </span>Indian Overseas Bank</div>
                  <div><span style={{ color: '#9ca3af' }}>A/C No: </span><strong>171702000001297</strong></div>
                  <div><span style={{ color: '#9ca3af' }}>IFSC: </span>IOBA0001717 · Gotri Road Branch</div>
                  <div style={{ marginTop: '6px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '6px', padding: '6px 10px' }}>
                    <span style={{ color: '#9a3412', fontWeight: 700 }}>UPI: </span>
                    <strong style={{ color: '#111' }}>BAGDROP1717@IOB</strong>
                  </div>
                </div>
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=upi%3A%2F%2Fpay%3Fpa%3DBAGDROP1717%40IOB%26pn%3DBagdrop%26cu%3DINR"
                    alt="UPI QR"
                    style={{ width: '76px', height: '76px', display: 'block', borderRadius: '4px', border: '1px solid #e5e7eb' }}
                  />
                  <div style={{ fontSize: '8px', color: '#9ca3af', marginTop: '3px' }}>Scan to Pay</div>
                </div>
              </div>
            </div>

            {/* Totals */}
            <div>
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>
                  <span>Sub Total</span><span>{fmtRs(subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>
                  <span>CGST @ 2.5%</span><span>{fmtRs(taxTotal / 2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                  <span>SGST @ 2.5%</span><span>{fmtRs(taxTotal / 2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #111', paddingTop: '10px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#111' }}>Total Amount</span>
                  <span style={{ fontSize: '18px', fontWeight: 900, color: '#f97316' }}>{fmtRs(grandTotal)}</span>
                </div>
              </div>
              {grandTotal > 0 && (
                <div style={{ marginTop: '10px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '8px 12px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '3px' }}>Amount in Words</div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#111', fontStyle: 'italic' }}>{toWords(grandTotal)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          {(lead.quote_notes ?? lead.notes) && (
            <div style={{ margin: '0 36px 16px', background: '#f9fafb', borderRadius: '8px', padding: '12px 14px', borderLeft: '3px solid #f97316' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#9ca3af', marginBottom: '4px' }}>Notes</div>
              <div style={{ fontSize: '12px', color: '#374151' }}>{lead.quote_notes ?? lead.notes}</div>
            </div>
          )}

          {/* Terms */}
          <div style={{ margin: '0 36px', borderTop: '1px solid #f3f4f6', paddingTop: '14px', paddingBottom: '20px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#374151', marginBottom: '8px' }}>Terms &amp; Conditions</div>
            {lead.quote_terms ? (
              <div style={{ fontSize: '10px', color: '#6b7280', lineHeight: '1.6' }}>{lead.quote_terms}</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px', fontSize: '10px', color: '#6b7280', lineHeight: '1.5' }}>
                {[
                  'All bookings confirmed on receipt of full payment. A CN number will be issued for reference.',
                  'Only services mentioned above are included. Company reserves the right to cancel at any point.',
                  'Luggage must not contain items prohibited by law. All bags processed through Govt screening.',
                  'Cancellation (Mumbai): ≥5 days for full refund. All other destinations: ≥7 days.',
                  'Bagdrop is not liable for loss/damage during transit. Carry essential documents personally.',
                  'Rates subject to change without prior notice and subject to availability at time of booking.',
                ].map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: '5px' }}>
                    <span style={{ color: '#f97316', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ margin: '0 36px', borderTop: '1px solid #f3f4f6', padding: '14px 0 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ fontSize: '10px', color: '#9ca3af', lineHeight: '1.6' }}>
              <div style={{ fontWeight: 700, color: '#374151', fontSize: '11px', marginBottom: '2px' }}>BAGDROP LOGISTICS SOLUTIONS PVT. LTD.</div>
              <div>TF-302, Ananta Stallion, Gotri Sevasi Road, Vadodara – 391101</div>
              <div>GSTIN: 24BDMPS7461P1ZM · CIN: U63090GJ2023PTC142601</div>
              <div>📞 63 5711 5711 · ✉ info@bagdrop.co · 🌐 bagdrop.co</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '140px', borderTop: '1px solid #374151', paddingTop: '6px', fontSize: '10px', color: '#374151', fontWeight: 600 }}>
                Authorized Signatory
              </div>
              <div style={{ fontSize: '9px', color: '#9ca3af', marginTop: '2px' }}>
                For Bagdrop Logistics Solutions Pvt. Ltd.
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            WORKFLOW PANEL (no-print)
        ════════════════════════════════════════════════════════════ */}
        {booking && (
          <div className="no-print mx-auto mt-6 max-w-3xl">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">

              {/* Header */}
              <div className="border-b border-gray-100 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-gray-800">Booking Workflow</h2>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {booking.tracking_id} · {booking.customer_email ?? lead.email ?? lead.phone}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {canGoBack && (
                      <button
                        onClick={() => setBackOpen(true)}
                        className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Previous Step
                      </button>
                    )}
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_COLOR[booking.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABEL[booking.status] ?? booking.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Horizontal progress strip */}
              <div className="overflow-x-auto px-6 py-4">
                <div className="flex min-w-max items-center">
                  {STATUS_STEPS.map((step, idx) => {
                    const done    = atOrPast(step.key) && booking.status !== step.key
                    const current = booking.status === step.key
                    return (
                      <div key={step.key} className="flex items-center">
                        <div className="flex flex-col items-center" style={{ minWidth: 56 }}>
                          <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                            done    ? 'bg-green-500 text-white' :
                            current ? 'bg-orange-500 text-white ring-2 ring-orange-200' :
                                      'bg-gray-100 text-gray-400'
                          }`}>
                            {done ? '✓' : idx + 1}
                          </div>
                          <span className={`mt-1 text-center text-[8px] leading-tight ${
                            done ? 'text-green-600 font-semibold' :
                            current ? 'text-orange-600 font-bold' :
                            'text-gray-400'
                          }`} style={{ maxWidth: 52 }}>
                            {step.label}
                          </span>
                        </div>
                        {idx < STATUS_STEPS.length - 1 && (
                          <div className={`h-0.5 w-6 shrink-0 mb-4 ${atOrPast(STATUS_STEPS[idx + 1].key) ? 'bg-green-400' : 'bg-gray-200'}`} />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ── Action Cards — one per step, gated by sequence ── */}
              <div className="border-t border-gray-100 px-6 pb-6 pt-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Next Action</p>

                {/* Error / success messages */}
                {actionError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
                    {actionError}
                    <button onClick={() => setActionError(null)} className="ml-3 text-red-400 hover:text-red-600">✕</button>
                  </div>
                )}

                {/* ── Step 3: Send Quote ── */}
                {atStatus('quote_created', 'inquiry') && (
                  <div className="rounded-xl border border-purple-100 bg-purple-50 p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-purple-600">📄 Step 3 — Send Quote to Customer</p>
                    <p className="text-sm text-purple-700">
                      The quote has been created. Send it to the customer via email, or mark as already sent if you emailed it from the quote form.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={doSendQuote} disabled={!!acting}
                        className="flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-40 transition-colors">
                        {acting === 'send_quote' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {acting === 'send_quote' ? 'Sending...' : 'Send Quote Email →'}
                      </button>
                      {/* Quick bypass if email was already sent from the quote generation form */}
                      <button
                        onClick={() => patchBooking('send_quote', { status: 'quote_sent' })}
                        disabled={!!acting}
                        className="flex items-center gap-2 rounded-lg border border-purple-200 bg-white px-4 py-2.5 text-sm font-semibold text-purple-700 hover:bg-purple-50 disabled:opacity-40 transition-colors">
                        ✓ Already Sent — Mark as Sent
                      </button>
                    </div>
                    {actionSuccess === 'send_quote' && <p className="text-xs text-green-600 font-semibold">✅ Quote sent! Status updated to Quote Sent.</p>}
                  </div>
                )}

                {/* ── Step 4: Quote Response ── */}
                {atStatus('quote_sent') && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-blue-600">📬 Step 4 — Record Customer Response</p>
                    <p className="text-sm text-blue-700">Quote has been sent. Record whether the customer accepted or rejected it.</p>
                    {!showRejectForm ? (
                      <div className="flex flex-wrap gap-2">
                        <button onClick={doMarkQuoteAccepted} disabled={!!acting}
                          className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40 transition-colors">
                          {acting === 'accept_quote' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                          Quote Accepted ✓
                        </button>
                        <button onClick={() => setShowRejectForm(true)} disabled={!!acting}
                          className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-40 transition-colors">
                          Quote Rejected ✕
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-red-100 bg-red-50 p-4 space-y-3">
                        <p className="text-xs font-bold text-red-500">Record Rejection Reason</p>
                        <select value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400">
                          <option value="">Select reason…</option>
                          {['Price too high','Chose another provider','Trust issue','Service not required','Timeline not suitable','Changed travel plans','No response from customer','Other'].map(r => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                        <textarea rows={2} value={rejectComment} onChange={e => setRejectComment(e.target.value)}
                          placeholder="Optional comment…"
                          className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400" />
                        <div className="flex gap-2">
                          <button onClick={doMarkQuoteRejected} disabled={!!acting || !rejectReason}
                            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40">
                            {acting === 'reject_quote' ? '…' : 'Confirm Rejection'}
                          </button>
                          <button onClick={() => setShowRejectForm(false)}
                            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    {actionSuccess === 'accept_quote' && <p className="text-xs text-green-600 font-semibold">✅ Quote accepted. Status updated.</p>}
                    {actionSuccess === 'reject_quote' && <p className="text-xs text-red-600 font-semibold">✕ Quote rejected and recorded.</p>}
                  </div>
                )}

                {/* ── Step 5: Send Payment Request ── */}
                {atStatus('accepted') && (() => {
                  const amt = Number(booking.total_amount ?? 0)
                  const upi = upiId || 'BAGDROP1717@IOB'
                  const upiLink = amt > 0 ? `upi://pay?pa=${upi}&pn=Bagdrop&am=${amt}&cu=INR&tn=${booking.tracking_id}` : ''
                  const qrUrl = upiLink ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(upiLink)}` : null
                  return (
                    <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 space-y-3">
                      <p className="text-xs font-bold uppercase tracking-widest text-amber-600">💳 Step 5 — Send Payment Request</p>
                      <div className="flex flex-wrap gap-4">
                        {qrUrl && (
                          <div className="flex flex-col items-center gap-1 shrink-0">
                            <img src={qrUrl} alt="UPI QR" width={100} height={100} className="rounded-xl border border-amber-200" />
                            <p className="text-[10px] font-mono text-gray-500">{upi}</p>
                            <p className="text-sm font-bold text-gray-800">₹{amt.toLocaleString('en-IN')}</p>
                          </div>
                        )}
                        <div className="flex-1 space-y-2 min-w-[200px]">
                          <button onClick={doSendPaymentRequest} disabled={!!acting}
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40 transition-colors">
                            {acting === 'send_payment' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            {acting === 'send_payment' ? 'Sending...' : 'Send Payment Request via WhatsApp →'}
                          </button>
                          <p className="text-[10px] text-amber-600">Updates status to Payment Requested + opens WhatsApp with UPI link.</p>
                        </div>
                      </div>
                      {actionSuccess === 'send_payment' && <p className="text-xs text-green-600 font-semibold">✅ Payment request sent. Status: Payment Requested.</p>}
                    </div>
                  )
                })()}

                {/* ── Step 6: Mark Payment Received (or Admin Approve) ── */}
                {atStatus('payment_pending') && (
                  <div className="rounded-xl border border-yellow-100 bg-yellow-50 p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-yellow-600">💰 Step 6 — Confirm Payment Received</p>
                    <p className="text-sm text-yellow-700">Awaiting customer payment. Once received, enter UTR and confirm.</p>
                    {showPaymentInput ? (
                      <div className="space-y-2">
                        <input type="text" placeholder="UTR / Payment Reference (optional)"
                          value={paymentRef} onChange={e => setPaymentRef(e.target.value)}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-400" />
                        <div className="flex gap-2">
                          <button onClick={doMarkPaymentReceived} disabled={!!acting}
                            className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40">
                            {acting === 'mark_payment' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                            {acting === 'mark_payment' ? 'Processing...' : 'Confirm Payment Received ✓'}
                          </button>
                          <button onClick={() => setShowPaymentInput(false)}
                            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => setShowPaymentInput(true)} disabled={!!acting}
                          className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40 transition-colors">
                          <CheckCircle className="h-4 w-4" /> Mark Payment Received →
                        </button>
                        <button onClick={doAdminApprove} disabled={!!acting}
                          className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-100 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-200 disabled:opacity-40 transition-colors">
                          {acting === 'admin_approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : '🏦'}
                          Admin Approve — Pay Later (VIP / Credit)
                        </button>
                      </div>
                    )}
                    {actionSuccess === 'mark_payment' && <p className="text-xs text-green-600 font-semibold">✅ Payment confirmed. Invoice auto-generated and emailed.</p>}
                    {actionSuccess === 'admin_approve' && <p className="text-xs text-amber-700 font-semibold">🏦 Admin approved (pay later). Invoice generated.</p>}
                  </div>
                )}

                {/* ── Step 7: Confirm Booking ── (after payment_received or payment_approved) */}
                {(atStatus('payment_received', 'payment_approved') && !atOrPast('confirmed')) && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
                      {booking.status === 'payment_approved' ? '🏦 Admin Approved' : '✅ Payment Received'} — Step 7: Confirm Booking
                    </p>
                    <p className="text-sm text-blue-700">Generate invoice and confirm the booking to proceed to operations.</p>
                    <button onClick={doConfirmBooking} disabled={!!acting || genInvoice}
                      className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
                      {(acting === 'confirm' || genInvoice) ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      {(acting === 'confirm' || genInvoice) ? 'Processing...' : 'Generate Invoice & Confirm Booking →'}
                    </button>
                    {actionSuccess === 'confirm' && <p className="text-xs text-green-600 font-semibold">🎉 Booking confirmed! Invoice generated.</p>}
                  </div>
                )}

                {/* ── Step 8: Generate Invoice (only if invoice not yet created) ── */}
                {atStatus('confirmed') && !invoice && (
                  <div className="rounded-xl border border-violet-100 bg-violet-50 p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-violet-600">🧾 Step 8 — Generate Invoice</p>
                    <button onClick={doGenerateInvoice} disabled={!!acting || genInvoice}
                      className="flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-40 transition-colors">
                      {(acting === 'gen_invoice' || genInvoice) ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      {(acting === 'gen_invoice' || genInvoice) ? 'Generating...' : 'Generate Invoice →'}
                    </button>
                  </div>
                )}

                {/* ── Step 9: Send Invoice
                     Shows when:
                     (a) status = invoice_generated (normal flow), OR
                     (b) status = confirmed AND invoice already exists
                         (invoice was auto-generated during payment confirm — status never advanced to invoice_generated)
                ── */}
                {(atStatus('invoice_generated') || (atStatus('confirmed') && !!invoice)) && (
                  <div className="rounded-xl border border-violet-100 bg-violet-50 p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-violet-600">📧 Step 9 — Send Invoice to Customer</p>
                    <p className="text-sm text-violet-700">
                      Invoice {invoice?.invoice_number ?? ''} is ready. Send it to the customer to proceed to operations.
                    </p>
                    <button onClick={doSendInvoice} disabled={!!acting || resendingEmail}
                      className="flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-40 transition-colors">
                      {(acting === 'send_invoice' || resendingEmail) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      {(acting === 'send_invoice' || resendingEmail) ? 'Sending...' : 'Send Invoice to Customer →'}
                    </button>
                    {actionSuccess === 'send_invoice' && <p className="text-xs text-green-600 font-semibold">✅ Invoice sent. Status updated to Invoice Sent.</p>}
                  </div>
                )}

                {/* ── Step 10: Schedule Pickup ── */}
                {atStatus('invoice_sent') && (
                  <div className="rounded-xl border border-orange-100 bg-orange-50 p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-orange-600">📅 Step 10 — Schedule Pickup</p>
                    <p className="text-sm text-orange-700">Invoice sent. Coordinate with customer to schedule bag pickup.</p>
                    <button onClick={doSchedulePickup} disabled={!!acting}
                      className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40 transition-colors">
                      {acting === 'schedule_pickup' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
                      {acting === 'schedule_pickup' ? 'Updating...' : 'Mark Pickup Scheduled →'}
                    </button>
                    {actionSuccess === 'schedule_pickup' && <p className="text-xs text-green-600 font-semibold">✅ Pickup scheduled.</p>}
                  </div>
                )}

                {/* ── Step 11: Bags Picked Up ── */}
                {atStatus('pickup_scheduled') && (
                  <div className="rounded-xl border border-violet-100 bg-violet-50 p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-violet-600">📦 Step 11 — Bags Picked Up</p>
                    <p className="text-sm text-violet-700">Pickup scheduled. Confirm once your team collects the bags.</p>
                    <button onClick={doMarkPickedUp} disabled={!!acting}
                      className="flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-40 transition-colors">
                      {acting === 'mark_picked_up' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                      {acting === 'mark_picked_up' ? 'Updating...' : 'Mark Bags Picked Up →'}
                    </button>
                    {actionSuccess === 'mark_picked_up' && <p className="text-xs text-green-600 font-semibold">✅ Bags picked up.</p>}
                  </div>
                )}

                {/* ── Step 12: In Transit ── */}
                {atStatus('picked_up') && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-blue-600">🚛 Step 12 — In Transit</p>
                    <p className="text-sm text-blue-700">Bags collected. Mark in transit once shipment is on the way.</p>
                    <button onClick={doMarkInTransit} disabled={!!acting}
                      className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
                      {acting === 'mark_in_transit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                      {acting === 'mark_in_transit' ? 'Updating...' : 'Mark In Transit →'}
                    </button>
                    {actionSuccess === 'mark_in_transit' && <p className="text-xs text-green-600 font-semibold">✅ In transit.</p>}
                  </div>
                )}

                {/* ── Step 13: Out for Delivery ── */}
                {atStatus('in_transit') && (
                  <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-cyan-600">🛵 Step 13 — Out for Delivery</p>
                    <p className="text-sm text-cyan-700">Shipment in transit. Mark out for delivery when agent is on the way.</p>
                    <button onClick={doMarkOutForDelivery} disabled={!!acting}
                      className="flex items-center gap-2 rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-40 transition-colors">
                      {acting === 'mark_out_delivery' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                      {acting === 'mark_out_delivery' ? 'Updating...' : 'Mark Out for Delivery →'}
                    </button>
                    {actionSuccess === 'mark_out_delivery' && <p className="text-xs text-green-600 font-semibold">✅ Out for delivery.</p>}
                  </div>
                )}

                {/* ── Step 14: Delivered ── */}
                {atStatus('out_for_delivery') && (
                  <div className="rounded-xl border border-green-100 bg-green-50 p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-green-600">✅ Step 14 — Mark Delivered</p>
                    <p className="text-sm text-green-700">Delivery agent on the way. Mark delivered once bags reach the customer.</p>
                    <button onClick={doMarkDelivered} disabled={!!acting}
                      className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40 transition-colors">
                      {acting === 'mark_delivered' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      {acting === 'mark_delivered' ? 'Updating...' : 'Mark Delivered ✓'}
                    </button>
                    {actionSuccess === 'mark_delivered' && <p className="text-xs text-green-600 font-semibold">🎉 Delivered!</p>}
                  </div>
                )}

                {/* ── Step 15: Create Trip Sheet ── */}
                {atStatus('delivered') && (
                  <div className="rounded-xl border border-orange-100 bg-orange-50 p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-orange-600">📋 Step 15 — Create Trip Sheet</p>
                    <p className="text-sm text-orange-700">Bags delivered. Log delivery expenses in a trip sheet.</p>
                    <a href="/admin/trip-sheets/new"
                      className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 transition-colors">
                      <Truck className="h-4 w-4" /> Create Trip Sheet →
                    </a>
                  </div>
                )}

                {/* ── Step 16: Mark Completed ── */}
                {atStatus('trip_created', 'delivered') && (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-500">🏁 Step 16 — Close Booking</p>
                    <p className="text-sm text-gray-600">Trip sheet created. Mark booking as completed to close it.</p>
                    <button onClick={doMarkCompleted} disabled={!!acting}
                      className="flex items-center gap-2 rounded-lg bg-gray-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-40 transition-colors">
                      {acting === 'mark_completed' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      {acting === 'mark_completed' ? 'Closing...' : 'Mark Completed ✓'}
                    </button>
                    {actionSuccess === 'mark_completed' && <p className="text-xs text-green-600 font-semibold">✅ Booking completed and closed.</p>}
                  </div>
                )}

                {/* ── All done ── */}
                {booking.status === 'completed' && (
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
                    <p className="text-base font-bold text-green-700">🎉 Booking Completed</p>
                    <p className="mt-1 text-sm text-green-600">This booking has been successfully completed and closed.</p>
                  </div>
                )}

                {/* ── Rejected / Closed ── */}
                {atStatus('rejected', 'closed') && (
                  <div className="rounded-xl border border-red-100 bg-red-50 p-4">
                    <p className="text-sm font-bold text-red-600">
                      {booking.status === 'rejected' ? '✕ Quote Rejected' : 'Inquiry Closed'}
                    </p>
                    {booking.rejection_reason && (
                      <p className="mt-1 text-sm text-red-700"><span className="font-semibold">Reason: </span>{booking.rejection_reason}</p>
                    )}
                    {booking.rejection_comment && (
                      <p className="text-sm text-red-600"><span className="font-semibold">Comment: </span>{booking.rejection_comment}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Quick info footer */}
              <div className="border-t border-gray-100 bg-gray-50 px-6 py-3">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
                  <span><Clock className="mr-1 inline h-3 w-3" />Created {fmtDateTime(lead.created_at)}</span>
                  {booking.total_amount && <span>Total: <strong className="text-orange-600">{fmtRs(booking.total_amount)}</strong></span>}
                  {booking.payment_status && <span>Payment: <strong className="text-gray-700">{booking.payment_status}</strong></span>}
                  {booking.payment_reference && <span>Ref: <strong className="font-mono text-gray-700">{booking.payment_reference}</strong></span>}
                  <span>Booking: <strong className="font-mono text-gray-700">{booking.tracking_id}</strong></span>
                </div>
              </div>
            </div>

            {/* ── Invoice Card ── */}
            {(invoice || genInvoice) && (
              <div className="no-print mx-auto mt-4 max-w-3xl overflow-hidden rounded-xl border border-green-200 bg-white shadow-sm">
                <div className="flex items-center gap-3 border-b border-green-100 bg-green-50 px-6 py-3">
                  <FileText className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-bold text-green-700">Tax Invoice</span>
                  {invoice?.sent_email && (
                    <span className="ml-auto flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                      <CheckCircle className="h-3 w-3" /> Emailed to customer
                    </span>
                  )}
                </div>

                {genInvoice ? (
                  <div className="flex items-center gap-2 px-6 py-5 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin text-orange-400" />
                    Generating invoice &amp; sending email to customer…
                  </div>
                ) : invoice ? (
                  <div className="px-6 py-5">
                    {/* Invoice meta */}
                    <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Invoice No.</p>
                        <p className="font-mono font-bold text-orange-600 text-base">{invoice.invoice_number}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Date</p>
                        <p className="font-medium text-gray-800">{fmtDate(invoice.invoice_date)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Amount</p>
                        <p className="font-bold text-green-700 text-base">{fmtRs(invoice.total_amount)}</p>
                      </div>
                    </div>

                    {/* GST breakdown */}
                    <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-xs">
                      <div className="flex justify-between text-gray-500 mb-1">
                        <span>Base Amount</span><span>{fmtRs(invoice.base_amount)}</span>
                      </div>
                      <div className="flex justify-between text-gray-500 mb-1">
                        <span>CGST 2.5%</span><span>{fmtRs(invoice.cgst)}</span>
                      </div>
                      <div className="flex justify-between text-gray-500 mb-2">
                        <span>SGST 2.5%</span><span>{fmtRs(invoice.sgst)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-2">
                        <span>Total</span><span className="text-green-700">{fmtRs(invoice.total_amount)}</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-3">
                      {/* Download PDF */}
                      <a
                        href={`/admin/invoices/${invoice.id}/print?key=${encodeURIComponent(key)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
                      >
                        <Download className="h-4 w-4" /> Download Invoice PDF
                      </a>

                      {/* Open in Invoices module */}
                      <a
                        href={`/admin/invoices?search=${invoice.invoice_number}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> View in Invoices
                      </a>

                      {/* Resend email */}
                      {invoice.customer_email && (
                        <button
                          onClick={resendInvoiceEmail}
                          disabled={resendingEmail}
                          className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
                        >
                          {resendingEmail
                            ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                            : <><Mail className="h-4 w-4" /> Resend to {invoice.customer_email}</>
                          }
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Generate invoice manually if not yet created and payment received */}
            {!invoice && !genInvoice && booking && ['payment_pending', 'payment_approved', 'confirmed', 'completed', 'delivered'].includes(booking.status) && (
              <div className="no-print mx-auto mt-4 max-w-3xl rounded-xl border border-dashed border-gray-200 bg-white px-6 py-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">No invoice generated yet</p>
                    <p className="text-xs text-gray-400 mt-0.5">Generate and email an invoice to the customer</p>
                  </div>
                  <button
                    onClick={() => booking?.id && generateAndSendInvoice(booking.id, !!booking.customer_email)}
                    disabled={genInvoice}
                    className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
                  >
                    <FileText className="h-4 w-4" /> Generate Invoice
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {!booking && !loading && (
          <div className="no-print mx-auto mt-6 max-w-3xl rounded-xl border border-gray-200 bg-white px-6 py-5 text-center shadow-sm">
            <p className="text-sm text-gray-500">No booking linked to this lead yet.</p>
          </div>
        )}
      </div>
    </>
  )
}
