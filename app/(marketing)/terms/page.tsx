import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms & Conditions — Bagdrop',
  description: 'Terms and conditions governing your use of Bagdrop services.',
}

const SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    text: 'By booking a service with Bagdrop or using our website (bagdrop.co), you agree to be bound by these Terms & Conditions. If you do not agree, please do not use our services. These terms apply to all customers, visitors, and users of Bagdrop services.',
  },
  {
    title: '2. Services',
    text: 'Bagdrop provides premium luggage logistics services including airport-to-doorstep delivery, doorstep-to-airport delivery, intercity baggage transport, destination wedding logistics, student relocation baggage shipping, and excess baggage forwarding. All services are subject to availability and operational coverage at the time of booking.',
  },
  {
    title: '3. Booking & Payment',
    text: 'Bookings are confirmed upon receipt of full payment or acceptance of a booking inquiry by our team. Prices displayed are estimates and may vary based on actual bag weight, dimensions, and route. Final pricing will be confirmed before pickup. All prices are inclusive of applicable taxes unless stated otherwise.',
  },
  {
    title: '4. Prohibited Items',
    text: 'The following items are strictly prohibited from being shipped through Bagdrop: cash, jewellery, passports or identity documents, perishable goods, hazardous or flammable materials, firearms or weapons, illegal substances, fragile items not properly packed, or any item prohibited under Indian law or BCAS regulations. Bagdrop reserves the right to refuse or return any shipment containing prohibited items without refund.',
  },
  {
    title: '5. Liability & Compensation',
    text: 'Bagdrop takes the utmost care in handling your baggage. In the unlikely event of loss or damage, our liability is limited to a maximum of Rs. 5,000 per bag unless the customer has declared a higher value and paid the applicable surcharge at the time of booking. We are not liable for damage to items inadequately packed, inherently fragile items, or items resulting from delays caused by third parties, weather, or force majeure events.',
  },
  {
    title: '6. Cancellation Policy',
    text: 'Cancellations made more than 24 hours before the scheduled pickup are eligible for a credit voucher (see Refund Policy). Cancellations made within 24 hours of pickup are not eligible for any credit or refund. No-shows at the pickup location will be treated as a cancellation within 24 hours.',
  },
  {
    title: '7. Customer Responsibilities',
    text: 'Customers are responsible for: ensuring bags are properly packed and labelled; providing accurate pickup and delivery addresses; being available (or having a representative available) at the time of pickup; declaring any fragile or high-value items before booking; ensuring the contents comply with all applicable regulations.',
  },
  {
    title: '8. Delays',
    text: 'Bagdrop strives to deliver within the committed timeframe. However, delays may occur due to traffic, weather, operational disruptions, or circumstances beyond our control. In such cases, Bagdrop will communicate proactively and redeliver at no additional charge. Bagdrop is not liable for any consequential loss arising from delays.',
  },
  {
    title: '9. Privacy',
    text: 'Your use of Bagdrop services is also governed by our Privacy Policy, which is incorporated into these Terms by reference. By using our services, you consent to the collection and use of your information as described in the Privacy Policy.',
  },
  {
    title: '10. Governing Law',
    text: 'These Terms & Conditions are governed by the laws of India. Any disputes arising out of or related to these terms shall be subject to the exclusive jurisdiction of the courts in Vadodara, Gujarat, India.',
  },
  {
    title: '11. Changes to Terms',
    text: 'Bagdrop reserves the right to modify these Terms & Conditions at any time. Changes will be effective immediately upon posting to bagdrop.co/terms. Continued use of our services after changes constitutes acceptance of the new terms.',
  },
  {
    title: '12. Contact',
    text: 'For any questions about these Terms & Conditions, please contact us at info@bagdrop.co or +91 96245 16661. Our office is located at 302, 3rd Floor, Ananta Stallion, Gotri Sevasi Road, Gotri, Vadodara – 391101.',
  },
]

export default function TermsPage() {
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
          <h1 className="font-display text-display-lg font-bold text-white">Terms &amp; Conditions</h1>
          <p className="mt-3 text-white/70">Last updated: June 2025</p>
        </div>
      </section>

      <div className="section-container py-16 lg:py-20">
        <div className="mx-auto max-w-3xl">
          <div className="mb-10 rounded-2xl border border-brand/20 bg-brand/5 p-6">
            <p className="text-base text-text-primary leading-relaxed">
              Please read these Terms &amp; Conditions carefully before using Bagdrop services. These terms form a legal agreement between you and Bagdrop Logistics Solutions Pvt. Ltd. (CIN pending). By placing a booking, you confirm you have read, understood, and agreed to these terms.
            </p>
          </div>

          <div className="space-y-5">
            {SECTIONS.map((section) => (
              <div key={section.title} className="rounded-2xl border border-border bg-white p-6 shadow-sm">
                <h2 className="text-base font-bold text-text-primary mb-3">{section.title}</h2>
                <p className="text-sm text-text-secondary leading-relaxed">{section.text}</p>
              </div>
            ))}
          </div>

          <p className="mt-10 text-sm text-text-muted text-center">
            These terms were last updated in June 2025. Always refer to bagdrop.co/terms for the current version.
          </p>
        </div>
      </div>
    </div>
  )
}
