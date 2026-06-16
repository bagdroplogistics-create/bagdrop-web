import Link from 'next/link'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Step  { number: string; title: string; desc: string }
interface Benefit { title: string; desc: string }
interface FAQ    { q: string; a: string }

export interface ServicePageProps {
  badge:       string
  headline:    string
  subheadline: string
  heroImage:   string
  heroImagePos?: string
  icon:        LucideIcon
  benefits:    Benefit[]
  steps:       Step[]
  faqs:        FAQ[]
  ctaHeadline: string
  ctaBody:     string
  bookHref?:   string
}

export function ServicePage({
  badge, headline, subheadline, heroImage, heroImagePos = 'center',
  benefits, steps, faqs, ctaHeadline, ctaBody, bookHref = '/book',
}: ServicePageProps) {
  return (
    <div className="min-h-screen bg-cream">

      {/* Hero */}
      <section className="relative min-h-[60vh] flex items-end overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-no-repeat"
          style={{ backgroundImage: `url('${heroImage}')`, backgroundPosition: heroImagePos }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/50 to-black/10" aria-hidden="true" />
        <div className="relative z-10 section-container pb-16 pt-32">
          <span className="eyebrow text-white/60">{badge}</span>
          <h1 className="mt-3 font-display text-display-lg font-bold text-white leading-tight max-w-2xl">
            {headline}
          </h1>
          <p className="mt-4 text-xl text-white/70 max-w-xl">{subheadline}</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href={bookHref}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-7 py-4 font-bold text-white hover:opacity-90 transition-opacity">
              Book Now <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/contact"
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-7 py-4 font-bold text-white hover:bg-white/20 transition-colors">
              Get a Quote
            </Link>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="section-padding bg-white">
        <div className="section-container">
          <div className="text-center mb-12">
            <span className="eyebrow">Why Choose Bagdrop</span>
            <h2 className="mt-3 font-display text-display-md text-text-primary">Built for this journey</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((b, i) => (
              <div key={i} className="rounded-2xl border border-border bg-cream p-7">
                <CheckCircle2 className="mb-4 h-6 w-6 text-brand" />
                <h3 className="font-display text-lg font-bold text-text-primary">{b.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="section-padding bg-cream">
        <div className="section-container">
          <div className="text-center mb-12">
            <span className="eyebrow">Process</span>
            <h2 className="mt-3 font-display text-display-md text-text-primary">How it works</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <div key={i} className="rounded-2xl border border-border bg-white p-7 shadow-sm relative">
                <span className="absolute right-5 top-4 font-display text-5xl font-bold text-text-primary/5 select-none">{step.number}</span>
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white font-bold text-sm">
                  {step.number}
                </div>
                <h3 className="font-display text-lg font-semibold text-text-primary">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section-padding bg-white">
        <div className="section-container max-w-2xl">
          <div className="text-center mb-10">
            <span className="eyebrow">FAQ</span>
            <h2 className="mt-3 font-display text-display-md text-text-primary">Common questions</h2>
          </div>
          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <div key={i} className="rounded-2xl border border-border bg-cream p-6">
                <h3 className="font-semibold text-text-primary mb-2">{faq.q}</h3>
                <p className="text-sm leading-relaxed text-text-secondary">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding bg-brand">
        <div className="section-container text-center max-w-xl">
          <h2 className="font-display text-display-md font-bold text-white">{ctaHeadline}</h2>
          <p className="mt-4 text-lg text-white/75">{ctaBody}</p>
          <Link href={bookHref}
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 font-bold text-brand hover:opacity-90 transition-opacity">
            Book Now <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  )
}
