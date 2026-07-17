// ─────────────────────────────────────────────────────────────
// BAGDROP MOBILE — Pricing Engine
// Ported verbatim from the website's lib/pricing.ts so quotes shown in
// the app always match what the website would quote for the same trip.
// If the website's pricing engine changes, mirror the change here too.
// ─────────────────────────────────────────────────────────────

import { BAG_TYPES, ADDON_SERVICES } from './constants'
import type { BookingState, CityId, ServiceId, PricingBreakdown } from './booking-types'

const ROUTE_FEES: Record<string, number> = {
  'ahmedabad-ahmedabad': 0,
  'baroda-baroda': 0,
  'delhi-delhi': 0,
  'goa-goa': 0,
  'mumbai-mumbai': 0,
  'nashik-nashik': 0,
  'pune-pune': 0,
  'surat-surat': 0,
  'baroda-mumbai': 499,
  'mumbai-nashik': 249,
  'mumbai-pune': 299,
  'mumbai-surat': 399,
  'mumbai-ahmedabad': 599,
  'mumbai-goa': 699,
  'mumbai-delhi': 999,
  'ahmedabad-delhi': 799,
  'baroda-delhi': 849,
  'delhi-goa': 1099,
  'delhi-nashik': 999,
  'delhi-pune': 999,
  'delhi-surat': 849,
  'ahmedabad-baroda': 149,
  'ahmedabad-goa': 699,
  'ahmedabad-nashik': 399,
  'ahmedabad-pune': 449,
  'ahmedabad-surat': 249,
  'baroda-goa': 699,
  'goa-nashik': 499,
  'goa-pune': 449,
  'goa-surat': 699,
  'baroda-nashik': 399,
  'baroda-pune': 399,
  'baroda-surat': 149,
  'nashik-pune': 249,
  'nashik-surat': 399,
  'pune-surat': 349,
}

function normalizeCityForRoute(cityId: string): string {
  if (cityId.startsWith('mumbai-airport')) return 'mumbai'
  if (cityId.startsWith('delhi-airport')) return 'delhi'
  if (cityId.startsWith('ahmedabad-airport')) return 'ahmedabad'
  if (cityId.startsWith('goa-airport')) return 'goa'
  return cityId
}

function getRouteFee(from: CityId, to: CityId): number {
  const normFrom = normalizeCityForRoute(from as string)
  const normTo = normalizeCityForRoute(to as string)
  const key = [normFrom, normTo].sort().join('-')
  return ROUTE_FEES[key] ?? 799
}

const SERVICE_MULTIPLIERS: Record<ServiceId, number> = {
  'airport-delivery': 1.0,
  'door-to-door': 0.92,
  'destination-weddings': 1.45,
  'student-relocation': 0.85,
  'corporate-travel': 1.1,
  'excess-baggage': 1.0,
}

function multiBagFactor(totalBags: number): number {
  if (totalBags <= 1) return 1.0
  if (totalBags === 2) return 0.95
  if (totalBags === 3) return 0.9
  return 0.85
}

export function calculatePrice(state: BookingState): PricingBreakdown {
  const { serviceId, fromCity, toCity, bags, addonIds } = state

  const totalBags = bags.reduce((sum, b) => sum + b.quantity, 0)
  let bagSubtotalFull = 0
  for (const bag of bags) {
    bagSubtotalFull += BAG_TYPES[bag.type].basePrice * bag.quantity
  }

  const factor = multiBagFactor(totalBags)
  const bagSubtotal = Math.round(bagSubtotalFull * factor)
  const multiDiscount = bagSubtotalFull - bagSubtotal

  const routeFee = fromCity && toCity ? getRouteFee(fromCity, toCity) : 0

  const multiplier = serviceId ? SERVICE_MULTIPLIERS[serviceId] : 1.0
  const priceBeforeAdjust = bagSubtotal + routeFee
  const priceAfterAdjust = Math.round(priceBeforeAdjust * multiplier)
  const serviceAdjust = priceAfterAdjust - priceBeforeAdjust

  const addonLookup = Object.fromEntries(ADDON_SERVICES.map(a => [a.id, a.price]))
  const addonsTotal = addonIds.reduce((sum, id) => sum + (addonLookup[id] ?? 0), 0)

  const subtotal = priceAfterAdjust + addonsTotal
  const gst = Math.round(subtotal * 0.05)
  const total = subtotal + gst

  return {
    bagSubtotal,
    multiDiscount,
    routeFee,
    serviceAdjust,
    addonsTotal,
    subtotal,
    gst,
    total,
    totalBags,
  }
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function estimateLabel(fromCity: CityId, toCity: CityId): string {
  const fee = getRouteFee(fromCity, toCity)
  const minBag = BAG_TYPES['travel'].basePrice
  const est = fee + minBag
  return `Starting from ${formatINR(est)}`
}
