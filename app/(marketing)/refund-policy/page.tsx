import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Refund Policy — Bagdrop',
  description: 'Understand how Bagdrop handles cancellations and refunds through our credit voucher system.',
}

const SECTIONS = [
  {
    title: 'No Direct Refund Policy',
    content:
      'Bagdrop does not offer direct monetary refunds. Instead, we provide a flexible credit voucher to ensure you can use your booking value anytime. This policy allows us to maintain high service standards while giving our customers maximum flexibility.',
  },
  {
    title: '6-Month Credit Voucher',
    content:
      'In case of cancellation or eligible refund situations, customers will receive a credit voucher valid for 6 months from the date of issue. The voucher can be applied to any future Bagdrop booking of equal or greater value.',
  },
  {
    title: 'Voucher Extension',
    content:
      'If the voucher is not used within 6 months, we will extend it by another 6 months upon request, ensuring maximum flexibility for our customers. Simply contact us before the expiry date to request an extension.',
  },
  {
    title: 'Transferable Voucher',
    content:
      'If you do not wish to use the voucher yourself, you are free to transfer it to your friends, family or relatives. The voucher remains valid for the remaining duration and can be used on any Bagdrop service.',
  },
  {
    title: 'Eligible Situations',
    content:
      'Credit vouchers are issued in the following situations: customer-initiated cancellation before pickup, service unavailability due to operational reasons, or disruptions caused by circumstances outside the customer\'s control. Each case is reviewed individually by our team.',
  },
  {
    title: 'How to Request',
    content:
      'To request a credit voucher, contact us via WhatsApp or email at info@bagdrop.co with your booking ID and reason for cancellation. Our team will process your request within 24–48 business hours and issue the voucher to your registered email.',
  },
  {
    title: 'Contact Us',
    content:
      'For any questions about our refund policy, please reach out to us at info@bagdrop.co or call +91 96245 16661. We are happy to help clarify your options.',
  },
]

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-cream">
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#111] py-16 lg:py-20">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-55"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1400&q=80&auto=format&fit=crop')" }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/35 to-black/10" aria-hidden="true" />
        <div className="relative z-10 section-container">
          <span className="inline-block rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-white mb-4">
            Legal
          </span>
          <h1 className="font-display text-display-lg font-bold text-white">Refund Policy</h1>
          <p className="mt-3 text-white/70 max-w-xl">
            Last updated: June 2025
          </p>
        </div>
      </section>

      {/* Content */}
      <div className="section-container py-16 lg:py-20">
        <div className="mx-auto max-w-3xl">
          {/* Intro box */}
          <div className="mb-10 rounded-2xl border border-brand/20 bg-brand/5 p-6">
            <p className="text-base text-text-primary leading-relaxed font-medium">
              At Bagdrop, we believe every rupee you spend should deliver value. Our credit voucher policy ensures your booking amount is never lost — it stays available for your future travel needs.
            </p>
          </div>

          <div className="space-y-8">
            {SECTIONS.map((s, i) => (
              <div key={i} className="rounded-2xl border border-border bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-text-primary mb-3">{s.title}</h2>
                <p className="text-base text-text-secondary leading-relaxed">{s.content}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 text-sm text-text-muted text-center">
            This policy is subject to change. The latest version will always be available at bagdrop.co/refund-policy.
          </div>
        </div>
      </div>
    </div>
  )
}
