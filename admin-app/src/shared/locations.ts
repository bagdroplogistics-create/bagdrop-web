// Same 14 pickup/drop locations used in the customer app's booking form
// (mobile-app/src/shared/constants.ts → BOOKING_LOCATIONS), so the admin
// quote form offers an identical location list. `routeKey` is the plain
// city key route-pricing/generate-quote expect (matches the aliases in
// app/api/admin/route-pricing/calculate/route.ts and
// app/api/admin/zoho/generate-quote/route.ts's normalise()).

export interface LocationOption {
  id: string
  label: string
  routeKey: string
}

export const PICKUP_LOCATIONS: LocationOption[] = [
  { id: 'ahmedabad', label: 'Ahmedabad', routeKey: 'ahmedabad' },
  { id: 'anand', label: 'Anand', routeKey: 'anand' },
  { id: 'bangalore', label: 'Bangalore', routeKey: 'bangalore' },
  { id: 'dahod', label: 'Dahod', routeKey: 'dahod' },
  { id: 'delhi-airport-t3', label: 'Delhi Airport', routeKey: 'delhi' },
  { id: 'goa', label: 'Goa', routeKey: 'goa' },
  { id: 'hyderabad-airport', label: 'Hyderabad Airport', routeKey: 'hyderabad' },
  { id: 'jaipur', label: 'Jaipur', routeKey: 'jaipur' },
  { id: 'mumbai', label: 'Mumbai', routeKey: 'mumbai' },
  { id: 'mumbai-airport-t2', label: 'Mumbai Airport T2', routeKey: 'mumbai' },
  { id: 'nadiad', label: 'Nadiad', routeKey: 'nadiad' },
  { id: 'rajasthan', label: 'Rajasthan', routeKey: 'rajasthan' },
  { id: 'udaipur', label: 'Udaipur', routeKey: 'udaipur' },
  { id: 'baroda', label: 'Vadodara', routeKey: 'baroda' },
]

export const OTHERS_VALUE = '__others__'

export const LOCATION_OPTIONS = [
  ...PICKUP_LOCATIONS.map(l => ({ value: l.id, label: l.label })),
  { value: OTHERS_VALUE, label: 'Others (type manually)' },
]

/** Given a saved from_city/to_city label, find the matching location id
 *  so a SelectField can be pre-selected. Falls back to "Others" with the
 *  raw text preserved, so custom/manual routes still round-trip. */
export function matchLocation(label?: string | null): { id: string | null; otherText: string } {
  const trimmed = (label ?? '').trim()
  if (!trimmed) return { id: null, otherText: '' }
  const found = PICKUP_LOCATIONS.find(l => l.label.toLowerCase() === trimmed.toLowerCase())
  if (found) return { id: found.id, otherText: '' }
  return { id: OTHERS_VALUE, otherText: trimmed }
}

/** Resolve a display label (from either the location list or free text)
 *  to the plain city key route-pricing/generate-quote expect. */
export function toRouteCityKey(label: string): string {
  const trimmed = label.trim()
  const found = PICKUP_LOCATIONS.find(l => l.label.toLowerCase() === trimmed.toLowerCase())
  return found ? found.routeKey : trimmed.toLowerCase()
}
