import type { Metadata } from 'next'
import { Briefcase } from 'lucide-react'
import { ServicePage } from '@/components/sections/service-page'

export const metadata: Metadata = {
  title: 'Corporate Baggage & Luggage Delivery Service India | Bagdrop',
  description: 'Corporate baggage delivery service across India. Volume rates, GST invoicing, monthly billing, and dedicated account management for business travel teams.',
  alternates: { canonical: 'https://bagdrop.co/corporate-travel' },
  keywords: [
    'corporate baggage delivery service India',
    'corporate luggage logistics India',
    'business travel baggage delivery India',
    'corporate excess baggage service',
    'GST invoice luggage delivery India',
  ],
}

export default function CorporateTravelPage() {
  return (
    <ServicePage
      slug="corporate-travel"
      badge="Corporate Travel"
      headline="Business-class logistics for your whole team."
      subheadline="Volume pricing. GST invoices. Dedicated account manager. Bagdrop handles every bag so your team focuses on the meeting, not the luggage."
      heroImage="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1600&q=80&auto=format&fit=crop"
      heroImagePos="center center"
      icon={Briefcase}
      benefits={[
        { title: 'Volume pricing', desc: 'Significant discounts for 10+ bags per booking. Custom rates for monthly volume commitments.' },
        { title: 'GST invoicing', desc: 'Full GST-compliant invoices for every booking. Monthly consolidated billing available.' },
        { title: 'Dedicated account manager', desc: 'A single WhatsApp contact for all corporate bookings. Priority response SLA.' },
        { title: 'Multi-city coverage', desc: 'We operate in Mumbai, Delhi, Ahmedabad, and Goa — the four most common corporate travel hubs in India.' },
        { title: 'Team event logistics', desc: 'Off-sites, conferences, roadshows. We coordinate baggage logistics for entire teams across multiple locations.' },
        { title: 'Executive service', desc: 'Premium handling for senior executives. Guaranteed pickup windows and priority delivery.' },
      ]}
      steps={[
        { number: '01', title: 'Set up account', desc: 'Contact us to set up a corporate account. Takes 24 hours. Monthly billing enabled.' },
        { number: '02', title: 'Book per trip', desc: 'Your team books directly via our website or WhatsApp. All billed to the company account.' },
        { number: '03', title: 'We handle logistics', desc: 'Pickup, transit, tracking — all managed by your dedicated account manager.' },
        { number: '04', title: 'Monthly invoice', desc: 'Single consolidated GST invoice at month end. No per-trip payment friction.' },
      ]}
      faqs={[
        { q: 'What is the minimum volume for a corporate account?', a: 'No minimum. Corporate accounts get GST invoicing and a dedicated manager from the first booking. Volume discounts kick in at 10+ bags per month.' },
        { q: 'Can employees book on behalf of the company?', a: 'Yes. We can set up a company booking link that employees use directly. All bookings are invoiced to the company.' },
        { q: 'Do you handle event logistics such as conferences and off-sites?', a: 'Absolutely. This is a core use case. Share your event brief and we will propose a full logistics plan.' },
      ]}
      ctaHeadline="Upgrade your team travel."
      ctaBody="Set up a corporate account in 24 hours. Volume pricing from day one."
    />
  )
}
