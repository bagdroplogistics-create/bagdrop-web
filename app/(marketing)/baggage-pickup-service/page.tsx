import type { Metadata } from 'next'
import { Package } from 'lucide-react'
import { ServicePage } from '@/components/sections/service-page'

export const metadata: Metadata = {
  title: 'Baggage Pickup Service in India — Airport, Home & Hotel Luggage Pickup',
  description: 'Baggage pickup service across India. We collect your luggage from the airport, your home or your hotel and deliver it to your door or your next flight.',
  alternates: { canonical: 'https://www.bagdrop.co/baggage-pickup-service' },
  keywords: ['baggage pickup service', 'luggage pickup service India', 'airport baggage pickup', 'baggage pickup from home'],
}

export default function BaggagePickupServicePage() {
  return (
    <ServicePage
      slug="baggage-pickup-service"
      badge="Baggage Pickup Service"
      headline="Baggage pickup from the airport, your home or your hotel."
      subheadline="Tell us where your bags are and where they need to go. We collect them and deliver them safely, so you can travel hands-free."
      heroImage="https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1600&q=80&auto=format&fit=crop"
      heroImagePos="center 50%"
      icon={Package}
      benefits={[
        { title: 'Airport arrival pickup', desc: 'We collect your bags when you land and deliver them to your home or hotel.' },
        { title: 'Home and hotel pickup', desc: 'We collect from your doorstep and take bags to the airport or another address.' },
        { title: 'Dedicated handling', desc: 'Your bags travel in Bagdrop vehicles, not mixed with general parcels.' },
        { title: 'Proof at every step', desc: 'Photographs, seals and a receipt at pickup, with delivery confirmation at the end.' },
        { title: 'Flexible timing', desc: 'Pick a pickup window that suits your flight or checkout time.' },
        { title: 'Insured in transit', desc: 'Standard insurance on every shipment.' },
      ]}
      steps={[
        { number: '01', title: 'Tell us the route', desc: 'Pickup point, drop point, date and number of bags.' },
        { number: '02', title: 'Confirm the quote', desc: 'You get a clear price on WhatsApp or email before anything is booked.' },
        { number: '03', title: 'We pick up', desc: 'Our executive collects, photographs and seals your bags.' },
        { number: '04', title: 'We deliver', desc: 'Bags reach the drop point with proof of delivery.' },
      ]}
      faqs={[
        { q: 'Can you collect my bags from the airport after I land?', a: 'Yes. Share your flight number and we meet you at the arrival point or collect from the agreed location.' },
        { q: 'How many bags can I send?', a: 'Any number. Pricing is per bag, and standard bags up to 32 kg each are covered. Larger items are available at checkout.' },
        { q: 'How do I get a quote?', a: 'Submit the booking form or message us on WhatsApp. We reply with a quote, and you confirm before anything is booked.' },
      ]}
      ctaHeadline="Need your bags picked up?"
      ctaBody="Get a quote on WhatsApp or email."
    />
  )
}
