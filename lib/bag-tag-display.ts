// BAGDROP — Airport-tag styling helpers (2026-09-07 redesign)
//
// Deliberately ZERO imports — same reasoning as lib/booking-status.ts's
// own module comment: this file must be safe to import from a 'use
// client' component (components/admin/BagTagPrintCard.tsx). It was
// FIRST written as part of lib/bag-tags.ts, which imports supabaseAdmin
// (lib/supabase.ts) at module scope to build the service-role client —
// that top-level `createClient(url, key)` call throws "supabaseKey is
// required" the instant it runs in a browser bundle, since the
// service-role key is server-only and never exposed to the client. Next
// bundles a module's ENTIRE top-level code once any client component
// imports anything from it, so even importing just cityCode/
// barcodeStripes from lib/bag-tags.ts pulled that throwing client-code
// into every admin page's bundle (production incident 2026-09-07 —
// "Application error: supabaseKey is required" on every /admin/* page,
// not just the bag-tags ones, because the bad chunk was shared).
// lib/bag-tags.ts re-exports both functions from here so its existing
// server-side importers (lib/bag-tags-pdf.tsx) keep working unchanged.
export interface BarcodeStripe { pct: number; bar: boolean }

// cityCode() is a purely DECORATIVE 3-letter mark for the FROM/TO panel —
// it is never the bag's real transport routing (BagDrop is not an
// airline; see lib/bag-tags.ts's own module comment). Known BagDrop
// operating cities map to their real public airport code as a nice
// touch; anything else falls back to its own first three letters so the
// panel never goes blank for a city we don't have hardcoded.
const KNOWN_CITY_CODES: Record<string, string> = {
  mumbai: 'BOM', 'mumbai airport': 'BOM',
  delhi: 'DEL', 'new delhi': 'DEL',
  ahmedabad: 'AMD',
  vadodara: 'BDQ', baroda: 'BDQ',
  udaipur: 'UDR',
  surat: 'STV',
  rajkot: 'RAJ',
  goa: 'GOI', dabolim: 'GOI', mopa: 'GOX',
  pune: 'PNQ',
  jaipur: 'JAI',
  bengaluru: 'BLR', bangalore: 'BLR',
  hyderabad: 'HYD',
  indore: 'IDR',
  nagpur: 'NAG',
  bhopal: 'BHO',
  chennai: 'MAA',
  kolkata: 'CCU',
}

export function cityCode(cityRaw: string | null | undefined): string {
  if (!cityRaw || !cityRaw.trim()) return '—'
  const key = cityRaw.trim().toLowerCase().replace(/\s*(airport|terminal|t1|t2|t3)\b.*$/i, '').trim()
  if (KNOWN_CITY_CODES[key]) return KNOWN_CITY_CODES[key]
  const letters = cityRaw.replace(/[^a-zA-Z]/g, '').toUpperCase()
  return letters.slice(0, 3) || '—'
}

// Deterministic, purely decorative "barcode" pattern — the real scan
// mechanism for a bag tag has always been the QR code (encodes
// bagTrackingUrl(), lib/bag-tags.ts). This never claims to be scannable
// — it exists so the tag reads visually as an airport baggage tag.
// Seeded from the bag's own label so the same tag always renders the
// same "barcode" (stable across re-prints/re-downloads) without needing
// a real barcode library or an extra network request per tag (unlike the
// QR, which already goes through api.qrserver.com).
export function barcodeStripes(seed: string, count = 44): BarcodeStripe[] {
  let state = 0
  for (let i = 0; i < seed.length; i++) state = (state * 31 + seed.charCodeAt(i)) >>> 0
  if (state === 0) state = 1
  function rand(): number {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const widths: number[] = []
  for (let i = 0; i < count; i++) {
    const r = rand()
    widths.push(r < 0.18 ? 3 : r < 0.5 ? 2 : 1)
  }
  const sum = widths.reduce((a, b) => a + b, 0)
  return widths.map((w, i) => ({ pct: (w / sum) * 100, bar: i % 2 === 0 }))
}
