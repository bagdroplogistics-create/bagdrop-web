import type { Metadata } from 'next'
import ContactClient from './ContactClient'

// BAGDROP — PM audit fix (2026-09-28): this page previously had 'use client'
// directly on page.tsx, which means it could NOT export `metadata` (Next.js
// App Router forbids exporting metadata from a Client Component). As a
// result /contact silently inherited the root layout's default title/
// description — the same ones used on the homepage — producing a duplicate
// <title> across both pages (PM Daily Report 2026-09-28, Issue #2).
//
// Fix: split into this Server Component (owns metadata) + ContactClient.tsx
// (owns the interactive form/state, unchanged). No visual or behavioral
// change — only the page's own <title>/<meta description> are now correct.
export const metadata: Metadata = {
  title: 'Contact Bagdrop — WhatsApp, Offices & Support',
  description: 'Reach Bagdrop by WhatsApp (reply within 15 min), email, or phone. Offices in Vadodara, Mumbai, and Goa. USA customers can also reach us via our partner Sky Bird Travel & Tours.',
  alternates: {
    canonical: 'https://www.bagdrop.co/contact',
  },
}

export default function ContactPage() {
  return <ContactClient />
}
