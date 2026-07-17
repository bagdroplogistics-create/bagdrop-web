// ─────────────────────────────────────────────────────────────
// BAGDROP MOBILE — Application Constants
// Ported verbatim from the website's lib/constants.ts so the app stays
// in perfect sync with what /api/bookings expects. If you add a service,
// city, route, bag type or add-on on the website, copy the same change
// here (and vice versa) — the IDs must match exactly on both sides.
// ─────────────────────────────────────────────────────────────

export const SITE = {
  name: 'Bagdrop',
  url: 'https://bagdrop.co',
  tagline: 'Travel Light. Arrive Stress-Free.',
  description:
    'Premium luggage delivery for airports, weddings, relocations, and intercity travel across India.',
  whatsapp: '916357115711',
  email: 'info@bagdrop.co',
  supportEmail: 'info@bagdrop.co',
  phone: '+91 63571 15711',
} as const

// ─── Service Types ──────────────────────────────────────────
export const SERVICE_TYPES = [
  {
    id: 'airport-delivery',
    label: 'Airport Delivery',
    description: 'Pickup from airport, delivered to your door.',
    icon: 'airplane' as const,
  },
  {
    id: 'excess-baggage',
    label: 'Excess Baggage',
    description: 'Ship it cheaper than the airline charges.',
    icon: 'briefcase' as const,
  },
  {
    id: 'door-to-door',
    label: 'Door-to-Door',
    description: 'From your home to any destination.',
    icon: 'home' as const,
  },
  {
    id: 'destination-weddings',
    label: 'Destination Weddings',
    description: 'White-glove handling for your big day.',
    icon: 'heart' as const,
  },
  {
    id: 'corporate-travel',
    label: 'Corporate Travel',
    description: 'Volume rates and dedicated support.',
    icon: 'business' as const,
  },
  {
    id: 'student-relocation',
    label: 'Student Relocation',
    description: 'Skip the airline fees when you move.',
    icon: 'school' as const,
  },
] as const

// ─── Bag Types ──────────────────────────────────────────────
export type BagTypeId = 'travel' | 'wedding'

export const BAG_TYPES: Record<
  BagTypeId,
  {
    id: BagTypeId
    label: string
    description: string
    dimensions: string
    maxWeight: string
    basePrice: number
  }
> = {
  travel: {
    id: 'travel',
    label: 'Travel Bag',
    description: 'Suitcases, trolleys, backpacks',
    dimensions: 'All standard sizes',
    maxWeight: 'Up to 32 kg',
    basePrice: 699,
  },
  wedding: {
    id: 'wedding',
    label: 'Wedding Luggage',
    description: 'Garment bags, wedding attire & décor',
    dimensions: 'All sizes',
    maxWeight: 'Up to 20 kg per piece',
    basePrice: 1499,
  },
}

// ─── Coverage — Cities & Airport Terminals ──────────────────
export const COVERAGE_CITIES = [
  { id: 'ahmedabad', label: 'Ahmedabad', code: 'AMD' },
  { id: 'baroda', label: 'Baroda', code: 'BDQ' },
  { id: 'anand', label: 'Anand', code: null },
  { id: 'dahod', label: 'Dahod', code: null },
  { id: 'nadiad', label: 'Nadiad', code: null },
  { id: 'mumbai', label: 'Mumbai', code: 'BOM' },
  { id: 'mumbai-airport-t2', label: 'Mumbai Airport (T2)', code: 'BOM' },
  { id: 'delhi', label: 'Delhi', code: 'DEL' },
  { id: 'delhi-airport-t3', label: 'Delhi Airport (T3)', code: 'DEL' },
  { id: 'jaipur', label: 'Jaipur', code: 'JAI' },
  { id: 'udaipur', label: 'Udaipur', code: 'UDR' },
  { id: 'goa', label: 'Goa', code: 'GOI' },
  { id: 'bangalore', label: 'Bangalore', code: 'BLR' },
  { id: 'hyderabad-airport', label: 'Hyderabad Airport', code: 'HYD' },
  { id: 'hyderabad', label: 'Hyderabad', code: 'HYD' },
  { id: 'gujarat', label: 'Gujarat', code: null },
  { id: 'rajasthan', label: 'Rajasthan', code: null },
] as const

export type CityId = (typeof COVERAGE_CITIES)[number]['id']

// ─── Booking Locations (pickup / drop dropdowns) ────────────
export const BOOKING_LOCATIONS: { id: CityId; label: string }[] = [
  { id: 'ahmedabad', label: 'Ahmedabad' },
  { id: 'anand', label: 'Anand' },
  { id: 'bangalore', label: 'Bangalore' },
  { id: 'dahod', label: 'Dahod' },
  { id: 'delhi-airport-t3', label: 'Delhi Airport' },
  { id: 'goa', label: 'Goa' },
  { id: 'hyderabad-airport', label: 'Hyderabad Airport' },
  { id: 'jaipur', label: 'Jaipur' },
  { id: 'mumbai', label: 'Mumbai' },
  { id: 'mumbai-airport-t2', label: 'Mumbai Airport T2' },
  { id: 'nadiad', label: 'Nadiad' },
  { id: 'rajasthan', label: 'Rajasthan' },
  { id: 'udaipur', label: 'Udaipur' },
  { id: 'baroda', label: 'Vadodara' },
]

// ─── Valid Routes — only these from→to pairs are bookable ───
export const VALID_ROUTES: ReadonlyArray<{ from: CityId; to: CityId }> = [
  { from: 'baroda', to: 'mumbai-airport-t2' },
  { from: 'baroda', to: 'mumbai' },
  { from: 'baroda', to: 'delhi-airport-t3' },
  { from: 'baroda', to: 'udaipur' },
  { from: 'udaipur', to: 'baroda' },
  { from: 'ahmedabad', to: 'bangalore' },
  { from: 'ahmedabad', to: 'delhi' },
  { from: 'ahmedabad', to: 'mumbai' },
  { from: 'ahmedabad', to: 'mumbai-airport-t2' },
  { from: 'anand', to: 'mumbai' },
  { from: 'anand', to: 'mumbai-airport-t2' },
  { from: 'dahod', to: 'hyderabad-airport' },
  { from: 'delhi', to: 'udaipur' },
  { from: 'delhi-airport-t3', to: 'baroda' },
  { from: 'goa', to: 'mumbai' },
  { from: 'mumbai', to: 'udaipur' },
  { from: 'mumbai', to: 'jaipur' },
  { from: 'udaipur', to: 'mumbai' },
  { from: 'udaipur', to: 'delhi-airport-t3' },
  { from: 'nadiad', to: 'mumbai-airport-t2' },
] as const

// ─── Time Slots ──────────────────────────────────────────────
export const TIME_SLOTS = [
  { id: '06:00 AM – 01:00 PM', label: 'Morning', range: '6:00 AM – 1:00 PM' },
  { id: '01:00 PM – 05:00 PM', label: 'Afternoon', range: '1:00 PM – 5:00 PM' },
  { id: '05:00 PM – 08:00 PM', label: 'Evening', range: '5:00 PM – 8:00 PM' },
  { id: '08:00 PM – 06:00 AM', label: 'Night', range: '8:00 PM – 6:00 AM' },
] as const

// ─── Add-on Services ─────────────────────────────────────────
export const ADDON_SERVICES = [
  {
    id: 'insurance' as const,
    label: 'Insurance Upgrade',
    description: 'Extended coverage up to ₹50,000',
    price: 299,
  },
] as const
