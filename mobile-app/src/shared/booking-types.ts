// ─────────────────────────────────────────────────────────────
// BAGDROP MOBILE — Booking Engine Types
// Ported from the website's lib/booking-types.ts — keep in sync.
// ─────────────────────────────────────────────────────────────

import type { BagTypeId, CityId } from './constants'

export const COUNTRY_CODES = [
  { code: '+91', flag: '🇮🇳', label: 'India (+91)', maxDigits: 10, placeholder: '98765 43210' },
  { code: '+1', flag: '🇺🇸', label: 'USA (+1)', maxDigits: 10, placeholder: '800 555 0100' },
  { code: '+44', flag: '🇬🇧', label: 'UK (+44)', maxDigits: 11, placeholder: '7911 123456' },
  { code: '+1CA', flag: '🇨🇦', label: 'Canada (+1)', maxDigits: 10, placeholder: '604 555 0100' },
] as const

export function getDialCode(code: string): string {
  return code === '+1CA' ? '+1' : code
}

export function validatePhone(digits: string, countryCode: string): boolean {
  switch (countryCode) {
    case '+91':
      return /^[6-9]\d{9}$/.test(digits)
    case '+44':
      return /^\d{10,11}$/.test(digits)
    default:
      return /^\d{10}$/.test(digits)
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
  phone: string
  countryCode: string
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
  countryCode: '+91',
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
  const phoneOk = validatePhone(digits, s.countryCode ?? '+91')
  const emailOk = !s.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)
  return !!(s.name.trim() && phoneOk && emailOk)
}
