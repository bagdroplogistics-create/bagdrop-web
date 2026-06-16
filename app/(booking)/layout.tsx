import Script from 'next/script'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'

export default function BookingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  return (
    <>
      {mapsKey && (
        <Script
          id="google-maps"
          src={`https://maps.googleapis.com/maps/api/js?key=${mapsKey}&libraries=places&language=en&region=IN`}
          strategy="afterInteractive"
        />
      )}
      <Navbar />
      <main>{children}</main>
      <Footer />
    </>
  )
}
