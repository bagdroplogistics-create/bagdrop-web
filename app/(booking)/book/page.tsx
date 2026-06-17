import type { Metadata } from 'next'
import { BookingHero }   from '@/components/booking/booking-hero'
import { BookingEngine } from '@/components/booking/booking-engine'

export const metadata: Metadata = {
  title: 'Book Luggage Delivery | Bagdrop',
  description: 'Book premium door-to-door baggage delivery across India. Airport pickup, wedding logistics, student relocation and more.',
  robots: { index: false },
}

export default function BookingPage() {
  return (
    <>
      <BookingHero />
      <BookingEngine />
    </>
  )
}
