import type { Metadata } from 'next'
import { Home } from 'lucide-react'
import { ServicePage } from '@/components/sections/service-page'

export const metadata: Metadata = {
  title: 'Home Baggage Drop — Luggage Collected From Your Door to the Airport',
  description: 'Home baggage drop across India: we collect your luggage from home or hotel and take it to your departure airport, so you arrive at the terminal with hand baggage only.',
  alternates: { canonical: 'https://www.bagdrop.co/home-baggage-drop' },
  keywords: ['home baggage drop', 'home baggage check-in', 'luggage pickup from home to airport', 'doorstep baggage drop India'],
}

export default function HomeBaggageDropPage() {
  return (
    <ServicePage
      slug="home-baggage-drop"
      badge="Home Baggage Drop"
      headline="Home baggage drop. Reach the airport with nothing to carry."
      subheadline="We collect your bags from home or hotel and take them to your departure airport before your flight. No queues at drop-off, no heavy lifting."
      heroImage="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1600&q=80&auto=format&fit=crop"
      heroImagePos="center 50%"
      icon={Home}
      benefits={[
        { title: 'Pickup from your door', desc: 'Our executive collects your luggage from your home, hotel or office at the time you choose.' },
        { title: 'Delivered to the airport on time', desc: 'Bags are taken to your departure airport ahead of your flight, so your schedule stays simple.' },
        { title: 'Sealed and photographed', desc: 'Every bag is photographed and sealed at pickup, with a receipt issued on the spot.' },
        { title: 'Updates on WhatsApp and email', desc: 'You are told when the bags are picked up and when they reach the airport.' },
        { title: 'Heavy and extra bags welcome', desc: 'Ideal for families, students and anyone carrying more than the airline allows.' },
        { title: 'Insured in transit', desc: 'Standard insurance on every shipment, with upgrades available for high-value items.' },
      ]}
      steps={[
        { number: '01', title: 'Book online', desc: 'Share your pickup address, flight details and number of bags.' },
        { number: '02', title: 'We collect', desc: 'Our executive arrives, checks, photographs and seals each bag.' },
        { number: '03', title: 'Taken to the airport', desc: 'Bags travel to your departure airport ahead of your flight.' },
        { number: '04', title: 'You travel light', desc: 'Arrive at the terminal with only hand baggage.' },
      ]}
      faqs={[
        { q: 'How early should I book home baggage drop?', a: 'Book at least 24 hours before your flight. For early-morning flights, we recommend booking two days ahead.' },
        { q: 'Which cities do you cover?', a: 'Mumbai, Delhi, Ahmedabad and Vadodara, with routes across Gujarat, Maharashtra and Goa. Message us for other cities.' },
        { q: 'Is my luggage insured?', a: 'Yes. Standard insurance applies to every shipment, with higher cover available at checkout.' },
      ]}
      ctaHeadline="Skip the baggage queue."
      ctaBody="Book home baggage drop in under two minutes."
    />
  )
}
