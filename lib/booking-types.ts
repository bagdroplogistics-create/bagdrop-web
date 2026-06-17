// ─────────────────────────────────────────────────────────────
// BAGDROP — Booking Engine Types
// ─────────────────────────────────────────────────────────────

import type { BagTypeId, CityId } from './constants'

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
  date:            string   // 'YYYY-MM-DD'
  timeSlotId:      TimeSlotId | null
  pickupAddress:   string
  dropAddress:     string
  flightNumber:    string
  flightDateTime:  string   // ISO for airport-delivery

  // Add-ons (collected in step 3)
  addonIds:    AddonId[]

  // Step 4 — Customer details
  name:        string
  email:       string
  phone:       string
  notes:       string
}

export const INITIAL_BOOKING_STATE: BookingState = {
  serviceId:       null,
  fromCity:        null,
  toCity:          null,
  bags:            [],
  date:            '',
  timeSlotId:      null,
  pickupAddress:   '',
  dropAddress:     '',
  flightNumber:    '',
  flightDateTime:  '',
  addonIds:        [],
  name:            '',
  email:           '',
  phone:           '',
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
  return s.bags.length > 0 && s.bags.some(b => b.quantity > 0)
}

export function isStep3Valid(s: BookingState): boolean {
  const base = !!(s.date && s.timeSlotId && s.pickupAddress && s.dropAddress)
  if (s.serviceId === 'airport-delivery') {
    return base && !!(s.flightNumber)
  }
  return base
}

export function isStep4Valid(s: BookingState): boolean {
  // Phone is verified via OTP at confirmation — only name + email required here
  return !!(
    s.name.trim() &&
    s.email.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)
  )
}
