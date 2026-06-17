'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, ShieldCheck, RotateCcw, X } from 'lucide-react'
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

  // Auto-focus first box when OTP stage appears
  useEffect(() => {
    refs.current[0]?.focus()
  }, [])

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
  /** Customer email from booking state — OTP is sent here via Resend */
  email: string
  /** Called after OTP is verified — parent then submits the booking */
  onVerified: () => void
  /** Called when the customer closes the modal without verifying */
  onClose: () => void
}

type Status = 'sending' | 'ready' | 'verifying' | 'error'

export function BookingOtpModal({ email, onVerified, onClose }: BookingOtpModalProps) {
  const [status,          setStatus]          = useState<Status>('sending')
  const [error,           setError]           = useState<string | null>(null)
  const [otp,             setOtp]             = useState('')
  const [resendCountdown, setResendCountdown] = useState(0)

  const isLoading = status === 'sending' || status === 'verifying'

  // Send OTP via Resend immediately when modal mounts
  useEffect(() => {
    sendOtp()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Resend cooldown countdown
  useEffect(() => {
    if (resendCountdown <= 0) return
    const t = setTimeout(() => setResendCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCountdown])

  // Auto-verify as soon as all 6 digits are entered
  useEffect(() => {
    if (otp.length === 6 && status === 'ready') {
      handleVerifyOtp()
    }
  }, [otp]) // eslint-disable-line react-hooks/exhaustive-deps

  async function sendOtp() {
    setStatus('sending')
    setError(null)
    setOtp('')
    try {
      const res  = await fetch('/api/auth/send-otp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'email', contact: email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send OTP.')
      setStatus('ready')
      setResendCountdown(30)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send OTP. Please try again.')
      setStatus('error')
    }
  }

  async function handleVerifyOtp() {
    if (otp.length !== 6) return
    setError(null)
    setStatus('verifying')
    try {
      const res  = await fetch('/api/auth/verify-otp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'email', contact: email, otp }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Incorrect or expired code.')
      // Verified — let parent create the booking
      onVerified()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed. Please try again.')
      setStatus('ready')
    }
  }

  // Show masked email: priya@example.com → pr***@example.com
  function maskEmail(e: string) {
    const [local, domain] = e.split('@')
    if (!domain) return e
    return `${local.slice(0, 2)}***@${domain}`
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
            disabled={isLoading}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-cream hover:text-text-primary disabled:opacity-40"
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
              {status === 'sending' ? 'Sending code…' : 'Verify your email'}
            </h2>
            <p className="mt-1.5 text-sm text-text-muted">
              {status === 'sending'
                ? 'Sending your verification code via email.'
                : <>We sent a 6-digit code to<br />
                    <span className="font-semibold text-text-primary">{maskEmail(email)}</span>
                  </>
              }
            </p>
          </div>

          <AnimatePresence mode="wait">

            {/* Sending spinner */}
            {status === 'sending' && (
              <motion.div
                key="sending"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4 py-6"
              >
                <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand border-t-transparent" />
                <p className="text-sm text-text-muted">Please wait…</p>
              </motion.div>
            )}

            {/* Send failed */}
            {status === 'error' && (
              <motion.div
                key="send-error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
                  <p className="text-sm font-medium text-red-700">{error}</p>
                </div>
                <button
                  onClick={sendOtp}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 text-sm font-semibold text-white shadow-lg shadow-brand/25 transition-all hover:opacity-90"
                >
                  Try again
                </button>
              </motion.div>
            )}

            {/* OTP entry */}
            {(status === 'ready' || status === 'verifying') && (
              <motion.div
                key="verify"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                {/* Inbox hint */}
                <div className="flex items-center justify-center gap-2 rounded-xl bg-brand-light px-4 py-2.5">
                  <Mail className="h-4 w-4 text-brand shrink-0" strokeWidth={1.75} />
                  <span className="text-sm text-brand font-medium">Check your inbox &amp; spam folder</span>
                </div>

                {/* 6-box OTP */}
                <div className="space-y-2">
                  <label className="block text-center text-sm font-medium text-text-primary">
                    Enter 6-digit code
                  </label>
                  <OtpBoxes value={otp} onChange={setOtp} disabled={isLoading} />
                  <p className="text-center text-xs text-text-muted">Code expires in 10 minutes</p>
                </div>

                {/* Inline error */}
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center text-sm text-red-500"
                  >
                    {error}
                  </motion.p>
                )}

                {/* Verify button */}
                <button
                  onClick={handleVerifyOtp}
                  disabled={isLoading || otp.length !== 6}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 text-sm font-semibold text-white shadow-lg shadow-brand/25 transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {status === 'verifying'
                    ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    : <><ShieldCheck className="h-4 w-4" /> Verify &amp; Confirm Booking</>
                  }
                </button>

                {/* Resend */}
                <button
                  onClick={sendOtp}
                  disabled={isLoading || resendCountdown > 0}
                  className="flex w-full items-center justify-center gap-1.5 text-xs text-text-muted transition-colors hover:text-brand disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="h-3 w-3" />
                  {resendCountdown > 0 ? `Resend code in ${resendCountdown}s` : 'Resend code'}
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
