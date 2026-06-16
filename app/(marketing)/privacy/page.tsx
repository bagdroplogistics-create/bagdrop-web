import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — Bagdrop',
  description: 'How Bagdrop collects, uses, and protects your personal information.',
}

const SECTIONS = [
  {
    title: '1. Information We Collect',
    items: [
      { subtitle: 'Personal Information', text: 'When you book a service, we collect your name, email address, phone number, and delivery addresses (pickup and drop-off locations).' },
      { subtitle: 'Booking Information', text: 'Details about your luggage, travel dates, flight information, and any special handling instructions you provide.' },
      { subtitle: 'Payment Information', text: 'We do not store card or payment details. All payments are processed through secure third-party gateways (Razorpay / Stripe).' },
      { subtitle: 'Usage Data', text: 'We may collect information about how you use our website, including IP address, browser type, pages visited, and time spent on pages.' },
    ],
  },
  {
    title: '2. How We Use Your Information',
    items: [
      { subtitle: 'Service Delivery', text: 'To process and fulfil your baggage delivery bookings, including coordinating pickup, transit, and delivery.' },
      { subtitle: 'Communication', text: 'To send booking confirmations, tracking updates, and delivery notifications via email and WhatsApp.' },
      { subtitle: 'Customer Support', text: 'To respond to your queries, complaints, and requests.' },
      { subtitle: 'Improvement', text: 'To analyse usage patterns and improve our website, services, and customer experience.' },
      { subtitle: 'Legal Compliance', text: 'To comply with applicable laws, regulations, and government requests in India.' },
    ],
  },
  {
    title: '3. Sharing of Information',
    items: [
      { subtitle: 'Logistics Partners', text: 'We share necessary booking and address information with our delivery and logistics partners solely for the purpose of completing your order.' },
      { subtitle: 'Technology Providers', text: 'We use third-party services for email delivery (Resend), database (Supabase), and payment processing. Each provider has their own privacy policy.' },
      { subtitle: 'Legal Requirements', text: 'We may disclose information if required by law, court order, or governmental authority in India.' },
      { subtitle: 'No Sale of Data', text: 'We do not sell, rent, or trade your personal information to third parties for marketing purposes.' },
    ],
  },
  {
    title: '4. Data Security',
    items: [
      { subtitle: 'Encryption', text: 'All data transmitted to and from our website is encrypted using SSL/TLS technology.' },
      { subtitle: 'Access Controls', text: 'Access to customer data is restricted to authorised Bagdrop staff on a need-to-know basis.' },
      { subtitle: 'Data Retention', text: 'We retain your booking information for up to 3 years for service, legal, and accounting purposes. You may request deletion at any time.' },
    ],
  },
  {
    title: '5. Your Rights',
    items: [
      { subtitle: 'Access', text: 'You may request a copy of the personal data we hold about you by emailing info@bagdrop.co.' },
      { subtitle: 'Correction', text: 'You may request correction of inaccurate or incomplete personal data at any time.' },
      { subtitle: 'Deletion', text: 'You may request deletion of your personal data, subject to any legal retention obligations.' },
      { subtitle: 'Opt-Out', text: 'You may opt out of marketing communications at any time by replying STOP to any WhatsApp message or using the unsubscribe link in emails.' },
    ],
  },
  {
    title: '6. Cookies',
    items: [
      { subtitle: 'Usage', text: 'Our website uses cookies to enhance your browsing experience, remember preferences, and analyse traffic. No personally identifiable information is stored in cookies.' },
      { subtitle: 'Control', text: 'You can disable cookies through your browser settings. Some features of the website may not function correctly without cookies.' },
    ],
  },
  {
    title: '7. Contact Us',
    items: [
      { subtitle: 'Privacy Queries', text: 'For any questions, concerns, or requests related to your privacy, please contact us at info@bagdrop.co or call +91 96245 16661. We aim to respond within 5 business days.' },
    ],
  },
]

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-cream">
      <section className="relative overflow-hidden bg-[#111] py-16 lg:py-20">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-55"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1400&q=80&auto=format&fit=crop')" }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/35 to-black/10" aria-hidden="true" />
        <div className="relative z-10 section-container">
          <span className="inline-block rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-white mb-4">Legal</span>
          <h1 className="font-display text-display-lg font-bold text-white">Privacy Policy</h1>
          <p className="mt-3 text-white/70">Last updated: June 2025</p>
        </div>
      </section>

      <div className="section-container py-16 lg:py-20">
        <div className="mx-auto max-w-3xl">
          <div className="mb-10 rounded-2xl border border-brand/20 bg-brand/5 p-6">
            <p className="text-base text-text-primary leading-relaxed">
              Bagdrop ("we", "us", "our") is committed to protecting your privacy. This policy explains what information we collect, how we use it, and the choices you have. By using bagdrop.co or booking our services, you agree to this policy.
            </p>
          </div>

          <div className="space-y-8">
            {SECTIONS.map((section) => (
              <div key={section.title} className="rounded-2xl border border-border bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-text-primary mb-4">{section.title}</h2>
                <div className="space-y-4">
                  {section.items.map((item) => (
                    <div key={item.subtitle}>
                      <p className="text-sm font-semibold text-text-primary mb-1">{item.subtitle}</p>
                      <p className="text-sm text-text-secondary leading-relaxed">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-10 text-sm text-text-muted text-center">
            This policy may be updated periodically. The latest version will always be available at bagdrop.co/privacy.
          </p>
        </div>
      </div>
    </div>
  )
}
