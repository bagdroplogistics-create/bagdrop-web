'use client'

// ─────────────────────────────────────────────────────────────
// SKYBIRD PARTNER DASHBOARD — booking engine
//
// Deliberately a SEPARATE file from booking-engine.tsx (not a shared/
// parameterized component) so the live BagDrop website booking form can
// never be touched or regressed by Skybird-specific changes. Reuses every
// step component (StepRoute, StepBags, StepSchedule, StepReview,
// BookingOtpModal) and the pricing engine completely unmodified — same
// fields, same layout, same validation, same conditional logic (wedding
// details, airport flight fields, add-ons), same OTP verification flow.
//
// Only two things differ from the public /book flow:
//   1. Submits to /api/skybird/bookings (Skybird-authenticated, force-tags
//      source='skybird' / partner_name='Skybird USA' server-side) instead
//      of the public /api/bookings.
//   2. On success, shows an inline confirmation inside the Skybird
//      dashboard shell instead of redirecting to the public
//      /book/confirmation marketing page — an internal partner tool has no
//      reason to leave the dashboard.
//
// Keep this file's steps in sync with components/booking/booking-engine.tsx
// if the underlying booking data model ever changes.
// ─────────────────────────────────────────────────────────────

import { useReducer, useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { CheckCircle2, Plus, List } from 'lucide-react'
import { StepIndicator }    from './step-indicator'
import { StepRoute }        from './step-route'
import { StepBags }         from './step-bags'
import { StepSchedule }     from './step-schedule'
import { StepReview }       from './step-review'
import { BookingOtpModal }  from './booking-otp-modal'
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

interface SkybirdBookingEngineProps {
  /** Skybird partner access key from sessionStorage — sent as ?key= to the scoped API. */
  skybirdKey: string
  /** Called after a successful submission — parent can refresh the inquiries list. */
  onSubmitted?: (trackingId: string) => void
  /** Navigate back to the inquiries list. */
  onBackToList?: () => void
  /**
   * Edit mode: when set, this is the id of an existing booking to update
   * instead of creating a new one. Requires `initialState` to pre-fill the
   * form. Saving PATCHes /api/skybird/bookings/[id] and skips the OTP
   * re-verification step entirely (the customer was already verified once,
   * at creation — re-sending an OTP on every correction would be both
   * unnecessary and annoying).
   */
  editBookingId?: string
  /** Pre-filled form state when editing — ignored when editBookingId is unset. */
  initialState?: BookingState
}

export function SkybirdBookingEngine({ skybirdKey, onSubmitted, onBackToList, editBookingId, initialState }: SkybirdBookingEngineProps) {
  const isEditMode = !!editBookingId
  const [{ step, booking }, dispatch] = useReducer(
    reducer,
    isEditMode && initialState ? { step: 1, booking: initialState } : INITIAL
  )
  const [submitting,  setSubmitting]  = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showOtpModal, setShowOtpModal] = useState(false)
  const [confirmedTrackingId, setConfirmedTrackingId] = useState<string | null>(null)
  const [savedEdit, setSavedEdit] = useState(false)

  const pricing = useMemo(() => calculatePrice(booking), [booking])

  const patch = (payload: Partial<BookingState>) => dispatch({ type: 'PATCH', payload })
  const next  = () => { dispatch({ type: 'NEXT_STEP' }); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const back  = () => { dispatch({ type: 'PREV_STEP' }); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  // Called when the agent clicks "Confirm Booking" (create) or "Save
  // Changes" (edit) on the review step. Create still verifies the
  // customer's mobile via OTP before the inquiry is created, exactly as
  // before. Edit saves immediately — no OTP.
  function handleBookingSubmit() {
    setSubmitError(null)
    if (isEditMode) { saveEdit(); return }
    setShowOtpModal(true)
  }

  async function saveEdit() {
    if (!editBookingId) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/skybird/bookings/${editBookingId}?key=${encodeURIComponent(skybirdKey)}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ booking, pricing }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not save changes')
      setSavedEdit(true)
      onSubmitted?.(data.trackingId ?? '')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not save changes. Please try again.')
      setSubmitting(false)
    }
  }

  async function handleOtpVerified() {
    setShowOtpModal(false)
    setSubmitting(true)

    try {
      const res = await fetch(`/api/skybird/bookings?key=${encodeURIComponent(skybirdKey)}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ booking, pricing }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Submission failed')

      setConfirmedTrackingId(data.trackingId)
      onSubmitted?.(data.trackingId)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed. Please try again.')
      setSubmitting(false)
    }
  }

  function startNewInquiry() {
    dispatch({ type: 'RESET' })
    setConfirmedTrackingId(null)
    setSubmitting(false)
    setSubmitError(null)
  }

  // ── Edit-saved screen ──────────────────────────────────────────────
  if (savedEdit) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Booking updated</h2>
        <p className="mt-2 text-sm text-gray-500">Your changes have been saved to the existing booking.</p>
        <div className="mt-8 flex justify-center">
          <button
            onClick={onBackToList}
            className="flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
          >
            <List className="h-4 w-4" /> Back to My Inquiries
          </button>
        </div>
      </div>
    )
  }

  // ── Success screen (replaces the public /book/confirmation redirect) ──
  if (confirmedTrackingId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Inquiry submitted to Bagdrop</h2>
        <p className="mt-2 text-sm text-gray-500">
          Tracking ID <span className="font-mono font-semibold text-gray-700">{confirmedTrackingId}</span>
          {' '}has been created and is now visible on the Bagdrop Admin Dashboard.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <button
            onClick={startNewInquiry}
            className="flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Submit Another
          </button>
          <button
            onClick={onBackToList}
            className="flex items-center gap-2 rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <List className="h-4 w-4" /> View My Inquiries
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <AnimatePresence>
        {showOtpModal && (
          <BookingOtpModal
            phone={booking.phone}
            countryIso2={booking.countryIso2}
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
              <div className="flex items-center gap-3 rounded-xl bg-sky-50 border border-sky-200 p-4 text-sm text-sky-700">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-600 border-t-transparent shrink-0" />
                {isEditMode ? 'Saving changes…' : 'Submitting inquiry to Bagdrop…'}
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
            <StepSchedule
              key="step-schedule"
              state={booking}
              onChange={patch}
              onNext={next}
              onBack={back}
              // Insurance Upgrade isn't offered to Skybird's customers —
              // hidden here only; the public site's StepSchedule usage in
              // booking-engine.tsx doesn't pass this, so it's unaffected.
              hiddenAddonIds={['insurance']}
            />
          )}
          {step === 4 && (
            <StepReview
              key="step-review"
              state={booking}
              onChange={patch}
              onBack={back}
              onBook={handleBookingSubmit}
              submitLabel={isEditMode ? 'Save Changes' : 'Confirm Booking'}
              hideVerificationNote={isEditMode}
            />
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
