'use client'

// BAGDROP — Lost Inquiries recovery tool (2026-09-23)
//
// Every "Inquiry creation failed" alert email (lib/creation-failure-alert.ts)
// meant the founder had to manually open Supabase's Table Editor, find the
// row in inquiry_creation_failures, copy its raw_payload JSON, and either
// hand-build a curl/Postman request to POST /api/admin/repair/
// recreate-lost-inquiry or transcribe every field into a fresh "+ New Quote"
// (which mints a NEW number, losing the customer's original one). This page
// replaces all of that with one click for the common case (a lost website/
// mobile-app booking with its raw_payload captured) — see
// app/api/admin/repair/recreate-lost-inquiry/route.ts's
// flattenRawBookingPayload for the exact field mapping.
//
// Deliberately admin-only for the actual recreate action (the route itself
// enforces this via requireAdmin) — a staff key can still view this list
// (requireAdminAuth on the GET), but recreate attempts will come back
// "Unauthorized — full admin key required".

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, RotateCcw, CheckCircle2, XCircle, Ban } from 'lucide-react'

interface RawBookingPayload {
  booking?: Record<string, unknown>
  pricing?: Record<string, unknown>
}

interface FailureRow {
  id:             string
  created_at:     string
  source:         string
  tracking_id:    string | null
  lead_number:    string | null
  failure_stage:  string
  customer_name:  string | null
  customer_phone: string | null
  customer_email: string | null
  error_message:  string
  alert_sent:     boolean
  raw_payload:    RawBookingPayload | Record<string, unknown> | null
  resolved_at:    string | null
  resolved_note:  string | null
}

// The only sources whose raw_payload shape recreate-lost-inquiry's
// flattenRawBookingPayload() actually knows how to auto-recreate. Any other
// source still shows in this list (for visibility/manual follow-up) but
// without a one-click Recreate button — its raw_payload shape is different
// (admin-leads/contact-form/y2k-inquiry/skybird-*) and guessing at a mapping
// for those risks silently saving wrong data, worse than not offering it.
const AUTO_RECREATABLE_SOURCES = new Set(['website-booking', 'mobile-app-booking'])

function summarizeBookingPayload(raw: RawBookingPayload) {
  const b = raw.booking ?? {}
  const bags = Array.isArray(b.bags) ? (b.bags as Array<{ type?: string; quantity?: number }>) : []
  const totalBags = (raw.pricing as Record<string, unknown> | undefined)?.totalBags as number | undefined
    ?? bags.reduce((sum, x) => sum + (Number(x.quantity) || 0), 0)
  return {
    title:    (b.title as string) ?? '—',
    name:     (b.name as string) ?? '—',
    phone:    (b.phone as string) ?? '—',
    email:    (b.email as string) ?? '—',
    route:    `${(b.fromCity as string) ?? '—'} → ${(b.toCity as string) ?? '—'}`,
    date:     (b.date as string) ?? '—',
    bags:     totalBags || '—',
  }
}

export default function LostInquiriesPage() {
  const router = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [authed,   setAuthed]   = useState(false)
  const [rows,     setRows]     = useState<FailureRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showResolved, setShowResolved] = useState(false)
  const [acting,   setActing]   = useState<string | null>(null)
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const [rowSuccess, setRowSuccess] = useState<Record<string, string>>({})

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)
  }, [router])

  const fetchRows = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    const res = await fetch(`/api/admin/repair/lost-inquiries?key=${encodeURIComponent(adminKey)}${showResolved ? '&resolved=true' : ''}`)
    if (res.ok) setRows((await res.json()).failures ?? [])
    setLoading(false)
  }, [adminKey, showResolved])

  useEffect(() => { if (authed) fetchRows() }, [authed, fetchRows])

  async function recreate(row: FailureRow) {
    if (!row.tracking_id) {
      setRowError(e => ({ ...e, [row.id]: 'No tracking_id was captured for this failure — cannot recreate automatically.' }))
      return
    }
    setActing(row.id)
    setRowError(e => ({ ...e, [row.id]: '' }))
    try {
      const res = await fetch('/api/admin/repair/recreate-lost-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({
          tracking_id:         row.tracking_id,
          lead_number:         row.lead_number ?? undefined,
          raw_booking_payload: row.raw_payload,
          failure_id:          row.id,
          source:              row.source === 'mobile-app-booking' ? 'mobile-app' : 'website',
          reason:              `Lost Inquiries tool — original insert failed: ${row.error_message}`,
          submitted_at:        row.created_at,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.success) {
        setRowSuccess(s => ({ ...s, [row.id]: `Recreated as ${d.tracking_id} / ${d.lead_number}` }))
        setRows(rs => rs.map(r => r.id === row.id ? { ...r, resolved_at: new Date().toISOString() } : r))
      } else {
        setRowError(e => ({ ...e, [row.id]: d.error ?? 'Recreate failed' }))
      }
    } catch {
      setRowError(e => ({ ...e, [row.id]: 'Recreate failed — network error' }))
    } finally {
      setActing(null)
    }
  }

  async function markIgnored(row: FailureRow) {
    if (!confirm(`Mark this as resolved without recreating anything (e.g. bot probe, not a real customer)?`)) return
    setActing(row.id)
    try {
      const res = await fetch('/api/admin/repair/lost-inquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ id: row.id, resolved_note: 'Marked resolved (no recreation) — not a real customer inquiry.' }),
      })
      if (res.ok) {
        setRows(rs => rs.map(r => r.id === row.id ? { ...r, resolved_at: new Date().toISOString() } : r))
      } else {
        const d = await res.json().catch(() => ({}))
        setRowError(e => ({ ...e, [row.id]: d.error ?? 'Failed to mark resolved' }))
      }
    } finally {
      setActing(null)
    }
  }

  const visibleRows = rows.filter(r => showResolved ? !!r.resolved_at : !r.resolved_at)

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Lost Inquiries
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Inquiry numbers that were minted but never saved (insert failed after the tracking ID was generated). Recover a real customer&apos;s inquiry under its <em>original</em> number, or mark a bot probe resolved.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs font-semibold text-gray-500">
          <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} />
          Show resolved
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-400" /></div>
      ) : visibleRows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-400">
          {showResolved ? 'No resolved failures yet.' : 'No unresolved lost inquiries — nothing to recover right now.'}
        </div>
      ) : (
        <div className="space-y-4">
          {visibleRows.map(row => {
            const canAutoRecreate = AUTO_RECREATABLE_SOURCES.has(row.source) && !!row.raw_payload && !!row.tracking_id
            const summary = canAutoRecreate ? summarizeBookingPayload(row.raw_payload as RawBookingPayload) : null
            return (
              <div key={row.id} className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-gray-800">{row.tracking_id ?? row.lead_number ?? 'no number captured'}</span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">{row.source}</span>
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">failed at {row.failure_stage}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-gray-900">{row.customer_name ?? '—'}</p>
                    <p className="text-xs text-gray-500">{row.customer_phone ?? '—'}{row.customer_email ? ' · ' + row.customer_email : ''}</p>
                  </div>
                  <p className="text-xs text-gray-400">{new Date(row.created_at).toLocaleString('en-IN')}</p>
                </div>

                <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{row.error_message}</p>

                {summary && (
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 sm:grid-cols-3">
                    <span><strong className="text-gray-800">Title:</strong> {summary.title}</span>
                    <span><strong className="text-gray-800">Name:</strong> {summary.name}</span>
                    <span><strong className="text-gray-800">Phone:</strong> {summary.phone}</span>
                    <span><strong className="text-gray-800">Route:</strong> {summary.route}</span>
                    <span><strong className="text-gray-800">Date:</strong> {summary.date}</span>
                    <span><strong className="text-gray-800">Bags:</strong> {summary.bags}</span>
                  </div>
                )}

                {row.resolved_at ? (
                  <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-green-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Resolved — {row.resolved_note ?? new Date(row.resolved_at).toLocaleString('en-IN')}
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {canAutoRecreate ? (
                      <button
                        onClick={() => recreate(row)}
                        disabled={acting === row.id}
                        className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-60">
                        {acting === row.id ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Recreating…</> : <><RotateCcw className="h-3.5 w-3.5" /> Recreate under original number</>}
                      </button>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-gray-400">
                        <XCircle className="h-3.5 w-3.5" />
                        {row.raw_payload ? 'No automatic recreation for this source yet — recover manually from the details above.' : 'No raw submission was captured — recover manually from the customer contact details above.'}
                      </span>
                    )}
                    <button
                      onClick={() => markIgnored(row)}
                      disabled={acting === row.id}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-60">
                      <Ban className="h-3.5 w-3.5" /> Mark resolved (bot / ignore)
                    </button>
                  </div>
                )}

                {rowError[row.id] && <p className="mt-2 text-xs font-medium text-red-600">{rowError[row.id]}</p>}
                {rowSuccess[row.id] && <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-green-600"><CheckCircle2 className="h-3.5 w-3.5" /> {rowSuccess[row.id]}</p>}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
