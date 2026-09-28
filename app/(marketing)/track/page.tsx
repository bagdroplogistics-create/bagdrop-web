import type { Metadata } from 'next'
import TrackClient from './TrackClient'

// BAGDROP — PM audit fix (2026-09-28), Issue #5: was a static "coming soon"
// placeholder, indexed and discoverable despite promising nothing worked
// yet. app/api/track/route.ts already had a working, PII-stripped lookup —
// this page now actually uses it. See TrackClient.tsx for details.
export const metadata: Metadata = {
  title: 'Track Your Bags',
  description: 'Track your Bagdrop delivery live — enter your Booking ID to see pickup, transit, and delivery status.',
  alternates: {
    canonical: 'https://www.bagdrop.co/track',
  },
}

export default function TrackPage() {
  return <TrackClient />
}
