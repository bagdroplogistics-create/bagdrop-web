// ─────────────────────────────────────────────────────────────
// BAGDROP — Application Constants
// Single source of truth for static config used across the app.
// ─────────────────────────────────────────────────────────────

export const SITE = {
  name: 'Bagdrop',
  url: 'https://www.bagdrop.co',
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
    href: '/airport-delivery',
    icon: 'plane-landing',
  },
  {
    id: 'excess-baggage',
    label: 'Excess Baggage',
    description: 'Ship it cheaper than the airline charges.',
    href: '/excess-baggage',
    icon: 'package',
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
    id: 'corporate-travel',
    label: 'Corporate Travel',
    description: 'Volume rates and dedicated support.',
    href: '/corporate-travel',
    icon: 'briefcase',
  },
  {
    id: 'student-relocation',
    label: 'Student Relocation',
    description: 'Skip the airline fees when you move.',
    href: '/student-relocation',
    icon: 'graduation-cap',
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
  { id: 'baroda',           label: 'Vadodara',              code: 'BDQ', airport: null },
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

  // ── Tamil Nadu ───────────────────────────────────────────
  { id: 'chennai',          label: 'Chennai',               code: 'MAA', airport: 'Chennai International' },

  // ── Assam ────────────────────────────────────────────────
  { id: 'guwahati',         label: 'Guwahati',              code: 'GAU', airport: 'Lokpriya Gopinath Bordoloi International' },

  // ── Gujarat (Surat) ──────────────────────────────────────
  { id: 'surat',            label: 'Surat',                 code: 'STV', airport: 'Surat International' },

  // ── Maharashtra (Navi Mumbai / Pune) ─────────────────────
  { id: 'navi-mumbai',      label: 'Navi Mumbai',           code: 'NMI', airport: 'Navi Mumbai International' },
  { id: 'pune',             label: 'Pune',                  code: 'PNQ', airport: 'Pune Airport' },

  // ── Regional / simplified booking labels ─────────────────
  { id: 'gujarat',          label: 'Gujarat',               code: null,  airport: null },
] as const

// Derive CityId from the cities list so it stays in sync automatically.
// booking-types.ts imports this instead of defining its own union.
export type CityId = (typeof COVERAGE_CITIES)[number]['id']

// ─── Booking Locations ───────────────────────────────────────
// Specific cities shown in the pickup / drop dropdowns.
// Both dropdowns use the same list.
export const BOOKING_LOCATIONS = [
  { id: 'ahmedabad'         as const, label: 'Ahmedabad' },
  { id: 'anand'             as const, label: 'Anand' },
  { id: 'bangalore'         as const, label: 'Bangalore' },
  { id: 'chennai'           as const, label: 'Chennai' },
  { id: 'dahod'             as const, label: 'Dahod' },
  { id: 'delhi-airport-t3'  as const, label: 'Delhi Airport' },
  { id: 'goa'               as const, label: 'Goa' },
  { id: 'guwahati'          as const, label: 'Guwahati' },
  { id: 'hyderabad-airport' as const, label: 'Hyderabad Airport' },
  { id: 'jaipur'            as const, label: 'Jaipur' },
  { id: 'mumbai'            as const, label: 'Mumbai' },
  { id: 'mumbai-airport-t2' as const, label: 'Mumbai Airport T2' },
  { id: 'nadiad'            as const, label: 'Nadiad' },
  { id: 'navi-mumbai'       as const, label: 'Navi Mumbai' },
  { id: 'pune'              as const, label: 'Pune' },
  { id: 'surat'             as const, label: 'Surat' },
  { id: 'udaipur'           as const, label: 'Udaipur' },
  { id: 'baroda'            as const, label: 'Vadodara' },
]

// ─── Valid Routes ────────────────────────────────────────────
// Only these from→to pairs are bookable.
// To add a new route: add one entry here (and ensure both cities
// exist in COVERAGE_CITIES above).
export const VALID_ROUTES: ReadonlyArray<{ from: CityId; to: CityId }> = [
  // Vadodara routes (internal id stays 'baroda' — see lib/city-normalize.ts)
  { from: 'baroda',           to: 'mumbai-airport-t2' },
  { from: 'baroda',           to: 'mumbai' },
  { from: 'baroda',           to: 'delhi-airport-t3' },
  { from: 'baroda',           to: 'udaipur' },
  { from: 'udaipur',          to: 'baroda' },

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

  // Udaipur routes (return legs)
  { from: 'udaipur',          to: 'mumbai' },
  { from: 'udaipur',          to: 'delhi-airport-t3' },

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

// ─── Customer Title ──────────────────────────────────────────
// Used on every form that captures a customer's name (website booking,
// admin lead/quote/booking forms, Skybird partner dashboard, both
// mobile apps). Stored alongside customer_name on bookings/leads/quotes
// (there is no single normalized `customers` table in this schema).
// Mirrored verbatim in admin-app/src/shared/constants.ts and
// mobile-app/src/shared/constants.ts — keep all three in sync.
export const TITLE_OPTIONS = ['Mr.', 'Mrs.', 'Ms.', 'M/S'] as const

export type TitleId = (typeof TITLE_OPTIONS)[number]

export const DEFAULT_TITLE: TitleId = 'Mr.'

// Same curated first-name list as supabase/migrations/
// 20260801_customer_title_gender_backfill.sql's `female_first_names` temp
// table, kept in sync by hand — that migration was a one-time SQL pass to
// correct legacy rows already defaulted to 'Mr.'; this is the same
// heuristic applied live, at display time, for any lead/booking that never
// collected an explicit Title (e.g. the Y2K wedding form, the marketing
// contact form) so it's not misgendering the customer as "Mr." by default
// on day one. It's still just a guess — always overridable via the
// Title dropdown on the Lead/Quote/Booking edit forms.
const FEMALE_FIRST_NAMES = new Set([
  'priya','neha','pooja','anjali','kavita','sunita','meera','sneha',
  'divya','ritu','anita','nisha','swati','deepa','rekha','usha',
  'geeta','seema','shweta','vandana','aarti','arti','aparna','bhavna',
  'bhavana','chitra','darshana','falguni','hetal','ila','jyoti','kajal',
  'lata','madhuri','nalini','payal','radha','sangeeta','trupti','urvashi',
  'vaishali','yamini','mansi','nikita','pallavi','ragini','sonal','trisha',
  'varsha','aisha','fatima','sana','ayesha','zara','amita','rupali',
  'purnima','poornima','kiran','preeti','priti','shilpa','sonia','sunanda',
  'sudha','vidya','yogita','reema','rima','simran','sarika','sarita',
  'shobha','shobhna','smita','vaidehi','vibha','vinita','roshni','ruchi',
  'ruchika','rutuja','sakshi','samiksha','sejal','shefali','sheetal','shital',
  'shraddha','sindhu','sonam','sujata','surbhi','tanvi','tanya','tejal',
  'urmila','vidhi','zeenat','alka','anagha','anisha','archana',
  'asha','bina','binita','bhumika','charu','daksha','damini','dimple',
  'dipika','deepika','drashti','foram','gauri','gayatri','hansa','harshita',
  'heena','hina','indu','ishita','jagruti','jaya','jigisha','juhi',
  'kalpana','kamini','kanchan','karishma','karuna','khushbu','khushi','komal',
  'krupa','kruti','kusum','leena','lina','mala','mamta',
  'manisha','manju','meena','minal','mital','mitali','monika','mrunal',
  'mrunali','namrata','nandini','nayana','neelam','neeta','niti','nupur',
  'padma','pankti','parul','pinky','poonam','pratiksha','pratima',
  'priyal','priyanka','rachana','rachna','rachita','rajni','rashi',
  'rashmi','renu','reshma','richa','rina','riddhi','rohini','roopa',
  'rupa','sadhna','sadhana','sameera','sanjana','sarla','savita','shalini',
  'shama','shanta','sharda','sharmila','shilpi','shivani',
  'shreya','shruti','shubhangi','shubhi','sonali','sulekha',
  'supriya','sushma','tanuja','tara','tasneem','tina',
  'tripti','twinkle','uma','urvi','vaishnavi',
  'vasudha','veena','vineeta','yashvi','yesha','yuvika',
  'zainab','aditi','akansha','akanksha','alisha','alpa','amisha','ami',
  'amrita','anushka','apeksha','apoorva','avni','bansi','bela','bhairavi',
  'bindi','chandni','charmi','chhaya','devika','disha','diti','drishti',
  'ekta','gargi','garima','gunjan','harleen','harsha','hemal','hemangi',
  'hetvi','ishani','janki','janvi','jhanvi','jinal','kajol','kanika',
  'kavya','keerti','khyati','kimaya','krisha','krishna','kriti','kritika',
  'kshama','lavanya','maitri','malti','maya','megha','mehak',
  'milan','mili','mona','naina','naisha','nandita','naomi','nayantara',
  'nazia','neelima','neerja','nehal','nidhi','nikki','nimisha','niral',
  'nishtha','nita','palak','pari','parineeta','parisha',
  'pragya','prakriti','prapti','prisha','purvi',
  'rajvi','rakhi','rani','rasika','raveena','reet','reeva','renuka',
  'riya','roshan','ruhi','sagarika','saloni','samta',
  'sanya','sapna','sarah','shaina','shivangi','shrishti',
  'siddhi','simar','snigdha','sonakshi','sonu','sristi','suhani',
  'sushila','svara','taniya','tanisha','tanushree','tejaswini','trishala',
  'urja','urshila','vaani','vandita','vanshika','varda',
  'vidisha','vrinda','yachna','yashika','zoya',
  // Also cover the wedding-guest scenario that prompted this fix.
  'monali','yashna',
])

// Same business/organization exclusion as the SQL migration — a company
// name shouldn't get a personal title guessed onto it either way.
const ORG_NAME_PATTERN = /\b(PVT|PRIVATE|LTD|LIMITED|LLP|LLC|INC\.?|CORP|CORPORATION|ENTERPRISE|ENTERPRISES|INDUSTR(Y|IES)|COMPANY|CO\.|GROUP|TRADERS?|EXPORTS?|IMPORTS?|SOLUTIONS?|SERVICES?|LOGISTICS|ASSOCIATES|PARTNERS|FOODS?|HOMEMADE|HOSPITAL|SCHOOL|COLLEGE|TRUST|FOUNDATION|SOCIETY|BANK|HOTEL|RESORT|TRAVELS?|TOURS?|CARGO|FREIGHT|SHIPPING|BUILDERS?|CONSTRUCTIONS?|REALTY|PROPERTIES|CONSULTANC(Y|IES)|TECHNOLOG(Y|IES)|SYSTEMS?|STUDIO|WORKS|MART|STORES?)\b/i

/**
 * Best-effort title guess from a first name alone, for the moment a
 * lead/booking is created and no Title was explicitly collected (no
 * dropdown on that form). Returns null — not a default — when it can't
 * tell, so callers decide whether "no guess" means omitting the title
 * entirely or falling back to DEFAULT_TITLE.
 */
function guessTitleFromName(name: string): TitleId | null {
  if (ORG_NAME_PATTERN.test(name)) return null
  const firstName = name.trim().split(/\s+/)[0]?.toLowerCase()
  if (firstName && FEMALE_FIRST_NAMES.has(firstName)) return 'Ms.'
  return null
}

/**
 * Formats a customer's title + name for display, e.g. "Mr. Rahul Patel".
 * Use this everywhere a customer's name is shown — dashboards, tables,
 * PDFs (Quote/Invoice/LR), email/WhatsApp/SMS templates, search results,
 * activity logs, reports, and both mobile apps.
 *
 * Falls back gracefully if title is missing/invalid (older records,
 * partial data, or a form — like the Y2K wedding page — that never asks
 * for one) so display code never has to null-check separately. Before
 * falling all the way back to DEFAULT_TITLE ('Mr.'), it tries the same
 * name-based heuristic as the one-time SQL backfill
 * (20260801_customer_title_gender_backfill.sql), so a customer named e.g.
 * "Monali" or "Neha" isn't shown as "Mr." just because no title was ever
 * collected for that particular form.
 */
export function formatCustomerName(title: string | null | undefined, name: string | null | undefined): string {
  const safeName = (name ?? '').trim()
  if (!safeName) return ''
  const safeTitle = TITLE_OPTIONS.includes(title as TitleId) ? title : (guessTitleFromName(safeName) ?? DEFAULT_TITLE)
  return `${safeTitle} ${safeName}`
}

// ─── Payment By: Individual / Business or Company ────────────
// Simplified per founder feedback — an earlier, much larger Zoho-Books-
// style Business Customer form (GST Treatment, Place of Supply, Currency,
// Accounts Receivable, Department, social profiles, etc.) was cut down to
// only what BagDrop's operations actually need: who the payment is coming
// from, their address, GST number, and payment terms. See
// supabase/migrations/20260807_business_customer_fields.sql for the
// `leads`/`bookings` columns these map to. None of this affects quotation
// generation, pricing, or the existing Individual customer fields.
export const CUSTOMER_TYPES = ['individual', 'business'] as const
export type CustomerType = (typeof CUSTOMER_TYPES)[number]
export const DEFAULT_CUSTOMER_TYPE: CustomerType = 'individual'

export const PAYMENT_TERMS_OPTIONS = [
  'Due on Receipt', 'Net 7 Days', 'Net 15 Days', 'Net 30 Days', 'Net 45 Days', 'Net 60 Days', 'Custom',
] as const
export const DEFAULT_PAYMENT_TERMS = 'Due on Receipt'
