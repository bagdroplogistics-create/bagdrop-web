import type { Metadata } from 'next'
import { Cormorant_Garamond, Great_Vibes, Lato } from 'next/font/google'

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
})

const greatVibes = Great_Vibes({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-great-vibes',
  display: 'swap',
})

const lato = Lato({
  subsets: ['latin'],
  weight: ['300', '400', '700'],
  variable: '--font-lato',
  display: 'swap',
})

export const metadata: Metadata = {
  // Browser tab / bookmark / share-preview title — deliberately generic
  // (no couple names, no #Y2K) per Founder request. The on-page hero still
  // shows the couple's names and wedding branding; this only controls what
  // shows in the tab, search results, and link previews.
  title: 'Wedding Excess Luggage Delivery | Bagdrop',
  description:
    'Exclusive luggage concierge service for destination wedding guests — pickup, delivery and safe handling of excess baggage across India.',
  openGraph: {
    title: 'Wedding Excess Luggage Delivery | Bagdrop',
    description: 'Bagdrop is a wedding luggage concierge service — pickup, delivery and safe handling of excess baggage for destination wedding guests.',
    type: 'website',
  },
}

export default function WeddingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${cormorant.variable} ${greatVibes.variable} ${lato.variable}`}>
      {children}
    </div>
  )
}
