'use client'

import { useState } from 'react'
import { ShieldCheck, Loader2 } from 'lucide-react'
import type { BookingState } from '@/lib/booking-types'

// Identity step (shown only when the identity gate is enabled). The customer is
// already OTP-verified and has a session. Aadhaar is verified through DigiLocker
// (Setu): we keep only the verified name, a reference and the last 4 digits.

interface Props {
  booking:        Pick<BookingState, 'title' | 'name'>
  trackingId:     string
  accessToken:    string | null
  verified:       { maskedNumber: string | null; verifiedName: string | null } | null
  submitting:     boolean
  onConfirm:      () => void      // continue to the confirmation page
  onBack:         () => void      // "Do this later"
}

export const DRAFT_KEY = 'bagdrop_booking_draft'
export const OK_KEY    = 'bagdrop_identity_ok'

export function StepIdentity({ booking, trackingId, accessToken, verified, submitting, onConfirm, onBack }: Props) {
  const [consent, setConsent] = useState(false)
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const fullName = `${booking.title ? booking.title + ' ' : ''}${booking.name}`.trim()

  async function start() {
    setError(null)
    if (!accessToken) { setError('Session expired. Please verify your mobile again.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/identity/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ trackingId, consent: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not start verification.')
      window.location.href = data.url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start verification.')
      setBusy(false)
    }
  }

  return (
    <div className="rounded-3xl border border-border bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white">
          <ShieldCheck className="h-6 w-6" strokeWidth={1.75} />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold text-text-primary">Verify the traveller</h2>
          <p className="text-sm text-text-muted">Once, needed before pickup. We never store your full Aadhaar number.</p>
        </div>
      </div>

      {verified ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <p className="font-semibold">Identity verified</p>
            <p className="mt-1">
              {verified.verifiedName ? <>Name: <b>{verified.verifiedName}</b>. </> : null}
              {verified.maskedNumber ? <>Aadhaar: <span className="font-mono">{verified.maskedNumber}</span>.</> : null}
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={onConfirm} disabled={submitting}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-sm font-semibold text-white shadow-lg shadow-brand/25 disabled:opacity-50">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl bg-brand-light p-4 text-sm text-text-secondary">
            <p>Booking name: <b className="text-text-primary">{fullName || '—'}</b></p>
            <p className="mt-1">This must match the name on the Aadhaar you verify with. UIDAI sends an OTP to the mobile linked to that Aadhaar. It takes about a minute.</p>
          </div>

          <label className="flex items-start gap-3 text-sm text-text-secondary">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1 h-5 w-5 shrink-0" />
            <span>I agree to verify my identity through DigiLocker. Bagdrop keeps only my verified name, a reference number and the last four digits of my Aadhaar, as described in the <a href="/privacy" className="text-brand underline">Privacy Policy</a>.</span>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button onClick={onBack} disabled={busy}
              className="h-12 rounded-xl border border-border px-5 text-sm font-semibold text-text-secondary disabled:opacity-50">Do this later</button>
            <button onClick={start} disabled={!consent || busy || !trackingId}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-sm font-semibold text-white shadow-lg shadow-brand/25 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify with DigiLocker'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
