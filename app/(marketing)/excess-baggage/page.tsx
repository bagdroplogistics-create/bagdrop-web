import type { Metadata } from 'next'
import { Package } from 'lucide-react'
import { ServicePage } from '@/components/sections/service-page'

export const metadata: Metadata = {
  title: 'Excess Baggage Shipping — Bagdrop',
  description: 'Ship your excess baggage for up to 60% less than airline fees. Door-to-door pickup and delivery across India.',
}

export default function ExcessBaggagePage() {
  return (
    <ServicePage
      badge="Excess Baggage"
      headline="Skip the airline fee. Ship it for less."
      subheadline="Airlines charge Rs.3,000 to 8,000 per extra bag. Bagdrop ships the same bag door-to-door for a fraction of the cost. Most customers save 40 to 60 percent."
      heroImage="https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=1600&q=80&auto=format&fit=crop"
      heroImagePos="center center"
      icon={Package}
      benefits={[
        { title: 'Save up to 60 percent', desc: 'Compare before you pay. Enter your route and weight on our booking page and see exactly how much you save vs the airline charge.' },
        { title: 'Door-to-door pickup', desc: 'We collect from your home before your flight and deliver to your destination. No dropping bags at a counter.' },
        { title: 'Any weight, any size', desc: 'Standard bags up to 32 kg, oversized up to 50 kg. Sports equipment, appliances, and boxes all accepted.' },
        { title: 'Arrives before you or after', desc: 'Choose delivery before you land, or a few days later when you are settled. Flexible delivery windows.' },
        { title: 'Fully insured in transit', desc: 'Rs.50,000 standard insurance on every shipment. Upgrade available for high-value contents.' },
        { title: 'Live tracking', desc: 'Track your bags from the moment they leave your home to the moment they arrive at your destination.' },
      ]}
      steps={[
        { number: '01', title: 'Get a quote', desc: 'Enter your route, bag count, and weight. See instant pricing vs the airline excess fee.' },
        { number: '02', title: 'Book and pack', desc: 'Confirm your booking. We send packing guidelines and a pickup confirmation to your phone.' },
        { number: '03', title: 'We collect', desc: 'Our executive arrives at your door, photographs and seals your bags, and issues a receipt.' },
        { number: '04', title: 'Delivered', desc: 'Bags arrive at your destination address within the delivery window you selected.' },
      ]}
      faqs={[
        { q: 'How much cheaper is Bagdrop vs airline excess?', a: 'On average, customers save 40 to 60 percent. A bag an airline charges Rs.5,000 for typically costs Rs.1,500 to 2,500 with Bagdrop, depending on the route and weight.' },
        { q: 'Can I send bags ahead of my flight?', a: 'Yes. Book pickup 24 to 48 hours before your flight. Your bags will be at the destination before or shortly after you arrive.' },
        { q: 'What is the maximum weight per bag?', a: 'Standard service covers up to 32 kg per bag. Oversized service covers 32 to 50 kg. For items over 50 kg, contact us for a custom quote.' },
        { q: 'Do you accept boxes and non-suitcase items?', a: 'Yes. Cardboard boxes, crates, appliance boxes, and sports equipment are all accepted. Ensure items are securely packed before pickup.' },
      ]}
      ctaHeadline="Stop paying airline excess fees."
      ctaBody="Book your excess baggage shipment in under 2 minutes."
    />
  )
}
