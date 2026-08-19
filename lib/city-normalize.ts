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
  // Strip a BARE terminal suffix — not wrapped in parentheses — e.g.
  // "Mumbai Airport T2" or "Delhi T1". Fix (2026-08-20): "Mumbai Airport
  // T2" is one of the standard preset city-picker labels (lib/constants.ts,
  // id 'mumbai-airport-t2') and was silently normalizing to "mumbait2"
  // instead of "mumbai" — never matching any route_pricing row for
  // "mumbai", so the "Reset from route pricing" button/auto-populate
  // silently never appeared for any lead using that exact preset, even
  // though the route itself was correctly configured.
  s = s.replace(/\bterminal\s*[12]\b/g, ' ')
  s = s.replace(/\bt[12]\b/g, ' ')
  // Collapse whitespace, then strip it entirely so multi-word variants
  // ("New Delhi") key the same as single-word aliases below.
  s = s.replace(/\s+/g, '').trim()
  return CITY_ALIASES[s] ?? s
}

// True when two free-form city labels resolve to the same canonical city —
// e.g. citiesEqual('Vadodara', 'Baroda') === true, citiesEqual('Mumbai
// Airport (T2)', 'mumbai') === true. Empty/unresolvable input never matches.
export function citiesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeCity(a)
  return na !== '' && na === normalizeCity(b)
}

// Finds the first active route_pricing row whose (from_city, to_city) pair
// matches the given cities in either direction, comparing on normalized
// (aliased) city keys rather than raw stored text. This is deliberately an
// in-application match over ALL active routes rather than a DB `.eq()` query
// — route_pricing rows are saved as free-typed text (see
// app/api/admin/route-pricing/route.ts), so two rows meaning the same city
// ("Vadodara" vs "Baroda", "Bengaluru" vs "Bangalore") can be stored with
// different raw spellings. A raw `.eq()` against a normalized query value
// silently misses any row saved with the non-canonical spelling — comparing
// normalizeCity(row.field) against normalizeCity(query) catches all of them,
// including rows that predate this fix, with no data migration required.
export function findRouteMatch<T extends { from_city: string; to_city: string }>(
  routes: T[],
  from: string,
  to: string,
): T | null {
  return routes.find(r =>
    (citiesEqual(r.from_city, from) && citiesEqual(r.to_city, to)) ||
    (citiesEqual(r.from_city, to)   && citiesEqual(r.to_city, from))
  ) ?? null
}
