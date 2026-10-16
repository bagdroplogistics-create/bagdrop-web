'use client'

import { useEffect, useState } from 'react'

// Admin booking page: Aadhaar status badge + "Send Aadhaar link". Renders nothing for bookings
// where Aadhaar does not apply (old-form bookings, international travellers).
type Info = { status: 'not_required' | 'pending' | 'verified' | 'review'; verifiedName: string | null; maskedNumber: string | null; link: string; hasEmail: boolean }

const BADGE: Record<string, { text: string; cls: string }> = {
  pending:  { text: 'ID pending',        cls: 'bg-amber-100 text-amber-800' },
  verified: { text: 'ID verified',       cls: 'bg-green-100 text-green-800' },
  review:   { text: 'ID needs review',   cls: 'bg-red-100 text-red-700' },
}

export function IdentityCard({ bookingId }: { bookingId: string }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg]   = useState<{ ok: boolean; text: string } | null>(null)
  const key = () => sessionStorage.getItem('bagdrop_admin_key') ?? ''

  function load() {
    fetch(`/api/admin/bookings/${bookingId}/identity`, { headers: { 'x-admin-key': key() }, cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null)).then(d => d && setInfo(d)).catch(() => {})
  }
  useEffect(load, [bookingId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!info || info.status === 'not_required') return null
  const badge = BADGE[info.status]

  async function send() {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(`/api/admin/bookings/${bookingId}/identity`, { method: 'POST', headers: { 'x-admin-key': key() } })
      const j = await r.json()
      setMsg(r.ok ? { ok: true, text: 'Aadhaar link emailed to the customer.' } : { ok: false, text: j.error ?? 'Could not send.' })
    } catch { setMsg({ ok: false, text: 'Could not send.' }) }
    setBusy(false)
  }
  async function copy() {
    try { await navigator.clipboard.writeText(info!.link); setMsg({ ok: true, text: 'Link copied. Paste it into WhatsApp.' }) }
    catch { setMsg({ ok: false, text: info!.link }) }
  }

  return (
    <div className="no-print mx-auto mt-6 max-w-3xl rounded-xl border border-gray-200 bg-white px-6 py-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-gray-800">Aadhaar verification</span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.cls}`}>{badge.text}</span>
        </div>
        {info.status !== 'verified' && (
          <div className="flex gap-2">
            <button onClick={copy} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700">Copy link</button>
            <button onClick={send} disabled={busy || !info.hasEmail}
              title={info.hasEmail ? '' : 'No customer email on this booking'}
              className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {busy ? 'Sending…' : 'Send Aadhaar link'}
            </button>
          </div>
        )}
      </div>
      {info.status === 'verified' && (
        <p className="mt-2 text-xs text-gray-600">Name on ID: <b>{info.verifiedName}</b>{info.maskedNumber ? <> · Aadhaar <span className="font-mono">{info.maskedNumber}</span></> : null}</p>
      )}
      {info.status === 'pending' && <p className="mt-2 text-xs text-gray-500">Required before pickup. Send the link once the booking is confirmed and paid.</p>}
      {info.status === 'review' && <p className="mt-2 text-xs text-gray-500">The name on the ID did not match closely. Check it with the customer before pickup.</p>}
      {msg && <p className={`mt-2 text-xs ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
    </div>
  )
}
