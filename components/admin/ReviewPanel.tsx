'use client'

// BAGDROP — components/admin/ReviewPanel.tsx
//
// "⭐ Review" action — available only once a booking reaches Completed
// status (founder spec, 2026-08-22). Lets Admin either open Bagdrop's
// Google review page directly, or send the customer a short review-request
// message via WhatsApp/Email with the review link included.
//
// The caller is responsible for only rendering this component when the
// booking's status is 'completed' — it also refuses to render itself as a
// defensive backstop (see the early return below), same pattern as
// PaymentFollowUpPanel's outstandingAmount guard, so it can never be shown
// for a New/Pending/Quote Sent/Confirmed/Ongoing/Cancelled booking even if
// a caller's gate is ever loosened by mistake.
//
// Shares the same customer_follow_ups table/history as FollowUpPanel and
// PaymentFollowUpPanel — distinguished by follow_up_type: 'review' (see
// supabase/migrations/20260822_customer_follow_ups_review_type.sql).
//
// Deliberately does NOT touch booking status, payment status, or any other
// workflow field, and does not trigger any other notification — this is
// purely an additional, optional, manually-triggered action. Opening the
// Google review page directly is not logged (it's not a customer
// communication); only an actual WhatsApp/Email send is recorded.

import { useEffect, useRef, useState } from 'react'
import { Star, ChevronDown, MessageCircle, Mail, ExternalLink, History, X } from 'lucide-react'
import { formatCustomerName } from '@/lib/constants'
import { GOOGLE_REVIEW_LINK } from '@/lib/company-info'

export interface ReviewTarget {
  /** customer_follow_ups.booking_id is NOT NULL — caller must not render
   *  this component when there's no booking to attach the request to. */
  bookingId: string
  /** Only ever used for the defensive re-check below — never for display. */
  bookingStatus: string
  title?: string | null
  name: string
  phone: string | null
  email: string | null
}

interface FollowUp {
  id: string
  method: 'whatsapp' | 'email'
  status: 'sent' | 'failed'
  subject: string | null
  message: string | null
  initiated_by: string | null
  created_at: string
  follow_up_type?: 'general' | 'payment' | 'review'
}

export default function ReviewPanel({ target, adminKey, compact }: { target: ReviewTarget; adminKey: string; compact?: boolean }) {
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

  // Defensive backstop — this button must never show for anything but a
  // genuinely Completed booking, independent of whatever gate the caller
  // uses (New/Pending/Quote Sent/Confirmed/Ongoing/Cancelled all excluded).
  if (target.bookingStatus !== 'completed') return null

  const displayName = formatCustomerName(target.title, target.name) || target.name

  // Founder-specified template (2026-08-22) — same wording for both
  // channels, using the one shared Google review link.
  function defaultReviewMessage() {
    return [
      `Hi ${displayName}, thank you for choosing BagDrop!`,
      `We hope you were happy with our baggage delivery service.`,
      `We would really appreciate it if you could take a moment to share your experience with us on Google:`,
      GOOGLE_REVIEW_LINK,
      `Thank you for your support! ❤️`,
      `— BagDrop Team`,
    ].join('\n')
  }
  function defaultEmailSubject() {
    return `How was your BagDrop experience?`
  }

  function openMode(m: 'whatsapp' | 'email') {
    setMenuOpen(false); setErr(''); setOkMsg('')
    setMode(m)
    setText(defaultReviewMessage())
    if (m === 'email') setSubject(defaultEmailSubject())
  }

  // Direct access to the Google review page — never logged (not a customer
  // communication), never touches booking/payment status.
  function openReviewPage() {
    setMenuOpen(false)
    window.open(GOOGLE_REVIEW_LINK, '_blank', 'noopener,noreferrer')
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
        follow_up_type: 'review',
        ...extra,
      }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.detail ? `${d.error ?? 'Failed to record review request'} (${d.detail})` : (d.error ?? 'Failed to record review request'))
    return d as { success: boolean; status: 'sent' | 'failed'; error?: string | null }
  }

  // WhatsApp is never sent from the server — opens WhatsApp Web directly on
  // the admin's own device with the chat + message pre-filled; the admin
  // still presses Send themselves. Uses web.whatsapp.com/send (not wa.me)
  // so it goes straight to the chat, skipping the intermediate
  // api.whatsapp.com landing page on desktop browsers.
  async function sendWhatsApp() {
    if (!target.phone) { setErr('No phone number on file.'); return }
    if (!text.trim()) { setErr('Message cannot be empty.'); return }
    setSending(true); setErr('')
    try {
      const digits = target.phone.replace(/\D/g, '')
      const e164   = digits.length > 10 ? digits : '91' + digits
      window.open(`https://web.whatsapp.com/send?phone=${e164}&text=${encodeURIComponent(text)}`, '_blank')
      await recordFollowUp('whatsapp', { message: text })
      setOkMsg('WhatsApp opened with the message — review request logged.')
      setMode(null)
      if (showHistory) loadHistory()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to log review request')
    }
    setSending(false)
  }

  async function sendEmailReview() {
    if (!target.email) { setErr('No email address on file.'); return }
    if (!subject.trim() || !text.trim()) { setErr('Subject and message are required.'); return }
    setSending(true); setErr('')
    try {
      const d = await recordFollowUp('email', { subject: subject.trim(), message: text })
      if (d.status === 'failed') setErr(d.error || 'Email failed to send.')
      else { setOkMsg(`Review request emailed to ${target.email} ✓`); setMode(null) }
      if (showHistory) loadHistory()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to send email')
    }
    setSending(false)
  }

  // Amber/gold tint — matches the ⭐ theme, distinct from the general
  // Follow Up (purple) and Payment Follow Up (amber-red) actions.
  const triggerClassName = compact
    ? 'inline-flex items-center gap-1 rounded-lg border border-yellow-300 bg-yellow-50 px-2.5 py-1 text-xs font-semibold text-yellow-700 hover:border-yellow-400 transition-colors'
    : 'flex items-center justify-center gap-1.5 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs font-semibold text-yellow-700 shadow-sm hover:bg-yellow-100 hover:border-yellow-400 transition-colors'

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); setErr(''); setOkMsg('') }}
        className={triggerClassName}>
        <Star className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        Review
        <ChevronDown className="h-3 w-3" />
      </button>

      {menuOpen && (
        <div onClick={e => e.stopPropagation()} className="absolute z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg left-0">
          <button onClick={openReviewPage}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50">
            <ExternalLink className="h-3.5 w-3.5 text-yellow-600" /> Open Google Review Page
          </button>
          <div className="my-1 border-t border-gray-100" />
          <button onClick={() => openMode('whatsapp')} disabled={!target.phone}
            title={target.phone ? undefined : 'No phone number on file for this customer'}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
            <MessageCircle className="h-3.5 w-3.5 text-green-600" /> Send via WhatsApp
          </button>
          <button onClick={() => openMode('email')} disabled={!target.email}
            title={target.email ? undefined : 'No email address on file for this customer'}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
            <Mail className="h-3.5 w-3.5 text-blue-600" /> Send via Email
          </button>
        </div>
      )}

      <button onClick={e => { e.stopPropagation(); toggleHistory() }}
        className={`mt-1 flex items-center gap-1 text-[10px] font-medium text-gray-400 hover:text-gray-600 ${compact ? 'justify-start' : 'w-full justify-center'}`}>
        <History className="h-3 w-3" /> {showHistory ? 'Hide history' : 'Review request history'}
      </button>

      {showHistory && (
        <div onClick={e => e.stopPropagation()} className={`mt-1.5 max-h-40 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-2 space-y-2 ${compact ? 'w-56' : 'w-full'}`}>
          {loadingHistory ? (
            <p className="text-[10px] text-gray-400">Loading…</p>
          ) : !history || history.filter(h => h.follow_up_type === 'review').length === 0 ? (
            <p className="text-[10px] text-gray-400">No review requests sent yet.</p>
          ) : (
            history.filter(h => h.follow_up_type === 'review').map(h => (
              <div key={h.id} className="text-[10px] leading-tight">
                <div className="flex items-center gap-1 font-semibold text-gray-700">
                  {h.method === 'whatsapp' ? <MessageCircle className="h-2.5 w-2.5 text-green-600" /> : <Mail className="h-2.5 w-2.5 text-blue-600" />}
                  {h.method === 'whatsapp' ? 'WhatsApp' : 'Email'}
                  <span className={h.status === 'failed' ? 'text-red-500' : 'text-green-600'}>· {h.status === 'failed' ? 'Failed' : 'Sent'}</span>
                </div>
                <p className="text-gray-400">
                  {new Date(h.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {h.initiated_by ? ` · ${h.initiated_by}` : ''}
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
                {mode === 'whatsapp' ? 'WhatsApp Review Request' : 'Email Review Request'}
              </h3>
              <button onClick={() => setMode(null)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
            </div>

            <p className="mb-3 text-xs text-gray-500">
              To: <span className="font-semibold text-gray-700">
                {mode === 'whatsapp' ? target.phone : target.email}
              </span>
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
              <textarea rows={mode === 'whatsapp' ? 7 : 8} value={text} onChange={e => setText(e.target.value)}
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
            </div>

            <div className="mb-4 space-y-1">
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Your name (for the follow-up log)</label>
              <input value={initiatedBy} onChange={e => setInitiatedBy(e.target.value)} placeholder="e.g. Aditya"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
            </div>

            {err && <p className="mb-2 text-xs text-red-500">{err}</p>}

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={mode === 'whatsapp' ? sendWhatsApp : sendEmailReview}
                disabled={sending}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-yellow-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-yellow-600 disabled:opacity-50 transition-colors">
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
