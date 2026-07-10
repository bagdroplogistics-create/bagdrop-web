'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import { ShieldCheck, Clock, Luggage } from 'lucide-react'

const TRUST_PILLS = [
  { icon: ShieldCheck, label: 'Fully Insured',        color: 'text-green-400',  bg: 'bg-green-900/40' },
  { icon: Clock,       label: '98.7% On-Time',        color: 'text-orange-400', bg: 'bg-orange-900/40' },
  { icon: Luggage,     label: '12,000+ Bags Delivered',color: 'text-sky-400',   bg: 'bg-sky-900/40' },
]

export function BookingHero() {
  return (
    <section className="relative overflow-hidden pt-[72px]">
      {/* Full-bleed airport background */}
      <div className="absolute inset-0">
        <Image
          src="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1920&q=85&auto=format&fit=crop"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
          aria-hidden="true"
        />
        {/* Dark gradient — lighter overlay so the image breathes */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black/65" />
      </div>

      {/* Content — reduced vertical padding for a tighter hero */}
      <div className="relative z-10 mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12 lg:py-14 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' as const }}
        >
          <span className="inline-block rounded-full bg-brand/20 border border-brand/40 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-orange-300 mb-4">
            Book a Delivery
          </span>
          <h1 className="font-display text-4xl font-black text-white sm:text-5xl lg:text-6xl leading-tight">
            Travel Light.<br />
            <span className="text-brand">We Handle Your Bags.</span>
          </h1>
          <p className="mt-5 text-lg text-white/70 max-w-xl mx-auto">
            Door-to-airport, airport-to-door, or intercity — pick your service and book in under 2 minutes.
          </p>
        </motion.div>

        {/* Trust pills */}
        <motion.div
          className="mt-8 flex flex-wrap justify-center gap-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' as const }}
        >
          {TRUST_PILLS.map(({ icon: Icon, label, color, bg }) => (
            <div key={label} className={`flex items-center gap-2 rounded-full ${bg} border border-white/10 px-4 py-2`}>
              <Icon className={`h-4 w-4 ${color} shrink-0`} strokeWidth={1.75} />
              <span className="text-sm font-medium text-white/85">{label}</span>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Bottom fade to page bg */}
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-[#FAF8F5]" />
    </section>
  )
}
