import type { Metadata } from 'next'
import { Playfair_Display, Inter } from 'next/font/google'

// BAGDROP — ICONIQA Hotel, Mumbai International Airport × Bagdrop landing
// page layout. Deliberately a NEW font pairing from the Y2K wedding page
// (Cormorant Garamond / Great Vibes) — Playfair Display (premium hospitality
// serif, used by airline/hotel brands) + Inter (already the body font used
// across the rest of bagdrop.co) — so this reads as a sophisticated hotel
// guest service, not a reskin of the wedding page.
const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-playfair',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter-iconiqa',
  display: 'swap',
})

export const metadata: Metadata = {
  // Browser tab / search / link-preview title — simple and professional,
  // per Founder spec section 20 ("Do not put customer names or dynamic
  // booking information in the browser title").
  title: 'ICONIQA Mumbai Airport | Baggage Delivery by BagDrop',
  description: 'Travel light from ICONIQA Hotel, Mumbai International Airport. Book hassle-free baggage delivery between your hotel, the airport, and your destination — powered by Bagdrop.',
  openGraph: {
    title: 'ICONIQA Mumbai Airport | Baggage Delivery by BagDrop',
    description: 'Book baggage delivery to/from ICONIQA Hotel, Mumbai International Airport — powered by Bagdrop.',
    type: 'website',
  },
  robots: { index: true, follow: true },
}

export default function IconiqaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${playfair.variable} ${inter.variable}`}>
      {children}
    </div>
  )
}
