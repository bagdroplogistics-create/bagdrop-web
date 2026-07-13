import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Excess Baggage Delivery Service in Vadodara — Bagdrop',
  description: 'Bagdrop offers door-to-door excess baggage delivery in Vadodara. Pick up from your home or office — delivered to Vadodara Airport (VDR) or any city in India. Save 40–60% vs airline fees.',
  alternates: {
    canonical: 'https://bagdrop.co/vadodara',
  },
  keywords: [
    'excess baggage delivery service vadodara',
    'luggage delivery service vadodara',
    'baggage delivery vadodara airport',
    'door to door luggage delivery vadodara',
    'excess baggage vadodara',
    'luggage transport service vadodara',
    'airport baggage delivery vadodara',
    'baggage pickup vadodara',
    'send luggage vadodara',
    'bagdrop vadodara',
    'vadodara airport luggage delivery',
    'luggage delivery baroda',
    'excess baggage baroda',
  ],
  openGraph: {
    title: 'Excess Baggage Delivery Service in Vadodara — Bagdrop',
    description: 'Door-to-door baggage pickup & delivery in Vadodara. Home to airport, airport to home, or intercity. Fully insured. Book in 2 minutes.',
    url: 'https://bagdrop.co/vadodara',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Service',
      '@id': 'https://bagdrop.co/vadodara#service',
      name: 'Excess Baggage Delivery Service in Vadodara',
      description: 'Door-to-door baggage pickup and delivery in Vadodara. We collect from your home or hotel and deliver to Vadodara Airport (VDR) — or from the airport directly to your doorstep.',
      provider: {
        '@type': 'LocalBusiness',
        name: 'Bagdrop',
        url: 'https://bagdrop.co',
        telephone: '+916357115711',
        email: 'info@bagdrop.co',
        areaServed: {
          '@type': 'City',
          name: 'Vadodara',
          containedInPlace: { '@type': 'State', name: 'Gujarat' },
        },
      },
      serviceType: 'Baggage Delivery',
      areaServed: { '@type': 'City', name: 'Vadodara' },
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Does Bagdrop operate in Vadodara?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Bagdrop provides door-to-door baggage delivery in Vadodara, covering all major areas including Alkapuri, Fatehgunj, Manjalpur, Waghodia Road, Akota, Karelibaug, and more. We cover Vadodara Airport (VDR / Harni Airport) and intercity routes to Mumbai, Ahmedabad, Delhi, and Goa.',
          },
        },
        {
          '@type': 'Question',
          name: 'How much does excess baggage delivery cost in Vadodara?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Bagdrop pricing in Vadodara starts significantly lower than airline excess fees. On most routes, customers save 40–60% compared to airline charges. For example, a bag that an airline charges Rs.4,000–6,000 for typically costs Rs.1,200–2,500 with Bagdrop. Get an exact quote on our booking page.',
          },
        },
        {
          '@type': 'Question',
          name: 'What is the pickup area for Vadodara baggage delivery?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'We cover all of Vadodara city and surrounding areas including Alkapuri, Fatehgunj, Manjalpur, Race Course, Old Padra Road, Waghodia Road, Sama, Gotri, Makarpura, Akota, and Karelibaug.',
          },
        },
        {
          '@type': 'Question',
          name: 'Do you deliver from Vadodara Airport to home?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Our Airport-to-Doorstep service collects your bags directly at Vadodara Airport (VDR) upon arrival and delivers them to your home or hotel — so you can leave the airport hands-free.',
          },
        },
        {
          '@type': 'Question',
          name: 'Which cities can I send luggage to from Vadodara?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'From Vadodara, Bagdrop delivers to Mumbai, Ahmedabad, Delhi, Goa, Surat, Rajkot, and other major cities across India. We also handle intercity routes within Gujarat.',
          },
        },
      ],
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://bagdrop.co' },
        { '@type': 'ListItem', position: 2, name: 'Vadodara Baggage Delivery', item: 'https://bagdrop.co/vadodara' },
      ],
    },
  ],
}

export default function VadodaraPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="min-h-screen bg-white">

        {/* ── Hero ── */}
        <section className="bg-gradient-to-br from-orange-50 to-white px-4 py-16 md:py-24">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-orange-100 px-4 py-1.5 text-sm font-semibold text-orange-600">
              Now serving Vadodara
            </div>
            <h1 className="mb-6 text-4xl font-bold tracking-tight text-gray-900 md:text-5xl lg:text-6xl">
              Excess Baggage Delivery<br />
              <span className="text-orange-500">Service in Vadodara</span>
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-lg text-gray-600 md:text-xl">
              Door-to-door luggage pickup and delivery in Vadodara. We collect from your home, office, or hotel — and deliver to Vadodara Airport (VDR), or directly to any city in India.
              <strong className="text-gray-900"> Save 40–60% vs airline excess fees.</strong>
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/book"
                className="rounded-xl bg-orange-500 px-8 py-4 text-base font-bold text-white shadow-lg hover:bg-orange-600 transition-colors"
              >
                Book in Vadodara →
              </Link>
              <Link
                href="/contact"
                className="rounded-xl border border-orange-200 bg-white px-8 py-4 text-base font-semibold text-orange-600 hover:bg-orange-50 transition-colors"
              >
                Get a Quote
              </Link>
            </div>
          </div>
        </section>

        {/* ── Stats ── */}
        <section className="border-y border-gray-100 bg-white px-4 py-8">
          <div className="mx-auto grid max-w-4xl grid-cols-2 gap-6 text-center md:grid-cols-4">
            {[
              { stat: '₹50,000', label: 'Insurance cover per bag' },
              { stat: '40–60%', label: 'Savings vs airline fees' },
              { stat: '24 hrs', label: 'Advance booking required' },
              { stat: '98.7%', label: 'On-time delivery rate' },
            ].map(({ stat, label }) => (
              <div key={label}>
                <div className="text-2xl font-bold text-orange-500 md:text-3xl">{stat}</div>
                <div className="mt-1 text-sm text-gray-500">{label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Services in Vadodara ── */}
        <section className="px-4 py-16">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-2 text-center text-3xl font-bold text-gray-900">
              Our Services in Vadodara
            </h2>
            <p className="mb-12 text-center text-gray-500">Three ways we handle your luggage in Vadodara</p>
            <div className="grid gap-6 md:grid-cols-3">
              {[
                {
                  title: 'Doorstep → Vadodara Airport',
                  desc: 'Flying out? We pick up your bags from your home or hotel in Vadodara and deliver them to Vadodara Airport (VDR / Harni Airport) before your flight. Travel hands-free.',
                  icon: '🏠→✈️',
                },
                {
                  title: 'Vadodara Airport → Doorstep',
                  desc: 'Just landed in Vadodara? We collect your bags at VDR Airport arrivals and deliver them directly to your home, hotel, or office anywhere in Vadodara city.',
                  icon: '✈️→🏠',
                },
                {
                  title: 'Vadodara → Any City',
                  desc: 'Sending bags to Mumbai, Ahmedabad, Delhi, or Goa? Our intercity service picks up in Vadodara and delivers door-to-door at your destination.',
                  icon: '🗺️',
                },
              ].map(({ title, desc, icon }) => (
                <div key={title} className="rounded-2xl border border-gray-100 bg-gray-50 p-6 shadow-sm">
                  <div className="mb-4 text-3xl">{icon}</div>
                  <h3 className="mb-2 text-lg font-bold text-gray-900">{title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Areas Covered ── */}
        <section className="bg-orange-50 px-4 py-16">
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-2 text-center text-3xl font-bold text-gray-900">
              Areas We Cover in Vadodara
            </h2>
            <p className="mb-10 text-center text-gray-500">We pick up and deliver across all major localities in Vadodara</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {[
                'Alkapuri', 'Fatehgunj', 'Manjalpur', 'Race Course',
                'Akota', 'Karelibaug', 'Sama', 'Gotri',
                'Waghodia Road', 'Old Padra Road', 'Makarpura', 'Gorwa',
                'Harni', 'Subhanpura', 'Productivity Road', 'Sayajigunj',
              ].map(area => (
                <div key={area} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-gray-700 shadow-sm">
                  <span className="text-orange-400">✓</span> {area}
                </div>
              ))}
            </div>
            <p className="mt-6 text-center text-sm text-gray-500">
              Don't see your area? <Link href="/contact" className="text-orange-500 underline">Contact us</Link> — we cover all of Vadodara district.
            </p>
          </div>
        </section>

        {/* ── Routes from Vadodara ── */}
        <section className="px-4 py-16">
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-2 text-center text-3xl font-bold text-gray-900">
              Popular Routes from Vadodara
            </h2>
            <p className="mb-10 text-center text-gray-500">Send luggage from Vadodara to any major city</p>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {[
                { from: 'Vadodara', to: 'Mumbai', time: '1–2 days' },
                { from: 'Vadodara', to: 'Ahmedabad', time: 'Same day' },
                { from: 'Vadodara', to: 'Delhi', time: '2–3 days' },
                { from: 'Vadodara', to: 'Goa', time: '2–3 days' },
                { from: 'Vadodara', to: 'Surat', time: 'Same day' },
                { from: 'Vadodara', to: 'Bangalore', time: '2–3 days' },
                { from: 'Mumbai', to: 'Vadodara', time: '1–2 days' },
                { from: 'Delhi', to: 'Vadodara', time: '2–3 days' },
                { from: 'Ahmedabad', to: 'Vadodara', time: 'Same day' },
              ].map(({ from, to, time }) => (
                <div key={from + to} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">{from} → {to}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{time} delivery</div>
                  </div>
                  <Link href="/book" className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600">
                    Book
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How It Works ── */}
        <section className="bg-gray-50 px-4 py-16">
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-2 text-center text-3xl font-bold text-gray-900">How It Works in Vadodara</h2>
            <p className="mb-12 text-center text-gray-500">From booking to delivery in 4 steps</p>
            <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-4">
              {[
                { n: '01', title: 'Book Online', desc: 'Select your route, bag count, and pickup slot. Takes under 2 minutes on our website.' },
                { n: '02', title: 'We Pick Up', desc: 'Our Vadodara executive arrives at your address on time. We photograph and tag your bags.' },
                { n: '03', title: 'In Transit', desc: 'You get WhatsApp and email updates as your bags move. Full tracking at every step.' },
                { n: '04', title: 'Delivered', desc: 'Bags arrive at your destination — before you do, or at the time you choose.' },
              ].map(({ n, title, desc }) => (
                <div key={n} className="text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-500 text-white font-bold text-lg">{n}</div>
                  <h3 className="mb-2 font-bold text-gray-900">{title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="px-4 py-16">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-2 text-center text-3xl font-bold text-gray-900">
              Frequently Asked Questions — Vadodara
            </h2>
            <p className="mb-10 text-center text-gray-500">Everything you need to know about baggage delivery in Vadodara</p>
            <div className="divide-y divide-gray-100">
              {[
                {
                  q: 'Does Bagdrop operate in Vadodara?',
                  a: 'Yes. Bagdrop operates across all of Vadodara city and surrounding areas. We cover Vadodara Airport (VDR / Harni Airport) and all major localities including Alkapuri, Fatehgunj, Manjalpur, Waghodia Road, Akota, and more.',
                },
                {
                  q: 'How much does excess baggage delivery cost in Vadodara?',
                  a: 'Pricing depends on your route and bag count. On average, customers save 40–60% compared to airline excess fees. A bag that an airline charges Rs.4,000–6,000 for typically costs Rs.1,200–2,500 with Bagdrop. Book online to see your exact price.',
                },
                {
                  q: 'How early should I book before my flight?',
                  a: 'We recommend booking at least 24 hours before your flight. For same-day pickup requests, contact us on WhatsApp and we will do our best to accommodate.',
                },
                {
                  q: 'Do you deliver from Vadodara Airport to my home?',
                  a: 'Yes. Our Airport-to-Doorstep service collects your bags at Vadodara Airport (VDR) upon arrival and delivers them to your home or hotel anywhere in Vadodara — so you can leave the airport empty-handed.',
                },
                {
                  q: 'Is my luggage insured during delivery?',
                  a: 'Yes. Every bag we handle comes with Rs.50,000 standard insurance coverage. You can upgrade for high-value items. We also photograph bags at pickup for documentation.',
                },
                {
                  q: 'Which cities can I send luggage to from Vadodara?',
                  a: 'From Vadodara, we deliver to Mumbai, Ahmedabad, Delhi, Goa, Surat, Rajkot, Bangalore, and other major cities across India.',
                },
              ].map(({ q, a }) => (
                <div key={q} className="py-6">
                  <h3 className="mb-2 font-bold text-gray-900">{q}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="bg-orange-500 px-4 py-16 text-white text-center">
          <div className="mx-auto max-w-2xl">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">
              Ready to travel light from Vadodara?
            </h2>
            <p className="mb-8 text-orange-100 text-lg">
              Book your baggage delivery in Vadodara in under 2 minutes. We handle the bags. You enjoy the journey.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/book"
                className="rounded-xl bg-white px-8 py-4 text-base font-bold text-orange-600 shadow-lg hover:bg-orange-50 transition-colors"
              >
                Book Now — Vadodara
              </Link>
              <a
                href="https://wa.me/916357115711?text=Hi!%20I%20need%20baggage%20delivery%20in%20Vadodara."
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border-2 border-white px-8 py-4 text-base font-semibold text-white hover:bg-orange-600 transition-colors"
              >
                WhatsApp Us
              </a>
            </div>
          </div>
        </section>

      </main>
    </>
  )
}
