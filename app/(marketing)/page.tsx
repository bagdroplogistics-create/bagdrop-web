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
  title: 'Travel Light. Arrive Stress-Free.',
  description:
    'Premium luggage delivery for airports, destination weddings, student relocations, and intercity travel across India.',
  alternates: {
    canonical: 'https://bagdrop.co',
  },
}

// Section components — to be built in Phase 4
import { HeroSection }       from '@/components/sections/hero'
import { TrustBar }          from '@/components/sections/trust-bar'
import { HowItWorks }        from '@/components/sections/how-it-works'
import { ServicesGrid }      from '@/components/sections/services-grid'
import { WhyBagdrop }        from '@/components/sections/why-bagdrop'
import { Testimonials }      from '@/components/sections/testimonials'
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
      <FaqSection />
      <CtaBanner />
    </>
  )
}
