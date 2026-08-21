'use client'

// BAGDROP — components/admin/PaymentFollowUpPanel.tsx
//
// Manual "Payment Follow Up" action — a separate button from the general
// FollowUpPanel (quote-not-responded nudge). Purpose: let Admin manually
// remind a customer about an OUTSTANDING PAYMENT, whenever
// outstanding_amount > 0 — including after the booking/service has
// already been completed. Availability is driven purely by the payment
// balance, never by booking status or customer type (founder spec,
// 2026-08-21): "If Outstanding Amount > 0 → show Payment Follow Up
// button." The caller is responsible for only rendering this component
// when outstandingAmount > 0; it also refuses to render itself as a
// defensive backstop (see the early return below) so it can never be left
// visible once a balance reaches ₹0.
//
// Shares the same customer_follow_ups table/history as FollowUpPanel —
// distinguished by follow_up_type: 'payment' (see
// supabase/migrations/20260821_customer_follow_ups_payment_type.sql) — so
// Admin sees one combined follow-up history per booking, not two.
//
// Deliberately does NOT touch booking status, payment status, generate a
// new invoice/quotation, or trigger any other customer notification —
// this only ever logs an additional, optional, admin-confirmed message.
// WhatsApp is opened via a wa.me deep link on the admin's own device
// (nothing sent from the server); Email is sent server-side via the
// existing Resend integration and embeds the one approved, fixed company
// payment QR image (never regenerated per reminder — see
// lib/company-info.ts's PAYMENT_QR_IMAGE_URL).

import { useEffect, useRef, useState } from 'react'
import { IndianRupee, ChevronDown, MessageCircle, Mail, History, X } from 'lucide-react'
import { formatCustomerName } from '@/lib/constants'
import { INVOICE_BANK, PAYMENT_QR_IMAGE_URL } from '@/lib/company-info'

export interface PaymentFollowUpTarget {
  /** customer_follow_ups.booking_id is NOT NULL — caller must not render
   *  this component when there's no booking to attach the reminder to. */
  bookingId: string
  /** Booking's tracking_id — shown as "Booking ID" in the message. */
  refLabel: string
  title?: string | null
  name: string
  phone: string | null
  email: string | null
  pickupLocation: string | null
  deliveryLocation: string | null
  /** null if no invoice has been generated for this booking yet — the
   *  Invoice No. line is simply omitted from the message in that case. */
  invoiceNumber: string | null
  totalAmount: number
  paidAmount: number
  outstandingAmount: number
}

interface FollowUp {
  id: string
  method: 'whatsapp' | 'email'
  status: 'sent' | 'failed'
  subject: string | null
  message: string | null
  initiated_by: string | null
  created_at: string
  follow_up_type?: 'general' | 'payment'
  outstanding_amount?: number | null
}

function inr(n: number): string {
  return '₹' + Math.round(n || 0).toLocaleString('en-IN')
}

export default function PaymentFollowUpPanel({ target, adminKey, compact }: { target: PaymentFollowUpTarget; adminKey: string; compact?: boolean }) {
  const [menuOpen, setMenuOpen]   = useState(false)
  const [mode, setMode]           = useState<'whatsapp' | 'email' | null>(null)
  const [text, setText]           = useState('')
  const [subject, setSubject]     = useState('')
  const [initiatedBy, setInitiatedBy] = useState('')
  const [sending, setSending]     = useState(false)
  const [err, setErr]             = useState('')
  const [okMsg, setOkMsg]         = useState('')
  const [history, setHistory]     = useState<FollowUp[] | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setInitiatedBy(typeof window !== 'undefined' ? (localStorage.getItem('bagdrop_admin_name') ?? '') : '')
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menuOpen])

  // Once fully paid, this button must disappear — a live, defensive
  // re-check independent of whatever gate the caller uses.
  if (target.outstandingAmount <= 0) return null

  const displayName = formatCustomerName(target.title, target.name) || target.name
  const route = `${target.pickupLocation ?? '—'} to ${target.deliveryLocation ?? '—'}`

  // Founder-specified template (2026-08-21). Outstanding Amount is always
  // Total − sum of approved payments — never "please pay the full invoice
  // again" — so this correctly supports partial payments. WhatsApp can't
  // attach an image via a wa.me deep link, so that variant includes a
  // clickable link to the QR (WhatsApp link-previews it as an image);
  // the Email variant embeds the real image inline instead.
  function defaultPaymentMessage(channel: 'whatsapp' | 'email') {
    const lines = [
      `Hi ${displayName},`,
      `This is a gentle reminder regarding the pending payment for your BagDrop booking.`,
      `Booking ID: ${target.refLabel}`,
      ...(target.invoiceNumber ? [`Invoice No: ${target.invoiceNumber}`] : []),
      `Route: ${route}`,
      `Total Amount: ${inr(target.totalAmount)}`,
      `Paid: ${inr(target.paidAmount)}`,
      `Outstanding Amount: ${inr(target.outstandingAmount)}`,
      ``,
      `You can make the pending payment using the UPI details below:`,
      `UPI ID: ${INVOICE_BANK.upi}`,
      channel === 'whatsapp'
        ? `Payment QR Code: ${PAYMENT_QR_IMAGE_URL} (QR code attached in this message)`
        : `Please scan the QR code below to make the payment.`,
      ``,
      `Once payment is completed, please share the payment confirmation/screenshot with us.`,
      ``,
      `Thank you,`,
      `BagDrop Team`,
    ]
    return lines.join('\n')
  }
  function defaultEmailSubject() {
    return `Payment Reminder — Outstanding ${inr(target.outstandingAmount)} (${target.refLabel})`
  }

  function openMode(m: 'whatsapp' | 'email') {
    setMenuOpen(false); setErr(''); setOkMsg('')
    setMode(m)
    setText(defaultPaymentMessage(m))
    if (m === 'email') setSubject(defaultEmailSubject())
  }

  async function loadHistory() {
    setLoadingHistory(true)
    try {
      const res = await fetch(`/api/admin/customer-follow-ups?booking_id=${target.bookingId}&key=${adminKey}`)
      const d = await res.json()
      setHistory(d.followUps ?? [])
    } catch { setHistory([]) }
    setLoadingHistory(false)
  }

  function toggleHistory() {
    const next = !showHistory
    setShowHistory(next)
    if (next && history === null) loadHistory()
  }

  async function recordFollowUp(method: 'whatsapp' | 'email', extra: Record<string, unknown>) {
    if (typeof window !== 'undefined' && initiatedBy.trim()) {
      localStorage.setItem('bagdrop_admin_name', initiatedBy.trim())
    }
    const res = await fetch('/api/admin/customer-follow-ups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({
        booking_id: target.bookingId,
        method,
        initiated_by: initiatedBy.trim() || null,
        follow_up_type: 'payment',
        outstanding_amount: target.outstandingAmount,
        ...extra,
      }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error ?? 'Failed to record follow-up')
    return d as { success: boolean; status: 'sent' | 'failed'; error?: string | null }
  }

  // WhatsApp is never sent from the server — opens WhatsApp Web directly
  // on the admin's own device with the chat + message pre-filled; the
  // admin still presses Send inside WhatsApp themselves (and can manually
  // attach the QR image shown below if they want it as an actual
  // attachment rather than just the link in the text). Uses
  // web.whatsapp.com/send (not wa.me) so it goes straight to the chat —
  // wa.me first bounces through an api.whatsapp.com landing page
  // ("Continue to WhatsApp Web") on desktop browsers, which this skips.
  async function sendWhatsApp() {
    if (!target.phone) { setErr('No phone number on file.'); return }
    if (!text.trim()) { setErr('Message cannot be empty.'); return }
    setSending(true); setErr('')
    try {
      const digits = target.phone.replace(/\D/g, '')
      const e164   = digits.length > 10 ? digits : '91' + digits
      window.open(`https://web.whatsapp.com/send?phone=${e164}&text=${encodeURIComponent(text)}`, '_blank')
      await recordFollowUp('whatsapp', { message: text })
      setOkMsg('WhatsApp opened with the message — follow-up logged.')
      setMode(null)
      if (showHistory) loadHistory()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to log follow-up')
    }
    setSending(false)
  }

  async function sendEmailFollowUp() {
    if (!target.email) { setErr('No email address on file.'); return }
    if (!subject.trim() || !text.trim()) { setErr('Subject and message are required.'); return }
    setSending(true); setErr('')
    try {
      const d = await recordFollowUp('email', { subject: subject.trim(), message: text })
      if (d.status === 'failed') setErr(d.error || 'Email failed to send.')
      else { setOkMsg(`Payment reminder emailed to ${target.email} ✓`); setMode(null) }
      if (showHistory) loadHistory()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to send email')
    }
    setSending(false)
  }

  // Amber/red tint (not the general Follow Up's purple) — this is a money
  // reminder, should read as distinct and slightly urgent at a glance.
  const triggerClassName = compact
    ? 'inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:border-amber-400 transition-colors'
    : 'flex items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 shadow-sm hover:bg-amber-100 hover:border-amber-400 transition-colors'

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); setErr(''); setOkMsg('') }}
        className={triggerClassName}>
        <IndianRupee className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        Payment Follow Up
        <ChevronDown className="h-3 w-3" />
      </button>

      {menuOpen && (
        // Opens UPWARD (bottom-full, not mt-1/top-full) — this button
        // usually sits in the Quick Info footer at the very bottom of a
        // card with `overflow-hidden` (for its rounded corners). A
        // downward dropdown there gets its lower rows (Email) clipped by
        // that ancestor since position:absolute content doesn't expand
        // the card's own height. Opening upward keeps the whole menu
        // safely inside the card.
        <div onClick={e => e.stopPropagation()} className="absolute z-20 bottom-full mb-1 left-0 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <button onClick={() => openMode('whatsapp')} disabled={!target.phone}
            title={target.phone ? undefined : 'No phone number on file for this customer'}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
            <MessageCircle className="h-3.5 w-3.5 text-green-600" /> WhatsApp
          </button>
          <button onClick={() => openMode('email')} disabled={!target.email}
            title={target.email ? undefined : 'No email address on file for this customer'}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
            <Mail className="h-3.5 w-3.5 text-blue-600" /> Email
          </button>
        </div>
      )}

      <button onClick={e => { e.stopPropagation(); toggleHistory() }}
        className="mt-1 flex items-center gap-1 text-[10px] font-medium text-gray-400 hover:text-gray-600">
        <History className="h-3 w-3" /> {showHistory ? 'Hide history' : 'Reminder history'}
      </button>

      {showHistory && (
        <div onClick={e => e.stopPropagation()} className="mt-1.5 max-h-40 w-64 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-2 space-y-2">
          {loadingHistory ? (
            <p className="text-[10px] text-gray-400">Loading…</p>
          ) : !history || history.filter(h => h.follow_up_type === 'payment').length === 0 ? (
            <p className="text-[10px] text-gray-400">No payment reminders sent yet.</p>
          ) : (
            history.filter(h => h.follow_up_type === 'payment').map(h => (
              <div key={h.id} className="text-[10px] leading-tight">
                <div className="flex items-center gap-1 font-semibold text-gray-700">
                  {h.method === 'whatsapp' ? <MessageCircle className="h-2.5 w-2.5 text-green-600" /> : <Mail className="h-2.5 w-2.5 text-blue-600" />}
                  {h.method === 'whatsapp' ? 'WhatsApp' : 'Email'}
                  <span className={h.status === 'failed' ? 'text-red-500' : 'text-green-600'}>· {h.status === 'failed' ? 'Failed' : 'Sent'}</span>
                </div>
                <p className="text-gray-400">
                  {new Date(h.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {h.initiated_by ? ` · ${h.initiated_by}` : ''}
                  {h.outstanding_amount != null ? ` · Outstanding was ${inr(h.outstanding_amount)}` : ''}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {(okMsg || err) && !mode && (
        <p className="mt-1 text-[10px] max-w-[220px] whitespace-normal" style={{ color: err ? '#ef4444' : '#16a34a' }}>{err || okMsg}</p>
      )}

      {mode && (
        <div onClick={e => e.stopPropagation()} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">
                {mode === 'whatsapp' ? 'WhatsApp Payment Reminder' : 'Email Payment Reminder'}
              </h3>
              <button onClick={() => setMode(null)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
            </div>

            <p className="mb-3 text-xs text-gray-500">
              To: <span className="font-semibold text-gray-700">
                {mode === 'whatsapp' ? target.phone : target.email}
              </span>
              {' · '}Outstanding: <span className="font-semibold text-amber-600">{inr(target.outstandingAmount)}</span>
            </p>

            {mode === 'email' && (
              <div className="mb-3 space-y-1">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Subject</label>
                <input value={subject} onChange={e => setSubject(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
              </div>
            )}

            <div className="mb-3 space-y-1">
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Message</label>
              <textarea rows={mode === 'whatsapp' ? 9 : 11} value={text} onChange={e => setText(e.target.value)}
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
            </div>

            {/* QR preview — same fixed asset embedded in the actual email;
                for WhatsApp the admin can save/attach this image manually
                inside the chat if they'd rather send it as an image than
                rely on the link in the text. */}
            <div className="mb-3 flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={PAYMENT_QR_IMAGE_URL} alt="Bagdrop payment QR code" className="h-16 w-16 rounded border border-gray-200 bg-white object-contain" />
              <div className="text-[10px] text-gray-500">
                <p className="font-semibold text-gray-700">UPI ID: {INVOICE_BANK.upi}</p>
                {mode === 'whatsapp'
                  ? <p>Sent as a link in the message. To send as an image instead, save this QR and attach it manually in WhatsApp.</p>
                  : <p>This QR image is embedded automatically in the email.</p>}
              </div>
            </div>

            <div className="mb-4 space-y-1">
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Your name (for the follow-up log)</label>
              <input value={initiatedBy} onChange={e => setInitiatedBy(e.target.value)} placeholder="e.g. Aditya"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
            </div>

            {err && <p className="mb-2 text-xs text-red-500">{err}</p>}

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={mode === 'whatsapp' ? sendWhatsApp : sendEmailFollowUp}
                disabled={sending}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-600 disabled:opacity-50 transition-colors">
                {sending ? 'Sending…' : mode === 'whatsapp' ? 'Open WhatsApp' : 'Send Email'}
              </button>
              <button onClick={() => setMode(null)}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
