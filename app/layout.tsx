import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Inter } from 'next/font/google'
import { cn } from '@/lib/utils'
import Script from 'next/script'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const viewport: Viewport = {
  themeColor: '#FF6300',
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  metadataBase: new URL('https://bagdrop.co'),
  title: {
    default: 'Bagdrop — Travel Light. Arrive Stress-Free.',
    template: '%s | Bagdrop',
  },
  description:
    'Premium luggage delivery for airports, destination weddings, student relocations, and intercity travel across India. We handle your bags — you travel free.',
  keywords: [
    'luggage delivery India',
    'airport baggage delivery',
    'door to door luggage delivery India',
    'excess baggage shipping India',
    'destination wedding luggage transport',
    'student baggage shipping India',
  ],
  authors: [{ name: 'Bagdrop Logistics Solutions Pvt. Ltd.' }],
  creator: 'Bagdrop',
  publisher: 'Bagdrop Logistics Solutions Pvt. Ltd.',
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: 'https://bagdrop.co',
    siteName: 'Bagdrop',
    title: 'Bagdrop — Travel Light. Arrive Stress-Free.',
    description:
      'Premium luggage delivery for airports, destination weddings, student relocations, and intercity travel across India.',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Bagdrop — Premium Luggage Delivery India',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bagdrop — Travel Light. Arrive Stress-Free.',
    description:
      'Premium luggage delivery for airports, destination weddings, student relocations, and intercity travel.',
    images: ['/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={cn(
        GeistSans.variable,
        GeistMono.variable,
        inter.variable,
        'scroll-smooth'
      )}
    >
      <head>
        <Script
          async
          src="https://www.googletagmanager.com/gtag/js?id=AW-17917128565"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'AW-17917128565');
          `}
        </Script>
      </head>
      <body
        className={cn(
          'min-h-screen bg-cream font-sans antialiased',
          inter.className
        )}
      >
        {children}
      </body>
    </html>
  )
}
