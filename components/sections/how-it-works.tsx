'use client'

import { motion } from 'framer-motion'
import { BookOpen, Truck, MapPin, CheckCircle2 } from 'lucide-react'

const STEPS = [
  {
    number:      '01',
    label:       'Book',
    description: 'Choose your route, bag type, and preferred pickup slot. Takes under 2 minutes.',
    Icon:        BookOpen,
    color:       'text-brand',
    bgColor:     'bg-brand-light',
  },
  {
    number:      '02',
    label:       'Pickup',
    description: 'Our team arrives at your door at the confirmed slot — no waiting, no calls.',
    Icon:        Truck,
    color:       'text-brand',
    bgColor:     'bg-brand-light',
  },
  {
    number:      '03',
    label:       'Updates',
    description: 'Receive WhatsApp and email updates at every stage — pickup, in transit, and delivered.',
    Icon:        MapPin,
    color:       'text-brand',
    bgColor:     'bg-brand-light',
  },
  {
    number:      '04',
    label:       'Delivery',
    description: 'Your bags arrive at the destination. Before you do. Always insured.',
    Icon:        CheckCircle2,
    color:       'text-brand',
    bgColor:     'bg-brand-light',
  },
] as const

const containerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.15, delayChildren: 0.1 } },
}

const itemVariants = {
  hidden:  { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
}

export function HowItWorks() {
  return (
    <section className="section-padding bg-cream" aria-labelledby="how-it-works-heading">
      <div className="section-container">

        {/* Heading */}
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, ease: 'easeOut' as const }}
        >
          <span className="eyebrow">How It Works</span>
          <h2
            id="how-it-works-heading"
            className="mt-3 font-display text-display-md text-text-primary"
          >
            Four steps to travel free
          </h2>
          <p className="mt-4 text-lg text-text-secondary max-w-xl mx-auto">
            From booking to delivery — the whole process is designed to be invisible.
          </p>
        </motion.div>

        {/* Steps grid */}
        <motion.div
          className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
        >
          {STEPS.map((step, index) => (
            <motion.div
              key={step.number}
              className="relative"
              variants={itemVariants}
            >
              {/* Desktop connector line */}
              {index < STEPS.length - 1 && (
                <div
                  className="absolute right-0 top-7 hidden h-px w-1/2 translate-x-full border-t-2 border-dashed border-border lg:block"
                  aria-hidden="true"
                />
              )}

              <div className="group relative rounded-2xl border border-border bg-white p-7 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-1">
                {/* Step number — background */}
                <span
                  className="absolute right-5 top-4 font-display text-5xl font-bold text-text-primary/5 select-none"
                  aria-hidden="true"
                >
                  {step.number}
                </span>

                {/* Icon */}
                <div className={`mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${step.bgColor} transition-colors duration-200 group-hover:bg-brand group-hover:text-white ${step.color}`}>
                  <step.Icon className="h-6 w-6 transition-colors duration-200 group-hover:text-white" strokeWidth={1.75} />
                </div>

                {/* Content */}
                <h3 className="font-display text-xl font-semibold text-text-primary">
                  {step.label}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-text-secondary">
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
