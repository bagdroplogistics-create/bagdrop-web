'use client'

import * as React from 'react'
import { motion } from 'framer-motion'

// ─── Animated counter ─────────────────────────────────────────

interface CounterProps {
  to: number
  decimals?: number
  suffix?: string
}

function AnimatedCounter({ to, decimals = 0, suffix = '' }: CounterProps) {
  const ref = React.useRef<HTMLSpanElement>(null)
  // Initialize to final value so SSR + first paint always shows the real number
  const [value, setValue] = React.useState(to)
  const animated = React.useRef(false)

  React.useEffect(() => {
    if (animated.current || !ref.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        animated.current = true
        observer.disconnect()
        const duration = 1800
        const startTime = performance.now()
        setValue(0)
        function tick(now: number) {
          const elapsed = now - startTime
          const t = Math.min(elapsed / duration, 1)
          // Cubic ease-out
          const eased = 1 - Math.pow(1 - t, 3)
          setValue(eased * to)
          if (t < 1) requestAnimationFrame(tick)
          else setValue(to)
        }
        requestAnimationFrame(tick)
      },
      { rootMargin: '-60px' }
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [to])

  const display = `${Number(value.toFixed(decimals)).toLocaleString('en-IN')}${suffix}`
  return <span ref={ref}>{display}</span>
}

// ─── Metrics ──────────────────────────────────────────────────

const METRICS = [
  {
    label:    'Bags Delivered',
    to:       12000,
    suffix:   '+',
    decimals: 0,
  },
  {
    label:    'Cities Covered',
    to:       50,
    suffix:   '+',
    decimals: 0,
  },
  {
    label:    'On-Time Rate',
    to:       98.7,
    suffix:   '%',
    decimals: 1,
  },
  {
    label:    'Customer Rating',
    to:       4.9,
    suffix:   ' / 5',
    decimals: 1,
  },
] as const

// ─── TrustBar Section ─────────────────────────────────────────

export function TrustBar() {
  return (
    <section
      className="border-y border-border bg-white"
      aria-label="Trust metrics"
    >
      <div className="section-container py-10 md:py-12">
        <motion.dl
          className="grid grid-cols-2 gap-8 sm:grid-cols-4"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={{
            hidden:  {},
            visible: { transition: { staggerChildren: 0.1 } },
          }}
        >
          {METRICS.map(({ label, to, suffix, decimals }) => (
            <motion.div
              key={label}
              className="text-center"
              variants={{
                hidden:  { opacity: 0, y: 16 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
              }}
            >
              <dt
                className="font-display text-4xl font-bold text-text-primary lg:text-5xl"
                aria-label={`${to}${suffix} ${label}`}
              >
                <AnimatedCounter to={to} decimals={decimals} suffix={suffix} />
              </dt>
              <dd className="mt-2 text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
                {label}
              </dd>
            </motion.div>
          ))}
        </motion.dl>
      </div>
    </section>
  )
}
