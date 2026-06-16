'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Luggage } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function CtaBanner() {
  return (
    <section className="relative overflow-hidden" aria-label="Book now">

      {/* Full-bleed airport image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1600&q=85&auto=format&fit=crop')",
        }}
        aria-hidden="true"
      />

      {/* Dark overlay — enough to read text, light enough to see the scene */}
      <div className="absolute inset-0 bg-black/55" aria-hidden="true" />

      {/* Subtle dot texture */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
        aria-hidden="true"
      />

      {/* Content */}
      <div className="section-container relative z-10 py-24 lg:py-32">
        <motion.div
          className="mx-auto max-w-2xl text-center"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          {/* Icon badge */}
          <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
            <Luggage className="h-7 w-7 text-white" strokeWidth={1.5} />
          </div>

          <h2 className="font-display text-display-md font-bold text-white leading-tight">
            Ready to travel light?
          </h2>
          <p className="mt-5 text-xl text-white/80 leading-relaxed">
            Your next trip starts the moment you stop carrying your bags.
            Book in under 2 minutes.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button
              variant="primary-dark"
              size="xl"
              className="group"
              asChild
            >
              <Link href="/book">
                Book Delivery
                <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button
              size="xl"
              className="border-[1.5px] border-white/40 bg-white/10 text-white hover:bg-white/20 hover:border-white/60 backdrop-blur-sm"
              asChild
            >
              <Link href="/services">Explore Services</Link>
            </Button>
          </div>

          <p className="mt-8 text-sm text-white/45">
            Operating in Mumbai &middot; Delhi &middot; Ahmedabad &middot; Goa
          </p>
        </motion.div>
      </div>
    </section>
  )
}
