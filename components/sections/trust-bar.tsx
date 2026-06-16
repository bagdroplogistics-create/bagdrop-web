'use client'

import * as React from 'react'
import { motion, useInView, useMotionValue, useSpring, useTransform } from 'framer-motion'

// ─── Animated counter ─────────────────────────────────────────

interface CounterProps {
  to: number
  decimals?: number
  prefix?: string
  suffix?: string
  duration?: number
}

function AnimatedCounter({ to, decimals = 0, prefix = '', suffix = '', duration = 1800 }: CounterProps) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })
  const motionValue = useMotionValue(0)
  const spring = useSpring(motionValue, { duration, bounce: 0 })
  const display = useTransform(spring, (current) => {
    const formatted = current.toFixed(decimals)
    return `${prefix}${Number(formatted).toLocaleString('en-IN')}${suffix}`
  })

  React.useEffect(() => {
    if (isInView) motionValue.set(to)
  }, [isInView, motionValue, to])

  return <motion.span ref={ref}>{display}</motion.span>
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
    to:       8,
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
