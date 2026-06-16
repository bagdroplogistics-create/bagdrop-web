'use client'

import { motion } from 'framer-motion'
import { TrendingDown, Radio, ShieldCheck, Clock } from 'lucide-react'

const REASONS = [
  {
    Icon:        TrendingDown,
    stat:        '60%',
    statLabel:   'cheaper than airline excess fees',
    title:       'Skip the airline fees',
    description: 'Airlines charge Rs. 3,000–8,000 for excess baggage. Bagdrop ships the same bag for significantly less — and picks it up from your door.',
  },
  {
    Icon:        Radio,
    stat:        '100%',
    statLabel:   'of deliveries tracked live',
    title:       'Real-time tracking',
    description: 'Every bag gets a live tracking link the moment it leaves your hands. Share it with family, hotel, or your wedding planner.',
  },
  {
    Icon:        ShieldCheck,
    stat:        '₹50K',
    statLabel:   'standard insurance coverage',
    title:       'Insure, every time',
    description: 'Standard insurance is included with every booking. Get your Marine Insurance as per insurance policy.',
  },
  {
    Icon:        Clock,
    stat:        '98.7%',
    statLabel:   'on-time delivery rate',
    title:       'On-time, every time',
    description: 'We schedule around your flight. Your bags are there before your taxi arrives — not the next morning.',
  },
] as const

const containerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
}

const cardVariants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
}

export function WhyBagdrop() {
  return (
    <section className="section-padding bg-[#111]" aria-labelledby="why-bagdrop-heading">
      <div className="section-container">

        {/* Heading */}
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, ease: 'easeOut' as const }}
        >
          <span className="eyebrow">Why Bagdrop</span>
          <h2
            id="why-bagdrop-heading"
            className="mt-3 font-display text-display-md text-white"
          >
            The smarter way to travel
          </h2>
          <p className="mt-4 text-lg text-white/55 max-w-xl mx-auto">
            Not a courier. Not a taxi. A purpose-built travel infrastructure
            that makes heavy bags someone else's problem.
          </p>
        </motion.div>

        {/* Cards */}
        <motion.div
          className="mt-14 grid gap-5 sm:grid-cols-2"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
        >
          {REASONS.map((reason) => (
            <motion.div
              key={reason.title}
              variants={cardVariants}
              className="group rounded-2xl border border-white/8 bg-white/4 p-8 transition-colors duration-300 hover:border-brand/30 hover:bg-white/6"
            >
              {/* Stat */}
              <div className="mb-5 flex items-baseline gap-3">
                <span className="font-display text-display-md font-bold text-brand">
                  {reason.stat}
                </span>
                <span className="text-sm text-white/40">{reason.statLabel}</span>
              </div>

              {/* Title + Icon row */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/8 text-white/50 transition-colors group-hover:bg-brand/15 group-hover:text-brand">
                  <reason.Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <h3 className="font-display text-xl font-semibold text-white">
                  {reason.title}
                </h3>
              </div>

              <p className="text-sm leading-relaxed text-white/55">
                {reason.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
