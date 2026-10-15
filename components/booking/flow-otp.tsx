'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { findCountry, DEFAULT_COUNTRY_ISO2 } from '@/lib/phone-countries'

// Inline OTP (blueprint: "Send code · [code] · Unlock"). Uses the SAME backend as the old pop-up:
// /api/auth/send-otp and /api/auth/verify-otp. After a correct code the customer gets a real
// session (token) so the identity step and the booking are bound to this verified mobile.
// This is Bagdrop's own OTP (SMS via Fast2SMS) — it has nothing to do with Setu. Setu is only
// used on the next step, where UIDAI sends its own OTP to the Aadhaar-linked mobile.

interface Props {
  phone: string
  countryIso2?: string
  disabled?: boolean
  onVerified: (accessToken: string) => void
}

export function FlowOtp({ phone, countryIso2 = DEFAULT_COUNTRY_ISO2, disabled, onVerified }: Props) {
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [shown, setShown] = useState<string | null>(null)

  const dial = '+' + (findCountry(countryIso2)?.dialCode ?? findCountry(DEFAULT_COUNTRY_ISO2)!.dialCode)
  const e164 = dial + phone.replace(/\D/g, '')

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function send() {
    setBusy(true); setErr(''); setMsg(''); setShown(null); setCode('')
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'phone', contact: e164 }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not send the code.')
      if (d.otp) setShown(String(d.otp))        // existing fallback when SMS could not be sent
      setSent(true); setCooldown(30)
      setMsg(`Code sent to ${dial} ${phone}. Valid for 10 minutes.`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send the code.')
    }
    setBusy(false)
  }

  async function verify() {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'phone', contact: e164, otp: code }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Incorrect or expired code.')
      const { supabaseBrowser } = await import('@/lib/supabase-browser')
      const { data: s, error: sErr } = await supabaseBrowser.auth.signInWithPassword({ email: d.authEmail, password: d.tempPassword })
      if (sErr || !s?.session?.access_token) throw new Error('Could not start a secure session. Please try again.')
      onVerified(s.session.access_token)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Verification failed. Please try again.')
    }
    setBusy(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="lg" onClick={send} disabled={disabled || busy || (sent && cooldown > 0)}>
          {sent ? (cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code') : 'Send code'}
        </Button>
        <input
          className="input-base w-40 text-center font-mono text-lg tracking-[0.3em]"
          placeholder="••••••" maxLength={6} inputMode="numeric" autoComplete="one-time-code" aria-label="OTP"
          value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} disabled={!sent}
        />
        <Button variant="primary" size="lg" onClick={verify} disabled={busy || code.length !== 6}>Unlock</Button>
      </div>
      {msg && <p className="text-xs text-text-muted">{msg}</p>}
      {shown && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          SMS could not be sent, so your code is shown here: <b className="font-mono text-sm tracking-widest">{shown}</b>
        </p>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  )
}
