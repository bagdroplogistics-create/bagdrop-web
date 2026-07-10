import type { Metadata } from 'next'
import Image from 'next/image'
import { Plane, Shield, Zap, Heart } from 'lucide-react'

export const metadata: Metadata = {
  title: 'About Bagdrop — India\'s Premium Baggage Infrastructure',
  description: 'We\'re building India\'s digital baggage infrastructure layer — so travelers can move freely without carrying their bags.',
}

const VALUES = [
  { icon: Plane,  title: 'Aviation-first',  desc: 'We think like an airport, not a courier. Every process is designed around the traveller\'s journey.' },
  { icon: Shield, title: 'Trust above all', desc: 'Your bags are insured, tracked, and treated with the same care you expect from a premium airline.' },
  { icon: Zap,    title: '24 / 48 / 72 Hour Delivery', desc: 'Same-day, next-day, or scheduled — choose the delivery window that fits your travel plan. We move as fast as you do.' },
  { icon: Heart,  title: 'Built for India', desc: 'From NRI families landing at BOM to students shipping to Pune — we\'re solving a uniquely Indian problem.' },
]

const MILESTONES = [
  { year: '2025', event: 'Bagdrop Founded' },
  { year: '2025', event: 'Pickup Services Launched Inside Mumbai T2' },
  { year: '2025', event: 'Expanded Operations — Mumbai · Delhi · Goa · Gujarat · Rajasthan · Hyderabad · Bangalore' },
  { year: '2025–2026', event: '12,000+ Bags Delivered' },
  { year: '2026', event: 'National Rollout Across 15 Cities' },
]

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-cream">
      {/* Hero */}
      <section className="relative bg-[#111] py-24 lg:py-32 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-50"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1400&q=80')" }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-black/20" aria-hidden="true" />
        <div className="relative z-10 section-container max-w-3xl">
          <span className="eyebrow text-white/50">Our Story</span>
          <h1 className="mt-3 font-display text-display-lg font-bold text-white leading-tight">
            We're building India's<br />
            <span className="text-brand">digital baggage layer.</span>
          </h1>
          <p className="mt-6 text-xl text-white/65 leading-relaxed">
            Bagdrop was founded on one simple observation: the most stressful part of travel isn't the flight.
            It's the 30 kg of luggage you're dragging through a crowded terminal.
          </p>
          <p className="mt-4 text-lg text-white/50 leading-relaxed">
            We're building the infrastructure that makes that problem disappear — for airports, hotels, wedding planners,
            universities, and the millions of travelers who deserve to move freely.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="section-padding bg-white">
        <div className="section-container">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-20 items-center">
            <div>
              <span className="eyebrow">Mission</span>
              <h2 className="mt-3 font-display text-display-md text-text-primary">
                Travel light.<br />Every time.
              </h2>
              <p className="mt-5 text-lg text-text-secondary leading-relaxed">
                Our mission is to eliminate luggage as a barrier to travel. Whether you're a first-time flyer,
                an NRI returning home, a bride shipping her trousseau, or a student moving abroad —
                Bagdrop exists to make your journey lighter.
              </p>
              <p className="mt-4 text-lg text-text-secondary leading-relaxed">
                We're not a courier company. We're aviation infrastructure — the invisible layer
                that connects your home to the airport, and the airport to the world.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-5">
              {[
                { label: 'Bags Delivered', value: '12,000+' },
                { label: 'Cities Covered', value: '50+' },
                { label: 'On-Time Rate',   value: '98.7%' },
                { label: 'Customer Rating', value: '4.9 / 5' },
              ].map(m => (
                <div key={m.label} className="rounded-2xl border border-stone-200 bg-stone-50 p-6">
                  <p className="font-display text-3xl font-black text-brand">{m.value}</p>
                  <p className="mt-1 text-sm text-text-muted">{m.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="section-padding bg-cream">
        <div className="section-container">
          <div className="text-center mb-12">
            <span className="eyebrow">Our Values</span>
            <h2 className="mt-3 font-display text-display-md text-text-primary">What we stand for</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map(v => (
              <div key={v.title} className="rounded-2xl border border-border bg-white p-7 shadow-sm">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <v.icon className="h-6 w-6" strokeWidth={1.75} />
                </div>
                <h3 className="font-display text-lg font-bold text-text-primary">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="section-padding bg-white">
        <div className="section-container">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">

            {/* Left — timeline */}
            <div>
              <div className="mb-10">
                <span className="eyebrow">Journey</span>
                <h2 className="mt-3 font-display text-display-md text-text-primary">How we got here</h2>
              </div>
              <div className="space-y-0">
                {MILESTONES.map((m, i) => (
                  <div key={i} className="flex gap-6">
                    <div className="flex flex-col items-center">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white text-xs font-bold">
                        {m.year.slice(-2)}
                      </div>
                      {i < MILESTONES.length - 1 && <div className="mt-1 w-0.5 flex-1 min-h-[2.5rem] bg-stone-200" />}
                    </div>
                    <div className="pb-8">
                      <p className="text-xs font-semibold text-brand">{m.year}</p>
                      <p className="mt-0.5 text-base font-medium text-text-primary">{m.event}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — image */}
            <div className="relative hidden lg:block">
              <div className="relative h-[520px] w-full overflow-hidden rounded-3xl shadow-2xl">
                <Image
                  src="https://images.unsplash.com/photo-1556388158-158ea5ccacbd?auto=format&fit=crop&w=800&q=80"
                  alt="Bagdrop — baggage handling operations at the airport"
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover object-center"
                />
                {/* Subtle brand overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                {/* Stat pill */}
                <div className="absolute bottom-6 left-6 right-6 rounded-2xl border border-white/20 bg-white/90 backdrop-blur-sm px-5 py-4 shadow-lg">
                  <p className="text-xs font-semibold uppercase tracking-widest text-brand mb-1">Our milestone</p>
                  <p className="font-display text-2xl font-black text-text-primary">12,000+ Bags</p>
                  <p className="text-sm text-text-muted">delivered across India since 2025</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* CTA — full-width background image with dark overlay */}
      <section className="relative section-padding overflow-hidden">
        {/* Background image */}
        <Image
          src="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1920&q=80"
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-center"
          aria-hidden="true"
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/70" aria-hidden="true" />

        <div className="relative z-10 section-container text-center">
          <h2 className="font-display text-display-md font-bold text-white">Join the journey</h2>
          <p className="mt-4 text-lg text-white/75 max-w-xl mx-auto">
            Whether you're a traveler, a hotel, an airport, or an investor — we'd love to talk.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <a href="/book" className="rounded-xl bg-brand px-8 py-4 font-bold text-white hover:opacity-90 transition-opacity shadow-lg shadow-brand/30">
              Book a Delivery
            </a>
            <a href="/contact" className="rounded-xl border border-white/40 bg-white/10 px-8 py-4 font-bold text-white hover:bg-white/20 transition-colors backdrop-blur-sm">
              Get in Touch
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
