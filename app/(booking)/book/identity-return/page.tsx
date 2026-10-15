'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { OK_KEY } from '@/components/booking/step-identity'

// Landing page after DigiLocker. The URL flags (success/id/scope) are NOT trusted:
// we ask our server, which asks Setu, and only then continue.

type Result = {
  verificationId: string
  status: string
  outcome: 'pass' | 'confirm' | 'blocked' | null
  verifiedName: string | null
  maskedNumber: string | null
  spellingConfirmed: boolean
  reviewStatus: string | null
}

function Inner() {
  const sp = useSearchParams()
  const requestId = sp.get('id') ?? ''
  const [phase, setPhase] = useState<'loading' | 'confirm' | 'review' | 'failed' | 'done'>('loading')
  const [res, setRes] = useState<Result | null>(null)
  const [msg, setMsg] = useState('')
  const [token, setToken] = useState('')

  function finish(r: Result) {
    sessionStorage.setItem(OK_KEY, JSON.stringify({
      verificationId: r.verificationId, maskedNumber: r.maskedNumber, verifiedName: r.verifiedName,
    }))
    setPhase('done')
    window.location.replace('/book?identity=done')
  }

  useEffect(() => {
    (async () => {
      if (!requestId) { setMsg('This link is not valid.'); setPhase('failed'); return }
      const { data } = await supabaseBrowser.auth.getSession()
      const t = data.session?.access_token
      if (!t) { setMsg('Your session has expired. Please start the booking again.'); setPhase('failed'); return }
      setToken(t)
      // DigiLocker can take a moment to mark the request complete — poll briefly.
      for (let i = 0; i < 6; i++) {
        const r = await fetch('/api/identity/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
          body: JSON.stringify({ requestId }),
        })
        const j = await r.json()
        if (!r.ok) { setMsg(j.error ?? 'Could not confirm verification.'); setPhase('failed'); return }
        if (j.status === 'pending') { await new Promise(s => setTimeout(s, 1500)); continue }
        setRes(j)
        if (j.status !== 'verified') { setMsg('Verification was not completed.'); setPhase('failed'); return }
        if (j.reviewStatus === 'pending') { setPhase('review'); return }
        if (j.outcome === 'pass' || j.spellingConfirmed) { finish(j); return }
        if (j.outcome === 'confirm') { setPhase('confirm'); return }
        setPhase('review'); return
      }
      setMsg('Verification was not completed.'); setPhase('failed')
    })()
  }, [requestId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function answer(confirm: boolean) {
    if (!res) return
    const r = await fetch('/api/identity/confirm-spelling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ verificationId: res.verificationId, confirm }),
    })
    const j = await r.json()
    if (!r.ok) { setMsg(j.error ?? 'Could not save.'); setPhase('failed'); return }
    if (confirm) finish({ ...res, spellingConfirmed: true })
    else setPhase('review')
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      {phase === 'loading' && <p className="text-text-muted">Confirming your verification…</p>}
      {phase === 'done' && <p className="text-text-muted">Verified. Returning to your booking…</p>}
      {phase === 'confirm' && res && (
        <div className="rounded-3xl border border-border bg-white p-6 shadow-sm">
          <h1 className="font-display text-xl font-bold">Please confirm the spelling</h1>
          <p className="mt-3 text-sm text-text-secondary">Your ID shows <b>{res.verifiedName}</b>. Is this you, and is this how you want the name on this booking?</p>
          <div className="mt-5 flex gap-3">
            <button onClick={() => answer(false)} className="h-12 flex-1 rounded-xl border border-border text-sm font-semibold">No, check it</button>
            <button onClick={() => answer(true)} className="h-12 flex-1 rounded-xl bg-brand text-sm font-semibold text-white">Yes, that is me</button>
          </div>
        </div>
      )}
      {phase === 'review' && (
        <div className="rounded-3xl border border-border bg-white p-6 shadow-sm">
          <h1 className="font-display text-xl font-bold">We need a quick manual check</h1>
          <p className="mt-3 text-sm text-text-secondary">The name on your ID does not match the booking name closely enough. Our team will review it and contact you on WhatsApp. Your booking is saved only once it is approved.</p>
          <a href="/book" className="mt-5 inline-block text-sm text-brand underline">Back to booking</a>
        </div>
      )}
      {phase === 'failed' && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-6">
          <p className="text-sm text-red-700">{msg || 'Something went wrong.'}</p>
          <a href="/book" className="mt-4 inline-block text-sm text-brand underline">Back to booking</a>
        </div>
      )}
    </div>
  )
}

export default function IdentityReturnPage() {
  return <Suspense fallback={<p className="p-10 text-center text-text-muted">Loading…</p>}><Inner /></Suspense>
}
