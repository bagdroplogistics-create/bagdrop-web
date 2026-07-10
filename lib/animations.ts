/**
 * BAGDROP — Framer Motion Animation Variants
 *
 * Rules:
 * - No animation on the booking form (keeps it fast)
 * - All scroll-triggered animations use once:true (fire once, not on every scroll)
 * - Respect prefers-reduced-motion — wrap in useReducedMotion check
 * - Never animate layout properties (width, height, margin, padding)
 * - Only animate: opacity, transform (translate, scale, rotate)
 */

import type { Variants, Transition } from 'framer-motion'

// ─── Easing ──────────────────────────────────────────────────

export const ease = {
  smooth:       [0.4, 0, 0.2, 1] as const,   // Material standard
  snappy:       [0.4, 0, 0, 1] as const,      // Entrances
  exit:         [0.4, 0, 1, 1] as const,      // Exits
  spring:       { type: 'spring', stiffness: 300, damping: 30 } as Transition,
  springGentle: { type: 'spring', stiffness: 150, damping: 20 } as Transition,
}

// ─── Duration ────────────────────────────────────────────────

export const duration = {
  instant: 0.1,
  fast:    0.2,
  normal:  0.3,
  slow:    0.5,
  crawl:   0.8,
}

// ─── Shared Viewport Options ─────────────────────────────────

export const viewport = {
  once:   true,
  margin: '-80px',
}

// ─── Variants ────────────────────────────────────────────────

/** Fade up — primary entrance animation for section content */
export const fadeUp: Variants = {
  hidden:  { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.slow, ease: ease.snappy },
  },
}

/** Fade in — for elements that shouldn't move, just appear */
export const fadeIn: Variants = {
  hidden:  { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: duration.normal, ease: ease.smooth },
  },
}

/** Scale in — for cards and icons entering */
export const scaleIn: Variants = {
  hidden:  { opacity: 0, scale: 0.92 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: duration.slow * 0.8, ease: ease.snappy },
  },
}

/** Slide in from left */
export const slideInLeft: Variants = {
  hidden:  { opacity: 0, x: -32 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: duration.slow, ease: ease.snappy },
  },
}

/** Slide in from right */
export const slideInRight: Variants = {
  hidden:  { opacity: 0, x: 32 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: duration.slow, ease: ease.snappy },
  },
}

/** Stagger container — wraps card grids to stagger children */
export const staggerContainer: Variants = {
  hidden:  {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren:   0.1,
    },
  },
}

/** Stagger item — child of staggerContainer */
export const staggerItem: Variants = {
  hidden:  { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.normal * 1.5, ease: ease.snappy },
  },
}

/** Hero reveal — for the main homepage headline */
export const heroReveal: Variants = {
  hidden:  { opacity: 0, y: 32 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.crawl, ease: ease.snappy, delay: 0.1 },
  },
}

/** Hero subtext — follows headline with delay */
export const heroSubtext: Variants = {
  hidden:  { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.slow, ease: ease.smooth, delay: 0.35 },
  },
}

/** Hero CTA — final element in hero entrance sequence */
export const heroCta: Variants = {
  hidden:  { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.slow, ease: ease.smooth, delay: 0.55 },
  },
}

/** Number counter — for trust metrics */
export const counterVariant: Variants = {
  hidden:  { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.normal, ease: ease.snappy },
  },
}

/** Booking step transition — fast, no drama */
export const bookingStep: Variants = {
  enter: {
    opacity: 0,
    x: 16,
    transition: { duration: duration.fast, ease: ease.snappy },
  },
  center: {
    opacity: 1,
    x: 0,
    transition: { duration: duration.fast, ease: ease.snappy },
  },
  exit: {
    opacity: 0,
    x: -16,
    transition: { duration: duration.fast, ease: ease.exit },
  },
}

/** Bag card selection — springs into selected state */
export const bagCardSelected = {
  scale: 1.02,
  transition: ease.spring,
}

export const bagCardDefault = {
  scale: 1,
  transition: ease.spring,
}
