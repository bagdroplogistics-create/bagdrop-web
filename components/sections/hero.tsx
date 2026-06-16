'use client'

import * as React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, ChevronLeft, ChevronRight, CheckCircle2, MapPin, Clock, Package, Luggage } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Slide data ───────────────────────────────────────────────

const SLIDES = [
  {
    id: 'airport',
    image: '/images/web-slider.jpg',
    badge: 'Airport Delivery',
    headline1: 'Travel Light.',
    headline2: 'Arrive Stress-Free.',
    body: 'We pick up your bags from home and deliver them straight to the airport — or vice versa. No queues. No trolleys. No hassle.',
    cta1: { label: 'Book Airport Delivery', href: '/book' },
    cta2: { label: 'Track My Bag', href: '/track' },
  },
  {
    id: 'wedding',
    image: 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=1920&q=80',
    badge: 'Destination Weddings',
    headline1: 'Your Wedding Day.',
    headline2: 'Bag-Free.',
    body: 'Coordinating wedding luggage across cities is stressful enough. Let Bagdrop handle every piece — for you, your family, and your guests.',
    cta1: { label: 'Plan Wedding Logistics', href: '/services/destination-weddings' },
    cta2: { label: 'Get a Quote', href: '/book' },
  },
  {
    id: 'student',
    image: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=1920&q=80',
    badge: 'Student Relocation',
    headline1: 'Moving For College?',
    headline2: "We've Got Your Bags.",
    body: "From Mumbai to Bangalore, Delhi to Pune — we ship your bags door-to-door so you can focus on your first day, not your luggage.",
    cta1: { label: 'Ship Student Bags', href: '/services/student-relocation' },
    cta2: { label: 'See Pricing', href: '/book' },
  },
]

const TRUST = ['12,000+ bags delivered', '98.7% on-time', 'Fully insured']

// ─── Floating order card (right side) ────────────────────────

const TIMELINE = [
  { label: 'Booked',     done: true  },
  { label: 'Picked up',  done: true  },
  { label: 'In transit', done: true,  active: true },
  { label: 'Delivered',  done: false },
]

function BagsCard() {
  return (
    <motion.div
      className="relative w-full max-w-[320px]"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.6, ease: 'easeOut' as const }}
    >
      {/* Glow */}
      <div className="absolute inset-0 rounded-3xl bg-white/10 blur-2xl scale-95" />

      {/* Card */}
      <div className="relative rounded-3xl border border-white/20 bg-white/95 shadow-2xl backdrop-blur-sm p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand">
              <Luggage className="h-3.5 w-3.5 text-white" strokeWidth={2} />
            </div>
            <span className="font-display text-sm font-bold text-text-primary">Bagdrop</span>
          </div>
          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-text-muted">
            BD-4K7P2X
          </span>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2 rounded-xl bg-brand/10 px-3 py-2.5 mb-4">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand" />
          </span>
          <span className="text-sm font-semibold text-brand">In Transit · Mumbai</span>
        </div>

        {/* Timeline */}
        <div className="space-y-2.5 mb-4">
          {TIMELINE.map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={[
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                step.done ? 'bg-brand' : 'bg-stone-100 border border-stone-300',
              ].join(' ')}>
                {step.done && <CheckCircle2 className="h-3 w-3 text-white" strokeWidth={2.5} />}
              </div>
              <span className={[
                'text-sm',
                step.active ? 'font-semibold text-brand' : step.done ? 'text-text-secondary' : 'text-text-muted',
              ].join(' ')}>
                {step.label}
              </span>
              {step.active && (
                <span className="ml-auto text-[10px] font-medium text-brand bg-brand/10 rounded-full px-2 py-0.5">Live</span>
              )}
            </div>
          ))}
        </div>

        {/* ETA */}
        <div className="flex items-center justify-between rounded-xl border border-stone-100 bg-stone-50 px-3 py-2.5">
          <div className="flex items-center gap-2 text-text-muted">
            <Clock className="h-4 w-4" />
            <span className="text-xs">Estimated arrival</span>
          </div>
          <span className="text-sm font-bold text-text-primary">45 min</span>
        </div>

        {/* Bag count */}
        <div className="mt-2.5 flex items-center gap-2 text-text-muted">
          <Package className="h-3.5 w-3.5" />
          <span className="text-xs">2 bags · Mumbai → BOM Terminal 2</span>
        </div>
      </div>

      {/* Floating verified badge */}
      <motion.div
        className="absolute -bottom-4 -right-3 rounded-2xl border border-stone-200 bg-white shadow-lg px-3 py-2.5"
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 1.1, ease: 'easeOut' as const }}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-text-primary">Bag photo verified</p>
            <p className="text-[10px] text-text-muted">2 min ago</p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Hero Slider ──────────────────────────────────────────────

export function HeroSection() {
  const [current, setCurrent] = React.useState(0)
  const [paused,  setPaused]  = React.useState(false)
  const total = SLIDES.length

  React.useEffect(() => {
    if (paused) return
    const t = setInterval(() => setCurrent(c => (c + 1) % total), 6000)
    return () => clearInterval(t)
  }, [paused, total])

  function goTo(i: number) { setCurrent((i + total) % total) }

  const slide = SLIDES[current]

  return (
    <section
      className="relative min-h-screen overflow-hidden"
      aria-label="Hero"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* ── Background image crossfade ── */}
      <AnimatePresence initial={false}>
        <motion.div
          key={slide.id + '-bg'}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: 'easeInOut' as const }}
        >
          <Image
            src={slide.image}
            alt=""
            fill
            priority={current === 0}
            sizes="100vw"
            className="object-cover object-center"
            aria-hidden="true"
          />
          {/* Dark gradient — natural black, no blue tint */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(105deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.60) 40%, rgba(0,0,0,0.30) 70%, rgba(0,0,0,0.08) 100%)',
            }}
          />
        </motion.div>
      </AnimatePresence>

      {/* ── Content: text LEFT + bags RIGHT ── */}
      <div className="relative z-10 flex min-h-screen items-center">
        <div className="section-container w-full py-28 lg:py-36">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">

            {/* ── Left column: all text, left-aligned ── */}
            <div className="text-left">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={slide.id + '-content'}
                  initial={{ opacity: 0, y: 32 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5, ease: 'easeOut' as const }}
                  className="text-left"
                >
                  {/* Service badge */}
                  <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-1.5 backdrop-blur-sm">
                    <MapPin className="h-3.5 w-3.5 text-[#FF6300]" />
                    <span className="text-xs font-semibold uppercase tracking-widest text-white">
                      {slide.badge}
                    </span>
                  </div>

                  {/* Headline */}
                  <h1
                    className="font-display font-extrabold text-white leading-[1.05] text-left"
                    style={{ fontSize: 'clamp(2.8rem, 5vw, 4.5rem)' }}
                  >
                    {slide.headline1}
                    <br />
                    <span className="text-[#FF6300]">{slide.headline2}</span>
                  </h1>

                  {/* Body */}
                  <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/80 text-left">
                    {slide.body}
                  </p>

                  {/* CTAs */}
                  <div className="mt-10 flex flex-wrap items-center justify-start gap-4">
                    <Button
                      variant="primary"
                      size="xl"
                      className="group shadow-lg shadow-black/30"
                      asChild
                    >
                      <Link href={slide.cta1.href}>
                        {slide.cta1.label}
                        <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
                      </Link>
                    </Button>
                    <Button
                      size="xl"
                      className="border border-white/50 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 hover:border-white/80 transition-all"
                      asChild
                    >
                      <Link href={slide.cta2.href}>{slide.cta2.label}</Link>
                    </Button>
                  </div>

                  {/* Trust strip */}
                  <div className="mt-10 flex flex-wrap items-center justify-start gap-x-5 gap-y-2">
                    {TRUST.map((item, i) => (
                      <React.Fragment key={item}>
                        <span className="flex items-center gap-1.5 text-sm text-white/70">
                          <CheckCircle2 className="h-3.5 w-3.5 text-[#FF6300]" />
                          {item}
                        </span>
                        {i < TRUST.length - 1 && (
                          <span className="h-3 w-px bg-white/20" aria-hidden="true" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* ── Right column: bags card, right-aligned ── */}
            <div className="hidden lg:flex items-center justify-end pr-4">
              <BagsCard />
            </div>

          </div>
        </div>
      </div>

      {/* ── Navigation: dots + arrows ── */}
      <div className="absolute bottom-10 left-0 right-0 z-20 flex items-center justify-center gap-6">
        <button
          onClick={() => goTo(current - 1)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white backdrop-blur-sm transition-all hover:bg-white/25"
          aria-label="Previous slide"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2">
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              className="relative h-1.5 overflow-hidden rounded-full transition-all duration-300"
              style={{ width: i === current ? 32 : 12, background: 'rgba(255,255,255,0.35)' }}
            >
              {i === current && (
                <motion.span
                  className="absolute inset-0 rounded-full bg-[#FF6300]"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 6, ease: 'linear' as const }}
                  style={{ transformOrigin: 'left' }}
                  key={current + '-fill'}
                />
              )}
            </button>
          ))}
        </div>

        <button
          onClick={() => goTo(current + 1)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white backdrop-blur-sm transition-all hover:bg-white/25"
          aria-label="Next slide"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Slide counter */}
      <div className="absolute bottom-10 right-6 z-20 hidden lg:block">
        <span className="text-xs font-semibold text-white/50 tabular-nums">
          {String(current + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
      </div>
    </section>
  )
}
