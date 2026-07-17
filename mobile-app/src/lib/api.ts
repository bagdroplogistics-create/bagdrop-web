// Thin client for bagdrop.co's existing Next.js API routes. No separate
// backend — every call here hits the same endpoints the website uses.

import { API_BASE_URL } from './config'
import { supabase } from './supabase'
import type { BookingState, PricingBreakdown, RazorpayOrder } from '@/shared/booking-types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`)
  }
  return data as T
}

/** Authenticated request — attaches the current Supabase session's access token. */
async function authedRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Not signed in.')
  return request<T>(path, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
  })
}

// ── Auth (OTP) ──────────────────────────────────────────────────────────
export function sendOtp(type: 'email' | 'phone', contact: string) {
  return request<{ success: boolean; otp?: string; fallback?: boolean; smsError?: string }>(
    '/api/auth/send-otp',
    { method: 'POST', body: JSON.stringify({ type, contact }) }
  )
}

export function verifyOtp(type: 'email' | 'phone', contact: string, otp: string) {
  return request<{ success: boolean; authEmail: string; tempPassword: string }>(
    '/api/auth/verify-otp',
    { method: 'POST', body: JSON.stringify({ type, contact, otp }) }
  )
}

// ── Bookings ─────────────────────────────────────────────────────────────
export interface CreateBookingPayload {
  booking: Record<string, unknown>
  pricing: { totalBags: number; total: number; addOns?: unknown }
}

export function createBooking(state: BookingState, pricing: PricingBreakdown) {
  return request<{ success: boolean; trackingId: string; id: string }>('/api/bookings', {
    method: 'POST',
    body: JSON.stringify({
      booking: {
        source: 'mobile-app',
        name: state.name,
        email: state.email,
        phone: state.phone,
        countryCode: state.countryCode,
        serviceId: state.serviceId,
        fromCity: state.fromCity,
        toCity: state.toCity,
        pickupAddress: state.pickupAddress,
        dropAddress: state.dropAddress,
        date: state.date,
        deliveryDate: state.deliveryDate,
        timeSlotId: state.timeSlotId,
        flightNumber: state.flightNumber,
        bags: state.bags,
        bagDetails: { bags: state.bags },
        weddingGuests: state.weddingGuests,
        weddingEventType: state.weddingEventType,
        weddingEventDate: state.weddingEventDate,
        weddingPickupLocation: state.weddingPickupLocation,
        weddingDropLocation: state.weddingDropLocation,
        weddingSpecialInstructions: state.weddingSpecialInstructions,
        notes: state.notes,
      },
      pricing: {
        totalBags: pricing.totalBags,
        total: pricing.total,
        addOns: state.addonIds,
      },
    }),
  })
}

export interface TrackedBooking {
  trackingId: string
  status: string
  customerName: string
  serviceLabel: string
  fromCity: string
  toCity: string
  pickupDate: string | null
  timeSlot: string | null
  totalBags: number
  statusHistory: { status: string; timestamp: string; note?: string }[]
  createdAt: string
  updatedAt: string
}

export function trackBooking(trackingId: string) {
  return request<TrackedBooking>(`/api/track?id=${encodeURIComponent(trackingId)}`)
}

export interface MyBooking {
  id: string
  tracking_id: string
  status: string
  customer_name: string
  customer_email: string
  customer_phone: string
  service_type: string
  service_label: string
  from_city: string
  to_city: string
  pickup_address: string | null
  drop_address: string | null
  pickup_date: string | null
  delivery_date: string | null
  time_slot: string | null
  flight_number: string | null
  notes: string | null
  total_bags: number
  bag_details: {
    bags?: { type: string; quantity: number }[]
    weddingGuests?: number | null
    weddingEventType?: string | null
    weddingEventDate?: string | null
    weddingPickupLocation?: string | null
    weddingDropLocation?: string | null
    weddingSpecialInstructions?: string | null
  } | null
  total_amount: number
  currency: string
  payment_status: string | null
  payment_reference: string | null
  status_history: { status: string; timestamp: string; note?: string }[]
  created_at: string
  updated_at: string
}

export function myBookings() {
  return authedRequest<{ bookings: MyBooking[] }>('/api/my-bookings')
}

export interface UpdateBookingPayload {
  pickup_address?: string
  drop_address?: string
  pickup_date?: string
  delivery_date?: string
  time_slot?: string
  flight_number?: string
  notes?: string
  bags?: { type: string; quantity: number }[]
  weddingGuests?: number | null
  weddingEventType?: string | null
  weddingEventDate?: string | null
  weddingPickupLocation?: string | null
  weddingDropLocation?: string | null
  weddingSpecialInstructions?: string | null
}

/** Customer self-edit — only logistics details, only before pickup. See app/api/my-bookings/[id]/route.ts. */
export function updateMyBooking(id: string, patch: UpdateBookingPayload) {
  return authedRequest<{ booking: MyBooking }>(`/api/my-bookings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

// ── Payments ────────────────────────────────────────────────────────────
export function createRazorpayOrder(amountInRupees: number, notes?: Record<string, string>) {
  return request<RazorpayOrder>('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ amount: amountInRupees, currency: 'INR', notes }),
  })
}

// ── Flight lookup ───────────────────────────────────────────────────────
export function lookupFlight(flightNumber: string, date?: string) {
  const qs = new URLSearchParams({ flight: flightNumber, ...(date ? { date } : {}) })
  return request<{
    flightNumber: string
    airline: string
    status: string
    departure: { airport: string; scheduled: string }
    arrival: { airport: string; scheduled: string }
  }>(`/api/flight-lookup?${qs}`)
}
