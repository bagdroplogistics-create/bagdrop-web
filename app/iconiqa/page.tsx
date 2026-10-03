'use client'

import { useState, useEffect, useRef } from 'react'
import { TIME_OPTIONS } from '@/lib/time-options'

// ─────────────────────────────────────────────────────────────
// ICONIQA Hotel, Mumbai International Airport × Bagdrop
// Guest-facing baggage delivery landing page.
//
// Structure/UX (smooth scroll, reveal-on-scroll sections, mobile drawer
// nav, isolated booking-form component for render performance, request-ID
// success state) is modeled on app/y2k/page.tsx, the approved reference
// for this pattern. The visual identity below is entirely new — a
// premium hotel/airport palette (deep navy + brass on ivory) and Playfair
// Display/Inter typography (app/iconiqa/layout.tsx) — no wedding styling,
// colors, or copy carried over.
//
// Founder-supplied, real ICONIQA Hotel + Mumbai Airport photography
// (2026-10-02) is used throughout this page — hero background, the Hotel
// Context section, the Guest Experience section, and a dedicated corridor
// banner between Services and How It Works. No stock or AI-generated
// imagery is used anywhere; every photo is an unedited property/airport
// photo supplied by the Founder. Sections still on original CSS/SVG
// (Service cards, the How It Works step diagram, FAQ) stay that way until
// more real photography is supplied — no image-generation tool is
// available in this environment to fabricate the rest.
//
// Submitting this form creates a `bookings` row with status 'inquiry' via
// app/api/iconiqa/inquiry/route.ts — never a confirmed booking. See that
// route's own header comment for the full reasoning and the existing
// quotation → approval → payment workflow this feeds into.
// ─────────────────────────────────────────────────────────────

const IMG_HOTEL_EXTERIOR = '/images/iconiqa-hotel-building.jpg'
const IMG_HOTEL_EXTERIOR_NIGHT = '/images/iconiqa-hotel-exterior-night.jpg'
const IMG_ROOFTOP_POOL = '/images/iconiqa-rooftop-pool-airport-view.webp'
// Founder-supplied ICONIQA logo — white mark + wordmark on a transparent
// background. Used as-is on dark backgrounds (hero/drawer/footer); on the
// nav bar, which turns light once the page is scrolled, it's rendered with
// filter:brightness(0) to flip it to a black silhouette on the fly rather
// than needing a second exported asset from the Founder.
const IMG_LOGO = '/images/iconiqa-logo-white.png'
// Bagdrop's existing white wordmark (already used the same way on
// app/y2k/page.tsx) — shown next to the ICONIQA mark instead of a plain
// "× Bagdrop" text label. Root-cause fix (2026-10-02): the file is the
// logo in its natural orange color, not pre-whitened — rendering it
// directly (or with a plain brightness(0), which only darkens it) is why
// it was unreadable. app/y2k/page.tsx's own pattern is the fix: apply
// `brightness(0) invert(1)` to force a white silhouette on dark
// backgrounds, and plain `brightness(0)` for black once the nav goes
// light — see every <img src={IMG_BAGDROP_LOGO}> usage below.
const IMG_BAGDROP_LOGO = '/logo-white.png'
// Additional founder-supplied ICONIQA photos (2026-10-02) — all real,
// unedited property photography, no stock/fabricated images used anywhere
// on this page. The *-luggage photos are real guests with real suitcases
// in the ICONIQA lobby/corridor (not staged by us) — used in place of the
// earlier empty-room shots now that these were supplied.
const IMG_LOBBY_RECEPTION = '/images/iconiqa-guests-lobby-luggage.png'
// Founder replaced the original (1080x1080 square) corridor photo with a
// proper widescreen shot (1672x941, ~16:9 — matches the banner's own wide/
// short aspect far better), fixing the aggressive zoom/crop the square
// source needed to fill a wide short section.
const IMG_ENTRANCE_CORRIDOR = '/images/iconiqa-guests-corridor-luggage-wide.png'
const IMG_AIRPORT_VIEW = '/images/mumbai-airport-view-from-hotel.jpg'
const IMG_AIRPORT_NIGHT = '/images/mumbai-airport-night-tarmac.jpg'

const ICONIQA_HOTEL_ADDRESS = 'ICONIQA Hotel, Mumbai International Airport'
const ICONIQA_AIRPORT_ADDRESS = 'Mumbai International Airport'

// ── Design tokens — premium hotel/airport palette, deliberately distinct
// from the Y2K wedding page's warm gold/dark-green mix. Navy-forward
// (hospitality + aviation cue) with a muted brass accent used sparingly. ──
const C = {
  ivory:      '#F6F4EF',
  card:       '#FFFFFF',
  ink:        '#171B22',
  navy:       '#1C2436',
  navyDeep:   '#10141C',
  brass:      '#AD8C56',
  brassLight: '#D9C39A',
  brassPale:  '#F3EBDB',
  steel:      '#5B6472',
  steelLight: '#8891A0',
  border:     '#E4E0D6',
  borderCard: '#EAE6DA',
  success:    '#1F6F52',
  error:      '#B3261E',
}

const FONT_DISPLAY = "'Playfair Display', var(--font-playfair), serif"
const FONT_BODY    = "'Inter', var(--font-inter-iconiqa), sans-serif"

// ── Service options — keys match SERVICE_MAP in app/api/iconiqa/inquiry/route.ts ──
const SERVICES = [
  {
    key: 'hotel-to-airport',
    title: 'Hotel → Airport',
    desc: 'Deliver your luggage from ICONIQA Hotel to Mumbai International Airport.',
    touchesHotel: true, touchesAirport: true, deliveryFixed: true,
  },
  {
    key: 'airport-to-hotel',
    title: 'Airport → Hotel',
    desc: 'Have your luggage delivered from Mumbai International Airport to ICONIQA Hotel.',
    touchesHotel: true, touchesAirport: true, deliveryFixed: true,
  },
  {
    key: 'hotel-to-destination',
    title: 'Hotel → Destination',
    desc: 'Send your luggage from ICONIQA Hotel to your next destination.',
    touchesHotel: true, touchesAirport: false, deliveryFixed: false,
  },
  {
    key: 'airport-to-destination',
    title: 'Airport → Destination',
    desc: 'Move your luggage from Mumbai International Airport directly to your destination.',
    touchesHotel: false, touchesAirport: true, deliveryFixed: false,
  },
] as const
type ServiceKey = typeof SERVICES[number]['key']

// Pickup/delivery time field (Founder request, 2026-10-03: "pickup time
// and delivery time change as per main booking form bcoz flight time
// fixed time so change this time field") — was a coarse 3-slot picker
// (Morning/Afternoon/Evening), which doesn't work for an airport transfer
// tied to a specific flight time. Now reuses the exact same precise
// 30-minute time picker (lib/time-options.ts's TIME_OPTIONS, 06:00 AM …
// 05:30 AM) already used by the main booking form's "Preferred pickup
// time" field (components/booking/step-schedule.tsx) — same values stored
// the same way (raw 24h "HH:MM" string straight into bookings.time_slot).

const HOW_IT_WORKS = [
  { n: '01', title: 'Book', desc: 'Submit your baggage delivery request.' },
  { n: '02', title: 'Get Your Quote', desc: 'Our team reviews your request and provides the applicable quotation.' },
  { n: '03', title: 'Approve & Pay', desc: 'Review the quotation and complete the existing approval/payment process.' },
  { n: '04', title: 'Travel Light', desc: 'Our operations team handles your baggage according to the scheduled pickup and delivery.' },
]

const BENEFITS = [
  { title: 'Travel Light', desc: 'Avoid carrying heavy bags through airports and transfers.' },
  { title: 'Door-to-Door Delivery', desc: 'Convenient pickup and delivery between your hotel, the airport, and your destination.' },
  { title: 'Secure Handling', desc: 'Baggage handled through a structured operational process.' },
  { title: 'Live Updates', desc: 'Receive updates through the existing Bagdrop communication workflow.' },
  { title: 'Professional Operations', desc: 'Managed by the Bagdrop logistics team.' },
]

const FAQS = [
  { q: 'Is my booking confirmed when I submit the form?', a: 'No. The form creates a booking request. Bagdrop will review the request and provide the applicable quotation and next steps.' },
  { q: 'How many bags can I send?', a: 'Baggage limits and pricing follow Bagdrop’s existing rules, reviewed as part of your quotation.' },
  { q: 'Can I send bags to Mumbai International Airport?', a: 'Yes, where the selected service and route are supported.' },
  { q: 'Can I send my bags to another destination?', a: 'Yes, depending on the available Bagdrop service route.' },
  { q: 'How will I receive updates?', a: 'Through Bagdrop’s existing WhatsApp and email communication workflow.' },
  { q: 'When do I pay?', a: 'Follow the existing Bagdrop quotation and payment workflow — payment is only collected after you approve the quotation.' },
]

function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect() } }, { threshold: 0.08 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, vis }
}

function Reveal({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const { ref, vis } = useReveal()
  return (
    <div ref={ref} style={{ opacity: vis ? 1 : 0, transform: vis ? 'translateY(0)' : 'translateY(24px)', transition: 'opacity 0.6s ease, transform 0.6s ease', ...style }}>
      {children}
    </div>
  )
}

function Eyebrow({ children, light }: { children: React.ReactNode; light?: boolean }) {
  return (
    <span style={{ fontFamily: FONT_BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.26em', textTransform: 'uppercase', color: light ? C.brassLight : C.brass }}>
      {children}
    </span>
  )
}

// Original SVG diagram — Hotel → Airport flow — used in the "How It Works"
// section below. Not a substitute for real photography anywhere; the hero
// above now uses the real ICONIQA Hotel exterior photo supplied 2026-10-02.
function HeroVisual() {
  return (
    <svg viewBox="0 0 600 420" style={{ width: '100%', maxWidth: 420, height: 'auto' }} aria-hidden="true">
      <defs>
        <linearGradient id="icv-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#232C3F" />
          <stop offset="100%" stopColor="#141821" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="600" height="420" rx="28" fill="url(#icv-sky)" />
      {/* dotted flight path */}
      <path d="M90 300 C 180 120, 420 120, 510 260" stroke={C.brassLight} strokeWidth="2" strokeDasharray="2 10" fill="none" opacity="0.7" />
      {/* hotel block */}
      <g transform="translate(60,260)">
        <rect width="80" height="70" rx="6" fill={C.brassPale} opacity="0.12" />
        <rect width="80" height="70" rx="6" fill="none" stroke={C.brassLight} strokeWidth="1.4" />
        {[0, 1, 2].map(r => [0, 1, 2].map(cIdx => (
          <rect key={`${r}-${cIdx}`} x={10 + cIdx * 22} y={12 + r * 18} width="12" height="10" fill={C.brassLight} opacity="0.55" />
        )))}
      </g>
      <text x="100" y="352" textAnchor="middle" fontFamily={FONT_BODY} fontSize="11" letterSpacing="0.12em" fill={C.brassLight} opacity="0.85">HOTEL</text>
      {/* bag icon midway */}
      <g transform="translate(275,185)">
        <rect x="-18" y="-6" width="36" height="30" rx="5" fill={C.brass} />
        <rect x="-10" y="-16" width="20" height="12" rx="4" fill="none" stroke={C.brass} strokeWidth="2.4" />
      </g>
      {/* plane icon */}
      <g transform="translate(470,250) rotate(28)">
        <path d="M0 -18 L5 0 L22 8 L22 13 L5 9 L2 22 L9 27 L9 31 L0 28 L-9 31 L-9 27 L-2 22 L-5 9 L-22 13 L-22 8 L-5 0 Z" fill={C.brassLight} />
      </g>
      <text x="498" y="300" textAnchor="middle" fontFamily={FONT_BODY} fontSize="11" letterSpacing="0.12em" fill={C.brassLight} opacity="0.85">AIRPORT</text>
    </svg>
  )
}

function JourneyVisual() {
  const steps = ['ICONIQA Hotel', 'Bag Pickup', 'Secure Transportation', 'Airport / Destination', 'Guest Travels Light']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, maxWidth: 360, margin: '0 auto' }}>
      {steps.map((s, i) => (
        <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: 14, height: 14, borderRadius: '50%', background: i === steps.length - 1 ? C.brass : C.navy, border: `2px solid ${C.brass}` }} />
          <p style={{ fontFamily: FONT_BODY, fontSize: 14.5, fontWeight: 600, color: C.ink, margin: '10px 0' }}>{s}</p>
          {i < steps.length - 1 && <div style={{ width: 1.5, height: 36, background: C.border }} />}
        </div>
      ))}
    </div>
  )
}

function FAQAccordion() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {FAQS.map((f, i) => (
        <div key={f.q} style={{ background: C.card, border: `1px solid ${C.borderCard}`, borderRadius: 16, overflow: 'hidden' }}>
          <button type="button" onClick={() => setOpen(open === i ? null : i)}
            style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ fontFamily: FONT_BODY, fontSize: 15.5, fontWeight: 600, color: C.ink }}>{f.q}</span>
            <span style={{ fontFamily: FONT_BODY, fontSize: 20, color: C.brass, flexShrink: 0, transform: open === i ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s ease' }}>+</span>
          </button>
          <div style={{ maxHeight: open === i ? 200 : 0, overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
            <p style={{ fontFamily: FONT_BODY, fontSize: 14.5, lineHeight: 1.7, color: C.steel, margin: '0 24px 20px' }}>{f.a}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Booking form — isolated component so a keystroke only re-renders this
// subtree, not the whole page (same performance reasoning as app/y2k/
// page.tsx's BookingForm). ──────────────────────────────────────────────
function BookingForm() {
  const [form, setForm] = useState({
    name: '', phone: '', whatsapp: '', sameAsPhone: true, email: '',
    serviceType: '' as ServiceKey | '',
    bags: 1,
    pickupDate: '', pickupTime: '',
    deliveryDate: '', deliveryTime: '',
    pickupAddress: '', roomNumber: '',
    deliveryLocation: '', deliveryAddress: '',
    flightNumber: '', airline: '', pnr: '',
    notes: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [code, setCode] = useState('')
  const [confirmName, setConfirmName] = useState('')

  const [isTestMode, setIsTestMode] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setIsTestMode(params.get('test') === '1' || params.get('test') === 'true')
  }, [])

  const svc = SERVICES.find(s => s.key === form.serviceType) ?? null
  const todayStr = new Date().toISOString().slice(0, 10)

  function field<K extends keyof typeof form>(key: K) {
    return (v: (typeof form)[K]) => {
      setForm(s => ({ ...s, [key]: v }))
      setErrors(e => ({ ...e, [key]: '' }))
    }
  }
  function selectService(key: ServiceKey) {
    setForm(s => ({ ...s, serviceType: key }))
    setErrors(e => ({ ...e, serviceType: '' }))
  }
  function incBags() { setForm(s => ({ ...s, bags: Math.min(50, s.bags + 1) })) }
  function decBags() { setForm(s => ({ ...s, bags: Math.max(1, s.bags - 1) })) }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const f = form
    const er: Record<string, string> = {}
    const digits = f.phone.replace(/\D/g, '')
    const waDigits = f.sameAsPhone ? digits : f.whatsapp.replace(/\D/g, '')
    if (!f.name.trim()) er.name = 'Please enter your name.'
    if (!/^[6-9]\d{9}$/.test(digits)) er.phone = 'Enter a valid 10-digit Indian mobile number.'
    if (!/^[6-9]\d{9}$/.test(waDigits)) er.whatsapp = 'Enter a valid 10-digit WhatsApp number.'
    if (!f.serviceType) er.serviceType = 'Please select a baggage delivery service.'
    if (!f.pickupDate) er.pickupDate = 'Select a pickup date.'
    else if (f.pickupDate < todayStr) er.pickupDate = 'Pickup date cannot be in the past.'
    if (!f.pickupTime) er.pickupTime = 'Select a pickup time.'
    if (!f.pickupAddress.trim()) er.pickupAddress = svc?.touchesHotel ? 'Enter your room number / contact details.' : 'Enter pickup / flight details.'
    if (svc && !svc.deliveryFixed) {
      if (!f.deliveryLocation.trim()) er.deliveryLocation = 'Enter the delivery location.'
      if (!f.deliveryAddress.trim()) er.deliveryAddress = 'Enter the delivery address.'
    }
    if (Object.keys(er).length) { setErrors(er); return }
    if (!svc) return

    setBusy(true)
    try {
      const res = await fetch('/api/iconiqa/inquiry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: f.name, phone: digits, whatsapp: waDigits, email: f.email,
          serviceType: f.serviceType,
          bags: String(f.bags),
          pickupDate: f.pickupDate, pickupTime: f.pickupTime,
          deliveryDate: f.deliveryDate || undefined, deliveryTime: f.deliveryTime || undefined,
          pickupAddress: f.pickupAddress,
          roomNumber: f.roomNumber,
          deliveryLocation: f.deliveryLocation, deliveryAddress: f.deliveryAddress,
          flightNumber: f.flightNumber, airline: f.airline, pnr: f.pnr,
          notes: f.notes,
          testMode: isTestMode,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Submission failed')
      setCode(d.trackingId ?? '')
      setConfirmName(f.name.trim().split(' ')[0])
      setSubmitted(true)
      document.getElementById('book')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (ex) {
      setErrors({ form: ex instanceof Error ? ex.message : 'Something went wrong. Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  function resetForm() {
    setSubmitted(false); setCode(''); setConfirmName(''); setErrors({})
    setForm({
      name: '', phone: '', whatsapp: '', sameAsPhone: true, email: '',
      serviceType: '', bags: 1,
      pickupDate: '', pickupTime: '', deliveryDate: '', deliveryTime: '',
      pickupAddress: '', roomNumber: '', deliveryLocation: '', deliveryAddress: '',
      flightNumber: '', airline: '', pnr: '', notes: '',
    })
  }

  const fi: React.CSSProperties = { height: 52, borderRadius: 12, border: `1px solid ${C.border}`, background: C.ivory, padding: '0 16px', fontSize: 15, color: C.ink, outline: 'none', width: '100%', fontFamily: FONT_BODY, transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s' }
  const fiFocus = (e: React.FocusEvent<HTMLElement>) => { const s = (e.currentTarget as HTMLElement).style; s.borderColor = C.brass; s.boxShadow = `0 0 0 3px rgba(173,140,86,0.16)`; s.background = '#fff' }
  const fiBlur  = (e: React.FocusEvent<HTMLElement>) => { const s = (e.currentTarget as HTMLElement).style; s.borderColor = C.border; s.boxShadow = 'none'; s.background = C.ivory }
  const label: React.CSSProperties = { fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.steel }
  const fieldErr: React.CSSProperties = { fontFamily: FONT_BODY, fontSize: 12, color: C.error }
  const sectionLabel: React.CSSProperties = { fontFamily: FONT_BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.brass, display: 'block', margin: '28px 0 16px' }

  return (
    <>
      {isTestMode && (
        <div style={{ maxWidth: 760, margin: '0 auto 24px', background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 12, padding: '12px 20px', textAlign: 'center', fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: '#92400E' }}>
          🧪 TEST MODE — submissions here don&apos;t use real tracking numbers and won&apos;t send WhatsApp/email notifications.
        </div>
      )}
      <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
        <Eyebrow>Book Your Baggage Delivery</Eyebrow>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, color: C.ink, fontSize: 'clamp(32px,5vw,52px)', lineHeight: 1.1, margin: '16px 0 12px' }}>Book Your Baggage Delivery</h2>
        <p style={{ fontFamily: FONT_BODY, fontSize: 16, lineHeight: 1.75, color: C.steel, maxWidth: '50ch', margin: '0 auto' }}>
          Tell us about your journey and baggage. Our team will review your request and get back to you with availability and pricing.
        </p>
      </div>

      {submitted ? (
        <Reveal style={{ marginTop: 44 }}>
          <div style={{ maxWidth: 640, margin: '0 auto', background: C.card, border: `1px solid ${C.borderCard}`, borderRadius: 24, padding: 'clamp(32px,6vw,52px)', textAlign: 'center', boxShadow: '0 30px 70px rgba(20,20,30,0.1)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: C.navy, color: C.brassLight, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', fontSize: 28 }}>✓</div>
            <h3 style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 'clamp(26px,4vw,36px)', margin: '0 0 12px', color: C.ink }}>Booking Request Received</h3>
            <p style={{ fontFamily: FONT_BODY, fontSize: 15.5, lineHeight: 1.7, color: C.steel, margin: '0 0 22px' }}>
              Thank you, {confirmName}. We have received your baggage delivery request. Our team will review the details and contact you regarding availability, quotation, and next steps.
            </p>
            <div style={{ marginBottom: 8, fontFamily: FONT_BODY, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.steelLight }}>Request ID</div>
            <div style={{ display: 'inline-block', fontFamily: "'Geist Mono', monospace", fontSize: 22, letterSpacing: '0.12em', color: C.navy, background: C.brassPale, border: `1px dashed ${C.brass}`, borderRadius: 14, padding: '14px 30px' }}>{code}</div>

            <div style={{ textAlign: 'left', marginTop: 34, paddingTop: 28, borderTop: `1px solid ${C.border}` }}>
              <p style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.brass, margin: '0 0 18px', textAlign: 'center' }}>What happens next?</p>
              {[
                { n: '1', t: 'Request Review', d: 'Our team reviews your submitted details.' },
                { n: '2', t: 'Quotation', d: 'We provide the applicable quotation for your baggage delivery.' },
                { n: '3', t: 'Customer Approval', d: 'You review the quotation and decide whether you would like to proceed.' },
                { n: '4', t: 'Booking Confirmation', d: 'Your booking is confirmed only after the required approval and payment process is completed.' },
              ].map(s => (
                <div key={s.n} style={{ display: 'flex', gap: 14, marginBottom: 14, alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: C.ivory, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_BODY, fontSize: 12, fontWeight: 700, color: C.brass }}>{s.n}</span>
                  <div>
                    <p style={{ fontFamily: FONT_BODY, fontSize: 14.5, fontWeight: 600, color: C.ink, margin: 0 }}>{s.t}</p>
                    <p style={{ fontFamily: FONT_BODY, fontSize: 13.5, color: C.steel, margin: '2px 0 0', lineHeight: 1.6 }}>{s.d}</p>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 26 }}>
              <button type="button" onClick={resetForm} style={{ background: 'none', border: 'none', fontFamily: FONT_BODY, fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.brass, cursor: 'pointer', borderBottom: `1px solid ${C.brass}`, padding: '4px 0' }}>
                Submit another request
              </button>
            </div>
          </div>
        </Reveal>
      ) : (
        <Reveal style={{ marginTop: 44 }}>
          <form onSubmit={submit} style={{ maxWidth: 820, margin: '0 auto', background: C.card, border: `1px solid ${C.borderCard}`, borderRadius: 24, padding: 'clamp(24px,5vw,48px)', boxShadow: '0 30px 70px rgba(20,20,30,0.08)' }}>

            <span style={sectionLabel}>Customer Details</span>
            <div className="icq-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={label}>Full Name</label>
                <input value={form.name} onChange={e => field('name')(e.target.value)} onFocus={fiFocus} onBlur={fiBlur} placeholder="Full name" style={fi} />
                {errors.name && <span style={fieldErr}>{errors.name}</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={label}>Mobile Number</label>
                <input value={form.phone} onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 10); setForm(s => ({ ...s, phone: v, whatsapp: s.sameAsPhone ? v : s.whatsapp })); setErrors(er => ({ ...er, phone: '' })) }} onFocus={fiFocus} onBlur={fiBlur} inputMode="tel" placeholder="10-digit number" style={fi} />
                {errors.phone && <span style={fieldErr}>{errors.phone}</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', letterSpacing: 0 }}>
                  WHATSAPP NUMBER
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 400, color: C.steelLight, fontSize: 11.5 }}>
                    <input type="checkbox" checked={form.sameAsPhone} onChange={e => { const same = e.target.checked; setForm(s => ({ ...s, sameAsPhone: same, whatsapp: same ? s.phone : s.whatsapp })) }} style={{ accentColor: C.brass }} />
                    same as mobile
                  </span>
                </label>
                <input value={form.sameAsPhone ? form.phone : form.whatsapp} disabled={form.sameAsPhone} onChange={e => field('whatsapp')(e.target.value.replace(/\D/g, '').slice(0, 10))} onFocus={fiFocus} onBlur={fiBlur} inputMode="tel" placeholder="10-digit number" style={{ ...fi, opacity: form.sameAsPhone ? 0.6 : 1, cursor: form.sameAsPhone ? 'not-allowed' : 'text' }} />
                {errors.whatsapp && <span style={fieldErr}>{errors.whatsapp}</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={label}>Email Address <span style={{ textTransform: 'none', letterSpacing: 0, color: C.steelLight, fontWeight: 400 }}>(optional)</span></label>
                <input type="email" value={form.email} onChange={e => field('email')(e.target.value)} onFocus={fiFocus} onBlur={fiBlur} placeholder="your@email.com" style={fi} />
              </div>
            </div>

            <span style={sectionLabel}>Choose Your Baggage Delivery</span>
            <div className="icq-service-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {SERVICES.map(s => (
                <button key={s.key} type="button" onClick={() => selectService(s.key)}
                  style={{ textAlign: 'left', padding: '16px 18px', borderRadius: 14, border: `1.5px solid ${form.serviceType === s.key ? C.brass : C.border}`, background: form.serviceType === s.key ? C.brassPale : C.ivory, cursor: 'pointer', transition: 'border-color 0.2s, background 0.2s' }}>
                  <p style={{ fontFamily: FONT_BODY, fontSize: 14, fontWeight: 700, color: C.ink, margin: '0 0 4px' }}>{s.title}</p>
                  <p style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: C.steel, margin: 0, lineHeight: 1.5 }}>{s.desc}</p>
                </button>
              ))}
            </div>
            {errors.serviceType && <span style={{ ...fieldErr, display: 'block', marginTop: 8 }}>{errors.serviceType}</span>}

            {svc && (
              <>
                <span style={sectionLabel}>Service Details</span>
                <div className="icq-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={label}>Pickup Location</label>
                    <input disabled value={svc.touchesHotel && svc.key === 'hotel-to-airport' ? ICONIQA_HOTEL_ADDRESS : svc.key === 'hotel-to-destination' ? ICONIQA_HOTEL_ADDRESS : ICONIQA_AIRPORT_ADDRESS} style={{ ...fi, color: C.steel, cursor: 'not-allowed', opacity: 0.85 }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={label}>Delivery Location</label>
                    {svc.deliveryFixed ? (
                      <input disabled value={svc.key === 'hotel-to-airport' ? ICONIQA_AIRPORT_ADDRESS : ICONIQA_HOTEL_ADDRESS} style={{ ...fi, color: C.steel, cursor: 'not-allowed', opacity: 0.85 }} />
                    ) : (
                      <input value={form.deliveryLocation} onChange={e => field('deliveryLocation')(e.target.value)} onFocus={fiFocus} onBlur={fiBlur} placeholder="City / area of your next destination" style={fi} />
                    )}
                    {errors.deliveryLocation && <span style={fieldErr}>{errors.deliveryLocation}</span>}
                  </div>

                  {!svc.deliveryFixed && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, gridColumn: '1 / -1' }}>
                      <label style={label}>Delivery Address</label>
                      <input value={form.deliveryAddress} onChange={e => field('deliveryAddress')(e.target.value)} onFocus={fiFocus} onBlur={fiBlur} placeholder="Full delivery address" style={fi} />
                      {errors.deliveryAddress && <span style={fieldErr}>{errors.deliveryAddress}</span>}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={label}>Number of Bags</label>
                    <div style={{ display: 'flex', alignItems: 'center', height: 52, borderRadius: 12, border: `1px solid ${C.border}`, background: C.ivory, padding: '0 8px', justifyContent: 'space-between' }}>
                      <button type="button" onClick={decBags} aria-label="Fewer bags" style={{ width: 36, height: 36, borderRadius: 9, border: 'none', background: '#EDE7D9', color: C.steel, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>−</button>
                      <span style={{ fontFamily: FONT_DISPLAY, fontSize: 22, color: C.ink, minWidth: 28, textAlign: 'center' }}>{form.bags}</span>
                      <button type="button" onClick={incBags} aria-label="More bags" style={{ width: 36, height: 36, borderRadius: 9, border: 'none', background: '#EDE7D9', color: C.steel, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>+</button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={label}>Pickup Date</label>
                    <input type="date" value={form.pickupDate} onChange={e => field('pickupDate')(e.target.value)} onFocus={fiFocus} onBlur={fiBlur} min={todayStr} style={fi} />
                    {errors.pickupDate && <span style={fieldErr}>{errors.pickupDate}</span>}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={label}>Pickup Time</label>
                    <div style={{ position: 'relative' }}>
                      <select value={form.pickupTime} onChange={e => field('pickupTime')(e.target.value)} onFocus={fiFocus} onBlur={fiBlur} style={{ ...fi, padding: '0 40px 0 16px' }}>
                        <option value="" disabled>Select time</option>
                        {TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <span style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: C.brass, fontSize: 11 }}>▾</span>
                    </div>
                    {errors.pickupTime && <span style={fieldErr}>{errors.pickupTime}</span>}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={label}>Delivery Date <span style={{ textTransform: 'none', letterSpacing: 0, color: C.steelLight, fontWeight: 400 }}>(optional)</span></label>
                    <input type="date" value={form.deliveryDate} onChange={e => field('deliveryDate')(e.target.value)} onFocus={fiFocus} onBlur={fiBlur} min={form.pickupDate || todayStr} style={fi} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={label}>Preferred Delivery Time <span style={{ textTransform: 'none', letterSpacing: 0, color: C.steelLight, fontWeight: 400 }}>(optional)</span></label>
                    <div style={{ position: 'relative' }}>
                      <select value={form.deliveryTime} onChange={e => field('deliveryTime')(e.target.value)} onFocus={fiFocus} onBlur={fiBlur} style={{ ...fi, padding: '0 40px 0 16px' }}>
                        <option value="">No preference</option>
                        {TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <span style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: C.brass, fontSize: 11 }}>▾</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, gridColumn: '1 / -1' }}>
                    <label style={label}>{svc.touchesHotel && (svc.key === 'hotel-to-airport' || svc.key === 'hotel-to-destination') ? 'Room Number / Pickup Details' : 'Pickup / Flight Details'}</label>
                    <input value={form.pickupAddress} onChange={e => field('pickupAddress')(e.target.value)} onFocus={fiFocus} onBlur={fiBlur}
                      placeholder={svc.key === 'hotel-to-airport' || svc.key === 'hotel-to-destination' ? 'Room number, contact point at the hotel' : 'Terminal, gate, or contact details at the airport'} style={fi} />
                    {errors.pickupAddress && <span style={fieldErr}>{errors.pickupAddress}</span>}
                  </div>
                </div>

                {(svc.touchesHotel) && (
                  <div style={{ marginTop: 18 }}>
                    <label style={label}>Hotel Room Number <span style={{ textTransform: 'none', letterSpacing: 0, color: C.steelLight, fontWeight: 400 }}>(optional)</span></label>
                    <input value={form.roomNumber} onChange={e => field('roomNumber')(e.target.value)} onFocus={fiFocus} onBlur={fiBlur} placeholder="e.g. 412" style={{ ...fi, marginTop: 8, maxWidth: 240 }} />
                  </div>
                )}

                {svc.touchesAirport && (
                  <>
                    <span style={sectionLabel}>Travel Details <span style={{ textTransform: 'none', letterSpacing: 0, color: C.steelLight, fontWeight: 400 }}>(where applicable)</span></span>
                    <div className="icq-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label style={label}>Flight Number</label>
                        <input value={form.flightNumber} onChange={e => field('flightNumber')(e.target.value)} onFocus={fiFocus} onBlur={fiBlur} placeholder="e.g. AI 101" style={fi} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label style={label}>Airline</label>
                        <input value={form.airline} onChange={e => field('airline')(e.target.value)} onFocus={fiFocus} onBlur={fiBlur} placeholder="e.g. Air India" style={fi} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label style={label}>PNR</label>
                        <input value={form.pnr} onChange={e => field('pnr')(e.target.value)} onFocus={fiFocus} onBlur={fiBlur} placeholder="Booking reference" style={fi} />
                      </div>
                    </div>
                  </>
                )}

                <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={label}>Special Requests <span style={{ textTransform: 'none', letterSpacing: 0, color: C.steelLight, fontWeight: 400 }}>(optional)</span></label>
                  <textarea value={form.notes} onChange={e => field('notes')(e.target.value)} onFocus={fiFocus} onBlur={fiBlur} rows={3} placeholder="Fragile items, extra bags, special instructions…" style={{ ...fi, height: 'auto', padding: '14px 16px', resize: 'vertical', lineHeight: 1.6 }} />
                </div>
              </>
            )}

            {errors.form && <p style={{ ...fieldErr, textAlign: 'center', marginTop: 16 }}>{errors.form}</p>}

            {/* Booking-request disclaimer — Founder spec section 9: must be
                visible near Submit, must never use "confirmed" language. */}
            <div style={{ marginTop: 24, background: 'rgba(173,140,86,0.08)', border: `1px solid rgba(173,140,86,0.3)`, borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 15, lineHeight: '1.6', color: C.brass, flexShrink: 0 }}>ⓘ</span>
              <p style={{ fontFamily: FONT_BODY, fontSize: 13, lineHeight: 1.65, color: C.steel, margin: 0 }}>
                <strong style={{ color: C.navy }}>Please note:</strong> Submitting this request does not confirm your booking. Our team will review your request and share the applicable quotation and next steps.
              </p>
            </div>

            <button type="submit" disabled={busy} style={{ marginTop: 22, width: '100%', height: 56, border: 'none', borderRadius: 13, background: busy ? '#7C8392' : C.navy, color: '#fff', fontFamily: FONT_BODY, fontSize: 14, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: busy ? 'not-allowed' : 'pointer', transition: 'transform 0.25s ease, box-shadow 0.25s ease, background 0.25s ease' }}
              onMouseEnter={e => { if (!busy) { e.currentTarget.style.background = '#262F45'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 14px 32px rgba(28,36,54,0.3)' } }}
              onMouseLeave={e => { if (!busy) { e.currentTarget.style.background = C.navy; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' } }}>
              {busy ? 'Submitting…' : 'Request Baggage Delivery'}
            </button>
            <p style={{ fontFamily: FONT_BODY, fontSize: 12, color: C.steelLight, textAlign: 'center', margin: '14px 0 0' }}>ICONIQA Hotel · Baggage Delivery by Bagdrop</p>
          </form>
        </Reveal>
      )}
    </>
  )
}

export default function IconiqaPage() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div style={{ fontFamily: FONT_BODY, background: C.ivory, color: C.ink, overflowX: 'hidden' }}>
      <style dangerouslySetInnerHTML={{__html:`
        html { scroll-behavior:smooth; -webkit-text-size-adjust:100%; }
        body { margin:0; }
        * { box-sizing:border-box; }
        a { color:inherit; text-decoration:none; }
        ::selection { background:${C.brass}; color:#fff; }
        input, select, textarea { font-family:${FONT_BODY}; }
        select { -webkit-appearance:none; appearance:none; }
        input::placeholder, textarea::placeholder { color:${C.steelLight}; }
        @media (max-width:860px) {
          .icq-desktop-nav { display:none !important; }
          .icq-hamburger { display:flex !important; }
        }
        @media (max-width:640px) {
          .icq-grid, .icq-service-grid { grid-template-columns:1fr !important; }
          .icq-benefits-grid { grid-template-columns:1fr !important; }
          .icq-context-grid { grid-template-columns:1fr !important; }
        }
      `}}/>

      {/* ── NAV ───────────────────────────────────────────── */}
      <nav style={{ position:'fixed', top:0, left:0, right:0, zIndex:100, height:84, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 clamp(20px,5vw,56px)', background: scrolled ? 'rgba(246,244,239,0.94)' : 'transparent', color: scrolled ? C.ink : '#fff', boxShadow: scrolled ? '0 1px 0 rgba(0,0,0,0.06)' : 'none', backdropFilter: scrolled ? 'saturate(180%) blur(12px)' : 'none', WebkitBackdropFilter: scrolled ? 'saturate(180%) blur(12px)' : 'none', transition:'background 0.4s ease, color 0.4s ease, box-shadow 0.4s ease' }}>
        <a href="#top" style={{ display:'flex', alignItems:'center', gap:16 }}>
          <img src={IMG_LOGO} alt="ICONIQA Hotels and Resorts" style={{ height:52, width:'auto', display:'block', filter: scrolled ? 'brightness(0)' : 'none', transition:'filter 0.4s ease' }} />
          <span style={{ width:1, height:30, background:'currentColor', opacity:0.3, display:'block' }} />
          <img src={IMG_BAGDROP_LOGO} alt="Bagdrop" style={{ height:75, width:'auto', display:'block', filter: scrolled ? 'brightness(0)' : 'brightness(0) invert(1)', transition:'filter 0.4s ease' }} />
        </a>
        <div className="icq-desktop-nav" style={{ display:'flex', alignItems:'center', gap:30, fontFamily:FONT_BODY, fontSize:12.5, fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase' }}>
          <a href="#services">Services</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#faq">FAQ</a>
          <a href="#book" style={{ border:`1px solid currentColor`, padding:'9px 20px', borderRadius:999, transition:'background 0.2s, border-color 0.2s, color 0.2s' }}
            onMouseEnter={e=>{ e.currentTarget.style.background=C.brass; e.currentTarget.style.borderColor=C.brass; e.currentTarget.style.color='#fff' }}
            onMouseLeave={e=>{ e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor='currentColor'; e.currentTarget.style.color='inherit' }}>
            Book Baggage Delivery
          </a>
        </div>
        <button type="button" onClick={()=>setMenuOpen(true)} aria-label="Open menu" className="icq-hamburger"
          style={{ display:'none', background:'none', border:'none', color:'inherit', cursor:'pointer', padding:8, flexDirection:'column', gap:5, width:42, height:42, alignItems:'center', justifyContent:'center' }}>
          <span style={{ width:22, height:1.5, background:'currentColor', display:'block' }}/>
          <span style={{ width:22, height:1.5, background:'currentColor', display:'block' }}/>
          <span style={{ width:22, height:1.5, background:'currentColor', display:'block' }}/>
        </button>
      </nav>

      {/* ── MOBILE DRAWER ─────────────────────────────────── */}
      <div onClick={()=>setMenuOpen(false)} style={{ position:'fixed', inset:0, zIndex:110, background:'rgba(10,12,18,0.5)', backdropFilter:'blur(4px)', opacity: menuOpen?1:0, pointerEvents: menuOpen?'auto':'none', transition:'opacity 0.35s ease' }}/>
      <aside style={{ position:'fixed', top:0, right:0, bottom:0, zIndex:120, width:'min(82vw, 340px)', background:C.navy, color:'#fff', transform: menuOpen ? 'translateX(0)' : 'translateX(100%)', transition:'transform 0.42s cubic-bezier(0.22,1,0.36,1)', display:'flex', flexDirection:'column', padding:'28px 30px', boxShadow:'-20px 0 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:44 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <img src={IMG_LOGO} alt="ICONIQA Hotels and Resorts" style={{ height:44, width:'auto', display:'block' }} />
            <img src={IMG_BAGDROP_LOGO} alt="Bagdrop" style={{ height:32, width:'auto', display:'block', filter:'brightness(0) invert(1)' }} />
          </div>
          <button type="button" onClick={()=>setMenuOpen(false)} aria-label="Close menu" style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'#fff', width:40, height:40, borderRadius:'50%', fontSize:20, cursor:'pointer', lineHeight:1 }}>×</button>
        </div>
        <nav style={{ display:'flex', flexDirection:'column', gap:4, fontFamily:FONT_DISPLAY }}>
          <a onClick={()=>setMenuOpen(false)} href="#services" style={{ fontSize:26, padding:'12px 0', borderBottom:'1px solid rgba(255,255,255,0.1)' }}>Services</a>
          <a onClick={()=>setMenuOpen(false)} href="#how-it-works" style={{ fontSize:26, padding:'12px 0', borderBottom:'1px solid rgba(255,255,255,0.1)' }}>How It Works</a>
          <a onClick={()=>setMenuOpen(false)} href="#faq" style={{ fontSize:26, padding:'12px 0', borderBottom:'1px solid rgba(255,255,255,0.1)' }}>FAQ</a>
        </nav>
        <a onClick={()=>setMenuOpen(false)} href="#book" style={{ marginTop:'auto', textAlign:'center', background:C.brass, color:'#fff', fontFamily:FONT_BODY, fontSize:13, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', padding:18, borderRadius:999 }}>
          Book Baggage Delivery
        </a>
      </aside>

      {/* ── HERO ──────────────────────────────────────────── */}
      <header id="top" style={{ position:'relative', minHeight:'92svh', display:'flex', alignItems:'center', padding:'120px clamp(20px,5vw,56px) 64px', color:'#fff', overflow:'hidden' }}>
        {/* Real ICONIQA Hotel exterior photo, founder-supplied 2026-10-02 */}
        <div style={{ position:'absolute', inset:0, zIndex:0, backgroundImage:`url(${IMG_HOTEL_EXTERIOR})`, backgroundSize:'cover', backgroundPosition:'center 38%' }} />
        {/* Lightened per Founder feedback ("too dark, reduce opacity") — was
            up to 92% opaque. Now a lighter, bottom-weighted wash (photo stays
            clearly visible at the top/middle) with a stronger text-shadow on
            the headline below doing the readability work instead. */}
        <div style={{ position:'absolute', inset:0, zIndex:1, pointerEvents:'none', background:`linear-gradient(180deg, rgba(16,20,28,0.48) 0%, rgba(16,20,28,0.38) 35%, rgba(16,20,28,0.46) 65%, rgba(16,20,28,0.72) 100%)` }} />
        <div style={{ position:'absolute', inset:0, zIndex:1, pointerEvents:'none', background:'radial-gradient(circle at 15% 20%, rgba(173,140,86,0.16), transparent 45%)' }} />
        <div style={{ position:'relative', zIndex:2, maxWidth:780, margin:'0 auto', textAlign:'center' }}>
          <span style={{ fontFamily:FONT_BODY, fontSize:11.5, fontWeight:700, letterSpacing:'0.32em', textTransform:'uppercase', color:C.brassLight }}>ICONIQA Hotel × Bagdrop</span>
          {/* color:'#fff' set explicitly — globals.css applies a `h1,h2,...{ color: text-text-primary }`
              rule to every heading site-wide, which (being a declared value on the element itself)
              overrides the inherited white from this header's color:'#fff', not just lower specificity.
              Any heading on a dark/photo background in this file needs this same explicit override. */}
          <h1 style={{ fontFamily:FONT_DISPLAY, fontWeight:600, fontSize:'clamp(40px,6.4vw,76px)', lineHeight:1.05, margin:'20px 0 20px', color:'#fff', textShadow:'0 2px 10px rgba(0,0,0,0.65), 0 4px 40px rgba(0,0,0,0.6)' }}>Travel Light.<br/>We&apos;ll Handle Your Bags.</h1>
          <p style={{ fontFamily:FONT_BODY, fontSize:'clamp(15px,1.6vw,18px)', lineHeight:1.75, color:'rgba(255,255,255,0.92)', maxWidth:'46ch', margin:'0 auto 36px', textShadow:'0 2px 10px rgba(0,0,0,0.6)' }}>
            Enjoy a seamless journey from ICONIQA Hotel, Mumbai International Airport, while Bagdrop takes care of your baggage delivery.
          </p>
          <div style={{ display:'flex', flexWrap:'wrap', gap:16, justifyContent:'center' }}>
            <a href="#book" style={{ background:C.brass, color:'#fff', fontFamily:FONT_BODY, fontSize:13.5, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', padding:'16px 30px', borderRadius:999, display:'inline-block', transition:'transform 0.2s ease, box-shadow 0.2s ease' }}
              onMouseEnter={e=>{ e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 14px 32px rgba(173,140,86,0.35)' }}
              onMouseLeave={e=>{ e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='none' }}>
              Book Baggage Delivery
            </a>
            <a href="#how-it-works" style={{ border:'1px solid rgba(255,255,255,0.4)', color:'#fff', fontFamily:FONT_BODY, fontSize:13.5, fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', padding:'16px 30px', borderRadius:999, display:'inline-block' }}>
              How It Works ↓
            </a>
          </div>
        </div>
      </header>

      {/* ── HOTEL CONTEXT ─────────────────────────────────── */}
      <section style={{ padding:'clamp(64px,8vw,100px) clamp(20px,5vw,56px)' }}>
        <div className="icq-context-grid" style={{ maxWidth:1080, margin:'0 auto', display:'grid', gridTemplateColumns:'1.05fr 0.95fr', gap:'clamp(32px,5vw,64px)', alignItems:'center' }}>
          <Reveal>
            <div>
              <Eyebrow>Your Stay, Taken Care Of</Eyebrow>
              <h2 style={{ fontFamily:FONT_DISPLAY, fontWeight:600, fontSize:'clamp(30px,4.6vw,46px)', lineHeight:1.15, margin:'16px 0 20px', color:C.ink }}>Your Stay. Your Journey. Your Bags — Taken Care Of.</h2>
              <p style={{ fontFamily:FONT_BODY, fontSize:16.5, lineHeight:1.8, color:C.steel }}>
                Leaving ICONIQA Hotel after your stay? Avoid carrying heavy luggage through airport terminals, transfers, and city travel. Bagdrop helps you move your bags securely between your hotel, airport, and destination so you can travel more comfortably.
              </p>
            </div>
          </Reveal>
          <Reveal style={{ transitionDelay:'0.08s' }}>
            <div style={{ borderRadius:20, overflow:'hidden', boxShadow:'0 24px 60px rgba(23,27,34,0.14)', aspectRatio:'4/3' }}>
              <img src={IMG_LOBBY_RECEPTION} alt="Guests with luggage in the ICONIQA Hotel lobby" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── CORRIDOR BANNER ───────────────────────────────── */}
      {/* Full-bleed breakout (width:100vw + negative-margin centering trick,
          independent of any ancestor padding/max-width) guarantees this
          section always spans the true viewport edge to edge. */}
      <section style={{ position:'relative', width:'100vw', marginLeft:'calc(50% - 50vw)', marginRight:'calc(50% - 50vw)', minHeight:'clamp(380px,42vw,620px)', display:'flex', alignItems:'flex-end', overflow:'hidden' }}>
        {/* Founder replaced the original square (1080x1080) corridor photo
            with a proper widescreen one (~16:9, see IMG_ENTRANCE_CORRIDOR
            above) — this needs far less aggressive cropping to fill a wide
            short banner than the square source did, so the section height
            was also brought back down from the square-image workaround. */}
        <div style={{ position:'absolute', inset:0, zIndex:0, backgroundImage:`url(${IMG_ENTRANCE_CORRIDOR})`, backgroundSize:'cover', backgroundPosition:'center center', backgroundRepeat:'no-repeat' }} />
        {/* Overlay lightened per Founder feedback ("too dark, reduce
            opacity") — now a bottom-up scrim (text sits at the bottom of the
            frame) instead of a strong left-to-right wash over the whole photo. */}
        <div style={{ position:'absolute', inset:0, zIndex:1, pointerEvents:'none', background:'linear-gradient(0deg, rgba(16,20,28,0.78) 0%, rgba(16,20,28,0.35) 38%, rgba(16,20,28,0.05) 70%, transparent 100%)' }} />
        <Reveal style={{ position:'relative', zIndex:2, padding:'32px clamp(20px,5vw,56px) 40px', maxWidth:640 }}>
          <span style={{ fontFamily:FONT_BODY, fontSize:11, fontWeight:700, letterSpacing:'0.28em', textTransform:'uppercase', color:C.brassLight, textShadow:'0 2px 10px rgba(0,0,0,0.7)' }}>From Lobby to Departure Gate</span>
          <h2 style={{ fontFamily:FONT_DISPLAY, fontWeight:600, fontSize:'clamp(24px,3.4vw,34px)', lineHeight:1.2, margin:'14px 0 0', color:'#fff', textShadow:'0 2px 14px rgba(0,0,0,0.75)' }}>Your bags leave through the same doors you do — we take it from there.</h2>
        </Reveal>
      </section>

      {/* ── SERVICE OPTIONS ───────────────────────────────── */}
      <section id="services" style={{ padding:'clamp(40px,6vw,64px) clamp(20px,5vw,56px) clamp(64px,8vw,100px)' }}>
        <Reveal>
          <div style={{ textAlign:'center', marginBottom:44 }}>
            <Eyebrow>Services</Eyebrow>
            <h2 style={{ fontFamily:FONT_DISPLAY, fontWeight:600, fontSize:'clamp(28px,4.4vw,42px)', margin:'14px 0 0', color:C.ink }}>Choose Your Baggage Delivery</h2>
          </div>
        </Reveal>
        <div className="icq-service-grid" style={{ maxWidth:1080, margin:'0 auto', display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:20 }}>
          {SERVICES.map((s, i) => (
            <Reveal key={s.key} style={{ transitionDelay:`${i*0.06}s` }}>
              <a href="#book" style={{ display:'block', background:C.card, border:`1px solid ${C.borderCard}`, borderRadius:18, padding:28, height:'100%', transition:'transform 0.3s ease, box-shadow 0.3s ease' }}
                onMouseEnter={e=>{ e.currentTarget.style.transform='translateY(-4px)'; e.currentTarget.style.boxShadow='0 20px 40px rgba(20,20,30,0.08)' }}
                onMouseLeave={e=>{ e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='none' }}>
                <div style={{ width:44, height:44, borderRadius:12, background:C.brassPale, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:18, color:C.brass, fontSize:19 }}>✈</div>
                <h3 style={{ fontFamily:FONT_DISPLAY, fontWeight:600, fontSize:20, margin:'0 0 8px', color:C.ink }}>{s.title}</h3>
                <p style={{ fontFamily:FONT_BODY, fontSize:14, lineHeight:1.65, color:C.steel, margin:0 }}>{s.desc}</p>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────── */}
      <section id="how-it-works" style={{ position:'relative', color:'#fff', padding:'clamp(64px,8vw,100px) clamp(20px,5vw,56px)', overflow:'hidden' }}>
        {/* Founder-supplied rooftop-pool photo (overlooking the airport at
            dusk) as a backdrop, with a light navy tint over it — not a
            gradient curtain, just enough of a wash for the white step text
            to stay readable while the photo itself stays clearly visible. */}
        <div style={{ position:'absolute', inset:0, zIndex:0, backgroundImage:`url(${IMG_ROOFTOP_POOL})`, backgroundSize:'cover', backgroundPosition:'center 55%' }} />
        <div style={{ position:'absolute', inset:0, zIndex:1, pointerEvents:'none', background:`${C.navyDeep}66` }} />
        <div style={{ position:'absolute', inset:0, zIndex:1, pointerEvents:'none', background:`linear-gradient(180deg, transparent 0%, ${C.navyDeep}73 100%)` }} />
        <div style={{ position:'relative', zIndex:2 }}>
          <Reveal>
            <div style={{ textAlign:'center', marginBottom:48 }}>
              <Eyebrow light>Process</Eyebrow>
              <h2 style={{ fontFamily:FONT_DISPLAY, fontWeight:600, fontSize:'clamp(28px,4.4vw,42px)', margin:'14px 0 0', color:'#fff' }}>How It Works</h2>
            </div>
          </Reveal>
          <Reveal style={{ display:'flex', justifyContent:'center', marginBottom:48 }}>
            <HeroVisual />
          </Reveal>
          <div className="icq-service-grid" style={{ maxWidth:1080, margin:'0 auto', display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:24 }}>
            {HOW_IT_WORKS.map((s, i) => (
              <Reveal key={s.n} style={{ transitionDelay:`${i*0.08}s` }}>
                <div style={{ textAlign:'center' }}>
                  <span style={{ fontFamily:FONT_DISPLAY, fontSize:38, color:C.brassLight, fontWeight:600, textShadow:'0 2px 12px rgba(0,0,0,0.5)' }}>{s.n}</span>
                  <h3 style={{ fontFamily:FONT_BODY, fontSize:15.5, fontWeight:700, margin:'10px 0 8px', color:'#fff', textShadow:'0 2px 12px rgba(0,0,0,0.5)' }}>{s.title}</h3>
                  <p style={{ fontFamily:FONT_BODY, fontSize:13.5, lineHeight:1.6, color:'rgba(255,255,255,0.85)', margin:0, textShadow:'0 1px 8px rgba(0,0,0,0.5)' }}>{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── BOOKING FORM ──────────────────────────────────── */}
      <section id="book" style={{ padding:'clamp(64px,8vw,100px) clamp(20px,5vw,56px)' }}>
        <BookingForm />
      </section>

      {/* ── TRUST / BENEFITS ──────────────────────────────── */}
      <section style={{ padding:'clamp(40px,6vw,64px) clamp(20px,5vw,56px) clamp(64px,8vw,100px)', background:C.card }}>
        <Reveal>
          <div style={{ textAlign:'center', marginBottom:44 }}>
            <Eyebrow>Why Guests Choose Bagdrop</Eyebrow>
            <h2 style={{ fontFamily:FONT_DISPLAY, fontWeight:600, fontSize:'clamp(28px,4.4vw,42px)', margin:'14px 0 0', color:C.ink }}>Why Guests Choose Bagdrop</h2>
          </div>
        </Reveal>
        <div className="icq-benefits-grid" style={{ maxWidth:1080, margin:'0 auto', display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:24 }}>
          {BENEFITS.map((b, i) => (
            <Reveal key={b.title} style={{ transitionDelay:`${i*0.05}s` }}>
              <div style={{ padding:24, borderRadius:16, background:C.ivory, border:`1px solid ${C.borderCard}`, height:'100%' }}>
                <h3 style={{ fontFamily:FONT_BODY, fontSize:15.5, fontWeight:700, margin:'0 0 8px', color:C.ink }}>{b.title}</h3>
                <p style={{ fontFamily:FONT_BODY, fontSize:13.5, lineHeight:1.65, color:C.steel, margin:0 }}>{b.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── GUEST EXPERIENCE / JOURNEY ────────────────────── */}
      <section style={{ padding:'clamp(64px,8vw,100px) clamp(20px,5vw,56px)' }}>
        <Reveal>
          <div style={{ textAlign:'center', marginBottom:44 }}>
            <Eyebrow>The Journey</Eyebrow>
            <h2 style={{ fontFamily:FONT_DISPLAY, fontWeight:600, fontSize:'clamp(28px,4.4vw,42px)', margin:'14px 0 0', color:C.ink }}>Your Guest Experience</h2>
          </div>
        </Reveal>
        <div className="icq-context-grid" style={{ maxWidth:1080, margin:'0 auto 48px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          <Reveal>
            <div style={{ borderRadius:18, overflow:'hidden', boxShadow:'0 20px 50px rgba(23,27,34,0.12)', aspectRatio:'5/4' }}>
              <img src={IMG_AIRPORT_VIEW} alt="Mumbai International Airport, viewed from ICONIQA Hotel" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
            </div>
          </Reveal>
          <Reveal style={{ transitionDelay:'0.08s' }}>
            <div style={{ borderRadius:18, overflow:'hidden', boxShadow:'0 20px 50px rgba(23,27,34,0.12)', aspectRatio:'5/4' }}>
              <img src={IMG_AIRPORT_NIGHT} alt="Mumbai International Airport terminal at night" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
            </div>
          </Reveal>
        </div>
        <Reveal><JourneyVisual /></Reveal>
      </section>

      {/* ── FAQ ───────────────────────────────────────────── */}
      <section id="faq" style={{ padding:'clamp(40px,6vw,64px) clamp(20px,5vw,56px) clamp(64px,8vw,100px)', background:C.card }}>
        <Reveal>
          <div style={{ textAlign:'center', marginBottom:40 }}>
            <Eyebrow>FAQ</Eyebrow>
            <h2 style={{ fontFamily:FONT_DISPLAY, fontWeight:600, fontSize:'clamp(28px,4.4vw,42px)', margin:'14px 0 0', color:C.ink }}>Frequently Asked Questions</h2>
          </div>
        </Reveal>
        <Reveal><FAQAccordion /></Reveal>
      </section>

      {/* ── FOOTER ────────────────────────────────────────── */}
      <footer style={{ background:C.navyDeep, color:'rgba(255,255,255,0.75)', padding:'64px clamp(20px,5vw,56px) 36px', textAlign:'center' }}>
        <img src={IMG_LOGO} alt="ICONIQA Hotels and Resorts" style={{ height:68, width:'auto', margin:'0 auto 16px', display:'block' }} />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:12, margin:'0 0 28px' }}>
          <span style={{ fontFamily:FONT_BODY, fontSize:14, letterSpacing:'0.14em', textTransform:'uppercase', color:C.brassLight }}>Baggage Delivery by</span>
          <img src={IMG_BAGDROP_LOGO} alt="Bagdrop" style={{ height:80, width:'auto', display:'block', filter:'brightness(0) invert(1)' }} />
        </div>
        <p style={{ fontFamily:FONT_BODY, fontSize:16, margin:'0 0 6px' }}>
          <a href="mailto:info@bagdrop.co" style={{ color:'inherit' }}>info@bagdrop.co</a>
        </p>
        <p style={{ fontFamily:FONT_BODY, fontSize:13.5, color:'rgba(255,255,255,0.45)', margin:'26px 0 0' }}>© {new Date().getFullYear()} Bagdrop — Aviation Infrastructure Company. All rights reserved.</p>
      </footer>
    </div>
  )
}
