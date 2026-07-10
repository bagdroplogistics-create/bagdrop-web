import type { Metadata } from 'next'
import { Heart } from 'lucide-react'
import { ServicePage } from '@/components/sections/service-page'

export const metadata: Metadata = {
  title: 'Destination Wedding Luggage Delivery Service India | Bagdrop',
  description: 'White-glove luggage delivery service for destination weddings across India. Bagdrop handles all guest baggage — pickup from every home, delivered to the venue.',
  alternates: { canonical: 'https://bagdrop.co/destination-weddings' },
  keywords: [
    'destination wedding luggage delivery India',
    'wedding baggage logistics India',
    'luggage delivery for weddings India',
    'wedding guest baggage service',
    'destination wedding baggage transport India',
  ],
}

export default function DestinationWeddingsPage() {
  return (
    <ServicePage
      slug="destination-weddings"
      badge="Destination Weddings"
      headline="Your big day deserves bag-free logistics."
      subheadline="Lehengas. Sherwanis. Gifts. Decor. We coordinate every piece across every city so your family arrives, not their luggage worries."
      heroImage="https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=1600&q=80&auto=format&fit=crop&crop=top"
      heroImagePos="center 25%"
      icon={Heart}
      benefits={[
        { title: 'White-glove handling', desc: 'Every garment bag, gift box, and decor piece is handled with premium care. Special packaging available.' },
        { title: 'Multi-city coordination', desc: 'Pickup from multiple family homes across different cities. Single booking. One dedicated operations manager.' },
        { title: 'Arrives before you', desc: 'We ensure bags reach the venue before the first function so you can focus on what matters.' },
        { title: 'Lehenga and sherwani safe', desc: 'We use hanging garment boxes for delicate outfits to prevent creasing and damage.' },
        { title: 'Gift and return logistics', desc: 'We can also coordinate return shipments, sending gifts back to guests homes after the wedding.' },
        { title: 'Dedicated coordinator', desc: 'A single point of contact for your entire wedding logistics. Available on WhatsApp.' },
      ]}
      steps={[
        { number: '01', title: 'Wedding briefing', desc: 'Share your wedding dates, venues, and guest list. We create a custom logistics plan.' },
        { number: '02', title: 'Multi-point pickup', desc: 'We collect from all locations on a coordinated schedule.' },
        { number: '03', title: 'Safe transit', desc: 'Garments travel in padded packaging. Fragile items handled separately.' },
        { number: '04', title: 'Venue delivery', desc: 'Everything arrives at the venue, organized and on time, before your mehendi begins.' },
      ]}
      faqs={[
        { q: 'Can you handle multiple pickup locations?', a: 'Yes. We specialize in multi-city wedding logistics. Coordinate up to 20 pickup addresses in a single booking.' },
        { q: 'How do you handle delicate outfits?', a: 'Lehengas and sherwanis are placed in dedicated hanging garment boxes to prevent folding and creasing during transit.' },
        { q: 'What is the lead time for wedding bookings?', a: 'We recommend booking at least 7 to 10 days before the first event. For large weddings with 50+ bags, 2 weeks minimum.' },
      ]}
      ctaHeadline="Make your wedding bag-free."
      ctaBody="White-glove wedding logistics across India. Book a consultation."
    />
  )
}
