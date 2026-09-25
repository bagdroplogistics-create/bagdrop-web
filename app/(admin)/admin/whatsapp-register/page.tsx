'use client'

// BAGDROP — one-time WhatsApp Cloud API registration tool (2026-09-25)
//
// Fixes Meta error #133010 "Account not registered", which has persisted
// across BOTH Fast2SMS and Bagdrop's own direct Meta app — see
// app/api/admin/whatsapp/register/route.ts's module comment for the full
// root-cause writeup. This is a rare, one-time (or very occasional) admin
// action, not part of the normal booking workflow — deliberately NOT
// added to the main sidebar nav; reachable directly at this URL when needed.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PhoneCall, Loader2, CheckCircle2, XCircle } from 'lucide-react'

export default function WhatsAppRegisterPage() {
  const router = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [authed, setAuthed] = useState(false)
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string; raw?: unknown } | null>(null)

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)
  }, [router])

  async function submit() {
    if (!/^\d{6}$/.test(pin)) {
      setResult({ success: false, message: 'PIN must be exactly 6 digits.' })
      return
    }
    setSubmitting(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/whatsapp/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ pin }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.success) {
        setResult({ success: true, message: 'Registered successfully. Try a real WhatsApp send now (e.g. Resend Acknowledgment on any lead) to confirm.', raw: d.metaResponse })
      } else {
        setResult({ success: false, message: d.error ?? 'Registration failed', raw: d.metaResponse })
      }
    } catch {
      setResult({ success: false, message: 'Network error — request never reached the server' })
    } finally {
      setSubmitting(false)
    }
  }

  if (!authed) return null

  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
        <PhoneCall className="h-5 w-5 text-orange-500" />
        Register WhatsApp Number
      </h1>
      <p className="mt-2 text-sm text-gray-500">
        Fixes Meta error <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">#133010 Account not registered</code>.
        This calls Meta&apos;s Cloud API directly to register +91 63571 15711 for messaging — a separate, lower-level
        step from the number just showing &quot;Connected&quot; in Business Manager.
      </p>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
        <label className="block text-sm font-medium text-gray-700">
          Two-step verification PIN (6 digits)
        </label>
        <p className="mt-1 text-xs text-gray-400">
          If you know the PIN already set for this number, enter it. If you&apos;re not sure one was ever set, or don&apos;t
          remember it, just make up a new 6-digit PIN and enter it here — Meta accepts a fresh PIN at registration time.
          This PIN is sent straight to Meta and is never saved anywhere in Bagdrop&apos;s own systems.
        </p>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="••••••"
          className="mt-3 w-40 rounded-lg border border-gray-200 px-3 py-2 text-center text-lg tracking-[0.3em] focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
        />

        <button
          onClick={submit}
          disabled={submitting || pin.length !== 6}
          className="mt-4 flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Registering…</> : 'Register Number'}
        </button>

        {result && (
          <div className={`mt-4 rounded-lg px-3 py-2.5 text-sm ${result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            <p className="flex items-center gap-1.5 font-semibold">
              {result.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {result.success ? 'Success' : 'Failed'}
            </p>
            <p className="mt-1">{result.message}</p>
            {!!result.raw && (
              <pre className="mt-2 overflow-x-auto rounded bg-white/60 p-2 text-[11px] text-gray-600">{JSON.stringify(result.raw, null, 2)}</pre>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
