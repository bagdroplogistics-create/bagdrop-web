import type { Metadata } from 'next'
import { Home } from 'lucide-react'
import { ServicePage } from '@/components/sections/service-page'

export const metadata: Metadata = {
  title: 'Door-to-Door Luggage Delivery Service India — Gujarat · Maharashtra · Goa',
  description: 'Door-to-door luggage & baggage delivery service across India. Pickup from any address, delivered to any address. Gujarat, Maharashtra, Goa & major cities.',
  alternates: { canonical: 'https://bagdrop.co/door-to-door' },
  keywords: [
    'door to door luggage delivery India',
    'door to door baggage delivery service',
    'intercity luggage delivery India',
    'luggage delivery Gujarat Maharashtra',
    'send bags door to door India',
  ],
}

export default function DoorToDoorPage() {
  return (
    <ServicePage
      slug="door-to-door"
      badge="Door-to-Door Delivery"
      headline="Your bags. Any two doors. Any city."
      subheadline="Moving between Mumbai and Pune? Sending luggage ahead to your holiday villa? We handle the distance so you don't have to."
      heroImage="https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1600&q=80&auto=format&fit=crop"
      heroImagePos="center 50%"
      icon={Home}
      benefits={[
        { title: 'No airport needed', desc: 'Pure doorstep-to-doorstep delivery. Perfect for intercity moves, holiday prep, or sending gifts.' },
        { title: 'Gujarat & Maharashtra', desc: 'Coverage across both states with reliable timelines — most deliveries completed within 24–48 hours.' },
        { title: 'Goa service', desc: 'Send your bags ahead to your Goa villa or hotel and arrive completely luggage-free.' },
        { title: 'WhatsApp & email updates', desc: 'We keep you and the recipient informed at every stage — pickup, in transit, and delivered. Live tracking coming soon.' },
        { title: 'Flexible scheduling', desc: 'Choose your pickup and delivery time windows. Morning, afternoon, or evening.' },
        { title: 'Insured transit', desc: 'Standard ₹50,000 insurance on every shipment. Upgrade for high-value items.' },
      ]}
      steps={[
        { number: '01', title: 'Book & schedule', desc: 'Enter pickup and drop addresses, number of bags, and preferred date.' },
        { number: '02', title: 'Pickup from door', desc: 'Our executive arrives, photographs and seals your bags, and issues a receipt.' },
        { number: '03', title: 'Intercity transit', desc: 'Bags travel in a dedicated Bagdrop vehicle — not shared with random parcels.' },
        { number: '04', title: 'Delivered to door', desc: 'Recipient is notified before arrival. Bags handed over with proof of delivery.' },
      ]}
      faqs={[
        { q: 'How long does intercity delivery take?', a: 'Most deliveries within Gujarat and Maharashtra complete within 24–48 hours. Goa typically 36–60 hours.' },
        { q: 'Can someone else receive the bags?', a: 'Yes. Just provide the recipient name and phone at booking. They will receive a WhatsApp delivery notification before arrival.' },
        { q: 'Is there a weight limit?', a: 'Standard bags up to 32 kg per item. Oversized (up to 50 kg) available at checkout.' },
      ]}
      ctaHeadline="Ship your bags. Travel free."
      ctaBody="Door-to-door delivery across Gujarat, Maharashtra & Goa."
    />
  )
}
