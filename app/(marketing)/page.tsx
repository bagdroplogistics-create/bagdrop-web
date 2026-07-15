/**
 * BAGDROP — Homepage
 *
 * Phase 4 will implement all sections with full content and animations.
 * This scaffold defines the section structure and imports.
 *
 * Sections (in order):
 * 1. Hero               — dark bg, headline, dual CTA, animated visual
 * 2. TrustBar           — bags delivered / cities / on-time % / rating
 * 3. HowItWorks         — 4 steps: Book → Pickup → Track → Delivery
 * 4. ServicesGrid       — 6 service cards
 * 5. CoverageMap        — India map with active cities
 * 6. WhyBagdrop         — 4 differentiators
 * 7. Testimonials       — 3 customer reviews
 * 8. PressPartners      — logo strip
 * 9. FaqSection         — top 5 questions with schema
 * 10. CtaBanner         — full-width "Ready to travel light?"
 */

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Excess Baggage Delivery Service in India | Door-to-Door Luggage Delivery | Bagdrop',
  description:
    'Bagdrop offers fast, secure, and affordable excess baggage delivery across India. Door-to-door luggage pickup, airport transfers, and nationwide baggage shipping.',
  alternates: {
    canonical: 'https://bagdrop.co',
  },
  keywords: [
    'excess baggage delivery service India',
    'luggage delivery service India',
    'airport to doorstep baggage delivery',
    'door to door luggage delivery India',
    'baggage delivery Mumbai',
    'baggage delivery Delhi',
    'baggage delivery Ahmedabad',
    'send excess baggage India',
    'bagdrop',
  ],
}

// Section components — to be built in Phase 4
import { HeroSection }       from '@/components/sections/hero'
import { TrustBar }          from '@/components/sections/trust-bar'
import { HowItWorks }        from '@/components/sections/how-it-works'
import { ServicesGrid }      from '@/components/sections/services-grid'
import { WhyBagdrop }        from '@/components/sections/why-bagdrop'
import { Testimonials }      from '@/components/sections/testimonials'
import { GoogleReviews }     from '@/components/sections/google-reviews'
import { FaqSection }        from '@/components/sections/faq-section'
import { CtaBanner }         from '@/components/sections/cta-banner'

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <TrustBar />
      <HowItWorks />
      <ServicesGrid />
      <WhyBagdrop />
      <Testimonials />
      <GoogleReviews />
      <FaqSection />
      <CtaBanner />
    </>
  )
}
