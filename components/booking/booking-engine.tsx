'use client'

import { useEffect, useState } from 'react'
import { BookingFlow } from './booking-flow'

// /book entry point. Always the new flow (use case → where → when → bags → who → OTP/price → confirm).
// The config call only supplies the use-case list and whether Aadhaar verification is switched on;
// if it fails or is slow the form still opens (all use cases, Aadhaar step skipped).

export function BookingEngine() {
  const [cfg, setCfg] = useState<{ useCases: { id: string; label: string; tagline: string }[]; identityGate: boolean } | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/booking-config', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(c => { if (alive) setCfg({ useCases: c?.useCases ?? [], identityGate: c?.identityGate === true }) })
      .catch(() => { if (alive) setCfg({ useCases: [], identityGate: false }) })
    return () => { alive = false }
  }, [])

  if (!cfg) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand border-t-transparent" />
      </div>
    )
  }
  return <BookingFlow useCases={cfg.useCases} identityGate={cfg.identityGate} />
}
