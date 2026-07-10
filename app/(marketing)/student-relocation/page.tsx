import type { Metadata } from 'next'
import { GraduationCap } from 'lucide-react'
import { ServicePage } from '@/components/sections/service-page'

export const metadata: Metadata = {
  title: 'Student Luggage & Baggage Delivery Service India — Save on Excess Fees',
  description: 'Baggage delivery service for students going abroad or relocating for college in India. Save ₹8,000+ on airline excess fees. Door-to-door pickup & delivery across India.',
  alternates: { canonical: 'https://bagdrop.co/student-relocation' },
  keywords: [
    'student luggage delivery service India',
    'student baggage shipping India',
    'excess baggage delivery for students India',
    'send luggage to college India',
    'student relocation baggage service',
  ],
}

export default function StudentRelocationPage() {
  return (
    <ServicePage
      slug="student-relocation"
      badge="Student Relocation"
      headline="Move your life. Not your bags."
      subheadline="Heading to college in another city or a university abroad? Ship everything you own for a fraction of the airline fee."
      heroImage="https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1600&q=80&auto=format&fit=crop"
      heroImagePos="center 30%"
      icon={GraduationCap}
      benefits={[
        { title: 'Save Rs.8,000+ in fees', desc: 'Airlines charge Rs.3,000 to 8,000 per bag for excess. Bagdrop ships the same bag door-to-door for significantly less.' },
        { title: 'Any size, any weight', desc: 'Books. Clothes. Appliances. Sports gear. We handle everything a student needs to move.' },
        { title: 'Delivery to hostels and PGs', desc: 'We coordinate with hostel wardens and PG owners for smooth delivery, even if you have not arrived yet.' },
        { title: 'Abroad shipments', desc: 'Moving to the UK, US, Canada, or Australia? We partner with international logistics for cross-border student moves.' },
        { title: 'Flexible timing', desc: 'Book pickup and delivery independently. Ship bags a week before you fly and arrive to a ready room.' },
        { title: 'Transparent pricing', desc: 'No hidden charges. Pay per bag, not per kg. Know exactly what you pay before you book.' },
      ]}
      steps={[
        { number: '01', title: 'Book and pack', desc: 'Book online. We send you packing guidelines and box specifications if needed.' },
        { number: '02', title: 'Pickup from home', desc: 'We collect from your parents home. No need for you to be present.' },
        { number: '03', title: 'Stay updated', desc: 'Your parents and you both get WhatsApp & email updates at every stage. Live tracking coming soon.' },
        { number: '04', title: 'Delivered to college', desc: 'Bags delivered to your hostel, PG, or apartment before or after you arrive.' },
      ]}
      faqs={[
        { q: 'Can my parents arrange the pickup without me?', a: 'Absolutely. Your parents can hand over the bags and we will keep both of you updated via WhatsApp and email at every stage.' },
        { q: 'Do you deliver to hostel rooms?', a: 'We deliver to the hostel reception or main gate. Coordinate with your warden in advance for smooth handover.' },
        { q: 'What is cheaper, Bagdrop or airline excess?', a: 'Bagdrop almost always wins. Airlines charge per kg over the limit. Bagdrop charges per bag regardless of weight. Most students save Rs.5,000 to 12,000.' },
      ]}
      ctaHeadline="Ship your bags. Fly free."
      ctaBody="Special student rates available. No excess fee surprises."
    />
  )
}
