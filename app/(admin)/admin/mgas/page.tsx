'use client'

// MGAS baggage-code requests (Mumbai T2 arrivals). Sending is gated by
// settings.mgas_mode (off = dry-run). Codes are typed in by an admin from the
// MGAS contact's reply — nothing is read or generated automatically.

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Send, CheckCircle2, AlertTriangle } from 'lucide-react'

interface Req {
  id: string; booking_id: string; arrival_date: string | null; scheduled_request_date: string | null
  request_status: string; review_reason: string | null; review_approved_at: string | null
  sent_at: string | null; last_error: string | null; send_attempts: number
  codes_status: string; codes: string[]; customer_notified_at: string | null
  booking: { tracking_id: string; title: string | null; customer_name: string | null; customer_phone: string | null; pickup_address: string | null; flight_number: string | null; total_bags: number | null; status: string } | null
}
interface Batch { id: string; trigger: string; mode: string; recipient: string | null; status: string; booking_count: number; message_text: string | null; error: string | null; created_at: string }

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700', needs_review: 'bg-amber-100 text-amber-800', late_review: 'bg-orange-100 text-orange-800',
  sending: 'bg-blue-100 text-blue-800', sent: 'bg-emerald-100 text-emerald-800', failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-500', excluded: 'bg-gray-100 text-gray-500',
}
const fmt = (d: string | null) => d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'
const fmtTs = (d: string | null) => d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

export default function MgasPage() {
  const [data, setData] = useState<{ today: string; config: { mode: string; recipientSet: boolean; testNumberSet: boolean; template: string }; requests: Req[]; batches: Batch[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [tab, setTab] = useState<'upcoming' | 'review' | 'sent' | 'all'>('upcoming')
  const [codeInput, setCodeInput] = useState<Record<string, string>>({})

  const key = () => (typeof window !== 'undefined' ? sessionStorage.getItem('bagdrop_admin_key') ?? '' : '')
  const load = useCallback(async (sync = false) => {
    setLoading(true)
    const r = await fetch(`/api/admin/mgas${sync ? '?sync=1' : ''}`, { headers: { 'x-admin-key': key() } })
    if (r.ok) setData(await r.json()); else setMsg(`Load failed (${r.status})`)
    setLoading(false)
  }, [])
  useEffect(() => { load(true) }, [load])

  async function act(action: string, body: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(action + JSON.stringify(body)); setMsg(null)
    const r = await fetch('/api/admin/mgas', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': key() }, body: JSON.stringify({ action, ...body }) })
    const j = await r.json().catch(() => ({}))
    setMsg(r.ok ? (j.mode === 'off' ? `Dry run only (mode OFF): ${j.bookings ?? 0} booking(s) previewed, nothing sent.` : j.errors?.length ? j.errors.join('; ') : j.warning ?? 'Done') : (j.error ?? 'Failed'))
    setBusy(null); load()
  }

  const rows = (data?.requests ?? []).filter(r =>
    tab === 'upcoming' ? ['pending', 'failed', 'sending'].includes(r.request_status)
    : tab === 'review' ? ['needs_review', 'late_review'].includes(r.request_status)
    : tab === 'sent' ? r.request_status === 'sent' : true)
  const reviewCount = (data?.requests ?? []).filter(r => ['needs_review', 'late_review'].includes(r.request_status)).length
  const mode = data?.config.mode ?? 'off'

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">MGAS Baggage Codes</h1>
          <p className="text-sm text-slate-500">Mumbai T2 arrivals. Request goes out 2 calendar days before arrival (10:00 AM IST).</p>
        </div>
        <button onClick={() => load(true)} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border hover:bg-slate-50">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className={`rounded-lg px-4 py-2.5 mb-4 text-sm flex items-center gap-2 ${mode === 'live' ? 'bg-emerald-50 text-emerald-800' : mode === 'test' ? 'bg-blue-50 text-blue-800' : 'bg-amber-50 text-amber-800'}`}>
        <AlertTriangle className="w-4 h-4" />
        {mode === 'live' ? 'LIVE: requests are sent to the MGAS contact.' : mode === 'test' ? 'TEST mode: messages go only to the Bagdrop test number; bookings are not marked requested.' : 'OFF: dry-run only. Nothing is sent to anyone. Live sending needs the founder to approve the template and test results.'}
        <span className="ml-auto text-xs opacity-70">Template: {data?.config.template}</span>
      </div>
      {msg && <div className="mb-3 text-sm bg-slate-100 rounded px-3 py-2">{msg}</div>}

      <div className="flex gap-2 mb-3 text-sm">
        {(['upcoming', 'review', 'sent', 'all'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg border ${tab === t ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}>
            {t === 'upcoming' ? 'Upcoming' : t === 'review' ? `Review queue${reviewCount ? ` (${reviewCount})` : ''}` : t === 'sent' ? 'Requested' : 'All'}
          </button>
        ))}
      </div>

      {loading ? <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div> : (
        <div className="space-y-2">
          {rows.length === 0 && <div className="text-sm text-slate-500 py-8 text-center">No bookings here.</div>}
          {rows.map(r => {
            const b = r.booking
            return (
              <div key={r.id} className="border rounded-lg p-3 bg-white">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-sm">{b?.tracking_id}</span>
                  <span className="text-sm text-slate-700">{[b?.title, b?.customer_name].filter(Boolean).join(' ')}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[r.request_status] ?? 'bg-slate-100'}`}>{r.request_status.replace('_', ' ')}</span>
                  <span className="text-xs text-slate-500 ml-auto">Codes: {r.codes_status.replace('_', ' ')}</span>
                </div>
                <div className="text-xs text-slate-600 mt-1 grid sm:grid-cols-4 gap-x-4 gap-y-0.5">
                  <span>Arrival: <b>{fmt(r.arrival_date)}</b></span>
                  <span>Request due: <b>{fmt(r.scheduled_request_date)}</b></span>
                  <span>Sent: {fmtTs(r.sent_at)}</span>
                  <span>Bags: {b?.total_bags ?? '—'} · Flight {b?.flight_number ?? '—'}</span>
                </div>
                {b?.pickup_address && <div className="text-xs text-slate-500 mt-1 truncate">Pickup: {b.pickup_address}</div>}
                {r.review_reason && <div className="text-xs text-amber-700 mt-1">Review: {r.review_reason}</div>}
                {r.last_error && <div className="text-xs text-red-600 mt-1">Error: {r.last_error}</div>}
                {r.codes.length > 0 && <div className="text-xs mt-1 font-mono">Codes: {r.codes.join(', ')}</div>}

                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {['needs_review', 'late_review'].includes(r.request_status) && !r.review_approved_at && (
                    <button disabled={!!busy} onClick={() => act('approve_review', { ids: [r.id] }, `Confirm ${b?.tracking_id} is a Mumbai T2 arrival and should get an MGAS request?`)} className="text-xs px-2.5 py-1 rounded bg-amber-500 text-white">Approve</button>
                  )}
                  {['pending', 'failed', 'late_review', 'needs_review'].includes(r.request_status) && (
                    <button disabled={!!busy} onClick={() => act('send', { ids: [r.id] }, `Send MGAS code request now for ${b?.tracking_id}?${mode === 'off' ? ' (Mode is OFF — preview only, nothing sent.)' : ''}`)} className="text-xs px-2.5 py-1 rounded bg-slate-900 text-white flex items-center gap-1"><Send className="w-3 h-3" /> Send now</button>
                  )}
                  {r.request_status === 'sent' && (
                    <button disabled={!!busy} onClick={() => act('resend', { ids: [r.id] }, `Resend the request for ${b?.tracking_id}? It was already sent.`)} className="text-xs px-2.5 py-1 rounded border">Resend</button>
                  )}
                  {r.request_status === 'sent' && r.codes_status !== 'customer_notified' && r.codes_status !== 'verified' && (
                    <>
                      <input value={codeInput[r.id] ?? ''} onChange={e => setCodeInput({ ...codeInput, [r.id]: e.target.value })} placeholder="Codes e.g. MG338 to MG340" className="text-xs border rounded px-2 py-1 w-52" />
                      <button disabled={!!busy || !codeInput[r.id]} onClick={() => act('record_codes', { id: r.id, codes: codeInput[r.id] })} className="text-xs px-2.5 py-1 rounded border">Save codes</button>
                    </>
                  )}
                  {r.codes_status === 'received' && <button disabled={!!busy} onClick={() => act('verify_codes', { id: r.id }, 'Mark these codes as verified (checked against the MGAS reply)?')} className="text-xs px-2.5 py-1 rounded bg-emerald-600 text-white flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Verify</button>}
                  {r.codes_status === 'verified' && <button disabled={!!busy} onClick={() => act('customer_notified', { id: r.id })} className="text-xs px-2.5 py-1 rounded border">Mark customer informed</button>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(data?.batches?.length ?? 0) > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold mb-2">Recent request messages</h2>
          <div className="space-y-1.5">
            {data!.batches.map(b => (
              <div key={b.id} className="text-xs border rounded p-2 bg-slate-50">
                <div className="flex gap-3 text-slate-600"><b>{fmtTs(b.created_at)}</b><span>{b.mode}</span><span>{b.trigger}</span><span>{b.status}</span><span>{b.booking_count} booking(s)</span></div>
                <div className="mt-1 text-slate-700 break-words">{b.message_text}</div>
                {b.error && <div className="text-red-600 mt-0.5">{b.error}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
