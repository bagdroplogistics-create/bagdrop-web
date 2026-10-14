// BAGDROP — use-case catalogue for the unified booking engine.
//
// Each use case CONFIGURES the same shipment/booking engine (it is not a new
// workflow). Source: "Bagdrop OS Blueprint" chapter 3. The six existing
// service categories stay exactly as they are; use cases refine them.
//
// Availability is data, not code: `enabledByDefault` is the fallback and a row
// in the `settings` table (key `use_case_enabled:<id>` = 'true' | 'false')
// overrides it. Use cases that need partner / route / price setup that is not
// confirmed are shipped DISABLED so nothing is silently activated.
//
// This file has no imports so it can run in the browser, the server and tests.

export type UseCaseMode = 'air' | 'rail' | 'sea' | 'road'
export type LocationType = 'home' | 'hotel' | 'airport' | 'station' | 'cruise-terminal' | 'venue' | 'hub' | 'any'
export type ServiceCategory =
  | 'airport-delivery' | 'door-to-door' | 'destination-weddings'
  | 'student-relocation' | 'corporate-travel' | 'excess-baggage'

export interface UseCaseDef {
  id: string
  label: string
  tagline: string
  /** Existing /book category this use case belongs to (keeps current behaviour). */
  service: ServiceCategory
  pickup: LocationType
  drop: LocationType
  mode: UseCaseMode
  /** Human-readable cut-off rule from the blueprint (informational until slot engine exists). */
  cutOffRule: string
  /** Label for the optional travel reference field; null = none. */
  travelReferenceLabel: string | null
  /** Needs traveller identity verification before booking (when the identity gate is on). */
  requiresIdentity: boolean
  /** Shipped enabled? Existing live categories: yes. New, unconfigured: no. */
  enabledByDefault: boolean
  /** Why it is disabled by default (shown to admins). */
  disabledReason?: string
}

export const USE_CASES: UseCaseDef[] = [
  { id: 'd2a', label: 'Doorstep → Airport', tagline: 'Fly hands free', service: 'airport-delivery', pickup: 'home', drop: 'airport', mode: 'air',
    cutOffRule: 'Flight time minus 4 h at the airport', travelReferenceLabel: 'Flight number', requiresIdentity: true, enabledByDefault: true },
  { id: 'a2d', label: 'Airport → Doorstep', tagline: 'Land and leave', service: 'airport-delivery', pickup: 'airport', drop: 'home', mode: 'air',
    cutOffRule: 'Flight arrival + 45 min', travelReferenceLabel: 'Flight number', requiresIdentity: true, enabledByDefault: true },
  { id: 'd2d', label: 'Door → Door', tagline: 'Intercity surface', service: 'door-to-door', pickup: 'home', drop: 'home', mode: 'road',
    cutOffRule: 'Line-haul departure', travelReferenceLabel: null, requiresIdentity: true, enabledByDefault: true },
  { id: 'h2h', label: 'Hotel → Hotel', tagline: 'Multi-city stay', service: 'door-to-door', pickup: 'hotel', drop: 'hotel', mode: 'road',
    cutOffRule: 'Hotel checkout time', travelReferenceLabel: 'Hotel booking reference', requiresIdentity: true, enabledByDefault: false,
    disabledReason: 'Needs hotel/concierge partner setup' },
  { id: 'h2a', label: 'Hotel → Airport', tagline: 'Check out light', service: 'airport-delivery', pickup: 'hotel', drop: 'airport', mode: 'air',
    cutOffRule: 'Flight time minus 4 h', travelReferenceLabel: 'Flight number', requiresIdentity: true, enabledByDefault: false,
    disabledReason: 'Needs hotel/concierge partner setup' },
  { id: 'rail', label: 'Railway station', tagline: 'Vande Bharat, Rajdhani', service: 'door-to-door', pickup: 'home', drop: 'station', mode: 'rail',
    cutOffRule: 'Train departure minus 90 min', travelReferenceLabel: 'Train number', requiresIdentity: true, enabledByDefault: false,
    disabledReason: 'Needs railway parcel arrangement, routes and prices' },
  { id: 'cruise', label: 'Cruise terminal', tagline: 'Mumbai, Goa, Kochi', service: 'door-to-door', pickup: 'home', drop: 'cruise-terminal', mode: 'sea',
    cutOffRule: 'Sailing minus 3 h', travelReferenceLabel: 'Ship / sailing reference', requiresIdentity: true, enabledByDefault: false,
    disabledReason: 'Needs cruise-line / port arrangement' },
  { id: 'wed', label: 'Wedding / Group', tagline: 'Manifest per guest', service: 'destination-weddings', pickup: 'home', drop: 'venue', mode: 'road',
    cutOffRule: 'Event date minus 1 day', travelReferenceLabel: null, requiresIdentity: true, enabledByDefault: true },
  { id: 'event', label: 'MICE / Event', tagline: 'Venue to hotel', service: 'corporate-travel', pickup: 'venue', drop: 'hotel', mode: 'road',
    cutOffRule: 'Session end', travelReferenceLabel: 'Event reference', requiresIdentity: true, enabledByDefault: false,
    disabledReason: 'Needs organiser bulk-upload process' },
  { id: 'store', label: 'Store and forward', tagline: 'Hold bags, deliver later', service: 'door-to-door', pickup: 'any', drop: 'any', mode: 'road',
    cutOffRule: 'Hold up to 30 days', travelReferenceLabel: null, requiresIdentity: true, enabledByDefault: false,
    disabledReason: 'Needs hub storage inventory' },
  { id: 'student', label: 'Student relocation', tagline: 'Home to hostel / campus', service: 'student-relocation', pickup: 'home', drop: 'any', mode: 'road',
    cutOffRule: 'Term start', travelReferenceLabel: null, requiresIdentity: true, enabledByDefault: true },
  { id: 'excess', label: 'Excess baggage', tagline: 'Ship it cheaper than airline fees', service: 'excess-baggage', pickup: 'any', drop: 'any', mode: 'road',
    cutOffRule: 'Line-haul departure', travelReferenceLabel: null, requiresIdentity: true, enabledByDefault: true },
  { id: 'corp', label: 'Corporate travel', tagline: 'Volume rates', service: 'corporate-travel', pickup: 'any', drop: 'any', mode: 'road',
    cutOffRule: 'Line-haul departure', travelReferenceLabel: null, requiresIdentity: true, enabledByDefault: true },
]

export const useCaseById = (id: string | null | undefined) => USE_CASES.find(u => u.id === id) ?? null

/** Parse the `use_case_enabled:*` overrides loaded from the settings table. */
export function resolveEnabledUseCases(overrides: Record<string, string | null | undefined> = {}): UseCaseDef[] {
  return USE_CASES.filter(u => {
    const o = overrides[`use_case_enabled:${u.id}`]
    if (o === 'true') return true
    if (o === 'false') return false
    return u.enabledByDefault
  })
}

/** Use cases that refine a given existing service category and are currently enabled. */
export function useCasesForService(service: string | null, enabled: UseCaseDef[]): UseCaseDef[] {
  return service ? enabled.filter(u => u.service === service) : []
}
