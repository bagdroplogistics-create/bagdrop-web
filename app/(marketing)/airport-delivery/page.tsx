import type { Metadata } from 'next'
import { PlaneLanding } from 'lucide-react'
import { ServicePage } from '@/components/sections/service-page'

export const metadata: Metadata = {
  title: 'Airport Baggage Delivery — Bagdrop',
  description: 'We collect your bags at arrivals and deliver them to your home or hotel. Or pick up from your door and drop at the airport before your flight.',
}

export default function AirportDeliveryPage() {
  return (
    <ServicePage
      badge="Airport Delivery"
      headline="Land. Walk out. We handle the rest."
      subheadline="No trolleys. No queues. No taxi arguments about boot space. Your bags meet you at the destination."
      heroImage="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1600&q=80&auto=format&fit=crop"
      heroImagePos="center 40%"
      icon={PlaneLanding}
      benefits={[
        { title: 'Arrivals collection', desc: 'We meet you at the belt or wait at arrivals. Bags go straight to your hotel or home while you travel light.' },
        { title: 'Departure drop-off', desc: 'We pick up from your door and deliver to the airport — guaranteed before your check-in deadline.' },
        { title: 'Flight-aware scheduling', desc: 'We track your flight in real time and adjust pickup/delivery windows if your flight is delayed.' },
        { title: 'All terminal coverage', desc: 'We operate at T1, T2, T3 across Mumbai, Delhi, Ahmedabad, and Goa airports.' },
        { title: 'Live tracking link', desc: 'From the moment we collect your bag, you and your family can track it in real time.' },
        { title: 'Fully insured', desc: '₹50,000 standard insurance. Upgrade available for high-value baggage.' },
      ]}
      steps={[
        { number: '01', title: 'Book online', desc: 'Enter your flight details, pickup address, and preferred slot. Under 2 minutes.' },
        { number: '02', title: 'We collect', desc: 'Our executive arrives at your door or the airport arrivals hall at the agreed time.' },
        { number: '03', title: 'Track live', desc: 'You get a real-time tracking link the moment your bags leave your hands.' },
        { number: '04', title: 'Delivered', desc: 'Bags arrive at your hotel, home, or terminal — before you do.' },
      ]}
      faqs={[
        { q: 'How early should I book for a flight?', a: 'At least 24 hours before your departure. For early morning flights, book the evening before.' },
        { q: 'What if my flight is delayed?', a: 'We track your flight in real time. Our team adjusts automatically — no calls needed.' },
        { q: 'Can you deliver to any hotel in Mumbai or Delhi?', a: 'Yes. We deliver to any address in our coverage zones, including hotels, homes, and offices.' },
      ]}
      ctaHeadline="Ready to land hands-free?"
      ctaBody="Book your airport delivery in under 2 minutes."
    />
  )
}
