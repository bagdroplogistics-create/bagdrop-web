'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const HAPPY_CLIENTS = [
  {
    // ASSUMPTION: bag count (5) read off the photo.
    name:    'Hiral Shah Ratnani',
    bags:    5,
    route:   'Vadodara to Mumbai',
    image:   '/images/testimonials/hiral-shah-ratnani.jpg',
    initials: 'HS',
  },
  {
    name:    'Mr. Brijesh Patel',
    bags:    6,
    route:   'Vadodara to Mumbai',
    image:   '/images/testimonials/brijesh-patel.jpg',
    initials: 'BP',
  },
  {
    name:    'Mr. Suyash Vaishnav',
    bags:    3,
    route:   'Vadodara to Mumbai',
    image:   '/images/testimonials/suyash-vaishnav.jpg',
    initials: 'SV',
  },
  {
    name:    'Ms. Shimoli Joshi',
    bags:    2,
    route:   'Vadodara to Mumbai',
    image:   '/images/testimonials/shimoli-joshi.jpg',
    initials: 'SJ',
  },
  {
    name:    'Mr. Nimesh Shah',
    bags:    3,
    route:   'Vadodara to Mumbai',
    image:   '/images/testimonials/nimesh-shah.jpg',
    initials: 'NS',
  },
]

const containerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
}

const cardVariants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
}

function StarRow() {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} className="h-4 w-4 fill-[#FF6300]" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

export function Testimonials() {
  const trackRef  = useRef<HTMLDivElement>(null)
  const cardRefs  = useRef<(HTMLDivElement | null)[]>([])
  const ratiosRef = useRef<Map<Element, number>>(new Map())
  const [active, setActive] = useState(0)

  const scrollToIndex = useCallback((i: number) => {
    const clamped = Math.max(0, Math.min(HAPPY_CLIENTS.length - 1, i))
    cardRefs.current[clamped]?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
    // Update immediately on click rather than waiting for the observer —
    // this is what makes the arrows/dots feel responsive instead of stuck.
    setActive(clamped)
  }, [])

  // Track which card is leftmost in view so the dots / arrows stay in sync
  // with touch-scrolling as well as button clicks.
  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    const ratios = ratiosRef.current

    const observer = new IntersectionObserver(
      (entries) => {
        // IMPORTANT: `entries` only contains the cards whose intersection
        // state *changed* since the last callback — not every card that's
        // currently visible. Keeping a running map of every card's last-known
        // ratio (keyed by element) and recomputing the best one from that
        // full map on every tick is what makes this reliable.
        entries.forEach((entry) => {
          ratios.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0)
        })

        let bestIdx = -1
        let bestRatio = 0
        cardRefs.current.forEach((el, idx) => {
          if (!el) return
          const r = ratios.get(el) ?? 0
          if (r > bestRatio) {
            bestRatio = r
            bestIdx = idx
          }
        })
        if (bestIdx !== -1) setActive(bestIdx)
      },
      { root: track, threshold: [0, 0.25, 0.5, 0.75, 1] }
    )

    cardRefs.current.forEach((el) => el && observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <section className="section-padding bg-cream" aria-labelledby="testimonials-heading">
      <div className="section-container">

        {/* Heading */}
        <motion.div
          className="flex flex-col items-center text-center sm:flex-row sm:items-end sm:justify-between sm:text-left"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, ease: 'easeOut' as const }}
        >
          <div>
            <span className="eyebrow">Happy Clients</span>
            <h2 id="testimonials-heading" className="mt-3 font-display text-display-md text-text-primary">
              Real customers. Real deliveries.
            </h2>
            <p className="mt-4 text-lg text-text-secondary max-w-xl sm:mx-0 mx-auto">
              Every bag delivered. Every client smiling.
            </p>
          </div>

          {/* Slider arrows — desktop / tablet */}
          <div className="mt-6 hidden shrink-0 items-center gap-2 sm:mt-0 sm:flex">
            <button
              type="button"
              onClick={() => scrollToIndex(active - 1)}
              disabled={active === 0}
              aria-label="Previous testimonial"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white text-text-primary shadow-sm transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => scrollToIndex(active + 1)}
              disabled={active === HAPPY_CLIENTS.length - 1}
              aria-label="Next testimonial"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white text-text-primary shadow-sm transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </motion.div>

        {/* Slider track */}
        <div className="-mx-4 sm:mx-0 mt-10">
          <motion.div
            ref={trackRef}
            className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-4 pb-4 sm:px-0 sm:pb-0 scrollbar-hide"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            role="region"
            aria-label="Customer testimonials — swipe or use the arrows to browse"
          >
            {HAPPY_CLIENTS.map((client, i) => (
              <motion.div
                key={client.name}
                ref={(el) => { cardRefs.current[i] = el }}
                variants={cardVariants}
                className="w-[78vw] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-white shadow-sm sm:w-[calc((100%-2.5rem)/3)] lg:w-[calc((100%-3.75rem)/4)]"
              >
                {/* Photo */}
                <div className="relative h-72 w-full bg-stone-100">
                  <Image
                    src={client.image}
                    alt={client.name}
                    fill
                    className="object-cover object-top"
                    sizes="(max-width: 640px) 78vw, (max-width: 1024px) 33vw, 25vw"
                  />
                </div>

                {/* Details */}
                <div className="p-5">
                  <StarRow />
                  <p className="mt-2 font-bold text-text-primary">{client.name}</p>
                  <p className="mt-0.5 text-sm text-text-secondary">
                    <span className="font-semibold text-[#FF6300]">{client.bags} {client.bags === 1 ? 'Bag' : 'Bags'}</span>
                    {' '}Delivered
                  </p>
                  <p className="text-sm text-text-muted">{client.route}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Dots — mirror active slide, tappable on all breakpoints */}
        <div className="mt-6 flex items-center justify-center gap-1.5" aria-hidden="true">
          {HAPPY_CLIENTS.map((client, i) => (
            <button
              key={client.name}
              type="button"
              onClick={() => scrollToIndex(i)}
              aria-label={`Go to ${client.name}'s testimonial`}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === active ? 'w-6 bg-[#FF6300]' : 'w-1.5 bg-border'
              }`}
            />
          ))}
        </div>

      </div>
    </section>
  )
}
