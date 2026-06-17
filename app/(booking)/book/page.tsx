import type { Metadata } from 'next'
import { BookingHero } from '@/components/booking/booking-hero'
import { BookingGate } from '@/components/booking/booking-gate'

export const metadata: Metadata = {
  title: 'Book Luggage Delivery | Bagdrop',
  description: 'Book premium door-to-door baggage delivery across India. Airport pickup, wedding logistics, student relocation and more.',
  robots: { index: false },
}

export default function BookingPage() {
  return (
    <>
      <BookingHero />
      <BookingGate />
    </>
  )
}
