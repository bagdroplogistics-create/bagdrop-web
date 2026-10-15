'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowLeftRight, ArrowRight, Lock, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PhoneInput } from '@/components/ui/phone-input'
import { cn } from '@/lib/utils'
import { BOOKING_LOCATIONS, TITLE_OPTIONS, SERVICE_TYPES, COVERAGE_CITIES } from '@/lib/constants'
import { INITIAL_BOOKING_STATE, isStep1Valid, isStep2Valid, isStep3Valid, isStep4Valid } from '@/lib/booking-types'
import type { BookingState, CityId, ServiceId } from '@/lib/booking-types'
import { calculatePrice } from '@/lib/pricing'
import { flowUseCases, useCaseById } from '@/lib/use-cases'
import { StepBags } from './step-bags'
import { StepSchedule } from './step-schedule'
import { BookingOtpModal } from './booking-otp-modal'
import { StepIdentity, DRAFT_KEY, OK_KEY } from './step-identity'

// New customer flow (Bagdrop Platform blueprint):
//   1 What  →  2 Where  →  3 When  →  4 Bags  →  5 Who  →  6 Price (OTP unlocks)  →  7 Verify identity → request saved
// Reuses the live cities, schedule/bag steps, pricing function and OTP. No payment: the booking is
// saved as an inquiry (same as today) and payment stays manual.

const LABELS = ['What', 'Where', 'When', 'Bags', 'Who', 'Price', 'Verify']
const OTHERS = '__others__'
const slide = {
  initial: { opacity: 0, x: 20 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -20 },
  transition: { duration: 0.3, ease: 'easeOut' as const },
}

interface Props { useCases: { id: string; label: string; tagline: string }[] }

export function BookingFlow({ useCases }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  // Like the HTML blueprint, "Home → Airport" is preselected.
  const [booking, setBooking] = useState<BookingState>({
    ...INITIAL_BOOKING_STATE, useCaseId: 'd2a', serviceId: 'airport-delivery',
  })
  const [payerOther, setPayerOther] = useState(false)
  const [payerName, setPayerName] = useState('')
  const [payerContact, setPayerContact] = useState('')

  const [showOtp, setShowOtp] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  const [verified, setVerified] = useState<{ maskedNumber: string | null; verifiedName: string | null; verificationId: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const patch = (p: Partial<BookingState>) => setBooking(b => ({ ...b, ...p }))
  const go = (n: number) => { setStep(n); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  // The 8 use cases from the HTML blueprint, in its order (minus any an admin switched off).
  const cases = useMemo(() => {
    if (!useCases.length) return flowUseCases({})
    return useCases.map(u => useCaseById(u.id)).filter((u): u is NonNullable<typeof u> => !!u)
  }, [useCases])

  const pricing = useMemo(() => { try { return calculatePrice(booking) } catch { return null } }, [booking])

  // Returning from DigiLocker (/book/identity-return → /book?identity=done): restore the draft.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('identity') !== 'done') return
    try {
      const draft = sessionStorage.getItem(DRAFT_KEY)
      const ok = sessionStorage.getItem(OK_KEY)
      if (!draft || !ok) return
      setBooking(JSON.parse(draft))
      setVerified(JSON.parse(ok))
      setUnlocked(true)
      setStep(7)
      import('@/lib/supabase-browser').then(async ({ supabaseBrowser }) => {
        const { data } = await supabaseBrowser.auth.getSession()
        setToken(data.session?.access_token ?? null)
      })
      window.history.replaceState({}, '', '/book')
    } catch { /* ignore a corrupt draft */ }
  }, [])

  function pickUseCase(id: string) {
    const def = useCaseById(id)
    if (!def) return
    patch({ useCaseId: id, serviceId: def.service as ServiceId })
  }

  async function submit() {
    setSubmitting(true); setError(null)
    const payerNote = payerOther && payerName.trim()
      ? `[Payer] ${payerName.trim()}${payerContact.trim() ? ' (' + payerContact.trim() + ')' : ''}` : ''
    const toSend: BookingState = {
      ...booking,
      notes: [booking.notes.trim(), payerNote].filter(Boolean).join(' | '),
    }
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ booking: toSend, pricing, identityVerificationId: verified?.verificationId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Booking failed')
      sessionStorage.removeItem(DRAFT_KEY); sessionStorage.removeItem(OK_KEY)
      sessionStorage.setItem('bagdrop_booking', JSON.stringify({ booking: toSend, trackingId: data.trackingId }))
      router.push('/book/confirmation?id=' + data.trackingId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Booking failed. Please try again.')
      setSubmitting(false)
    }
  }

  const city = (id: string | null) => COVERAGE_CITIES.find(c => c.id === id)?.label ?? id ?? '—'

  return (
    <>
      <AnimatePresence>
        {showOtp && (
          <BookingOtpModal
            phone={booking.phone}
            countryIso2={booking.countryIso2}
            establishSession
            onClose={() => setShowOtp(false)}
            onVerified={t => { setShowOtp(false); if (t) { setToken(t); setUnlocked(true) } }}
          />
        )}
      </AnimatePresence>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex gap-1.5">
            {LABELS.map((l, i) => (
              <div key={l} className={cn('h-1.5 flex-1 rounded-full', i + 1 <= step ? 'bg-brand' : 'bg-border')} />
            ))}
          </div>
          <p className="mt-2 text-xs font-medium text-text-muted">Step {step} of {LABELS.length} · {LABELS[step - 1]}</p>
        </div>

        {error && <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>}

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0">
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div key="s1" {...slide} className="space-y-5">
                  <div>
                    <h2 className="font-display text-xl font-semibold text-text-primary">What are we carrying for you?</h2>
                    <p className="mt-1 text-sm text-text-muted">Pick one. Everything else adapts to it.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {cases.map(u => {
                      const sel = booking.useCaseId === u.id
                      return (
                        <button key={u.id} type="button" onClick={() => pickUseCase(u.id)} aria-pressed={sel}
                          className={cn('rounded-2xl border-2 p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                            sel ? 'border-brand bg-brand-light' : 'border-border bg-white hover:border-brand/40')}>
                          <p className={cn('text-base font-semibold', sel ? 'text-brand' : 'text-text-primary')}>{u.label}</p>
                          <p className="mt-0.5 text-sm text-text-muted">{u.tagline}</p>
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex justify-end">
                    <Button variant="primary" size="lg" disabled={!booking.serviceId} onClick={() => go(2)}>Continue <ArrowRight className="h-4 w-4" /></Button>
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="s2" {...slide} className="space-y-5">
                  <WhereStep state={booking} onChange={patch} />
                  <div className="flex justify-between">
                    <Button variant="secondary" size="lg" onClick={() => go(1)}><ArrowLeft className="h-4 w-4" /> Back</Button>
                    <Button variant="primary" size="lg" disabled={!isStep1Valid(booking)} onClick={() => go(3)}>Continue <ArrowRight className="h-4 w-4" /></Button>
                  </div>
                </motion.div>
              )}

              {step === 3 && <StepSchedule key="s3" state={booking} onChange={patch} onNext={() => go(4)} onBack={() => go(2)} />}
              {step === 4 && <StepBags key="s4" state={booking} onChange={patch} onNext={() => go(5)} onBack={() => go(3)} />}

              {step === 5 && (
                <motion.div key="s5" {...slide} className="space-y-5">
                  <div>
                    <h2 className="font-display text-xl font-semibold text-text-primary">Who is travelling?</h2>
                    <p className="mt-1 text-sm text-text-muted">Name exactly as on the Aadhaar you will verify with. Bags are released only to this name.</p>
                  </div>
                  <div className="space-y-4 rounded-2xl border border-border bg-white p-5">
                    <div className="grid gap-4 sm:grid-cols-[110px_1fr]">
                      <div className="space-y-1.5">
                        <label htmlFor="f-title" className="block text-sm font-medium text-text-primary">Title</label>
                        <select id="f-title" className="input-base" value={booking.title} onChange={e => patch({ title: e.target.value as BookingState['title'] })}>
                          {TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="f-name" className="block text-sm font-medium text-text-primary">Full name <span className="text-brand">*</span></label>
                        <input id="f-name" className="input-base" placeholder="As on Aadhaar" autoComplete="name" value={booking.name} onChange={e => patch({ name: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="phone" className="block text-sm font-medium text-text-primary">Mobile number <span className="text-brand">*</span></label>
                      <PhoneInput id="phone" variant="public" countryIso2={booking.countryIso2 || 'IN'} nationalNumber={booking.phone}
                        onCountryChange={iso2 => patch({ countryIso2: iso2 })} onNumberChange={d => patch({ phone: d })} placeholder="98765 43210" required />
                      <p className="text-[11px] text-text-muted">We send a one-time code to this number.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="f-email" className="block text-sm font-medium text-text-primary">Email (optional)</label>
                      <input id="f-email" type="email" className="input-base" placeholder="name@example.com" value={booking.email} onChange={e => patch({ email: e.target.value })} />
                    </div>
                    <label className="flex items-start gap-3 text-sm text-text-secondary">
                      <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={payerOther} onChange={e => setPayerOther(e.target.checked)} />
                      <span>Someone else is paying (family abroad, company, planner)</span>
                    </label>
                    {payerOther && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <input className="input-base" placeholder="Payer name" value={payerName} onChange={e => setPayerName(e.target.value)} />
                        <input className="input-base" placeholder="Payer mobile or email" value={payerContact} onChange={e => setPayerContact(e.target.value)} />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <label htmlFor="f-notes" className="block text-sm font-medium text-text-primary">Anything we should know (optional)</label>
                      <textarea id="f-notes" rows={3} className="input-base resize-none" placeholder="Gate code, call before arriving, fragile item inside" value={booking.notes} onChange={e => patch({ notes: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <Button variant="secondary" size="lg" onClick={() => go(4)}><ArrowLeft className="h-4 w-4" /> Back</Button>
                    <Button variant="primary" size="lg" disabled={!isStep4Valid(booking)} onClick={() => go(6)}>See my price <ArrowRight className="h-4 w-4" /></Button>
                  </div>
                </motion.div>
              )}

              {step === 6 && (
                <motion.div key="s6" {...slide} className="space-y-5">
                  <div>
                    <h2 className="font-display text-xl font-semibold text-text-primary">Your price</h2>
                    <p className="mt-1 text-sm text-text-muted">One code to your mobile unlocks it.</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-white p-5">
                    {unlocked ? (
                      <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                        <ShieldCheck className="h-5 w-5 shrink-0" />
                        <span>Mobile verified. The estimate is shown on the right. Our team confirms the final amount.</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-start gap-3">
                        <p className="flex items-center gap-2 text-sm text-text-secondary"><Lock className="h-4 w-4" /> Verify <b>{booking.phone || 'your mobile'}</b> to unlock your price.</p>
                        <Button variant="primary" size="lg" onClick={() => setShowOtp(true)} disabled={!isStep4Valid(booking)}>Send code</Button>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between">
                    <Button variant="secondary" size="lg" onClick={() => go(5)}><ArrowLeft className="h-4 w-4" /> Back</Button>
                    <Button variant="primary" size="lg" disabled={!unlocked || !token} onClick={() => go(7)}>Verify and book <ArrowRight className="h-4 w-4" /></Button>
                  </div>
                </motion.div>
              )}

              {step === 7 && (
                <motion.div key="s7" {...slide}>
                  <StepIdentity
                    booking={booking} accessToken={token} verified={verified} submitting={submitting}
                    onBack={() => { setVerified(null); go(6) }}
                    onConfirm={submit}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Summary */}
          <aside className="order-first lg:order-last">
            <div className="space-y-3 rounded-2xl border border-border bg-white p-5 text-sm lg:sticky lg:top-24">
              <h3 className="font-display text-sm font-semibold text-text-primary">Your booking</h3>
              <Row k="Service" v={useCaseById(booking.useCaseId)?.label ?? SERVICE_TYPES.find(s => s.id === booking.serviceId)?.label ?? '—'} />
              <Row k="Route" v={booking.fromCity && booking.toCity ? `${city(booking.fromCity)} → ${city(booking.toCity)}` : '—'} />
              <Row k="Pickup" v={booking.date || '—'} />
              <Row k="Time" v={booking.timeSlotId ?? '—'} />
              <Row k="Bags" v={String(booking.bags.reduce((n, b) => n + b.quantity, 0) || '—')} />
              <Row k="Traveller" v={booking.name.trim() || '—'} />
              <div className="mt-2 rounded-xl bg-text-primary p-4 text-white">
                <p className="text-[11px] uppercase tracking-wide opacity-70">{unlocked ? 'Estimated price' : 'Price after one OTP'}</p>
                <div className={cn(!unlocked && 'pointer-events-none select-none blur-md')} aria-hidden={!unlocked}>
                  <p className="mt-1 text-3xl font-bold">₹{pricing ? pricing.total.toLocaleString('en-IN') : '0'}</p>
                  {pricing && (
                    <div className="mt-2 space-y-1 text-xs opacity-80">
                      <Line k="Bags" v={pricing.bagSubtotal - pricing.multiDiscount} />
                      <Line k="Route and service" v={pricing.routeFee + pricing.serviceAdjust} />
                      {pricing.addonsTotal > 0 && <Line k="Add-ons" v={pricing.addonsTotal} />}
                      <Line k="GST" v={pricing.gst} />
                    </div>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-text-muted">Estimate. Final amount is confirmed by our team before pickup. No payment now.</p>
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-2"><span className="text-text-muted">{k}</span><span className="text-right font-medium text-text-primary">{v}</span></div>
}
function Line({ k, v }: { k: string; v: number }) {
  return <div className="flex justify-between"><span>{k}</span><span>₹{Math.round(v).toLocaleString('en-IN')}</span></div>
}

function WhereStep({ state, onChange }: { state: BookingState; onChange: (p: Partial<BookingState>) => void }) {
  const [fromOthers, setFromOthers] = useState(false)
  const [toOthers, setToOthers] = useState(false)
  const known = BOOKING_LOCATIONS.map(c => c.id as string)
  const fromVal = fromOthers ? OTHERS : (known.includes(state.fromCity ?? '') ? (state.fromCity ?? '') : '')
  const toVal = toOthers ? OTHERS : (known.includes(state.toCity ?? '') ? (state.toCity ?? '') : '')

  function setFrom(v: string) {
    if (v === OTHERS) { setFromOthers(true); onChange({ fromCity: null }); return }
    setFromOthers(false); const id = (v as CityId) || null
    onChange({ fromCity: id, toCity: state.toCity === id ? null : state.toCity })
  }
  function setTo(v: string) {
    if (v === OTHERS) { setToOthers(true); onChange({ toCity: null }); return }
    setToOthers(false); onChange({ toCity: (v as CityId) || null })
  }
  function swap() {
    const a = fromOthers, b = toOthers
    setFromOthers(b); setToOthers(a)
    onChange({ fromCity: state.toCity, toCity: state.fromCity })
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold text-text-primary">Where from, where to?</h2>
        <p className="mt-1 text-sm text-text-muted">Not in the list? Choose Others and tell us the city. We confirm whether we can serve it.</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <label htmlFor="w-from" className="block text-sm font-medium text-text-primary">Pickup city <span className="text-brand">*</span></label>
          <select id="w-from" className="input-base" value={fromVal} onChange={e => setFrom(e.target.value)}>
            <option value="">Select pickup location</option>
            {BOOKING_LOCATIONS.filter(c => c.id !== state.toCity).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            <option value={OTHERS}>Others</option>
          </select>
          {fromOthers && <input className="input-base mt-2" autoFocus placeholder="Enter your city or location" value={state.fromCity ?? ''} onChange={e => onChange({ fromCity: (e.target.value as CityId) || null })} />}
        </div>
        <button type="button" onClick={swap} aria-label="Swap pickup and drop"
          className="mx-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-white text-text-muted hover:border-brand/40 hover:text-brand">
          <ArrowLeftRight className="h-4 w-4" />
        </button>
        <div className="flex-1 space-y-1.5">
          <label htmlFor="w-to" className="block text-sm font-medium text-text-primary">Delivery city <span className="text-brand">*</span></label>
          <select id="w-to" className="input-base" value={toVal} onChange={e => setTo(e.target.value)}>
            <option value="">Select drop location</option>
            {BOOKING_LOCATIONS.filter(c => c.id !== state.fromCity).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            <option value={OTHERS}>Others</option>
          </select>
          {toOthers && <input className="input-base mt-2" autoFocus placeholder="Enter your city or location" value={state.toCity ?? ''} onChange={e => onChange({ toCity: (e.target.value as CityId) || null })} />}
        </div>
      </div>
    </div>
  )
}

// Re-exported for tests / future step gating.
export const FLOW_VALIDATORS = { isStep1Valid, isStep2Valid, isStep3Valid, isStep4Valid }
