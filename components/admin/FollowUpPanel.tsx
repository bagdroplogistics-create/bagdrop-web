'use client'

// BAGDROP — components/admin/FollowUpPanel.tsx
//
// Manual, customer-facing "Follow Up" action — lets an admin send one
// WhatsApp or email nudge to a customer who hasn't responded to their
// quote, with the message fully editable before it goes out. Logs every
// attempt to customer_follow_ups (see
// supabase/migrations/20260820_customer_follow_ups.sql for why that's a
// separate table from the existing, unrelated `lead_followups` automated
// internal reminder system).
//
// Shared between the Booking Workflow page (app/(admin)/admin/page.tsx)
// and the Leads table (app/(admin)/admin/leads/page.tsx) — originally
// built inline in the Booking Workflow page only, then extracted here so
// both call sites share one implementation (and one default message
// template) instead of drifting apart. Takes a small, page-agnostic
// `FollowUpTarget` shape rather than either page's own Booking/Lead
// interface, since those two types don't share field names
// (customer_name vs name, customer_phone vs phone, etc.).
//
// Deliberately does NOT touch booking status, payment status, lead
// status, or trigger any other notification — purely an additional,
// optional, manually-triggered communication.

import { useEffect, useRef, useState } from 'react'
import { MessageCircle, ChevronDown, Mail, History, X } from 'lucide-react'
import { formatCustomerName } from '@/lib/constants'

export interface FollowUpTarget {
  /** customer_follow_ups.booking_id is NOT NULL — caller must not render
   *  this component at all when there's no booking to attach a follow-up
   *  to (both call sites already guard on this). */
  bookingId: string
  /** Shown in the email subject / used for context — a booking's
   *  tracking_id, or a lead's lead_number when called from the Leads
   *  table (that lead's linked booking may not have its own tracking_id
   *  surfaced on that page). */
  refLabel: string
  title?: string | null
  name: string
  phone: string | null
  email: string | null
  pickupLocation: string | null
  deliveryLocation: string | null
}

interface FollowUp {
  id: string
  method: 'whatsapp' | 'email'
  status: 'sent' | 'failed'
  subject: string | null
  message: string | null
  initiated_by: string | null
  created_at: string
}

export default function FollowUpPanel({ target, adminKey, compact }: { target: FollowUpTarget; adminKey: string; compact?: boolean }) {
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

  // Remember the admin's name across follow-ups on this device — there's
  // no per-user login system in this dashboard (just shared admin/staff
  // keys), so this is the only practical way to record "who initiated it".
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

  const displayName = formatCustomerName(target.title, target.name) || target.name

  // Shared wording for both channels — founder-specified template
  // (2026-08-21), same message content sent whether the admin picks
  // WhatsApp or Email.
  function defaultFollowUpMessage() {
    return `Hi ${displayName},\nJust following up regarding the quotation we shared for your baggage delivery from ${target.pickupLocation ?? '—'} to ${target.deliveryLocation ?? '—'}.\nPlease let us know if you have any questions or would like to proceed with the booking. We'll be happy to assist you.`
  }
  function defaultEmailSubject() {
    return `Following up on your Bagdrop quote (${target.refLabel})`
  }

  function openMode(m: 'whatsapp' | 'email') {
    setMenuOpen(false); setErr(''); setOkMsg('')
    setMode(m)
    setText(defaultFollowUpMessage())
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
      body: JSON.stringify({ booking_id: target.bookingId, method, initiated_by: initiatedBy.trim() || null, ...extra }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error ?? 'Failed to record follow-up')
    return d as { success: boolean; status: 'sent' | 'failed'; error?: string | null }
  }

  // WhatsApp is never sent from the server — this opens a wa.me deep link
  // on the ADMIN'S OWN device with the message pre-filled; the admin still
  // has to press Send inside WhatsApp themselves. The API call right after
  // is only to log that this happened, not to send anything.
  async function sendWhatsApp() {
    if (!target.phone) { setErr('No phone number on file.'); return }
    if (!text.trim()) { setErr('Message cannot be empty.'); return }
    setSending(true); setErr('')
    try {
      const digits = target.phone.replace(/\D/g, '')
      const e164   = digits.length > 10 ? digits : '91' + digits
      window.open(`https://wa.me/${e164}?text=${encodeURIComponent(text)}`, '_blank')
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
      else { setOkMsg(`Follow-up email sent to ${target.email} ✓`); setMode(null) }
      if (showHistory) loadHistory()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to send email')
    }
    setSending(false)
  }

  // Two trigger looks: the full-width purple button used in the Booking
  // Workflow page's action column, or a compact pill matching the
  // View Booking / quote-number links already used in the Leads table's
  // Booking / Estimate column (inline-flex, border+bg tint, text-xs).
  const triggerClassName = compact
    ? 'inline-flex items-center gap-1 rounded-lg border border-purple-100 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700 hover:border-purple-300 transition-colors'
    : 'flex w-full items-center justify-center gap-1.5 rounded-lg border border-purple-200 bg-white px-3 py-2 text-xs font-semibold text-purple-600 shadow-sm hover:bg-purple-50 hover:border-purple-400 transition-colors'

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); setErr(''); setOkMsg('') }}
        className={triggerClassName}>
        <MessageCircle className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        Follow Up
        <ChevronDown className="h-3 w-3" />
      </button>

      {menuOpen && (
        <div onClick={e => e.stopPropagation()} className={`absolute z-20 mt-1 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg ${compact ? 'left-0' : 'right-0'}`}>
          <button onClick={() => openMode('whatsapp')} disabled={!target.phone}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
            <MessageCircle className="h-3.5 w-3.5 text-green-600" /> WhatsApp
          </button>
          <button onClick={() => openMode('email')} disabled={!target.email}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
            <Mail className="h-3.5 w-3.5 text-blue-600" /> Email
          </button>
        </div>
      )}

      <button onClick={e => { e.stopPropagation(); toggleHistory() }}
        className={`mt-1 flex items-center gap-1 text-[10px] font-medium text-gray-400 hover:text-gray-600 ${compact ? 'justify-start' : 'w-full justify-center'}`}>
        <History className="h-3 w-3" /> {showHistory ? 'Hide history' : 'Follow-up history'}
      </button>

      {showHistory && (
        <div onClick={e => e.stopPropagation()} className={`mt-1.5 max-h-40 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-2 space-y-2 ${compact ? 'w-56' : 'w-full'}`}>
          {loadingHistory ? (
            <p className="text-[10px] text-gray-400">Loading…</p>
          ) : !history || history.length === 0 ? (
            <p className="text-[10px] text-gray-400">No follow-ups yet.</p>
          ) : (
            history.map(h => (
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
        <p className={`mt-1 text-[10px] ${err ? 'text-red-500' : 'text-green-600'}`}>{err || okMsg}</p>
      )}

      {mode && (
        <div onClick={e => e.stopPropagation()} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">
                {mode === 'whatsapp' ? 'WhatsApp Follow-Up' : 'Email Follow-Up'}
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
              <textarea rows={mode === 'whatsapp' ? 5 : 7} value={text} onChange={e => setText(e.target.value)}
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
                onClick={mode === 'whatsapp' ? sendWhatsApp : sendEmailFollowUp}
                disabled={sending}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-50 transition-colors">
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
