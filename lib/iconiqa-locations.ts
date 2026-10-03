// BAGDROP — lib/iconiqa-locations.ts
//
// Airport location options for the ICONIQA Hotel landing page
// (app/iconiqa/page.tsx) — Founder request, 2026-10-03: "update delivery
// location in a dropdown add Mumbai T2, NMIA, Delhi all 3 Terminal,
// Bangalore, Hyderabad means add total 7 location in Delivery for all 4
// baggage delivery category wherever pickup and delivery location
// required."
//
// Shared between the client form (app/iconiqa/page.tsx) and the server
// route (app/api/iconiqa/inquiry/route.ts) so the dropdown options and
// the server-side validation of submitted values can never drift apart.
//
// Each label deliberately wraps its airport-code/terminal qualifier in
// parentheses — lib/city-normalize.ts's normalizeCity() strips any
// "(...)" content as a whole unit before matching against route_pricing,
// so e.g. "Mumbai Airport (Terminal 2)" still cleanly resolves to the
// canonical city key "mumbai" for pricing/route-matching purposes,
// without needing any further changes there. "Navi Mumbai International
// Airport (NMIA)" deliberately resolves to its own distinct city key
// ("navimumbai") rather than being aliased to "mumbai" — it's a separate
// physical airport, and nothing here should silently decide those two
// are commercially equivalent; if Bagdrop prices them the same, that's a
// Route/Pricing Master entry for each from the admin, not an alias.
export interface IconiqaLocationOption {
  value: string
  label: string
}

export const ICONIQA_AIRPORT_LOCATIONS: IconiqaLocationOption[] = [
  { value: 'mumbai-t2',   label: 'Mumbai Airport (Terminal 2)' },
  { value: 'nmia',        label: 'Navi Mumbai International Airport (NMIA)' },
  { value: 'delhi-t1',    label: 'Delhi Airport (Terminal 1)' },
  { value: 'delhi-t2',    label: 'Delhi Airport (Terminal 2)' },
  { value: 'delhi-t3',    label: 'Delhi Airport (Terminal 3)' },
  { value: 'bangalore',   label: 'Bangalore Airport' },
  { value: 'hyderabad',   label: 'Hyderabad Airport' },
]
