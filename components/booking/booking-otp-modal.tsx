'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Phone, ShieldCheck, ArrowRight, RotateCcw, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Inline 6-box OTP input ────────────────────────────────────
function OtpBoxes({
  value, onChange, disabled,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (value.length > 0 && value.length <= 6) {
      refs.current[Math.min(value.length - 1, 5)]?.focus()
    }
  }, [value])

  function handleChange(idx: number, raw: string) {
    const all = raw.replace(/\D/g, '')
    if (all.length > 1) {
      const filled = all.slice(0, 6)
      onChange(filled)
      refs.current[Math.min(filled.length - 1, 5)]?.focus()
      return
    }
    const digit   = all.slice(0, 1)
    const updated = value.slice(0, idx) + digit + value.slice(idx + 1)
    onChange(updated.slice(0, 6))
    if (digit && idx < 5) refs.current[idx + 1]?.focus()
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (value[idx]) {
        onChange(value.slice(0, idx) + value.slice(idx + 1))
      } else if (idx > 0) {
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
          maxLength={6}
          value={value[i] ?? ''}
          disabled={disabled}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onFocus={e => e.target.select()}
          id={`modal-otp-${i}`}
          aria-label={`Digit ${i + 1} of 6`}
          className={cn(
            'h-12 w-10 sm:w-11 rounded-xl border-2 text-center text-xl font-bold font-mono transition-all duration-150',
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

// ── Main modal ────────────────────────────────────────────────
export interface BookingOtpModalProps {
  /** Called with the verified 10-digit phone (no +91) after OTP success */
  onVerified: (phone: string) => void
  /** Called when the user dismisses the modal without verifying */
  onClose: () => void
}

type Stage  = 'input' | 'verify'
type Status = 'idle' | 'loading' | 'verifying' | 'error'

export function BookingOtpModal({ onVerified, onClose }: BookingOtpModalProps) {
  const [stage,    setStage]    = useState<Stage>('input')
  const [status,   setStatus]   = useState<Status>('idle')
  const [error,    setError]    = useState<string | null>(null)
  const [phone,    setPhone]    = useState('')
  const [otp,      setOtp]      = useState('')
  const [shownOtp, setShownOtp] = useState<string | null>(null)

  const isLoading = status === 'loading' || status === 'verifying'

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
      if (data.otp) {
        setShownOtp(data.otp)
        setOtp(data.otp) // auto-fill boxes
      }
      setStatus('idle')
      setStage('verify')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  async function handleVerifyOtp() {
    if (otp.length !== 6) return
    setError(null)
    setStatus('verifying')
    try {
      const cleaned = phone.replace(/\D/g, '')
      const res  = await fetch('/api/auth/verify-otp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'phone', contact: '+91' + cleaned, otp }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Incorrect or expired code.')
      // Success — pass verified phone to parent; parent will submit the booking
      onVerified(cleaned)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed. Please try again.')
      setStatus('error')
    }
  }

  function handleReset() {
    setStage('input')
    setStatus('idle')
    setError(null)
    setOtp('')
    setShownOtp(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Card */}
      <motion.div
        className="relative z-10 w-full max-w-sm"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.25, ease: 'easeOut' as const }}
      >
        <div className="rounded-3xl border border-border bg-white p-7 shadow-2xl shadow-black/10">
          {/* Close */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-cream hover:text-text-primary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Header */}
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white shadow-lg shadow-brand/30">
              <ShieldCheck className="h-7 w-7" strokeWidth={1.75} />
            </div>
            <h2 className="font-display text-xl font-bold text-text-primary">
              {stage === 'input' ? 'Verify Mobile Number' : 'Enter your code'}
            </h2>
            <p className="mt-1.5 text-sm text-text-muted">
              {stage === 'input'
                ? 'One quick verification before we confirm your booking.'
                : `OTP sent to +91 ${phone.replace(/\D/g, '')}`}
            </p>
          </div>

          <AnimatePresence mode="wait">

            {/* ── Step 1: Phone input ── */}
            {stage === 'input' && (
              <motion.div
                key="input"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <label htmlFor="modal-phone" className="block text-sm font-medium text-text-primary">
                    Mobile number
                  </label>
                  <div className="flex gap-2">
                    <div className="flex h-12 shrink-0 select-none items-center rounded-xl border border-border bg-cream px-3 text-sm font-semibold text-text-secondary">
                      🇮🇳 +91
                    </div>
                    <div className="relative flex-1">
                      <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted pointer-events-none" strokeWidth={1.75} />
                      <input
                        id="modal-phone"
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
                  className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 text-sm font-semibold text-white shadow-lg shadow-brand/25 transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {status === 'loading'
                    ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    : <>Get OTP <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>}
                </button>
              </motion.div>
            )}

            {/* ── Step 2: OTP verification ── */}
            {stage === 'verify' && (
              <motion.div
                key="verify"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {/* On-screen OTP display */}
                {shownOtp && (
                  <div className="rounded-2xl border-2 border-brand/25 bg-brand-light px-4 py-3 text-center">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-brand/70">
                      Your OTP
                    </p>
                    <p className="font-mono text-3xl font-bold tracking-[0.3em] text-brand">
                      {shownOtp}
                    </p>
                  </div>
                )}

                {/* 6-box input */}
                <div className="space-y-2">
                  <label className="block text-center text-sm font-medium text-text-primary">
                    Enter 6-digit code
                  </label>
                  <OtpBoxes value={otp} onChange={setOtp} disabled={isLoading} />
                  <p className="text-center text-xs text-text-muted">Code expires in 10 minutes</p>
                </div>

                {error && <p className="text-center text-sm text-red-500">{error}</p>}

                <button
                  onClick={handleVerifyOtp}
                  disabled={isLoading || otp.length !== 6}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 text-sm font-semibold text-white shadow-lg shadow-brand/25 transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {status === 'verifying'
                    ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    : <><ShieldCheck className="h-4 w-4" /> Verify &amp; Confirm Booking</>}
                </button>

                <button
                  onClick={handleReset}
                  disabled={isLoading}
                  className="flex w-full items-center justify-center gap-1.5 text-xs text-text-muted transition-colors hover:text-brand disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" />
                  Change number / resend code
                </button>
              </motion.div>
            )}

          </AnimatePresence>

          <p className="mt-5 text-center text-[11px] text-text-muted">
            By continuing you agree to Bagdrop&apos;s{' '}
            <a href="/terms"   className="text-brand hover:underline">Terms</a>{' '}
            &amp;{' '}
            <a href="/privacy" className="text-brand hover:underline">Privacy Policy</a>.
          </p>
        </div>
      </motion.div>
    </div>
  )
}
