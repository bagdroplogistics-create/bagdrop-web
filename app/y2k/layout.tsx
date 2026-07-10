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
  title: 'Yashna ❤️ Yash — #Y2K | Wedding Luggage Concierge by Bagdrop',
  description:
    'Exclusive luggage concierge service for guests attending Yashna & Yash\'s destination wedding at Taj Lake Palace, Udaipur on 17 December 2026.',
  openGraph: {
    title: 'Yashna ❤️ Yash — #Y2K Wedding Luggage Concierge',
    description: 'BagDrop is the official luggage concierge partner for #Y2K at Taj Lake Palace, Udaipur.',
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
