import type { Metadata } from 'next'
import Link from 'next/link'
import { Package, MessageCircle } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Bag Tracking — Coming Soon | Bagdrop',
  description: 'Bagdrop live bag tracking is coming soon. In the meantime, get real-time WhatsApp and email updates at every stage of your delivery.',
  alternates: {
    canonical: 'https://bagdrop.co/track',
  },
}

export default function TrackPage() {
  return (
    <div className="min-h-screen bg-cream">
      {/* Hero */}
      <section className="relative bg-[#111] py-20 lg:py-28 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-55"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1540339832862-474599807836?w=1400&q=80')" }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/35 to-black/10" aria-hidden="true" />
        <div className="relative z-10">
          <div className="section-container text-center">
            <span className="eyebrow text-white/50">Bag Tracking</span>
            <h1 className="mt-3 font-display text-display-lg font-bold text-white">
              Tracking coming soon
            </h1>
            <p className="mt-4 text-lg text-white/60 max-w-md mx-auto">
              Live bag tracking will be available soon. Until then, you get
              WhatsApp and email updates at every stage of your delivery.
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <div className="section-container py-20 text-center max-w-xl">
        <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-brand/10">
          <Package className="h-10 w-10 text-brand" strokeWidth={1.5} />
        </div>

        <h2 className="font-display text-2xl font-bold text-text-primary">
          We keep you in the loop
        </h2>
        <p className="mt-4 text-base text-text-secondary leading-relaxed">
          While live tracking is being built, you receive WhatsApp and email
          updates at every stage — pickup confirmed, in transit, and delivered.
        </p>

        <div className="mt-10 rounded-2xl border border-border bg-white p-6 text-left space-y-4 shadow-sm">
          <h3 className="font-display text-sm font-semibold text-text-primary">
            What you get today
          </h3>
          {[
            'Pickup confirmation via WhatsApp and email',
            'In-transit update when your bags are on the move',
            'Delivery confirmation with timestamp',
            'Direct WhatsApp access to your delivery team',
          ].map((text, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-light text-xs font-bold text-brand">
                ✓
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">{text}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            href="https://wa.me/916357115711"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 font-bold text-white hover:opacity-90 transition-opacity"
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp for updates
          </a>
          <Link
            href="/book"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-6 py-3 font-semibold text-text-primary hover:border-brand hover:text-brand transition-colors"
          >
            Book a delivery
          </Link>
        </div>
      </div>
    </div>
  )
}
