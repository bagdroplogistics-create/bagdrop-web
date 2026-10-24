'use client'

import { useEffect, useState } from 'react'
import { LegacyBookingEngine } from './booking-engine-legacy'
import { BookingFlow } from './booking-flow'

// /book entry point. Chooses between:
//   • BookingFlow          — the new use-case → where → when → bags → who → OTP/price flow
//                            (only when the identity gate is switched on in settings, or locally
//                             with IDENTITY_GATE_LOCAL=true)
//   • LegacyBookingEngine  — the original 4-step form, exactly as it was live before the upgrade
// Anything wrong (network error, slow config, switch off) falls back to the legacy form.

type Mode = 'loading' | 'legacy' | 'flow'

export function BookingEngine() {
  const [mode, setMode] = useState<Mode>('loading')
  const [useCases, setUseCases] = useState<{ id: string; label: string; tagline: string }[]>([])

  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => { if (alive) setMode(m => (m === 'loading' ? 'legacy' : m)) }, 2500)
    fetch('/api/booking-config', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(c => {
        if (!alive) return
        if (c?.identityGate === true) { setUseCases(c.useCases ?? []); setMode('flow') }
        else setMode('legacy')
      })
      .catch(() => { if (alive) setMode('legacy') })
    return () => { alive = false; clearTimeout(timer) }
  }, [])

  if (mode === 'loading') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand border-t-transparent" />
      </div>
    )
  }
  return mode === 'flow' ? <BookingFlow useCases={useCases} identityGate /> : <LegacyBookingEngine />
}
