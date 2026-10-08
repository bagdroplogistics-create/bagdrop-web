import type { Metadata } from 'next'
import { Plane } from 'lucide-react'
import { ServicePage } from '@/components/sections/service-page'

export const metadata: Metadata = {
  title: 'Airport Baggage Services in India — Mumbai, Delhi & Ahmedabad Airports',
  description: 'Airport baggage services for travellers: airport-to-doorstep delivery, home baggage drop and excess baggage transfer from Mumbai, Delhi and Ahmedabad airports.',
  alternates: { canonical: 'https://www.bagdrop.co/airport-baggage-services' },
  keywords: ['airport baggage services', 'airport baggage service India', 'airport luggage delivery', 'excess baggage airport India'],
}

export default function AirportBaggageServicesPage() {
  return (
    <ServicePage
      slug="airport-baggage-services"
      badge="Airport Baggage Services"
      headline="Airport baggage services for travellers who want to travel light."
      subheadline="Arriving, departing or carrying more than the airline allows? We move your bags between the airport and your door."
      heroImage="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1600&q=80&auto=format&fit=crop"
      heroImagePos="center 50%"
      icon={Plane}
      benefits={[
        { title: 'Airport to doorstep', desc: 'We collect your bags on arrival and deliver them to your home or hotel.' },
        { title: 'Doorstep to airport', desc: 'We pick up from your address and take bags to the departure airport.' },
        { title: 'Excess baggage, handled', desc: 'Send the extra bags separately instead of paying airline excess fees.' },
        { title: 'Mumbai, Delhi and Ahmedabad', desc: 'Airport services from these airports to destinations across Gujarat, Maharashtra and Goa.' },
        { title: 'Made for NRIs, families and students', desc: 'Built around international arrivals, long stays and big moves.' },
        { title: 'Insured and tracked', desc: 'Standard insurance and status updates through WhatsApp and email.' },
      ]}
      steps={[
        { number: '01', title: 'Share your flight', desc: 'Flight number, date, number of bags and drop address.' },
        { number: '02', title: 'Get a quote', desc: 'A clear price before you commit.' },
        { number: '03', title: 'We handle the bags', desc: 'Collected at the airport or your door, sealed and photographed.' },
        { number: '04', title: 'Delivered', desc: 'Handed over at the destination with proof of delivery.' },
      ]}
      faqs={[
        { q: 'Which airports do you serve?', a: 'Mumbai (T2), Delhi and Ahmedabad, with deliveries across Gujarat, Maharashtra and Goa. More locations are being added.' },
        { q: 'Is this cheaper than airline excess baggage fees?', a: 'For heavy or multiple extra bags it often is. Ask for a quote and compare it with your airline fee.' },
        { q: 'Do you need my flight details?', a: 'Yes, for airport pickups and drop-offs. It lets us plan the timing around your flight.' },
      ]}
      ctaHeadline="Land. Walk out. Bags follow."
      ctaBody="Book airport baggage services in minutes."
    />
  )
}
