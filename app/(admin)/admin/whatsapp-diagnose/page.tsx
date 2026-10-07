'use client'

// BAGDROP — WhatsApp delivery diagnostics (2026-10-07)
//
// Asks Meta directly why WhatsApp messages show "Sent" in the Communication Log
// but never reach customers. See app/api/admin/whatsapp/diagnose/route.ts.
// Rare admin tool — deliberately not in the sidebar; open /admin/whatsapp-diagnose.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Stethoscope, Loader2 } from 'lucide-react'

export default function WhatsAppDiagnosePage() {
  const router = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [authed, setAuthed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const [data, setData] = useState<unknown>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)
  }, [router])

  async function run() {
    setLoading(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/whatsapp/diagnose', { headers: { 'x-admin-key': adminKey } })
      setData(await res.json().catch(() => ({ error: `HTTP ${res.status}` })))
    } catch {
      setMsg('Network error — request never reached the server')
    } finally {
      setLoading(false)
    }
  }

  async function subscribe() {
    setSubscribing(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/whatsapp/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ action: 'subscribe' }),
      })
      const d = await res.json().catch(() => ({}))
      setMsg(res.ok && d.ok ? 'Subscribed — the app is now subscribed to this WhatsApp account. Run diagnostics again to confirm.' : `Subscribe failed: ${JSON.stringify(d)}`)
    } catch {
      setMsg('Network error — request never reached the server')
    } finally {
      setSubscribing(false)
    }
  }

  if (!authed) return null

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
        <Stethoscope className="h-5 w-5 text-orange-500" />
        WhatsApp Delivery Diagnostics
      </h1>
      <p className="mt-2 text-sm text-gray-500">
        Asks Meta directly whether this number can send messages and, if not, why. Look at the
        <code className="mx-1 rounded bg-gray-100 px-1 py-0.5 text-xs">health_status</code>
        blocks (can_send_message / errors) and at
        <code className="mx-1 rounded bg-gray-100 px-1 py-0.5 text-xs">subscribedApps</code>
        (our app must be listed for delivery webhooks to arrive).
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button onClick={run} disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking…</> : 'Run diagnostics'}
        </button>
        <button onClick={subscribe} disabled={subscribing}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {subscribing ? <><Loader2 className="h-4 w-4 animate-spin" /> Subscribing…</> : 'Subscribe app to WhatsApp account'}
        </button>
      </div>

      {msg && <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">{msg}</p>}

      {!!data && (
        <pre className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white p-4 text-[11px] leading-relaxed text-gray-700">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </main>
  )
}
