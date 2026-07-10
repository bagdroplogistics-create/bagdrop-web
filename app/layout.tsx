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
    default: 'Excess Baggage Delivery Service in India | Door-to-Door Luggage Delivery | Bagdrop',
    template: '%s | Bagdrop',
  },
  description:
    'India\'s premium excess baggage delivery service. Door-to-door luggage pickup & delivery for airports, destination weddings, student relocations, and intercity travel. Save 40–60% vs airline fees.',
  keywords: [
    'excess baggage delivery service India',
    'luggage delivery service India',
    'airport baggage delivery India',
    'door to door luggage delivery India',
    'excess baggage shipping India',
    'baggage delivery Mumbai Delhi Ahmedabad',
    'send luggage ahead India',
    'doorstep baggage delivery',
    'airport to doorstep delivery',
    'destination wedding luggage transport',
    'student baggage shipping India',
    'intercity luggage delivery',
    'bagdrop',
  ],
  authors: [{ name: 'Bagdrop Logistics Solutions Pvt. Ltd.' }],
  creator: 'Bagdrop',
  publisher: 'Bagdrop Logistics Solutions Pvt. Ltd.',
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: 'https://bagdrop.co',
    siteName: 'Bagdrop',
    title: 'Excess Baggage Delivery Service in India | Door-to-Door Luggage Delivery | Bagdrop',
    description:
      'Bagdrop offers fast, secure, and affordable excess baggage delivery across India. Door-to-door luggage pickup, airport transfers, and nationwide baggage shipping.',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Bagdrop — Excess Baggage Delivery Service India',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bagdrop — Excess Baggage & Luggage Delivery Service India',
    description:
      'Door-to-door luggage & excess baggage delivery across India. Save 40–60% vs airline fees. Mumbai · Delhi · Ahmedabad · Vadodara.',
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
      className={cn(GeistSans.variable, GeistMono.variable, inter.variable, 'scroll-smooth')}
    >
      <head>
        {/* ── Preconnect — speeds up hero image + font loading ── */}
        <link rel="preconnect" href="https://images.unsplash.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://api.qrserver.com" />

        {/* ── WebSite Schema — enables Google Sitelinks search box ── */}
        <Script id="schema-website" type="application/ld+json" strategy="beforeInteractive">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            'name': 'Bagdrop',
            'url': 'https://bagdrop.co',
            'description': 'India\'s excess baggage and luggage delivery service. Door-to-door pickup and delivery across India.',
            'potentialAction': {
              '@type': 'SearchAction',
              'target': {
                '@type': 'EntryPoint',
                'urlTemplate': 'https://bagdrop.co/track?id={search_term_string}',
              },
              'query-input': 'required name=search_term_string',
            },
          })}
        </Script>

        {/* ── Structured Data — Organization · LocalBusiness · Services · Reviews · FAQ ── */}
        <Script id="schema-org" type="application/ld+json" strategy="beforeInteractive">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [

              // ── 1. ORGANIZATION ──────────────────────────────────────────
              {
                '@type': 'Organization',
                '@id': 'https://bagdrop.co/#organization',
                'name': 'Bagdrop Logistics Solutions Pvt. Ltd.',
                'alternateName': 'Bagdrop',
                'url': 'https://bagdrop.co',
                'logo': {
                  '@type': 'ImageObject',
                  'url': 'https://bagdrop.co/logo.png',
                  'width': 200,
                  'height': 60,
                },
                'image': 'https://bagdrop.co/og-image.jpg',
                'description': 'India\'s premium excess baggage and luggage delivery service. Door-to-door pickup and delivery for airports, destination weddings, student relocations, and intercity travel across India.',
                'foundingDate': '2023',
                'legalName': 'Bagdrop Logistics Solutions Pvt. Ltd.',
                'vatID': '24BDMPS7461P1ZM',
                'address': {
                  '@type': 'PostalAddress',
                  'streetAddress': 'TF-302, Ananta Stallion, Gotri Sevasi Road',
                  'addressLocality': 'Vadodara',
                  'addressRegion': 'Gujarat',
                  'postalCode': '391101',
                  'addressCountry': 'IN',
                },
                'contactPoint': [
                  {
                    '@type': 'ContactPoint',
                    'telephone': '+91-63-5711-5711',
                    'contactType': 'customer service',
                    'areaServed': 'IN',
                    'availableLanguage': ['English', 'Hindi', 'Gujarati'],
                    'contactOption': 'TollFree',
                  },
                  {
                    '@type': 'ContactPoint',
                    'email': 'info@bagdrop.co',
                    'contactType': 'customer support',
                    'areaServed': 'IN',
                  },
                ],
                'sameAs': [
                  'https://www.instagram.com/bagdrop.co',
                  'https://www.linkedin.com/company/bagdrop',
                  'https://www.facebook.com/bagdrop',
                ],
              },

              // ── 2. LOCAL BUSINESS ────────────────────────────────────────
              {
                '@type': 'LocalBusiness',
                '@id': 'https://bagdrop.co/#business',
                'name': 'Bagdrop — Excess Baggage Delivery Service',
                'alternateName': 'Bagdrop Logistics Solutions',
                'description': 'India\'s premium excess baggage and luggage delivery service. Door-to-door pickup and delivery for airports, destination weddings, student relocations, and intercity travel.',
                'url': 'https://bagdrop.co',
                'telephone': '+91-63-5711-5711',
                'email': 'info@bagdrop.co',
                'logo': 'https://bagdrop.co/logo.png',
                'image': 'https://bagdrop.co/og-image.jpg',
                'parentOrganization': { '@id': 'https://bagdrop.co/#organization' },
                'address': {
                  '@type': 'PostalAddress',
                  'streetAddress': 'TF-302, Ananta Stallion, Gotri Sevasi Road',
                  'addressLocality': 'Vadodara',
                  'addressRegion': 'Gujarat',
                  'postalCode': '391101',
                  'addressCountry': 'IN',
                },
                'geo': {
                  '@type': 'GeoCoordinates',
                  'latitude': 22.3539,
                  'longitude': 73.1627,
                },
                'areaServed': [
                  { '@type': 'City', 'name': 'Mumbai' },
                  { '@type': 'City', 'name': 'Delhi' },
                  { '@type': 'City', 'name': 'Ahmedabad' },
                  { '@type': 'City', 'name': 'Vadodara' },
                  { '@type': 'City', 'name': 'Surat' },
                  { '@type': 'City', 'name': 'Pune' },
                  { '@type': 'City', 'name': 'Goa' },
                  { '@type': 'State', 'name': 'Gujarat' },
                  { '@type': 'State', 'name': 'Maharashtra' },
                ],
                'priceRange': '₹₹',
                'currenciesAccepted': 'INR',
                'paymentAccepted': 'Cash, Credit Card, Debit Card, UPI',
                'openingHoursSpecification': {
                  '@type': 'OpeningHoursSpecification',
                  'dayOfWeek': ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
                  'opens': '07:00',
                  'closes': '21:00',
                },
                // AggregateRating — from verified Google Business Profile (5.0 ★, 8 reviews)
                'aggregateRating': {
                  '@type': 'AggregateRating',
                  'ratingValue': '5.0',
                  'reviewCount': '8',
                  'bestRating': '5',
                  'worstRating': '1',
                },
                'hasOfferCatalog': {
                  '@type': 'OfferCatalog',
                  'name': 'Bagdrop Services',
                  'itemListElement': [
                    { '@type': 'Offer', 'itemOffered': { '@type': 'Service', 'name': 'Excess Baggage Delivery' } },
                    { '@type': 'Offer', 'itemOffered': { '@type': 'Service', 'name': 'Airport to Doorstep Delivery' } },
                    { '@type': 'Offer', 'itemOffered': { '@type': 'Service', 'name': 'Door-to-Door Luggage Delivery' } },
                    { '@type': 'Offer', 'itemOffered': { '@type': 'Service', 'name': 'Destination Wedding Baggage' } },
                    { '@type': 'Offer', 'itemOffered': { '@type': 'Service', 'name': 'Student Relocation Baggage' } },
                    { '@type': 'Offer', 'itemOffered': { '@type': 'Service', 'name': 'Corporate Travel Logistics' } },
                  ],
                },
              },

              // ── 3. SERVICES (all 6) ──────────────────────────────────────
              {
                '@type': 'Service',
                '@id': 'https://bagdrop.co/excess-baggage#service',
                'serviceType': 'Excess Baggage Delivery Service',
                'name': 'Excess Baggage Delivery Service in India',
                'description': 'Door-to-door excess baggage delivery across India. Save 40–60% vs airline excess fees. Pickup from your home, delivered to your destination.',
                'provider': { '@id': 'https://bagdrop.co/#business' },
                'areaServed': { '@type': 'Country', 'name': 'India' },
                'url': 'https://bagdrop.co/excess-baggage',
                'offers': { '@type': 'Offer', 'priceCurrency': 'INR', 'availability': 'https://schema.org/InStock' },
              },
              {
                '@type': 'Service',
                '@id': 'https://bagdrop.co/airport-delivery#service',
                'serviceType': 'Airport Baggage Delivery Service',
                'name': 'Airport to Doorstep Baggage Delivery',
                'description': 'Airport baggage collection and delivery to your home, hotel or office. Or doorstep pickup before your flight. Covers Mumbai, Delhi, Ahmedabad & Goa airports.',
                'provider': { '@id': 'https://bagdrop.co/#business' },
                'areaServed': { '@type': 'Country', 'name': 'India' },
                'url': 'https://bagdrop.co/airport-delivery',
                'offers': { '@type': 'Offer', 'priceCurrency': 'INR', 'availability': 'https://schema.org/InStock' },
              },
              {
                '@type': 'Service',
                '@id': 'https://bagdrop.co/door-to-door#service',
                'serviceType': 'Door to Door Luggage Delivery',
                'name': 'Door-to-Door Luggage Delivery Service India',
                'description': 'Intercity door-to-door luggage delivery across Gujarat, Maharashtra, and Goa. Reliable timelines, insured transit.',
                'provider': { '@id': 'https://bagdrop.co/#business' },
                'areaServed': [
                  { '@type': 'State', 'name': 'Gujarat' },
                  { '@type': 'State', 'name': 'Maharashtra' },
                  { '@type': 'State', 'name': 'Goa' },
                ],
                'url': 'https://bagdrop.co/door-to-door',
                'offers': { '@type': 'Offer', 'priceCurrency': 'INR', 'availability': 'https://schema.org/InStock' },
              },
              {
                '@type': 'Service',
                '@id': 'https://bagdrop.co/destination-weddings#service',
                'serviceType': 'Wedding Logistics Service',
                'name': 'Destination Wedding Luggage Delivery India',
                'description': 'White-glove baggage and wedding logistics service for destination weddings across India. Multi-city pickup, garment handling, gift return logistics.',
                'provider': { '@id': 'https://bagdrop.co/#business' },
                'areaServed': { '@type': 'Country', 'name': 'India' },
                'url': 'https://bagdrop.co/destination-weddings',
                'offers': { '@type': 'Offer', 'priceCurrency': 'INR', 'availability': 'https://schema.org/InStock' },
              },
              {
                '@type': 'Service',
                '@id': 'https://bagdrop.co/student-relocation#service',
                'serviceType': 'Student Relocation Baggage Service',
                'name': 'Student Luggage Delivery Service India',
                'description': 'Baggage delivery for students relocating for college or going abroad. Save on airline excess fees. Door-to-door pickup from parents\' home, delivered to hostel or PG.',
                'provider': { '@id': 'https://bagdrop.co/#business' },
                'areaServed': { '@type': 'Country', 'name': 'India' },
                'url': 'https://bagdrop.co/student-relocation',
                'offers': { '@type': 'Offer', 'priceCurrency': 'INR', 'availability': 'https://schema.org/InStock' },
              },
              {
                '@type': 'Service',
                '@id': 'https://bagdrop.co/corporate-travel#service',
                'serviceType': 'Corporate Baggage Logistics',
                'name': 'Corporate Travel Baggage Delivery India',
                'description': 'Corporate baggage and travel logistics across India. Volume rates, GST invoicing, monthly billing, and dedicated account management.',
                'provider': { '@id': 'https://bagdrop.co/#business' },
                'areaServed': { '@type': 'Country', 'name': 'India' },
                'url': 'https://bagdrop.co/corporate-travel',
                'offers': { '@type': 'Offer', 'priceCurrency': 'INR', 'availability': 'https://schema.org/InStock' },
              },

            ],
          })}
        </Script>

        {/* ── Google Ads Tag ── */}
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
