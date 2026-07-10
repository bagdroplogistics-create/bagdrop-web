// ─────────────────────────────────────────────────────────────
// BAGDROP — Booking Engine Types
// ─────────────────────────────────────────────────────────────

import type { BagTypeId, CityId } from './constants'

// ── Country codes for phone field ─────────────────────────────
export const COUNTRY_CODES = [
  { code: '+91', flag: '🇮🇳', label: 'India (+91)',  maxDigits: 10, placeholder: '98765 43210' },
  { code: '+1',  flag: '🇺🇸', label: 'USA (+1)',     maxDigits: 10, placeholder: '800 555 0100' },
  { code: '+44', flag: '🇬🇧', label: 'UK (+44)',     maxDigits: 11, placeholder: '7911 123456'  },
  { code: '+1CA',flag: '🇨🇦', label: 'Canada (+1)',  maxDigits: 10, placeholder: '604 555 0100' },
] as const

// Returns the actual dial code (Canada and USA both use +1)
export function getDialCode(code: string): string {
  return code === '+1CA' ? '+1' : code
}

// Phone validation by country
export function validatePhone(digits: string, countryCode: string): boolean {
  switch (countryCode) {
    case '+91':  return /^[6-9]\d{9}$/.test(digits)   // 10 digits, starts 6-9
    case '+44':  return /^\d{10,11}$/.test(digits)     // 10–11 digits
    default:     return /^\d{10}$/.test(digits)        // +1 USA & CA: 10 digits
  }
}

export type { CityId }

export type ServiceId =
  | 'airport-delivery'
  | 'door-to-door'
  | 'destination-weddings'
  | 'student-relocation'
  | 'corporate-travel'
  | 'excess-baggage'

// Time slot display string — e.g. "09:00 AM – 12:00 PM"
export type TimeSlotId = string

export type AddonId = 'insurance'

// ─── Wedding event types ─────────────────────────────────────
export const WEDDING_EVENT_TYPES = [
  'Wedding',
  'Reception',
  'Engagement',
  'Destination Wedding',
  'Other',
] as const

export type WeddingEventType = (typeof WEDDING_EVENT_TYPES)[number]

// ─── A single bag selection ─────────────────────────────────
export interface BagItem {
  type: BagTypeId
  quantity: number
}

// ─── Step-by-step booking state ─────────────────────────────
export interface BookingState {
  // Step 1 — Route & Service
  serviceId:   ServiceId | null
  fromCity:    CityId | null
  toCity:      CityId | null

  // Step 2 — Bags
  bags:        BagItem[]

  // Step 3 — Schedule & Addresses
  date:            string   // 'YYYY-MM-DD' — pickup date
  deliveryDate:    string   // 'YYYY-MM-DD' — expected delivery date
  timeSlotId:      TimeSlotId | null
  pickupAddress:   string
  dropAddress:     string
  flightNumber:    string
  flightDateTime:  string   // ISO for airport-delivery

  // Step 2b — Wedding-specific fields (populated when wedding bag is selected)
  weddingGuests:              number | null
  weddingEventType:           WeddingEventType | ''
  weddingEventDate:           string   // 'YYYY-MM-DD'
  weddingPickupLocation:      string
  weddingDropLocation:        string
  weddingSpecialInstructions: string

  // Add-ons (collected in step 3)
  addonIds:    AddonId[]

  // Step 4 — Customer details
  name:        string
  email:       string
  phone:       string
  countryCode: string   // e.g. '+91', '+1', '+44', '+1CA'
  notes:       string
}

export const INITIAL_BOOKING_STATE: BookingState = {
  serviceId:       null,
  fromCity:        null,
  toCity:          null,
  bags:            [],
  date:            '',
  deliveryDate:    '',
  timeSlotId:      null,
  pickupAddress:   '',
  dropAddress:     '',
  flightNumber:    '',
  flightDateTime:  '',
  weddingGuests:              null,
  weddingEventType:           '',
  weddingEventDate:           '',
  weddingPickupLocation:      '',
  weddingDropLocation:        '',
  weddingSpecialInstructions: '',
  addonIds:        [],
  name:            '',
  email:           '',
  phone:           '',
  countryCode:     '+91',
  notes:           '',
}

// ─── Pricing breakdown returned by calculatePrice() ─────────
export interface PricingBreakdown {
  bagSubtotal:      number   // sum of per-bag prices before discounts
  multiDiscount:    number   // amount saved on multi-bag discount
  routeFee:         number   // distance-based route surcharge
  serviceAdjust:    number   // +/- from service multiplier
  addonsTotal:      number   // sum of selected add-on prices
  subtotal:         number   // before GST
  gst:              number   // 18% GST
  total:            number   // final amount in ₹ (integer paise ÷ 100)
  totalBags:        number   // total number of bags across all types
}

// ─── Razorpay order shape returned from /api/orders ─────────
export interface RazorpayOrder {
  id:       string
  amount:   number  // paise
  currency: string
  receipt:  string
}

// ─── Razorpay payment response from frontend ────────────────
export interface RazorpayPaymentSuccess {
  razorpay_payment_id: string
  razorpay_order_id:   string
  razorpay_signature:  string
}

// ─── Step validation helpers ─────────────────────────────────
export function isStep1Valid(s: BookingState): boolean {
  return !!(s.serviceId && s.fromCity && s.toCity)
}

export function isStep2Valid(s: BookingState): boolean {
  if (!s.bags.length || !s.bags.some(b => b.quantity > 0)) return false
  // If wedding bags are selected, require all mandatory wedding fields
  const hasWedding = s.bags.some(b => b.type === 'wedding' && b.quantity > 0)
  if (hasWedding) {
    return !!(
      s.weddingGuests && s.weddingGuests > 0 &&
      s.weddingEventType &&
      s.weddingEventDate &&
      s.weddingPickupLocation.trim() &&
      s.weddingDropLocation.trim()
    )
  }
  return true
}

export function isStep3Valid(s: BookingState): boolean {
  return !!(s.date && s.timeSlotId && s.pickupAddress && s.dropAddress)
}

export function isStep4Valid(s: BookingState): boolean {
  const digits  = s.phone.replace(/\D/g, '')
  const phoneOk = validatePhone(digits, s.countryCode ?? '+91')
  const emailOk = !s.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)
  return !!(s.name.trim() && phoneOk && emailOk)
}
