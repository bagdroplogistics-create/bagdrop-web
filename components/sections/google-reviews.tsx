'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const REVIEWS = [
  {
    name: 'Kavitha Chandrasekaran',
    initials: 'KC',
    weeks: '2 days ago',
    text: 'Had a good experience with bag drop. Affordable price, they delivered the baggage on time.',
  },
  {
    name: 'Saurabh Bafna',
    initials: 'SB',
    weeks: '8 weeks ago',
    text: 'Have used Bagdrop three times and each experience has been seamless. The service is excellent, reliable, and takes all the stress out of travelling with heavy or bulky luggage. Anyone who travels with a lot of bags should definitely give them a try. Would 100% recommend!',
  },
  {
    name: 'Priya Shah',
    initials: 'PS',
    weeks: '17 weeks ago',
    text: 'We used Bagdrop services to transfer luggage to Mumbai. This has been an amazing service that we found online — our luggage got picked up from our doorstep in Goa and delivered to our Bombay house. Highly recommend this service.',
  },
  {
    name: 'Poonam Agrawal',
    initials: 'PA',
    weeks: '17 weeks ago',
    text: 'It was really a very good service. Everything was well planned from pickup of luggage till the dropping of bags at the international airport. Thank you Bagdrop Solutions. Really appreciate!',
  },
  {
    name: 'Saurabh Muley',
    initials: 'SM',
    weeks: '17 weeks ago',
    text: 'Excellent service for hassle-free baggage transport from one city to another. My bags were picked up on time, properly wrapped, and delivered on schedule. Would highly recommend for a smooth and hassle-free baggage transport experience.',
  },
  {
    name: 'Snehal Shah',
    initials: 'SS',
    weeks: '10 weeks ago',
    text: 'Really nice experience — on time for pickup as well as drop.',
  },
  {
    name: 'Praful Patel',
    initials: 'PP',
    weeks: '15 weeks ago',
    text: 'Excellent, satisfactory and most reliable service.',
  },
  {
    name: 'Aditya Gaikwad',
    initials: 'AG',
    weeks: '17 weeks ago',
    text: 'Reliable and on time delivery.',
  },
  {
    name: 'Bharat Patel',
    initials: 'BP',
    weeks: '14 weeks ago',
    text: 'Very perfect & in time.',
  },
]

function StarRow() {
  return (
    <div className="flex gap-0.5" aria-label="5 out of 5 stars">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} className="h-4 w-4 fill-[#FBBC04]" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

// Google "G" logo SVG
function GoogleLogo() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
}

const cardVariants = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' as const } },
}

export function GoogleReviews() {
  const trackRef  = useRef<HTMLDivElement>(null)
  const cardRefs  = useRef<(HTMLDivElement | null)[]>([])
  const ratiosRef = useRef<Map<Element, number>>(new Map())
  const [active, setActive] = useState(0)

  const scrollToIndex = useCallback((i: number) => {
    const clamped = Math.max(0, Math.min(REVIEWS.length - 1, i))
    cardRefs.current[clamped]?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
    // Update immediately on click rather than waiting for the observer —
    // this is what makes the arrows/dots feel responsive instead of stuck.
    setActive(clamped)
  }, [])

  // Keep the dots / arrow disabled-state in sync with touch-scrolling too.
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
        // full map on every tick is what makes this reliable; reading only
        // the batch of changed entries (the previous implementation) meant
        // the "active" card often failed to advance after a scroll.
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
    <section className="section-padding overflow-hidden bg-white" aria-labelledby="google-reviews-heading">
      <div className="section-container">

        {/* Heading */}
        <motion.div
          className="flex flex-col items-center text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          {/* Google badge */}
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 shadow-sm">
            <GoogleLogo />
            <span className="text-sm font-semibold text-gray-700">Google Reviews</span>
            <span className="flex items-center gap-1 text-sm font-bold text-gray-900">
              5.0
              <svg className="h-4 w-4 fill-[#FBBC04]" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </span>
            <span className="text-sm text-gray-400">(13 reviews)</span>
          </div>

          <h2 id="google-reviews-heading" className="mt-2 font-display text-display-md text-text-primary">
            What our customers say
          </h2>
          <p className="mt-4 text-lg text-text-secondary max-w-xl mx-auto">
            Every review is from a verified customer on Google.
          </p>
        </motion.div>

        {/* Slider arrows */}
        <div className="mt-6 hidden items-center justify-end gap-2 sm:flex">
          <button
            type="button"
            onClick={() => scrollToIndex(active - 1)}
            disabled={active === 0}
            aria-label="Previous review"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => scrollToIndex(active + 1)}
            disabled={active === REVIEWS.length - 1}
            aria-label="Next review"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Review cards — full-bleed horizontal slider so the row uses the
          entire viewport width (not just the 1280px content column), fitting
          as many fixed-width cards on one line as will physically fit. The
          section stays a fixed height no matter how many reviews get added
          later — extras just extend the scrollable track. */}
      <div
        className="mt-4 overflow-x-auto scrollbar-hide"
        style={{
          paddingLeft: 'max(1rem, calc((100vw - 80rem) / 2 + 2rem))',
          paddingRight: 'max(1rem, calc((100vw - 80rem) / 2 + 2rem))',
          scrollSnapType: 'x mandatory',
        }}
        ref={trackRef}
        role="region"
        aria-label="Customer reviews — swipe or use the arrows to browse"
      >
        <motion.div
          className="flex gap-5 pb-4 sm:pb-0"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
        >
          {REVIEWS.map((review, i) => (
              <motion.div
                key={review.name}
                ref={(el) => { cardRefs.current[i] = el }}
                variants={cardVariants}
                className="flex w-[85vw] max-w-[320px] shrink-0 flex-col rounded-2xl border border-gray-100 bg-gray-50 p-5 shadow-sm sm:w-[300px]"
                style={{ scrollSnapAlign: 'start' }}
              >
                {/* Top row: avatar + name + Google logo */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    {/* Avatar initial */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FF6300] text-sm font-bold text-white">
                      {review.initials}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-gray-900 leading-tight">{review.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{review.weeks}</p>
                    </div>
                  </div>
                  <GoogleLogo />
                </div>

                {/* Stars */}
                <StarRow />

                {/* Review text */}
                <p className="mt-3 text-sm text-gray-600 leading-relaxed flex-1">
                  "{review.text}"
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>

      <div className="section-container">
        {/* Dots */}
        <div className="mt-6 flex items-center justify-center gap-1.5" aria-hidden="true">
          {REVIEWS.map((review, i) => (
            <button
              key={review.name}
              type="button"
              onClick={() => scrollToIndex(i)}
              aria-label={`Go to ${review.name}'s review`}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === active ? 'w-6 bg-[#FF6300]' : 'w-1.5 bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* See all on Google CTA */}
        <motion.div
          className="mt-10 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <a
            href="https://www.google.com/search?q=Bagdrop+Logistics+Solutions"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-700 shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-200"
          >
            <GoogleLogo />
            See all reviews on Google
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </motion.div>

      </div>
    </section>
  )
}
