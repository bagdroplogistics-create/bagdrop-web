'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Lock, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PhoneInput } from '@/components/ui/phone-input'
import { cn } from '@/lib/utils'
import { TITLE_OPTIONS } from '@/lib/constants'
import { INITIAL_BOOKING_STATE, isStep4Valid } from '@/lib/booking-types'
import type { BookingState, ServiceId } from '@/lib/booking-types'
import { flowUseCases, useCaseById } from '@/lib/use-cases'
import {
  FLOW_CITIES, FLOW_AIRPORTS, FLOW_SLOTS, MODE_COPY, MIN_PIECES, flowQuote, slotLabel, zoneForCityId,
} from '@/lib/flow-pricing'
import { FlowOtp } from './flow-otp'
import { WeddingInquiry } from './wedding-inquiry'
import { FlowWhere, FlowWhen, FlowBags, defaultsFor, whereValid, whenValid, bagsValid } from './flow-steps'

// Customer flow from "Bagdrop Platform.html":
//   1 What → 2 Where → 3 When → 4 Bags → 5 Who → 6 Price (OTP unlocks) → 7 Confirm → request saved
//   → /book/verify (Aadhaar via DigiLocker, AFTER the booking exists) → /book/confirmation
// "Wedding or event" opens the wedding inquiry form instead. No payment: the booking is saved as an
// inquiry (same as today) and payment stays manual.

const LABELS = ['What', 'Where', 'When', 'Bags', 'Who', 'Price', 'Confirm']
const slide = {
  initial: { opacity: 0, x: 20 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -20 },
  transition: { duration: 0.3, ease: 'easeOut' as const },
}
const inr = (n: number) => (n < 0 ? '−' : '') + '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN')

const START: BookingState = {
  ...INITIAL_BOOKING_STATE,
  useCaseId: 'd2a', serviceId: 'airport-delivery',
  ...defaultsFor('d2a'),
  flowStd: MIN_PIECES, flowOdd: 0, flowSlot: '08:00', timeSlotId: '08:00 – 10:00',
  bags: [{ type: 'travel', quantity: MIN_PIECES }],
  residency: 'in',
}

interface Props { useCases: { id: string; label: string; tagline: string }[]; identityGate?: boolean }

export function BookingFlow({ useCases, identityGate = true }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [weddingForm, setWeddingForm] = useState(false)
  const [booking, setBooking] = useState<BookingState>(START)
  const [payerOther, setPayerOther] = useState(false)
  const [payerName, setPayerName] = useState('')
  const [payerContact, setPayerContact] = useState('')

  const [token, setToken] = useState<string | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const patch = (p: Partial<BookingState>) => setBooking(b => ({ ...b, ...p }))
  const go = (n: number) => { setStep(n); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const cases = useMemo(() => {
    if (!useCases.length) return flowUseCases({})
    return useCases.map(u => useCaseById(u.id)).filter((u): u is NonNullable<typeof u> => !!u)
  }, [useCases])

  const def = useCaseById(booking.useCaseId)
  const mode = def?.mode ?? 'road'

  const quote = useMemo(() => flowQuote({
    mode, uc: booking.useCaseId ?? '',
    zoneFrom: zoneForCityId(booking.fromCity), zoneTo: zoneForCityId(booking.toCity),
    std: booking.flowStd ?? MIN_PIECES, odd: booking.flowOdd ?? 0,
    slotFrom: booking.flowSlot ?? null, date: booking.date,
  }), [mode, booking])

  function pickUseCase(id: string) {
    const d = useCaseById(id)
    if (!d) return
    // Each use case has its own defaults and fields, so start its route/reference fresh.
    patch({ useCaseId: id, serviceId: d.service as ServiceId, ...defaultsFor(id), travelReference: '', flightNumber: '' })
  }

  async function submit(intl = false) {
    setSubmitting(true); setError(null)
    const payerNote = payerOther && payerName.trim()
      ? `[Payer] ${payerName.trim()}${payerContact.trim() ? ' (' + payerContact.trim() + ')' : ''}` : ''
    const extra = [
      booking.flowOdd ? `Oversize pieces: ${booking.flowOdd}` : '',
      booking.travelReference?.trim() ? `${MODE_COPY[mode].refLabel || 'Reference'}: ${booking.travelReference.trim()}` : '',
      intl ? '[Identity] International traveller: passport verification by our team required before pickup' : '',
    ]
    const toSend: BookingState = {
      ...booking,
      notes: [booking.notes.trim(), payerNote, ...extra].filter(Boolean).join(' | '),
    }
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          booking: toSend,
          pricing: quote ? { total: Math.round(quote.total), totalBags: quote.actual } : undefined,
          residency: intl ? 'intl' : 'in',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Booking failed')
      sessionStorage.setItem('bagdrop_booking', JSON.stringify({ booking: toSend, trackingId: data.trackingId }))
      // Indian travellers verify their Aadhaar right after the request is saved.
      router.push(intl || !identityGate ? '/book/confirmation?id=' + data.trackingId : '/book/verify?id=' + data.trackingId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Booking failed. Please try again.')
      setSubmitting(false)
    }
  }

  if (weddingForm) {
    return <div className="px-4 py-10 sm:px-6 lg:px-8"><WeddingInquiry onBack={() => setWeddingForm(false)} /></div>
  }

  const labelOf = (id: string | null) =>
    FLOW_CITIES.find(c => c.id === id)?.label ?? FLOW_AIRPORTS.find(a => a.id === id)?.label ?? id ?? '—'
  const slotObj = FLOW_SLOTS.find(s => s.from === booking.flowSlot)
  const pieces = `${booking.flowStd ?? MIN_PIECES} bag${(booking.flowStd ?? MIN_PIECES) !== 1 ? 's' : ''}${booking.flowOdd ? ` + ${booking.flowOdd} oversize` : ''}`
  const intl = booking.residency === 'intl'

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex gap-1.5">
            {LABELS.map((l, i) => <div key={l} className={cn('h-1.5 flex-1 rounded-full', i + 1 <= step ? 'bg-brand' : 'bg-border')} />)}
          </div>
          <p className="mt-2 text-xs font-medium text-text-muted">Step {step} of {LABELS.length} · {LABELS[step - 1]}</p>
        </div>

        {error && <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>}

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0">
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div key="s1" {...slide} className="space-y-5 rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6">
                  <div>
                    <h2 className="font-display text-xl font-semibold text-text-primary">What are we carrying for you?</h2>
                    <p className="mt-1 text-sm text-text-muted">Pick one. Everything else adapts to it.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {cases.map(u => {
                      const sel = booking.useCaseId === u.id
                      return (
                        <button key={u.id} type="button" onClick={() => pickUseCase(u.id)} aria-pressed={sel}
                          className={cn('rounded-2xl border-2 p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                            sel ? 'border-brand bg-brand-light' : 'border-border bg-white hover:border-brand/40')}>
                          <p className={cn('whitespace-nowrap text-[15px] font-semibold', sel ? 'text-brand' : 'text-text-primary')}>{u.label}</p>
                          <p className="mt-0.5 text-sm text-text-muted">{u.tagline}</p>
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex justify-end">
                    <Button variant="primary" size="lg" disabled={!booking.serviceId}
                      onClick={() => (booking.useCaseId === 'wed' ? setWeddingForm(true) : go(2))}>
                      Continue <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="s2" {...slide} className="space-y-5 rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6">
                  <FlowWhere state={booking} onChange={patch} />
                  <Nav onBack={() => go(1)} onNext={() => go(3)} nextOk={whereValid(booking)} />
                </motion.div>
              )}

              {step === 3 && (
                <motion.div key="s3" {...slide} className="space-y-5 rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6">
                  <FlowWhen state={booking} onChange={patch} />
                  <Nav onBack={() => go(2)} onNext={() => go(4)} nextOk={whenValid(booking)} />
                </motion.div>
              )}

              {step === 4 && (
                <motion.div key="s4" {...slide} className="space-y-5 rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6">
                  <FlowBags state={booking} onChange={patch} />
                  <Nav onBack={() => go(3)} onNext={() => go(5)} nextOk={bagsValid(booking)} />
                </motion.div>
              )}

              {step === 5 && (
                <motion.div key="s5" {...slide} className="space-y-5 rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6">
                  <div>
                    <h2 className="font-display text-xl font-semibold text-text-primary">Who is travelling?</h2>
                    <p className="mt-1 text-sm text-text-muted">Name exactly as on the ID you will verify with. The bags are released only to this name or the OTP they share.</p>
                  </div>
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-[110px_1fr]">
                      <div className="space-y-1.5">
                        <label htmlFor="f-title" className="block text-sm font-medium text-text-primary">Title</label>
                        <select id="f-title" className="input-base" value={booking.title} onChange={e => patch({ title: e.target.value as BookingState['title'] })}>
                          {TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="f-name" className="block text-sm font-medium text-text-primary">Traveller&apos;s full name <span className="text-brand">*</span></label>
                        <input id="f-name" className="input-base" placeholder="As on Aadhaar or passport" autoComplete="name" value={booking.name} onChange={e => patch({ name: e.target.value })} />
                        <p className="text-[11px] text-text-muted">Enter your full name as on your ID, for example “Monaliben Keyur Patel”. You verify your Aadhaar in step 7.</p>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label htmlFor="phone" className="block text-sm font-medium text-text-primary">Mobile <span className="text-brand">*</span></label>
                        <PhoneInput id="phone" variant="public" countryIso2={booking.countryIso2 || 'IN'} nationalNumber={booking.phone}
                          onCountryChange={iso2 => patch({ countryIso2: iso2 })} onNumberChange={d => patch({ phone: d })} placeholder="98765 43210" required />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="f-email" className="block text-sm font-medium text-text-primary">Email</label>
                        <input id="f-email" type="email" className="input-base" placeholder="name@mail.com" autoComplete="email" value={booking.email} onChange={e => patch({ email: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="f-res" className="block text-sm font-medium text-text-primary">Traveller is</label>
                      <select id="f-res" className="input-base" value={booking.residency ?? 'in'} onChange={e => patch({ residency: e.target.value as 'in' | 'intl' })}>
                        <option value="in">Indian resident · Aadhaar</option>
                        <option value="intl">International · passport</option>
                      </select>
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
                      <input id="f-notes" className="input-base" placeholder="Gate code, call before arriving, fragile item inside" value={booking.notes} onChange={e => patch({ notes: e.target.value })} />
                    </div>
                  </div>
                  <Nav onBack={() => go(4)} onNext={() => go(6)} nextOk={isStep4Valid(booking)} nextLabel="See my price" />
                </motion.div>
              )}

              {step === 6 && (
                <motion.div key="s6" {...slide} className="space-y-5 rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6">
                  <div>
                    <h2 className="font-display text-xl font-semibold text-text-primary">Your price</h2>
                    <p className="mt-1 text-sm text-text-muted">One code to your mobile unlocks it.</p>
                  </div>
                  <div>
                    {unlocked ? (
                      <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                        <ShieldCheck className="h-5 w-5 shrink-0" />
                        <span>{quote ? 'Mobile verified. Your estimate is on the right. Our team confirms the final amount.' : 'Mobile verified. We confirm the route and price for this city within the hour.'}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-start gap-3">
                        <p className="flex items-center gap-2 text-sm text-text-secondary"><Lock className="h-4 w-4" /> Verify <b>{booking.phone || 'your mobile'}</b> to unlock your price.</p>
                        <FlowOtp phone={booking.phone} countryIso2={booking.countryIso2} disabled={!isStep4Valid(booking)}
                          onVerified={t => { setToken(t); setUnlocked(true) }} />
                      </div>
                    )}
                  </div>
                  <Nav onBack={() => go(5)} onNext={() => go(7)} nextOk={unlocked && !!token} nextLabel="Continue" />
                </motion.div>
              )}

              {step === 7 && (
                <motion.div key="s7" {...slide}>
                  <div className="rounded-3xl border border-border bg-white p-6 shadow-sm sm:p-8">
                    <h2 className="font-display text-xl font-bold text-text-primary">Confirm your request</h2>
                    <p className="mt-2 text-sm text-text-secondary">
                      {intl
                        ? 'International travellers are verified with a passport. Online passport checks are not live yet, so our team will contact you on WhatsApp to verify the passport before pickup. Your request is saved now.'
                        : !identityGate ? 'Your request is saved and our team will contact you to confirm availability and price.'
                        : 'Your request is saved first. Next, you verify the traveller with Aadhaar through DigiLocker. It takes about a minute and is needed before pickup.'}
                    </p>
                    {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
                    <div className="mt-6 flex gap-3">
                      <Button variant="secondary" size="lg" onClick={() => go(6)} disabled={submitting}>Back</Button>
                      <Button variant="primary" size="lg" className="flex-1" onClick={() => submit(intl)} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit booking request'}</Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Summary */}
          <aside className="order-first space-y-4 lg:order-last">
            <div className="space-y-3 rounded-2xl border border-border bg-white p-5 text-sm lg:sticky lg:top-24">
              <h3 className="font-display text-sm font-semibold text-text-primary">Your booking</h3>
              <Row k="Service" v={def?.label ?? '—'} />
              <Row k="Route" v={booking.fromCity && booking.toCity ? `${labelOf(booking.fromCity)} → ${labelOf(booking.toCity)}` : '—'} />
              <Row k="Travel" v={[booking.travelReference?.trim(), booking.date].filter(Boolean).join(' · ') || '—'} />
              <Row k="Pickup" v={slotObj ? slotLabel(slotObj) : '—'} />
              <Row k="Pieces" v={pieces} />
              <Row k="Traveller" v={booking.name.trim() || '—'} />
              <div className="mt-2 rounded-xl bg-text-primary p-4 text-white">
                <p className="text-[11px] uppercase tracking-wide opacity-70">{unlocked ? 'Estimated price' : 'Price after one OTP'}</p>
                <div className={cn(!unlocked && 'pointer-events-none select-none blur-md')} aria-hidden={!unlocked}>
                  {quote ? (
                    <>
                      <p className="mt-1 text-3xl font-bold">{inr(quote.total)}</p>
                      <p className="mt-1 text-xs opacity-75">per piece {inr(quote.perPiece)} · {quote.actual} actual, {quote.billed} billed · incl. GST</p>
                      <div className="mt-2 space-y-1 text-xs opacity-85">
                        <Line k={`Rate ₹${quote.rate.toLocaleString('en-IN')} × ${quote.billed}`} v={inr(quote.base)} />
                        <Line k="Oversize" v={quote.oversize ? inr(quote.oversize) : '—'} />
                        <Line k={MODE_COPY[mode].handling} v={quote.handling ? inr(quote.handling) : '—'} />
                        <Line k="Slab" v={quote.slab ? inr(quote.slab) : '—'} />
                        <Line k="Peak and slot" v={quote.peak ? inr(quote.peak) : '—'} />
                        <Line k="GST 18%" v={inr(quote.gst)} />
                      </div>
                    </>
                  ) : (
                    <p className="mt-1 text-sm">We confirm the route and price for this city within the hour.</p>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-text-muted">From ₹2,500 per bag · minimum 2 · estimate only, our team confirms the final amount before pickup. No payment now.</p>
            </div>

            <div className="rounded-2xl border border-border bg-white p-5 text-sm">
              <h3 className="mb-2 font-display text-sm font-semibold text-text-primary">Good to know</h3>
              <ul className="space-y-2 text-text-secondary">
                <li><b className="font-mono text-[11px] text-text-muted">Seal</b> · Each bag gets a numbered RFID seal and 4 photos at pickup. You get them on WhatsApp.</li>
                <li><b className="font-mono text-[11px] text-text-muted">Airport</b> · Bags are at the Bagdrop counter 4 hours before departure. Show your booking reference and ID at the counter.</li>
                <li><b className="font-mono text-[11px] text-text-muted">Weight</b> · We weigh at pickup. Over 32 kg becomes oversize with your approval before it leaves.</li>
                <li><b className="font-mono text-[11px] text-text-muted">Changes</b> · Free reschedule up to 6 hours before pickup. Flight delays re-plan automatically.</li>
                <li><b className="font-mono text-[11px] text-text-muted">Privacy</b> · Identity is checked by a licensed provider. We store a reference, not your ID.</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}

function Nav({ onBack, onNext, nextOk, nextLabel = 'Continue' }: { onBack: () => void; onNext: () => void; nextOk: boolean; nextLabel?: string }) {
  return (
    <div className="flex justify-between pt-2">
      <Button variant="secondary" size="lg" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Back</Button>
      <Button variant="primary" size="lg" disabled={!nextOk} onClick={onNext}>{nextLabel} <ArrowRight className="h-4 w-4" /></Button>
    </div>
  )
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-2"><span className="text-text-muted">{k}</span><span className="text-right font-medium text-text-primary">{v}</span></div>
}
function Line({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-2"><span>{k}</span><span className="font-mono">{v}</span></div>
}
