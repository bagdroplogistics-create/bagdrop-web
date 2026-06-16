'use client'

import { useReducer, useMemo, useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { StepIndicator } from './step-indicator'
import { StepRoute }     from './step-route'
import { StepBags }      from './step-bags'
import { StepSchedule }  from './step-schedule'
import { StepReview }    from './step-review'
import { INITIAL_BOOKING_STATE } from '@/lib/booking-types'
import { calculatePrice } from '@/lib/pricing'
import type { BookingState } from '@/lib/booking-types'

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
  const [submitting, setSubmitting]   = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Keep pricing for API payload only — not displayed to user
  const pricing = useMemo(() => calculatePrice(booking), [booking])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step])

  const patch = (payload: Partial<BookingState>) => dispatch({ type: 'PATCH', payload })
  const next  = () => dispatch({ type: 'NEXT_STEP' })
  const back  = () => dispatch({ type: 'PREV_STEP' })

  async function handleBookingSubmit() {
    setSubmitError(null)
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
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-10">
        <StepIndicator current={step} />
      </div>

      {submitError && (
        <div className="mb-6 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-600">
          {submitError}
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
  )
}
