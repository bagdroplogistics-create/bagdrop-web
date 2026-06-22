'use client'

import { Suspense, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
CheckCircle2,
Package,
ArrowRight,
MessageCircle,
Mail,
} from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'

function ConfirmationContent() {
const params = useSearchParams()
const trackingId = params.get('id') ?? ''

const [booking, setBooking] = useState<any>(null)

useEffect(() => {
           // Fire Google Ads conversion when booking is confirmed
           if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
                        ;(window as any).gtag('event', 'conversion', {
                                       send_to: 'AW-17917128565/RUFPCJCb0IkcEPXext9C',
                        })
           }
try {
const raw = sessionStorage.getItem('bagdrop_booking')
if (raw) setBooking(JSON.parse(raw))
} catch {
// ignore
}
}, [])

const customerEmail = booking?.booking?.email ?? 'your email'

return ( <main className="min-h-screen bg-cream pt-20 pb-24"> <div className="mx-auto max-w-xl px-4 sm:px-6 py-16 text-center">
<motion.div
className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100"
initial={{ scale: 0 }}
animate={{ scale: 1 }}
transition={{ type: 'spring', stiffness: 300, damping: 20 }}
> <CheckCircle2
         className="h-10 w-10 text-green-600"
         strokeWidth={1.75}
       />
</motion.div>


    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.4 }}
    >
      <h1 className="font-display text-3xl font-bold text-text-primary">
        Booking Request Received!
      </h1>

      <p className="mt-3 text-base text-text-secondary">
        Our team will call you within <strong>30 minutes</strong> to
        confirm your booking. A confirmation email has been sent to{' '}
        <strong>{customerEmail}</strong>.
      </p>

      {trackingId && (
        <div className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white border border-border px-5 py-3 shadow-sm">
          <Package className="h-4 w-4 text-brand" strokeWidth={1.75} />
          <span className="text-sm text-text-muted">
            Your Booking ID:
          </span>
          <span className="font-mono text-sm font-bold text-brand tracking-widest">
            {trackingId}
          </span>
        </div>
      )}

      <div className="mt-4 flex items-center justify-center gap-2 text-sm text-text-muted">
        <Mail className="h-4 w-4 text-brand" />
        <span>Check your inbox for booking details</span>
      </div>
    </motion.div>

    <motion.div
      className="mt-10 rounded-2xl border border-border bg-white p-6 text-left space-y-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.4 }}
    >
      <h2 className="font-display text-sm font-semibold text-text-primary">
        What happens next?
      </h2>

      {[
        'Our team will call you within 30 minutes to confirm pickup details.',
        'A Bagdrop executive will arrive at your address at the scheduled time.',
        'Your bags are photographed, sealed, and tracked throughout the journey.',
        'Live updates will be sent to your phone and email until delivery.',
      ].map((text, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-light text-xs font-bold text-brand">
            {i + 1}
          </div>
          <p className="text-sm text-text-secondary leading-relaxed">
            {text}
          </p>
        </div>
      ))}
    </motion.div>

    <motion.div
      className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.45, duration: 0.4 }}
    >
      <Button variant="primary" size="lg" asChild>
        <Link href="/track">
          Track My Bag
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>

      <Button variant="secondary" size="lg" asChild>
        <a
          href={`https://wa.me/919999999999?text=Hi! My Bagdrop booking ID is ${trackingId}. Can you confirm my booking?`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle className="h-4 w-4" />
          WhatsApp Us
        </a>
      </Button>
    </motion.div>

    <p className="mt-8 text-xs text-text-muted">
      <Link
        href="/"
        className="underline underline-offset-4 hover:text-brand"
      >
        ← Back to home
      </Link>
    </p>
  </div>
</main>

)
}

export default function ConfirmationPage() {
return (
<Suspense fallback={<div>Loading...</div>}> <ConfirmationContent /> </Suspense>
)
}
