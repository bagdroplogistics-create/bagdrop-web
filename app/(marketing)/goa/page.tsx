import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Excess Baggage Delivery Service in Goa — Bagdrop',
  description: 'Bagdrop offers door-to-door excess baggage delivery in Goa. Pick up from your villa or hotel — delivered to Goa Airport (GOI/Dabolim or Mopa) or any city in India. Perfect for weddings, holidays & NRI travel.',
  alternates: {
    canonical: 'https://bagdrop.co/goa',
  },
  keywords: [
    'excess baggage delivery service goa',
    'luggage delivery service goa',
    'baggage delivery goa airport',
    'door to door luggage delivery goa',
    'excess baggage goa',
    'luggage transport service goa',
    'airport baggage delivery goa',
    'baggage pickup goa',
    'send luggage goa',
    'bagdrop goa',
    'dabolim airport baggage delivery',
    'mopa airport luggage service',
    'GOI airport baggage',
    'destination wedding baggage goa',
    'goa hotel luggage delivery',
  ],
  openGraph: {
    title: 'Excess Baggage Delivery Service in Goa — Bagdrop',
    description: 'Door-to-door baggage pickup & delivery in Goa. Villa to airport, airport to hotel, or intercity. Ideal for weddings, holidays & NRI travel. Book in 2 minutes.',
    url: 'https://bagdrop.co/goa',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Service',
      '@id': 'https://bagdrop.co/goa#service',
      name: 'Excess Baggage Delivery Service in Goa',
      description: 'Door-to-door baggage pickup and delivery in Goa. We collect from your villa, hotel, or home and deliver to Goa Airport (GOI/Dabolim or Mopa) — or from the airport directly to your accommodation.',
      provider: {
        '@type': 'LocalBusiness',
        name: 'Bagdrop',
        url: 'https://bagdrop.co',
        telephone: '+916357115711',
        email: 'info@bagdrop.co',
        areaServed: {
          '@type': 'State',
          name: 'Goa',
          containedInPlace: { '@type': 'Country', name: 'India' },
        },
      },
      serviceType: 'Baggage Delivery',
      areaServed: { '@type': 'State', name: 'Goa' },
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Does Bagdrop operate in Goa?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Bagdrop provides door-to-door baggage delivery across Goa, covering North Goa (Calangute, Baga, Anjuna, Panaji, Mapusa), South Goa (Colva, Benaulim, Palolem, Margao), and inland areas. We serve both Dabolim Airport (GOI) and Mopa International Airport (MOPA).',
          },
        },
        {
          '@type': 'Question',
          name: 'Is Bagdrop useful for destination weddings in Goa?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Absolutely. Bagdrop is the ideal solution for destination weddings in Goa. We collect bags from guests across Mumbai, Delhi, Ahmedabad, and other cities, and deliver them directly to the wedding venue or hotel in Goa — so guests travel light and arrive stress-free. We also handle return logistics after the wedding.',
          },
        },
        {
          '@type': 'Question',
          name: 'Do you pick up from hotels and villas in Goa?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. We pick up from any hotel, resort, villa, or private address in Goa. Whether you are at a beachfront property in North Goa or a heritage villa in South Goa, we come to you.',
          },
        },
        {
          '@type': 'Question',
          name: 'Do you deliver from Goa Airport to my hotel?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Our Airport-to-Hotel service collects your bags at Dabolim (GOI) or Mopa Airport arrivals and delivers them directly to your hotel, resort, or villa anywhere in Goa — start your holiday immediately.',
          },
        },
        {
          '@type': 'Question',
          name: 'Which cities can I send luggage to from Goa?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'From Goa, Bagdrop delivers to Mumbai, Delhi, Ahmedabad, Vadodara, Pune, Bangalore, and other major cities across India.',
          },
        },
      ],
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://bagdrop.co' },
        { '@type': 'ListItem', position: 2, name: 'Goa Baggage Delivery', item: 'https://bagdrop.co/goa' },
      ],
    },
  ],
}

export default function GoaPage() {
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
              Now serving Goa
            </div>
            <h1 className="mb-6 text-4xl font-bold tracking-tight text-gray-900 md:text-5xl lg:text-6xl">
              Excess Baggage Delivery<br />
              <span className="text-orange-500">Service in Goa</span>
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-lg text-gray-600 md:text-xl">
              Door-to-door luggage pickup and delivery across Goa. We collect from your hotel, villa, or home — and deliver to Goa Airport (Dabolim or Mopa), or directly to any city in India.
              <strong className="text-gray-900"> Ideal for weddings, holidays & NRI travel.</strong>
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/book"
                className="rounded-xl bg-orange-500 px-8 py-4 text-base font-bold text-white shadow-lg hover:bg-orange-600 transition-colors"
              >
                Book in Goa →
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

        {/* ── Services ── */}
        <section className="px-4 py-16">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-2 text-center text-3xl font-bold text-gray-900">Our Services in Goa</h2>
            <p className="mb-12 text-center text-gray-500">Four ways we handle your luggage in Goa</p>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  title: 'Hotel/Villa → Airport',
                  desc: 'We collect your bags from your hotel, resort, or villa in Goa and deliver to Dabolim (GOI) or Mopa Airport before your flight.',
                  icon: '🏨→✈️',
                },
                {
                  title: 'Goa Airport → Hotel',
                  desc: 'Land at Dabolim or Mopa and head straight to the beach — we deliver your bags to your hotel or villa so you arrive free.',
                  icon: '✈️→🏨',
                },
                {
                  title: 'City → Goa Wedding',
                  desc: 'Guests flying in from Mumbai, Delhi, or Ahmedabad? We collect their bags in their city and deliver to the wedding venue in Goa.',
                  icon: '🎊',
                },
                {
                  title: 'Goa → Any City',
                  desc: 'Sending bags home from Goa? Our intercity service picks up from your Goa address and delivers door-to-door across India.',
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

        {/* ── Wedding CTA Banner ── */}
        <section className="bg-orange-500 px-4 py-12 text-white text-center">
          <div className="mx-auto max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-widest text-orange-200 mb-2">Destination Weddings</p>
            <h2 className="text-2xl font-bold md:text-3xl mb-3">Planning a wedding in Goa?</h2>
            <p className="text-orange-100 mb-6 max-w-xl mx-auto">
              We handle baggage logistics for all your guests — multi-city pickups, venue delivery, and return dispatch. White-glove service from booking to the last bag.
            </p>
            <Link
              href="/destination-weddings"
              className="inline-block rounded-xl bg-white px-8 py-3 text-sm font-bold text-orange-600 hover:bg-orange-50 transition-colors"
            >
              See Wedding Logistics →
            </Link>
          </div>
        </section>

        {/* ── Areas Covered ── */}
        <section className="bg-orange-50 px-4 py-16">
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-2 text-center text-3xl font-bold text-gray-900">Areas We Cover in Goa</h2>
            <p className="mb-10 text-center text-gray-500">We pick up and deliver across North Goa, South Goa, and inland areas</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {[
                'Calangute', 'Baga', 'Anjuna', 'Panaji',
                'Mapusa', 'Vagator', 'Morjim', 'Candolim',
                'Colva', 'Benaulim', 'Palolem', 'Margao',
                'Vasco', 'Dabolim', 'Old Goa', 'Ponda',
              ].map(area => (
                <div key={area} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-gray-700 shadow-sm">
                  <span className="text-orange-400">✓</span> {area}
                </div>
              ))}
            </div>
            <p className="mt-6 text-center text-sm text-gray-500">
              Don't see your area? <Link href="/contact" className="text-orange-500 underline">Contact us</Link> — we cover all of Goa state.
            </p>
          </div>
        </section>

        {/* ── Routes ── */}
        <section className="px-4 py-16">
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-2 text-center text-3xl font-bold text-gray-900">Popular Routes from Goa</h2>
            <p className="mb-10 text-center text-gray-500">Send luggage from Goa to any major city</p>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {[
                { from: 'Goa', to: 'Mumbai', time: '1–2 days' },
                { from: 'Goa', to: 'Delhi', time: '2–3 days' },
                { from: 'Goa', to: 'Ahmedabad', time: '2–3 days' },
                { from: 'Goa', to: 'Bangalore', time: '1–2 days' },
                { from: 'Goa', to: 'Pune', time: '1–2 days' },
                { from: 'Goa', to: 'Vadodara', time: '2–3 days' },
                { from: 'Mumbai', to: 'Goa', time: '1–2 days' },
                { from: 'Delhi', to: 'Goa', time: '2–3 days' },
                { from: 'Ahmedabad', to: 'Goa', time: '2–3 days' },
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
            <h2 className="mb-2 text-center text-3xl font-bold text-gray-900">How It Works in Goa</h2>
            <p className="mb-12 text-center text-gray-500">From booking to delivery in 4 steps</p>
            <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-4">
              {[
                { n: '01', title: 'Book Online', desc: 'Select your route, bag count, and pickup slot. Takes under 2 minutes on our website.' },
                { n: '02', title: 'We Pick Up', desc: 'Our Goa executive arrives at your hotel, villa, or address on time. Bags are tagged and photographed.' },
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
            <h2 className="mb-2 text-center text-3xl font-bold text-gray-900">Frequently Asked Questions — Goa</h2>
            <p className="mb-10 text-center text-gray-500">Everything about baggage delivery in Goa</p>
            <div className="divide-y divide-gray-100">
              {[
                {
                  q: 'Does Bagdrop operate in Goa?',
                  a: 'Yes. Bagdrop operates across all of Goa — North Goa (Calangute, Baga, Anjuna, Panaji, Mapusa) and South Goa (Colva, Benaulim, Palolem, Margao). We serve both Dabolim Airport (GOI) and Mopa International Airport.',
                },
                {
                  q: 'Is Bagdrop useful for destination weddings in Goa?',
                  a: 'Absolutely. We specialize in destination wedding baggage logistics. We collect bags from guests across India — Mumbai, Delhi, Ahmedabad — and deliver directly to your Goa wedding venue or hotel. We also handle return dispatch after the event.',
                },
                {
                  q: 'Do you pick up from hotels and villas in Goa?',
                  a: 'Yes. We pick up from any hotel, resort, villa, or private address in Goa. We come to your accommodation — no need to drag bags to the airport.',
                },
                {
                  q: 'Do you deliver from Goa Airport to my hotel?',
                  a: 'Yes. Our Airport-to-Hotel service collects bags at Dabolim (GOI) or Mopa arrivals and delivers to your hotel, resort, or villa anywhere in Goa — start your holiday or wedding immediately.',
                },
                {
                  q: 'Is my luggage insured during delivery?',
                  a: 'Yes. Every bag is covered with Rs.50,000 standard insurance. We photograph bags at pickup for documentation. High-value upgrades are available on request.',
                },
                {
                  q: 'Which cities can I send luggage to from Goa?',
                  a: 'From Goa, we deliver to Mumbai, Delhi, Ahmedabad, Vadodara, Pune, Bangalore, and other major cities across India.',
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
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">Ready to travel light in Goa?</h2>
            <p className="mb-8 text-orange-100 text-lg">
              Book your baggage delivery in Goa in under 2 minutes. We handle the bags. You enjoy the beach.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/book"
                className="rounded-xl bg-white px-8 py-4 text-base font-bold text-orange-600 shadow-lg hover:bg-orange-50 transition-colors"
              >
                Book Now — Goa
              </Link>
              <a
                href="https://wa.me/916357115711?text=Hi!%20I%20need%20baggage%20delivery%20in%20Goa."
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
