import type { Metadata } from 'next'
import Script from 'next/script'

export const metadata: Metadata = {
  title: 'FAQ — Excess Baggage Delivery Service Questions Answered | Bagdrop',
  description: 'Common questions about Bagdrop\'s excess baggage & luggage delivery service — pricing, pickup, coverage, and how much you save vs airline fees.',
  alternates: {
    canonical: 'https://bagdrop.co/faq',
  },
}

const FAQS = [
  {
    category: 'Booking',
    items: [
      { q: 'How far in advance do I need to book?', a: 'We recommend at least 24 hours for airport pickups and intercity. Same-day may be available in select cities — check at checkout.' },
      { q: 'Can I change or cancel my booking?', a: 'Yes. Contact us on WhatsApp at least 6 hours before your pickup slot. Cancellations made more than 24 hours in advance are fully refunded.' },
      { q: 'How do I book for multiple people or a group?', a: 'Use our Group / Wedding booking option. You can add up to 30 bags in a single booking. For larger volumes, contact us for a custom quote.' },
    ],
  },
  {
    category: 'Pickup & Delivery',
    items: [
      { q: 'What happens on the day of pickup?', a: 'Our executive will coordinate with you.' },
      { q: 'What if I\'m not home for pickup?', a: 'You can authorize someone else to hand over your bags. Contact us in advance so we can update the booking.' },
      { q: 'Do you deliver to hotels?', a: 'Absolutely. Hotels are one of our most common delivery addresses. We coordinate with the front desk to ensure seamless handover.' },
    ],
  },
  {
    category: 'Updates & Insurance',
    items: [
      { q: 'Can I track my bag?', a: 'You receive WhatsApp and email updates at every stage — pickup confirmed, in transit, and delivered. Live bag tracking will be available soon.' },
      { q: 'What if my bag is damaged or lost?', a: 'You can buy up to ₹50,000 premium coverage at checkout for high-value items.' },
      { q: 'Is my bag safe during transit?', a: 'Your bag is sealed, photographed, and documented at pickup. We use dedicated vehicles.' },
    ],
  },
  {
    category: 'Pricing & Payment',
    items: [
      { q: 'How is pricing calculated?', a: 'Pricing depends on route, distance, number of bags, weight category, and service type. Get an instant quote on our booking page.' },
      { q: 'How much can I save vs. airline excess fees?', a: 'Most customers save 40–60% compared to airline excess baggage charges. For a bag the airline would charge ₹5,000 for, Bagdrop typically costs ₹1,500–2,500.' },
      { q: 'Do you offer GST invoices for corporate bookings?', a: 'Yes. Corporate accounts get GST invoices, monthly billing, and dedicated account management. Contact us to set up a corporate account.' },
    ],
  },
  {
    category: 'Coverage',
    items: [
      { q: 'Which cities do you operate in?', a: 'We operate in 50+ cities across India, with more cities launching soon.' },
      { q: 'Do you handle international shipments?', a: 'Not yet. We are India-domestic only. International service is on our roadmap for 2026.' },
      { q: 'Can you handle sports equipment or oversized bags?', a: 'Yes — golf bags, surfboards, bicycle boxes, strollers. Select Oversized at checkout. Weight must be under 50 kg per item.' },
    ],
  },
]

// Flatten all FAQs for the JSON-LD schema
const ALL_FAQ_ITEMS = FAQS.flatMap(section => section.items)

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-cream">
      <Script
        id="schema-faq"
        type="application/ld+json"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            'mainEntity': ALL_FAQ_ITEMS.map(item => ({
              '@type': 'Question',
              'name': item.q,
              'acceptedAnswer': {
                '@type': 'Answer',
                'text': item.a,
              },
            })),
          }),
        }}
      />
      {/* Hero */}
      <section className="relative bg-[#111] py-20 lg:py-28 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-50"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1569154941061-e231b4725ef1?w=1400&q=80')" }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-black/20" aria-hidden="true" />
        <div className="relative z-10">
        <div className="section-container text-center">
          <span className="eyebrow text-white/50">Help Centre</span>
          <h1 className="mt-3 font-display text-display-lg font-bold text-white">
            Frequently Asked Questions
          </h1>
          <p className="mt-4 text-lg text-white/60 max-w-md mx-auto">
            Everything you need to know about Bagdrop.
          </p>
        </div>
        </div>
      </section>

      <div className="section-container section-padding max-w-3xl">
        <div className="space-y-12">
          {FAQS.map(section => (
            <div key={section.category}>
              <h2 className="font-display text-xl font-bold text-text-primary mb-6 pb-3 border-b border-border">
                {section.category}
              </h2>
              <div className="space-y-6">
                {section.items.map(item => (
                  <div key={item.q} className="rounded-2xl border border-border bg-white p-6 shadow-sm">
                    <h3 className="font-semibold text-text-primary mb-2">{item.q}</h3>
                    <p className="text-sm leading-relaxed text-text-secondary">{item.a}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Still have questions? */}
        <div className="mt-14 rounded-2xl bg-brand p-8 text-center">
          <h3 className="font-display text-xl font-bold text-white">Still have questions?</h3>
          <p className="mt-2 text-white/75">We're one WhatsApp away.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <a href="https://wa.me/916357115711" target="_blank" rel="noopener noreferrer"
               className="rounded-xl bg-white px-6 py-3 font-bold text-brand hover:opacity-90 transition-opacity">
              WhatsApp Us
            </a>
            <a href="/contact"
               className="rounded-xl border border-white/30 bg-white/10 px-6 py-3 font-bold text-white hover:bg-white/20 transition-colors">
              Send a Message
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}