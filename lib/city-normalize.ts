// BAGDROP — lib/city-normalize.ts
//
// Single source of truth for reducing a free-form city/route label (as
// stored on a lead/booking — e.g. "Mumbai Airport (T2)", "Vadodara",
// "Delhi Airport") down to the plain lowercase city key that
// route_pricing.from_city / route_pricing.to_city are actually saved as
// (see app/api/admin/route-pricing/route.ts — routes are saved as just
// `String(from_city).toLowerCase().trim()`, plain city names, no airport
// suffix, no aliasing).
//
// Previously this normalization was implemented twice, slightly differently,
// in app/api/admin/route-pricing/calculate/route.ts and
// app/api/admin/zoho/generate-quote/route.ts — and NEITHER version actually
// stripped airport terminal suffixes like "(T2)" or the word "airport"
// itself. That meant any route involving a label like "Mumbai Airport (T2)"
// (the standard format used throughout the booking flow for airport
// deliveries) could never match a saved route_pricing row for "mumbai",
// silently leaving quote line items empty even when pricing was configured
// correctly. Both call sites now import this one function instead.

const CITY_ALIASES: Record<string, string> = {
  vadodara:   'baroda',
  vdr:        'baroda',
  brc:        'baroda',
  bengaluru:  'bangalore',
  blr:        'bangalore',
  bombay:     'mumbai',
  bom:        'mumbai',
  nmia:       'mumbai',
  newdelhi:   'delhi',
  del:        'delhi',
  igi:        'delhi',
  amd:        'ahmedabad',
  amdairport: 'ahmedabad',
}

export function normalizeCity(raw: string | null | undefined): string {
  let s = (raw ?? '').toLowerCase().trim()
  // Strip any parenthetical suffix — "(T2)", "(Terminal 2)", "(T1, T2)", etc.
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ')
  // Strip the word "airport" on its own — "Mumbai Airport" → "Mumbai".
  s = s.replace(/\bairport\b/g, ' ')
  // Collapse whitespace, then strip it entirely so multi-word variants
  // ("New Delhi") key the same as single-word aliases below.
  s = s.replace(/\s+/g, '').trim()
  return CITY_ALIASES[s] ?? s
}
