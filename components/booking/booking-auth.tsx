'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Phone, ArrowRight, RotateCcw, ShieldCheck } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { cn } from '@/lib/utils'
import type { User } from '@supabase/supabase-js'

type Stage  = 'input' | 'verify'
type Status = 'idle' | 'loading' | 'sent' | 'verifying' | 'error'

interface BookingAuthProps {
  onAuth: (user: User) => void
}

// ── 6-box OTP input ───────────────────────────────────────────
interface OtpBoxesProps {
  value:    string                        // always 0–6 chars
  onChange: (v: string) => void
  onComplete?: (v: string) => void        // optional: called when all 6 filled
  disabled?: boolean
}

function OtpBoxes({ value, onChange, onComplete, disabled }: OtpBoxesProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([])

  // When value is set externally (auto-fill / shownOtp), focus the last filled box
  useEffect(() => {
    if (value.length > 0 && value.length <= 6) {
      refs.current[Math.min(value.length - 1, 5)]?.focus()
    }
  }, [value])

  function handleChange(idx: number, raw: string) {
    // Paste — distribute all digits across boxes
    const all = raw.replace(/\D/g, '')
    if (all.length > 1) {
      const filled = all.slice(0, 6)
      onChange(filled)
      refs.current[Math.min(filled.length - 1, 5)]?.focus()
      return
    }

    const digit = all.slice(0, 1)
    const next  = value.slice(0, idx) + digit + value.slice(idx + 1)
    const clamped = next.slice(0, 6)
    onChange(clamped)

    if (digit && idx < 5) refs.current[idx + 1]?.focus()
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (value[idx]) {
        // Clear current box
        onChange(value.slice(0, idx) + value.slice(idx + 1))
      } else if (idx > 0) {
        // Move back and clear previous
        onChange(value.slice(0, idx - 1) + value.slice(idx))
        refs.current[idx - 1]?.focus()
      }
    } else if (e.key === 'ArrowLeft'  && idx > 0) refs.current[idx - 1]?.focus()
      else if (e.key === 'ArrowRight' && idx < 5) refs.current[idx + 1]?.focus()
  }

  return (
    <div className="flex justify-center gap-2 sm:gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el }}
          type="text"
          inputMode="numeric"
          maxLength={6}           // allow paste of full 6-digit code into any box
          value={value[i] ?? ''}
          disabled={disabled}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onFocus={e => e.target.select()}
          id={`otp-box-${i}`}
          aria-label={`Digit ${i + 1} of 6`}
          className={cn(
            'h-14 w-11 sm:w-12 rounded-xl border-2 text-center text-2xl font-bold font-mono transition-all duration-150',
            'focus:outline-none focus:ring-0',
            value[i]
              ? 'border-brand bg-brand-light text-brand'
              : 'border-border bg-white text-text-primary',
            'focus:border-brand',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        />
      ))}
    </div>
  )
}

// ── Main auth component ───────────────────────────────────────
export function BookingAuth({ onAuth }: BookingAuthProps) {
  const [stage,    setStage]    = useState<Stage>('input')
  const [status,   setStatus]   = useState<Status>('idle')
  const [error,    setError]    = useState<string | null>(null)
  const [phone,    setPhone]    = useState('')        // 10-digit, no +91
  const [otp,      setOtp]      = useState('')
  const [shownOtp, setShownOtp] = useState<string | null>(null)

  const isLoading = status === 'loading' || status === 'verifying'

  // ── Send OTP ────────────────────────────────────────────────
  async function handleSendOtp() {
    const cleaned = phone.replace(/\D/g, '')
    if (!/^[6-9]\d{9}$/.test(cleaned)) {
      setError('Please enter a valid 10-digit Indian mobile number.')
      return
    }

    setError(null)
    setStatus('loading')

    try {
      const res  = await fetch('/api/auth/send-otp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'phone', contact: '+91' + cleaned }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send OTP.')

      // Phone OTP is generated on-server and returned for on-screen display
      if (data.otp) {
        setShownOtp(data.otp)
        setOtp(data.otp)     // auto-fill all 6 boxes
      }

      setStatus('sent')
      setStage('verify')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  // ── Verify OTP ──────────────────────────────────────────────
  async function handleVerifyOtp(code: string) {
    if (code.length !== 6) return

    setError(null)
    setStatus('verifying')

    try {
      const cleaned = phone.replace(/\D/g, '')

      const res  = await fetch('/api/auth/verify-otp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'phone', contact: '+91' + cleaned, otp: code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Invalid code.')

      const { data: signInData, error: signInError } =
        await supabaseBrowser.auth.signInWithPassword({
          email:    data.authEmail,
          password: data.tempPassword,
        })

      if (signInError) throw signInError
      if (!signInData.user) throw new Error('Sign-in completed but no user returned.')

      onAuth(signInData.user)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed. Please try again.')
      setStatus('error')
    }
  }

  // Auto-focus first empty box when OTP screen appears
  useEffect(() => {
    if (stage === 'verify' && !shownOtp) {
      // Manual entry mode — focus box 0
      setTimeout(() => {
        const firstBox = document.getElementById('otp-box-0') as HTMLInputElement | null
        firstBox?.focus()
      }, 100)
    }
    // When shownOtp is set, boxes are pre-filled — no auto-submit,
    // user clicks Verify & Continue themselves.
  }, [stage, shownOtp])

  function handleReset() {
    setStage('input')
    setStatus('idle')
    setError(null)
    setOtp('')
    setShownOtp(null)
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-12 sm:px-0">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="rounded-3xl border border-border bg-white p-8 shadow-2xl shadow-black/8"
      >
        {/* ── Header ── */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-white shadow-lg shadow-brand/30">
            <ShieldCheck className="h-8 w-8" strokeWidth={1.75} />
          </div>
          <h1 className="font-display text-2xl font-bold text-text-primary">
            {stage === 'input' ? 'Verify to Book' : 'Enter your code'}
          </h1>
          <p className="mt-2 text-base text-text-muted">
            {stage === 'input'
              ? 'Enter your mobile number to get a verification code.'
              : `Code sent to +91 ${phone.replace(/\D/g, '')}`}
          </p>
        </div>

        <AnimatePresence mode="wait">

          {/* ── Step 1: Phone input ── */}
          {stage === 'input' && (
            <motion.div
              key="input"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.22 }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <label htmlFor="auth-phone" className="block text-base font-medium text-text-primary">
                  Mobile number
                </label>
                <div className="flex gap-2">
                  <div className="flex h-12 shrink-0 select-none items-center rounded-xl border border-border bg-cream px-3 text-base font-semibold text-text-secondary">
                    🇮🇳 +91
                  </div>
                  <div className="relative flex-1">
                    <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted pointer-events-none" strokeWidth={1.75} />
                    <input
                      id="auth-phone"
                      type="tel"
                      inputMode="numeric"
                      value={phone}
                      onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
                      placeholder="98765 43210"
                      autoComplete="tel-national"
                      className="input-base pl-10 w-full"
                    />
                  </div>
                </div>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <button
                onClick={handleSendOtp}
                disabled={isLoading || phone.replace(/\D/g, '').length !== 10}
                className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 text-base font-semibold text-white shadow-lg shadow-brand/25 transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === 'loading'
                  ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  : <>Get OTP <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>
                }
              </button>
            </motion.div>
          )}

          {/* ── Step 2: OTP verification ── */}
          {stage === 'verify' && (
            <motion.div
              key="verify"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.22 }}
              className="space-y-5"
            >
              {/* On-screen OTP display */}
              {shownOtp && (
                <div className="rounded-2xl border-2 border-brand/25 bg-brand-light px-4 py-3 text-center">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-brand/70">
                    Your OTP
                  </p>
                  <p className="font-mono text-4xl font-bold tracking-[0.3em] text-brand">
                    {shownOtp}
                  </p>
                </div>
              )}

              {/* 6-box OTP input */}
              <div className="space-y-2">
                <label className="block text-center text-base font-medium text-text-primary">
                  Enter 6-digit code
                </label>
                <OtpBoxes
                  value={otp}
                  onChange={setOtp}
                  disabled={isLoading}
                />
                <p className="text-center text-xs text-text-muted">
                  Code expires in 10 minutes
                </p>
              </div>

              {error && (
                <p className="text-center text-sm text-red-500">{error}</p>
              )}

              <button
                onClick={() => handleVerifyOtp(otp)}
                disabled={isLoading || otp.length !== 6}
                className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 text-base font-semibold text-white shadow-lg shadow-brand/25 transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === 'verifying'
                  ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  : <><ShieldCheck className="h-4 w-4" /> Verify &amp; Continue</>
                }
              </button>

              <button
                onClick={handleReset}
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-1.5 text-sm text-text-muted transition-colors hover:text-brand disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Change number / resend code
              </button>
            </motion.div>
          )}

        </AnimatePresence>

        <p className="mt-6 text-center text-xs text-text-muted">
          By continuing you agree to Bagdrop&apos;s{' '}
          <a href="/terms"   className="text-brand hover:underline">Terms</a>{' '}
          &amp;{' '}
          <a href="/privacy" className="text-brand hover:underline">Privacy Policy</a>.
        </p>
      </motion.div>
    </div>
  )
}
