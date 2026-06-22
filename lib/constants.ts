// ─────────────────────────────────────────────────────────────
// BAGDROP — Application Constants
// Single source of truth for static config used across the app.
// ─────────────────────────────────────────────────────────────

export const SITE = {
  name: 'Bagdrop',
  url: 'https://bagdrop.co',
  tagline: 'Travel Light. Arrive Stress-Free.',
  description:
    'Premium luggage delivery for airports, weddings, relocations, and intercity travel across India.',
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '919000000000',
  email: 'hello@bagdrop.co',
  supportEmail: 'support@bagdrop.co',
  phone: '+91 90000 00000', // update with real number
} as const

// ─── Service Types ──────────────────────────────────────────
export const SERVICE_TYPES = [
  {
    id: 'airport-delivery',
    label: 'Airport Delivery',
    description: 'Pickup from airport, delivered to your door.',
    href: '/airport-delivery',
    icon: 'plane-landing',
  },
  {
    id: 'door-to-door',
    label: 'Door-to-Door',
    description: 'From your home to any destination.',
    href: '/door-to-door',
    icon: 'home',
  },
  {
    id: 'destination-weddings',
    label: 'Destination Weddings',
    description: 'White-glove handling for your big day.',
    href: '/destination-weddings',
    icon: 'heart',
  },
  {
    id: 'student-relocation',
    label: 'Student Relocation',
    description: 'Skip the airline fees when you move.',
    href: '/student-relocation',
    icon: 'graduation-cap',
  },
  {
    id: 'corporate-travel',
    label: 'Corporate Travel',
    description: 'Volume rates and dedicated support.',
    href: '/corporate-travel',
    icon: 'briefcase',
  },
  {
    id: 'excess-baggage',
    label: 'Excess Baggage',
    description: 'Ship it cheaper than the airline charges.',
    href: '/excess-baggage',
    icon: 'package',
  },
] as const

// ─── Bag Types ──────────────────────────────────────────────
export type BagTypeId =
  | 'travel'
  | 'wedding'
  | 'cabin'     // legacy — kept for existing booking data
  | 'medium'    // legacy
  | 'large'     // legacy
  | 'oversized' // legacy
  | 'sports'    // legacy

export const BAG_TYPES: Record<
  BagTypeId,
  {
    id: BagTypeId
    label: string
    description: string
    dimensions: string
    maxWeight: string
    basePrice: number
    svgPath: string
  }
> = {
  travel: {
    id: 'travel',
    label: 'Travel Bag',
    description: 'Suitcases, trolleys, backpacks',
    dimensions: 'All standard sizes',
    maxWeight: 'Up to 32 kg',
    basePrice: 699,
    svgPath: '/icons/bags/medium.svg',
  },
  wedding: {
    id: 'wedding',
    label: 'Wedding Luggage',
    description: 'Garment bags, wedding attire & décor',
    dimensions: 'All sizes',
    maxWeight: 'Up to 20 kg per piece',
    basePrice: 1499,
    svgPath: '/icons/bags/wedding.svg',
  },
  // ── Legacy types — not shown in booking form ────────────────
  cabin: {
    id: 'cabin',
    label: 'Cabin Bag',
    description: 'Small carry-on size',
    dimensions: 'Up to 55 × 40 × 20 cm',
    maxWeight: 'Up to 8 kg',
    basePrice: 499,
    svgPath: '/icons/bags/cabin.svg',
  },
  medium: {
    id: 'medium',
    label: 'Medium Suitcase',
    description: 'Standard checked bag',
    dimensions: 'Up to 65 × 45 × 25 cm',
    maxWeight: 'Up to 23 kg',
    basePrice: 699,
    svgPath: '/icons/bags/medium.svg',
  },
  large: {
    id: 'large',
    label: 'Large Suitcase',
    description: 'Large checked luggage',
    dimensions: 'Up to 75 × 50 × 30 cm',
    maxWeight: 'Up to 32 kg',
    basePrice: 899,
    svgPath: '/icons/bags/large.svg',
  },
  oversized: {
    id: 'oversized',
    label: 'Oversized Luggage',
    description: 'Extra-large items',
    dimensions: 'Over 75 cm any side',
    maxWeight: 'Up to 50 kg',
    basePrice: 1299,
    svgPath: '/icons/bags/oversized.svg',
  },
  sports: {
    id: 'sports',
    label: 'Sports Equipment',
    description: 'Duffel bags, kit bags',
    dimensions: 'Flexible sizing',
    maxWeight: 'Up to 30 kg',
    basePrice: 999,
    svgPath: '/icons/bags/sports.svg',
  },
}

// ─── Coverage — Cities & Airport Terminals ──────────────────
// Add new entries here whenever a route is added to VALID_ROUTES.
export const COVERAGE_CITIES = [
  // ── Gujarat ─────────────────────────────────────────────
  { id: 'ahmedabad',        label: 'Ahmedabad',             code: 'AMD', airport: 'Sardar Vallabhbhai Patel International' },
  { id: 'baroda',           label: 'Baroda',                code: 'BDQ', airport: null },
  { id: 'anand',            label: 'Anand',                 code: null,  airport: null },
  { id: 'dahod',            label: 'Dahod',                 code: null,  airport: null },
  { id: 'nadiad',           label: 'Nadiad',                code: null,  airport: null },

  // ── Maharashtra ──────────────────────────────────────────
  { id: 'mumbai',           label: 'Mumbai',                code: 'BOM', airport: 'Chhatrapati Shivaji Maharaj International' },
  { id: 'mumbai-airport-t2',label: 'Mumbai Airport (T2)',   code: 'BOM', airport: 'Chhatrapati Shivaji Maharaj T2' },

  // ── Delhi / NCR ──────────────────────────────────────────
  { id: 'delhi',            label: 'Delhi',                 code: 'DEL', airport: 'Indira Gandhi International' },
  { id: 'delhi-airport-t3', label: 'Delhi Airport (T3)',    code: 'DEL', airport: 'Indira Gandhi International T3' },

  // ── Rajasthan ────────────────────────────────────────────
  { id: 'jaipur',           label: 'Jaipur',                code: 'JAI', airport: 'Jaipur International' },
  { id: 'udaipur',          label: 'Udaipur',               code: 'UDR', airport: 'Maharana Pratap Airport' },

  // ── Goa ─────────────────────────────────────────────────
  { id: 'goa',              label: 'Goa',                   code: 'GOI', airport: 'Manohar International' },

  // ── Karnataka ────────────────────────────────────────────
  { id: 'bangalore',        label: 'Bangalore',             code: 'BLR', airport: 'Kempegowda International' },

  // ── Telangana ────────────────────────────────────────────
  { id: 'hyderabad-airport',label: 'Hyderabad Airport',     code: 'HYD', airport: 'Rajiv Gandhi International' },
  { id: 'hyderabad',        label: 'Hyderabad',             code: 'HYD', airport: 'Rajiv Gandhi International' },

  // ── Regional / simplified booking labels ─────────────────
  { id: 'gujarat',          label: 'Gujarat',               code: null,  airport: null },
  { id: 'rajasthan',        label: 'Rajasthan',             code: null,  airport: null },
] as const

// Derive CityId from the cities list so it stays in sync automatically.
// booking-types.ts imports this instead of defining its own union.
export type CityId = (typeof COVERAGE_CITIES)[number]['id']

// ─── Booking Locations ───────────────────────────────────────
// Specific cities shown in the pickup / drop dropdowns.
// Both dropdowns use the same list.
export const BOOKING_LOCATIONS = [
  { id: 'baroda'            as const, label: 'Vadodara' },
  { id: 'ahmedabad'         as const, label: 'Ahmedabad' },
  { id: 'mumbai'            as const, label: 'Mumbai' },
  { id: 'mumbai-airport-t2' as const, label: 'Mumbai Airport T2' },
  { id: 'anand'             as const, label: 'Anand' },
  { id: 'nadiad'            as const, label: 'Nadiad' },
  { id: 'dahod'             as const, label: 'Dahod' },
  { id: 'delhi-airport-t3'  as const, label: 'Delhi Airport' },
  { id: 'goa'               as const, label: 'Goa' },
  { id: 'bangalore'         as const, label: 'Bangalore' },
  { id: 'udaipur'           as const, label: 'Udaipur' },
  { id: 'jaipur'            as const, label: 'Jaipur' },
  { id: 'rajasthan'         as const, label: 'Rajasthan' },
  { id: 'hyderabad-airport' as const, label: 'Hyderabad Airport' },
]

// ─── Valid Routes ────────────────────────────────────────────
// Only these from→to pairs are bookable.
// To add a new route: add one entry here (and ensure both cities
// exist in COVERAGE_CITIES above).
export const VALID_ROUTES: ReadonlyArray<{ from: CityId; to: CityId }> = [
  // Baroda routes
  { from: 'baroda',           to: 'mumbai-airport-t2' },
  { from: 'baroda',           to: 'mumbai' },
  { from: 'baroda',           to: 'delhi-airport-t3' },

  // Ahmedabad routes
  { from: 'ahmedabad',        to: 'bangalore' },
  { from: 'ahmedabad',        to: 'delhi' },
  { from: 'ahmedabad',        to: 'mumbai' },
  { from: 'ahmedabad',        to: 'mumbai-airport-t2' },

  // Anand routes
  { from: 'anand',            to: 'mumbai' },
  { from: 'anand',            to: 'mumbai-airport-t2' },

  // Dahod routes
  { from: 'dahod',            to: 'hyderabad-airport' },

  // Delhi routes
  { from: 'delhi',            to: 'udaipur' },
  { from: 'delhi-airport-t3', to: 'baroda' },

  // Goa routes
  { from: 'goa',              to: 'mumbai' },

  // Mumbai routes
  { from: 'mumbai',           to: 'udaipur' },
  { from: 'mumbai',           to: 'jaipur' },

  // Nadiad routes
  { from: 'nadiad',           to: 'mumbai-airport-t2' },
] as const

// ─── Time Slots ──────────────────────────────────────────────
// Displayed in 12-hour AM/PM format. The `id` is stored in timeSlotId on BookingState.
export const TIME_SLOTS = [
  { id: '06:00 AM – 01:00 PM', label: 'Morning',   range: '6:00 AM – 1:00 PM' },
  { id: '01:00 PM – 05:00 PM', label: 'Afternoon', range: '1:00 PM – 5:00 PM' },
  { id: '05:00 PM – 08:00 PM', label: 'Evening',   range: '5:00 PM – 8:00 PM' },
  { id: '08:00 PM – 06:00 AM', label: 'Night',     range: '8:00 PM – 6:00 AM' },
] as const

// ─── Trust Metrics ───────────────────────────────────────────
export const TRUST_METRICS = [
  { value: '12,000+', label: 'Bags Delivered', suffix: '' },
  { value: '50',      label: 'Cities Covered', suffix: '+' },
  { value: '98.7',    label: 'On-Time Rate',   suffix: '%' },
  { value: '4.9',     label: 'Customer Rating', suffix: '/5' },
] as const

// ─── Navigation ──────────────────────────────────────────────
export const NAV_LINKS = [
  { label: 'Services', href: '/services', hasDropdown: true },
  { label: 'About',    href: '/about',    hasDropdown: false },
  { label: 'FAQ',      href: '/faq',      hasDropdown: false },
] as const

// ─── Add-on Services ─────────────────────────────────────────
export const ADDON_SERVICES = [
  {
    id: 'insurance',
    label: 'Insurance Upgrade',
    description: 'Extended coverage up to Rs. 50,000',
    price: 299,
    icon: 'shield-check',
  },
] as const
