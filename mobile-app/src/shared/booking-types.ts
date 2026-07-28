// ─────────────────────────────────────────────────────────────
// BAGDROP MOBILE — Booking Engine Types
// Ported from the website's lib/booking-types.ts — keep in sync.
// ─────────────────────────────────────────────────────────────

import type { BagTypeId, CityId } from './constants'
import { isValidPhoneForCountry } from './phone-format'
import { DEFAULT_COUNTRY_ISO2 } from './phone-countries'

// International phone support: country is now tracked as an ISO 3166-1
// alpha-2 code (e.g. 'IN', 'US', 'CA', 'GB') instead of a raw dial-code
// string — see src/components/PhoneInput.tsx and src/shared/phone-countries.ts
// / phone-format.ts for the shared picker UI and per-country validation.
// Kept in sync with the website's lib/booking-types.ts.

export type { CityId }

export type ServiceId =
  | 'airport-delivery'
  | 'door-to-door'
  | 'destination-weddings'
  | 'student-relocation'
  | 'corporate-travel'
  | 'excess-baggage'

export type TimeSlotId = string
export type AddonId = 'insurance'

export const WEDDING_EVENT_TYPES = ['Wedding', 'Reception', 'Engagement', 'Destination Wedding', 'Other'] as const
export type WeddingEventType = (typeof WEDDING_EVENT_TYPES)[number]

export interface BagItem {
  type: BagTypeId
  quantity: number
}

export interface BookingState {
  serviceId: ServiceId | null
  fromCity: CityId | null
  toCity: CityId | null

  bags: BagItem[]

  date: string
  deliveryDate: string
  timeSlotId: TimeSlotId | null
  pickupAddress: string
  dropAddress: string
  flightNumber: string
  flightDateTime: string

  weddingGuests: number | null
  weddingEventType: WeddingEventType | ''
  weddingEventDate: string
  weddingPickupLocation: string
  weddingDropLocation: string
  weddingSpecialInstructions: string

  addonIds: AddonId[]

  name: string
  email: string
  phone: string        // national digits only, no dial code
  countryIso2: string   // e.g. 'IN', 'US', 'CA', 'GB'
  notes: string
}

export const INITIAL_BOOKING_STATE: BookingState = {
  serviceId: null,
  fromCity: null,
  toCity: null,
  bags: [],
  date: '',
  deliveryDate: '',
  timeSlotId: null,
  pickupAddress: '',
  dropAddress: '',
  flightNumber: '',
  flightDateTime: '',
  weddingGuests: null,
  weddingEventType: '',
  weddingEventDate: '',
  weddingPickupLocation: '',
  weddingDropLocation: '',
  weddingSpecialInstructions: '',
  addonIds: [],
  name: '',
  email: '',
  phone: '',
  countryIso2: DEFAULT_COUNTRY_ISO2,
  notes: '',
}

export interface PricingBreakdown {
  bagSubtotal: number
  multiDiscount: number
  routeFee: number
  serviceAdjust: number
  addonsTotal: number
  subtotal: number
  gst: number
  total: number
  totalBags: number
}

export interface RazorpayOrder {
  id: string
  amount: number
  currency: string
  receipt: string
}

export function isStep1Valid(s: BookingState): boolean {
  return !!(s.serviceId && s.fromCity && s.toCity)
}

export function isStep2Valid(s: BookingState): boolean {
  if (!s.bags.length || !s.bags.some(b => b.quantity > 0)) return false
  const hasWedding = s.bags.some(b => b.type === 'wedding' && b.quantity > 0)
  if (hasWedding) {
    return !!(
      s.weddingGuests &&
      s.weddingGuests > 0 &&
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
  const digits = s.phone.replace(/\D/g, '')
  const phoneOk = isValidPhoneForCountry(digits, s.countryIso2 || DEFAULT_COUNTRY_ISO2)
  const emailOk = !s.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)
  return !!(s.name.trim() && phoneOk && emailOk)
}
