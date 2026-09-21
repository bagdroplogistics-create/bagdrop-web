import type { Metadata } from 'next'
import Link from 'next/link'
import {
  PlaneLanding, Home, Heart, GraduationCap, Briefcase, Package, ArrowRight, Luggage,
} from 'lucide-react'
import { SERVICE_TYPES } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'Our Services — Door-to-Door Baggage Delivery Across India',
  description: 'Explore all Bagdrop services: airport delivery, door-to-door, destination weddings, corporate travel, student relocation, and excess baggage shipping.',
  alternates: {
    canonical: 'https://www.bagdrop.co/services',
  },
}

const ICONS: Record<string, typeof PlaneLanding> = {
  'plane-landing':   PlaneLanding,
  'package':         Package,
  'home':            Home,
  'heart':           Heart,
  'briefcase':       Briefcase,
  'graduation-cap':  GraduationCap,
}

const LONG_DESCRIPTIONS: Record<string, string> = {
  'airport-delivery':      'Land and walk out empty-handed. We collect your bags at arrivals and deliver them to your hotel or home — or pick up from your door before your flight.',
  'excess-baggage':        'Ship it for less than the airline charges. Most customers save 40–60% on excess baggage fees, door-to-door across India.',
  'door-to-door':          'Send luggage between any two addresses across Gujarat, Maharashtra, and Goa. No airport, no hassle.',
  'destination-weddings':  'White-glove handling for lehengas, sherwanis, and gifts. We arrive early so your big day starts perfectly.',
  'corporate-travel':      'Volume rates, GST invoicing, and a dedicated account manager. Business-class logistics for your whole team.',
  'student-relocation':    'Moving abroad or to a new city for college? Skip the excess fee — we ship everything you own, affordably.',
}

export default function ServicesIndexPage() {
  return (
    <div className="min-h-screen bg-cream">
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#111] py-16 lg:py-20">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-55"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1400&q=80&auto=format&fit=crop')" }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/35 to-black/10" aria-hidden="true" />
        <div className="relative z-10 section-container">
          <span className="inline-block rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-white mb-4">Our Services</span>
          <h1 className="font-display text-display-lg font-bold text-white max-w-2xl">
            Every journey. Every bag. Handled.
          </h1>
          <p className="mt-3 text-white/70 max-w-xl">
            Six ways to travel without the weight — pick the one that fits your trip.
          </p>
        </div>
      </section>

      {/* Service cards */}
      <div className="section-container py-16 lg:py-20">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICE_TYPES.map((service) => {
            const Icon = ICONS[service.icon] ?? Luggage
            return (
              <Link
                key={service.id}
                href={service.href}
                className="group flex flex-col rounded-2xl border border-border bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand/25 hover:shadow-lg"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-light text-brand transition-colors duration-200 group-hover:bg-brand group-hover:text-white">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </div>
                <h2 className="font-display text-lg font-semibold text-text-primary group-hover:text-brand transition-colors duration-200">
                  {service.label}
                </h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-text-secondary">
                  {LONG_DESCRIPTIONS[service.id] ?? service.description}
                </p>
                <div className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-brand">
                  Learn more
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                </div>
              </Link>
            )
          })}
        </div>

        {/* CTA banner */}
        <div className="mt-14 rounded-2xl bg-brand p-8 text-center">
          <h3 className="font-display text-xl font-bold text-white">Not sure which service fits?</h3>
          <p className="mt-2 text-white/75">Tell us your route and we'll recommend the right one.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <Link href="/book"
               className="rounded-xl bg-white px-6 py-3 font-bold text-brand hover:opacity-90 transition-opacity">
              Book Now
            </Link>
            <a href="https://wa.me/916357115711" target="_blank" rel="noopener noreferrer"
               className="rounded-xl border border-white/30 bg-white/10 px-6 py-3 font-bold text-white hover:bg-white/20 transition-colors">
              WhatsApp Us
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
