'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { StepIdentity } from '@/components/booking/step-identity'

// Shown right after the booking request is saved. Aadhaar (DigiLocker) is verified here, against
// the booking that now exists. The customer may skip for now and finish from the confirmation page.

type Info = { name: string; title: string | null; status: 'pending' | 'verified' | 'review'; verifiedName: string | null; maskedNumber: string | null }

function Inner() {
  const sp = useSearchParams()
  const router = useRouter()
  const trackingId = sp.get('id') ?? ''
  const [token, setToken] = useState<string | null>(null)
  const [info, setInfo] = useState<Info | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser.auth.getSession()
      const t = data.session?.access_token ?? null
      if (!t || !trackingId) { setErr('Your session has expired. Your request is saved. Our team will contact you to complete verification.'); return }
      setToken(t)
      const r = await fetch('/api/identity/booking?id=' + encodeURIComponent(trackingId), { headers: { Authorization: `Bearer ${t}` } })
      const j = await r.json()
      if (!r.ok) { setErr(j.error ?? 'Could not load your booking.'); return }
      setInfo(j)
    })()
  }, [trackingId])

  const toConfirmation = () => router.push('/book/confirmation?id=' + trackingId)

  if (err) return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-sm text-text-secondary">{err}</p>
      <a href={'/book/confirmation?id=' + trackingId} className="mt-4 inline-block text-sm text-brand underline">Continue</a>
    </div>
  )
  if (!info) return <p className="p-10 text-center text-text-muted">Loading…</p>

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <p className="mb-4 text-center text-sm text-text-secondary">Request <b className="font-mono">{trackingId}</b> is saved. One last step.</p>
      <StepIdentity
        booking={{ title: (info.title ?? '') as never, name: info.name }}
        trackingId={trackingId}
        accessToken={token}
        verified={info.status === 'verified' ? { maskedNumber: info.maskedNumber, verifiedName: info.verifiedName } : null}
        submitting={false}
        onConfirm={toConfirmation}
        onBack={toConfirmation}
      />
    </div>
  )
}

export default function VerifyPage() {
  return <Suspense fallback={<p className="p-10 text-center text-text-muted">Loading…</p>}><Inner /></Suspense>
}
