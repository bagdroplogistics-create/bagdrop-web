'use client'

import { useEffect } from 'react'

// Reports every click on a Bagdrop WhatsApp link (wa.me/916357115711) to Google
// Ads as the "WhatsApp Lead – Click" conversion, and tags the pre-filled message
// with [AD] (visitor arrived from a Google ad, gclid) or [WEB] so ad leads can be
// told apart from website leads.
//
// IMPORTANT: confirm the label below against Google Ads → Goals → Conversions →
// "WhatsApp Lead – Click" → Tag setup. One wrong character = no tracking.
const WA_CONVERSION = 'AW-17917128565/DfVYCPqioLMdEPXext9C'
const DEFAULT_MSG = "Hi Bagdrop, I'd like a quote for baggage delivery."

export default function WhatsAppClickTracker() {
  useEffect(() => {
    try {
      if (/[?&]gclid=/.test(window.location.search)) sessionStorage.setItem('bd_src', 'AD')
    } catch { /* storage unavailable */ }

    function onClick(e: MouseEvent) {
      const target = e.target as Element | null
      const link = target?.closest?.('a[href*="wa.me/916357115711"]') as HTMLAnchorElement | null
      if (!link) return

      const w = window as unknown as { gtag?: (...a: unknown[]) => void }
      if (typeof w.gtag === 'function') {
        w.gtag('event', 'conversion', {
          send_to: WA_CONVERSION, value: 1.0, currency: 'INR', transport_type: 'beacon',
        })
      }

      let src = 'WEB'
      try { src = sessionStorage.getItem('bd_src') || 'WEB' } catch { /* ignore */ }

      // Keep any message the page already pre-fills (e.g. "where is my order");
      // only fall back to the default quote message when there is none.
      let base = DEFAULT_MSG
      try {
        const existing = new URL(link.href).searchParams.get('text')
        if (existing) base = existing.replace(/\s*\[(AD|WEB)\]\s*$/, '')
      } catch { /* ignore */ }
      link.href = 'https://wa.me/916357115711?text=' + encodeURIComponent(`${base} [${src}]`)
    }

    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  return null
}
