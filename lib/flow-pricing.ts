// BAGDROP — customer flow data + price estimate, taken from "Bagdrop Platform.html"
// (the blueprint). Pure module, no imports: runs in the browser, on the server and in tests.
//
// IMPORTANT: the zone rate matrix, handling fees, slab, peak and slot adjustments below are the
// blueprint's own figures. The blueprint itself marks rates beyond the known lanes as
// placeholders. This is an ESTIMATE shown to the customer; the final amount is the quote your
// team issues from Route Pricing. Cities that are not in a rate zone ("Others") get no estimate.

export type Zone = 'MUM' | 'GUJ' | 'NOR' | 'SOU' | 'GOA' | 'EAS'
export type Mode = 'air' | 'rail' | 'sea' | 'road'

const Z: Zone[] = ['MUM', 'GUJ', 'NOR', 'SOU', 'GOA', 'EAS']
const RATE: Record<Zone, number[]> = {
  GUJ: [2500, 2500, 4900, 4500, 5250, 6500],
  MUM: [2500, 2500, 4500, 3900, 3675, 6500],
  NOR: [4500, 4900, 2500, 5500, 5250, 6000],
  SOU: [3900, 4500, 5500, 2750, 4200, 6500],
  GOA: [3675, 5250, 5250, 4200, 2500, 7000],
  EAS: [6500, 6500, 6000, 6500, 7000, 2750],
}
const MODE_FEE: Record<Mode, number> = { air: 250, rail: 150, sea: 400, road: 0 }
export const MIN_PIECES = 2
export const OVERSIZE_FEE = 900
const SAME_ZONE_RATE = 1500

/** Cities exactly as listed on /book. `id` is the live CityId stored on the booking. */
export const FLOW_CITIES: { label: string; id: string; zone: Zone }[] = [
  { label: 'Ahmedabad', id: 'ahmedabad', zone: 'GUJ' }, { label: 'Anand', id: 'anand', zone: 'GUJ' },
  { label: 'Bangalore', id: 'bangalore', zone: 'SOU' }, { label: 'Chennai', id: 'chennai', zone: 'SOU' },
  { label: 'Dahod', id: 'dahod', zone: 'GUJ' }, { label: 'Goa', id: 'goa', zone: 'GOA' },
  { label: 'Guwahati', id: 'guwahati', zone: 'EAS' }, { label: 'Jaipur', id: 'jaipur', zone: 'NOR' },
  { label: 'Mumbai', id: 'mumbai', zone: 'MUM' }, { label: 'Nadiad', id: 'nadiad', zone: 'GUJ' },
  { label: 'Navi Mumbai', id: 'navi-mumbai', zone: 'MUM' }, { label: 'Pune', id: 'pune', zone: 'MUM' },
  { label: 'Surat', id: 'surat', zone: 'GUJ' }, { label: 'Udaipur', id: 'udaipur', zone: 'NOR' },
  { label: 'Vadodara', id: 'baroda', zone: 'GUJ' },
]

/** Airports: the three on the live site are available; the rest are planned (shown, not selectable). */
export const FLOW_AIRPORTS: { code: string; label: string; id: string | null; zone: Zone; available: boolean }[] = [
  { code: 'BOM', label: 'Mumbai Airport T2', id: 'mumbai-airport-t2', zone: 'MUM', available: true },
  { code: 'DEL', label: 'Delhi Airport', id: 'delhi-airport-t3', zone: 'NOR', available: true },
  { code: 'HYD', label: 'Hyderabad Airport', id: 'hyderabad-airport', zone: 'SOU', available: true },
  { code: 'BOM1', label: 'Mumbai Airport T1', id: null, zone: 'MUM', available: false },
  { code: 'AMD', label: 'Ahmedabad', id: null, zone: 'GUJ', available: false },
  { code: 'BDQ', label: 'Vadodara', id: null, zone: 'GUJ', available: false },
  { code: 'STV', label: 'Surat', id: null, zone: 'GUJ', available: false },
  { code: 'JAI', label: 'Jaipur', id: null, zone: 'NOR', available: false },
  { code: 'BLR', label: 'Bengaluru', id: null, zone: 'SOU', available: false },
  { code: 'MAA', label: 'Chennai', id: null, zone: 'SOU', available: false },
  { code: 'GOI', label: 'Goa Dabolim', id: null, zone: 'GOA', available: false },
  { code: 'GOX', label: 'Goa Mopa', id: null, zone: 'GOA', available: false },
  { code: 'GAU', label: 'Guwahati', id: null, zone: 'EAS', available: false },
]

/** Pickup windows from the blueprint: [from, to, price adjustment per billed piece]. */
export const FLOW_SLOTS: { from: string; to: string; adj: number }[] = [
  { from: '06:00', to: '08:00', adj: 0 }, { from: '08:00', to: '10:00', adj: -150 },
  { from: '10:00', to: '12:00', adj: 0 }, { from: '12:00', to: '14:00', adj: 0 },
  { from: '14:00', to: '16:00', adj: 0 }, { from: '16:00', to: '18:00', adj: 0 },
  { from: '18:00', to: '20:00', adj: 250 },
]
export const slotLabel = (s: { from: string; to: string }) => `${s.from} – ${s.to}`

/** Blueprint per-mode copy. */
export const MODE_COPY: Record<Mode, {
  refLabel: string; refPlaceholder: string; whenLede: string; check: string; checkBody: string; handling: string
}> = {
  air:  { refLabel: 'Flight number', refPlaceholder: '6E 5219', whenLede: 'Your flight sets the cut off. We work backwards from it.', check: 'Flight check',
          checkBody: 'enter the number and we confirm the schedule and set your pickup window. Delays re-plan automatically.', handling: 'Airport handling' },
  rail: { refLabel: 'Train number', refPlaceholder: '20901 Vande Bharat', whenLede: 'Your train sets the cut off. Bags reach the station 90 minutes before.', check: 'Train check',
          checkBody: 'we confirm the running status and set the station hand off.', handling: 'Station handling' },
  sea:  { refLabel: 'Cruise and sailing', refPlaceholder: 'Cordelia · 2 Nov', whenLede: 'Your sailing sets the cut off. Bags reach the terminal 3 hours before.', check: 'Sailing check',
          checkBody: 'we confirm the port schedule and tag bags with your cabin number.', handling: 'Terminal handling' },
  road: { refLabel: '', refPlaceholder: '', whenLede: 'Pick the day. We pick the window with you.', check: 'Route',
          checkBody: 'line haul departs daily at 14:00 from the Gujarat hub.', handling: 'Handling' },
}

export function zoneForCityId(id: string | null | undefined): Zone | null {
  if (!id) return null
  return FLOW_CITIES.find(c => c.id === id)?.zone ?? FLOW_AIRPORTS.find(a => a.id === id)?.zone ?? null
}

export interface FlowQuoteInput {
  mode: Mode
  uc: string
  zoneFrom: Zone | null
  zoneTo: Zone | null
  std: number
  odd: number
  slotFrom: string | null     // "08:00"
  date: string                // YYYY-MM-DD
}
export interface FlowQuote {
  actual: number; billed: number; rate: number
  base: number; oversize: number; handling: number; slab: number; peak: number
  subtotal: number; gst: number; total: number; perPiece: number
}

/** null when either end has no rate zone (e.g. "Others"): the team confirms the price. */
export function flowQuote(i: FlowQuoteInput): FlowQuote | null {
  if (!i.zoneFrom || !i.zoneTo) return null
  const actual = Math.max(0, i.std) + Math.max(0, i.odd)
  const billed = Math.max(actual, MIN_PIECES)
  const rate = i.zoneFrom === i.zoneTo ? SAME_ZONE_RATE : RATE[i.zoneFrom][Z.indexOf(i.zoneTo)]
  const base = rate * billed
  const oversize = Math.max(0, i.odd) * OVERSIZE_FEE
  const handling = MODE_FEE[i.mode] * billed
  const slabPct = i.uc === 'wed' ? 0.18 : billed >= 10 ? 0.15 : billed >= 5 ? 0.08 : 0
  const slab = -base * slabPct
  const m = i.date ? Number(i.date.slice(5, 7)) : 10
  const row = FLOW_SLOTS.find(s => s.from === i.slotFrom) ?? FLOW_SLOTS[1]
  const peak = ((m >= 10 || m <= 2) ? base * 0.2 : 0) + row.adj * billed
  const subtotal = base + oversize + handling + slab + peak
  const gst = subtotal * 0.18
  const total = subtotal + gst
  return { actual, billed, rate, base, oversize, handling, slab, peak, subtotal, gst, total, perPiece: total / billed }
}
