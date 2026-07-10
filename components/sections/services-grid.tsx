'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  PlaneLanding, Home, Heart, GraduationCap, Briefcase, Package, ArrowRight, ChevronLeft, ChevronRight,
} from 'lucide-react'

const SERVICES = [
  {
    id:          'airport-delivery',
    href:        '/airport-delivery',
    Icon:        PlaneLanding,
    label:       'Airport Delivery',
    description: 'Land and walk out empty-handed. We collect your bags at arrivals and deliver them to your hotel or home.',
    tag:         'Most popular',
    photo:       'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=560&h=380&q=80&auto=format&fit=crop',
    photoPos:    'center 40%',
  },
  {
    id:          'door-to-door',
    href:        '/door-to-door',
    Icon:        Home,
    label:       'Door-to-Door',
    description: 'Send luggage between any two addresses across Gujarat, Maharashtra, and Goa. No airport, no hassle.',
    tag:         null,
    photo:       'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=560&h=380&q=80&auto=format&fit=crop',
    photoPos:    'center 50%',
  },
  {
    id:          'destination-weddings',
    href:        '/destination-weddings',
    Icon:        Heart,
    label:       'Destination Weddings',
    description: 'White-glove handling for lehengas, sherwanis, and gifts. We arrive early so your big day starts perfectly.',
    tag:         'High value',
    photo:       'https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=560&h=380&q=80&auto=format&fit=crop&crop=top',
    photoPos:    'center 25%',
  },
  {
    id:          'student-relocation',
    href:        '/student-relocation',
    Icon:        GraduationCap,
    label:       'Student Relocation',
    description: 'Moving abroad or to a new city? Skip the excess fee. We ship everything you own, affordably.',
    tag:         null,
    photo:       'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=560&h=380&q=80&auto=format&fit=crop',
    photoPos:    'center 40%',
  },
  {
    id:          'corporate-travel',
    href:        '/corporate-travel',
    Icon:        Briefcase,
    label:       'Corporate Travel',
    description: 'Volume rates, GST invoicing, and a dedicated account manager. Business-class logistics for your team.',
    tag:         null,
    photo:       'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=560&h=380&q=80&auto=format&fit=crop',
    photoPos:    'center center',
  },
  {
    id:          'excess-baggage',
    href:        '/excess-baggage',
    Icon:        Package,
    label:       'Excess Baggage',
    description: 'Ship it for less than the airline charges. Most customers save 40–60% on excess baggage fees.',
    tag:         'Save money',
    photo:       'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=560&h=380&q=80&auto=format&fit=crop',
    photoPos:    'center center',
  },
] as const

export function ServicesGrid() {
  const [current, setCurrent] = useState(0)
  const [visibleCount, setVisibleCount] = useState(3)
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Determine how many cards are visible based on viewport
  useEffect(() => {
    function update() {
      if (window.innerWidth < 640)       setVisibleCount(1)
      else if (window.innerWidth < 1024) setVisibleCount(2)
      else                               setVisibleCount(3)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const maxIndex = SERVICES.length - visibleCount

  const goTo = useCallback((idx: number) => {
    setCurrent(Math.max(0, Math.min(idx, maxIndex)))
  }, [maxIndex])

  const prev = () => goTo(current - 1)
  const next = () => goTo(current === maxIndex ? 0 : current + 1)

  // Auto-advance every 4 seconds
  useEffect(() => {
    autoRef.current = setInterval(() => {
      setCurrent(c => (c >= maxIndex ? 0 : c + 1))
    }, 4000)
    return () => { if (autoRef.current) clearInterval(autoRef.current) }
  }, [maxIndex])

  // Reset auto-timer on manual navigation
  function manualNav(fn: () => void) {
    if (autoRef.current) clearInterval(autoRef.current)
    fn()
    autoRef.current = setInterval(() => {
      setCurrent(c => (c >= maxIndex ? 0 : c + 1))
    }, 4000)
  }

  // Card width % based on visible count
  const cardWidthPct = 100 / visibleCount

  return (
    <section className="section-padding overflow-hidden bg-cream" aria-labelledby="services-heading">

      {/* Heading + nav buttons */}
      <div className="section-container mb-10">
        <div className="flex items-end justify-between gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, ease: 'easeOut' as const }}
          >
            <span className="eyebrow">Our Services</span>
            <h2 id="services-heading" className="mt-3 font-display text-display-md text-text-primary max-w-2xl">
              Every journey. Every bag.{' '}
              <span className="text-gradient">Handled.</span>
            </h2>
            <p className="mt-4 text-lg text-text-secondary max-w-xl">
              Six ways to travel without the weight.
            </p>
          </motion.div>

          {/* Prev / Next buttons */}
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <button
              onClick={() => manualNav(prev)}
              disabled={current === 0}
              aria-label="Previous service"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white shadow-sm transition-all hover:border-brand hover:text-brand disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => manualNav(next)}
              aria-label="Next service"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white shadow-sm transition-all hover:border-brand hover:text-brand"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Slider track */}
      <div className="section-container overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${current * cardWidthPct}%)` }}
        >
          {SERVICES.map((service) => (
            <div
              key={service.id}
              className="shrink-0 px-2.5"
              style={{ width: `${cardWidthPct}%` }}
            >
              <Link
                href={service.href}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-brand/25 hover:shadow-lg"
                aria-label={`${service.label} — Learn more`}
              >
                {/* Photo */}
                <div className="relative h-[200px] overflow-hidden bg-neutral-100">
                  <div
                    className="absolute inset-0 bg-cover bg-no-repeat transition-transform duration-700 ease-out group-hover:scale-[1.06]"
                    style={{ backgroundImage: `url('${service.photo}')`, backgroundPosition: service.photoPos }}
                    aria-hidden="true"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white/20 to-transparent" aria-hidden="true" />
                  {service.tag && (
                    <div className="absolute left-3 top-3">
                      <span className="inline-flex items-center rounded-full bg-brand px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
                        {service.tag}
                      </span>
                    </div>
                  )}
                </div>

                {/* Body */}
                <div className="flex flex-1 flex-col p-5">
                  <div className="mb-3 flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand transition-colors duration-200 group-hover:bg-brand group-hover:text-white">
                      <service.Icon className="h-3.5 w-3.5" strokeWidth={2} />
                    </div>
                    <h3 className="font-display text-base font-semibold text-text-primary group-hover:text-brand transition-colors duration-200">
                      {service.label}
                    </h3>
                  </div>
                  <p className="flex-1 text-sm leading-relaxed text-text-secondary line-clamp-3">
                    {service.description}
                  </p>
                  <div className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-brand">
                    Learn more
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* Dot indicators + mobile arrows */}
      <div className="section-container mt-6 flex items-center justify-between">
        {/* Mobile prev/next */}
        <button
          onClick={() => manualNav(prev)}
          disabled={current === 0}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white shadow-sm sm:hidden disabled:opacity-30"
          aria-label="Previous"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Dots */}
        <div className="flex items-center gap-2" aria-hidden="true">
          {Array.from({ length: maxIndex + 1 }).map((_, i) => (
            <button
              key={i}
              onClick={() => manualNav(() => goTo(i))}
              aria-label={`Go to slide ${i + 1}`}
              className={`rounded-full transition-all duration-300 ${
                i === current ? 'w-6 h-2 bg-brand' : 'w-2 h-2 bg-border hover:bg-brand/40'
              }`}
            />
          ))}
        </div>

        {/* Mobile next */}
        <button
          onClick={() => manualNav(next)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white shadow-sm sm:hidden"
          aria-label="Next"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* Desktop label */}
        <span className="hidden sm:block text-xs text-text-muted">
          {current + 1} – {Math.min(current + visibleCount, SERVICES.length)} of {SERVICES.length}
        </span>
      </div>

    </section>
  )
}
