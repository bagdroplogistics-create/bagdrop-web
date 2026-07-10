'use client'

import { useReducer, useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { StepIndicator }    from './step-indicator'
import { StepRoute }        from './step-route'
import { StepBags }         from './step-bags'
import { StepSchedule }     from './step-schedule'
import { StepReview }       from './step-review'
import { BookingOtpModal }  from './booking-otp-modal'
import { INITIAL_BOOKING_STATE } from '@/lib/booking-types'
import { calculatePrice } from '@/lib/pricing'
import type { BookingState } from '@/lib/booking-types' // still needed for reducer type

type Action =
  | { type: 'PATCH';     payload: Partial<BookingState> }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'RESET' }

interface EngineState { step: number; booking: BookingState }
const INITIAL: EngineState = { step: 1, booking: INITIAL_BOOKING_STATE }

function reducer(state: EngineState, action: Action): EngineState {
  switch (action.type) {
    case 'PATCH':      return { ...state, booking: { ...state.booking, ...action.payload } }
    case 'NEXT_STEP':  return { ...state, step: Math.min(state.step + 1, 4) }
    case 'PREV_STEP':  return { ...state, step: Math.max(state.step - 1, 1) }
    case 'RESET':      return INITIAL
    default:           return state
  }
}

export function BookingEngine() {
  const router = useRouter()
  const [{ step, booking }, dispatch] = useReducer(reducer, INITIAL)
  const [submitting,  setSubmitting]  = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showOtpModal, setShowOtpModal] = useState(false)

  const pricing = useMemo(() => calculatePrice(booking), [booking])

  const patch = (payload: Partial<BookingState>) => dispatch({ type: 'PATCH', payload })
  const next  = () => { dispatch({ type: 'NEXT_STEP' }); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const back  = () => { dispatch({ type: 'PREV_STEP' }); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  // Called when customer clicks "Confirm Booking" on the review page.
  // Shows the OTP modal instead of submitting immediately.
  function handleBookingSubmit() {
    setSubmitError(null)
    setShowOtpModal(true)
  }

  // Called after email OTP is verified successfully.
  // Email is already in booking state — submit immediately.
  async function handleOtpVerified() {
    setShowOtpModal(false)
    setSubmitting(true)

    try {
      const res = await fetch('/api/bookings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ booking, pricing }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Booking failed')

      if (typeof window !== 'undefined') {
        sessionStorage.setItem(
          'bagdrop_booking',
          JSON.stringify({ booking, trackingId: data.trackingId })
        )
      }

      router.push('/book/confirmation?id=' + data.trackingId)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Booking failed. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* OTP Modal — rendered as a portal-style overlay */}
      <AnimatePresence>
        {showOtpModal && (
          <BookingOtpModal
            phone={booking.phone}
            countryCode={booking.countryCode}
            onVerified={handleOtpVerified}
            onClose={() => setShowOtpModal(false)}
          />
        )}
      </AnimatePresence>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-10">
          <StepIndicator current={step} />
        </div>

        {(submitError || submitting) && (
          <div className="mb-6">
            {submitting && (
              <div className="flex items-center gap-3 rounded-xl bg-brand-light border border-brand/20 p-4 text-sm text-brand">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent shrink-0" />
                Submitting your booking…
              </div>
            )}
            {submitError && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-600">
                {submitError}
              </div>
            )}
          </div>
        )}

        <AnimatePresence mode="wait">
          {step === 1 && (
            <StepRoute key="step-route" state={booking} onChange={patch} onNext={next} />
          )}
          {step === 2 && (
            <StepBags key="step-bags" state={booking} onChange={patch} onNext={next} onBack={back} />
          )}
          {step === 3 && (
            <StepSchedule key="step-schedule" state={booking} onChange={patch} onNext={next} onBack={back} />
          )}
          {step === 4 && (
            <StepReview
              key="step-review"
              state={booking}
              onChange={patch}
              onBack={back}
              onBook={handleBookingSubmit}
            />
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
