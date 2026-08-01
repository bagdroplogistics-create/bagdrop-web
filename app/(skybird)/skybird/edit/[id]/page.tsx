'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react'
import { SkybirdBookingEngine } from '@/components/booking/skybird-booking-engine'
import { COVERAGE_CITIES } from '@/lib/constants'
import { INITIAL_BOOKING_STATE } from '@/lib/booking-types'
import type { BookingState, AddonId } from '@/lib/booking-types'
import { TITLE_OPTIONS, DEFAULT_TITLE } from '@/lib/constants'

// ============================================================================
// SKYBIRD PARTNER DASHBOARD — Edit an existing booking
// ============================================================================
// Loads the booking via GET /api/skybird/bookings/[id], reverse-maps the
// stored DB row back into the BookingState shape the shared step
// components expect, and hands it to SkybirdBookingEngine in edit mode
// (which PATCHes instead of POSTing on save, and skips OTP re-verification).
//
// Reverse-mapping isn't lossless for two fields, both flagged inline below:
//   - Bag type breakdown: only the total bag count is reliably stored
//     today (bag_details only ever holds wedding-specific sub-fields, not a
//     general per-type breakdown) — so editing pre-fills the total under a
//     single bag type (Wedding Luggage if it was a wedding booking,
//     otherwise Travel Bag) rather than the original per-type split. The
//     partner can adjust the breakdown in the Bags step if it matters.
//   - Route city: stored as a display label ("Mumbai"), not the internal
//     city id — matched back against COVERAGE_CITIES by label. Falls back
//     to unset (forcing a re-select) if a booking's stored label doesn't
//     match any current city, rather than guessing wrong.
// ============================================================================

interface BookingRow {
  id: string; tracking_id: string; status: string
  title: string | null
  customer_name: string | null; customer_email: string | null; customer_phone: string | null
  customer_phone_country_code: string | null; customer_phone_national: string | null
  service_type: string | null
  from_city: string | null; to_city: string | null
  pickup_address: string | null; drop_address: string | null
  pickup_date: string | null; delivery_date: string | null; time_slot: string | null
  flight_number: string | null; flight_datetime: string | null
  total_bags: number | null
  bag_details: Record<string, unknown> | null
  notes: string | null
}

function cityIdFromLabel(label: string | null): string | null {
  if (!label) return null
  const match = COVERAGE_CITIES.find(c => c.label === label)
  return match?.id ?? null
}

// The notes column has "[Wedding] Event: ... | Guests: ... | ..." appended
// after the free-text notes at save time (see the PATCH/POST routes) — cut
// it back off here so editing doesn't double it up on the next save (the
// wedding fields are reconstructed separately from bag_details instead).
function extractFreeNotes(rawNotes: string | null): string {
  if (!rawNotes) return ''
  const idx = rawNotes.indexOf('[Wedding]')
  if (idx === -1) return rawNotes
  return rawNotes.slice(0, idx).replace(/\s*\|\s*$/, '').trim()
}

function mapBookingToState(b: BookingRow): BookingState {
  const weddingInfo = (b.bag_details && typeof b.bag_details === 'object') ? b.bag_details : null
  const isWedding = !!weddingInfo && 'weddingEventType' in weddingInfo && !!weddingInfo.weddingEventType

  return {
    ...INITIAL_BOOKING_STATE,
    serviceId:   (b.service_type as BookingState['serviceId']) || null,
    fromCity:    cityIdFromLabel(b.from_city) as BookingState['fromCity'],
    toCity:      cityIdFromLabel(b.to_city)   as BookingState['toCity'],
    bags:        [{ type: isWedding ? 'wedding' : 'travel', quantity: b.total_bags || 1 }],
    date:            b.pickup_date   ?? '',
    deliveryDate:    b.delivery_date ?? '',
    timeSlotId:      b.time_slot ?? null,
    pickupAddress:   b.pickup_address ?? '',
    dropAddress:     b.drop_address   ?? '',
    flightNumber:    b.flight_number ?? '',
    flightDateTime:  b.flight_datetime ?? '',
    weddingGuests:              isWedding ? (Number(weddingInfo?.weddingGuests) || null) : null,
    weddingEventType:           isWedding ? ((weddingInfo?.weddingEventType as BookingState['weddingEventType']) ?? '') : '',
    weddingEventDate:           isWedding ? ((weddingInfo?.weddingEventDate as string) ?? '') : '',
    weddingPickupLocation:      isWedding ? ((weddingInfo?.weddingPickupLocation as string) ?? '') : '',
    weddingDropLocation:        isWedding ? ((weddingInfo?.weddingDropLocation as string) ?? '') : '',
    weddingSpecialInstructions: isWedding ? ((weddingInfo?.weddingSpecialInstructions as string) ?? '') : '',
    addonIds:    [] as AddonId[],   // Insurance Upgrade is hidden/unsupported in Skybird either way
    title:       (b.title && TITLE_OPTIONS.includes(b.title as never) ? b.title : DEFAULT_TITLE) as BookingState['title'],
    name:        b.customer_name ?? '',
    email:       b.customer_email ?? '',
    phone:       b.customer_phone_national ?? (b.customer_phone ?? '').replace(/\D/g, '').slice(-10),
    countryIso2: b.customer_phone_country_code ?? 'IN',
    notes:       extractFreeNotes(b.notes),
  }
}

export default function SkybirdEditBookingPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [skybirdKey, setSkybirdKey] = useState('')
  const [authed, setAuthed] = useState(false)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [canEdit, setCanEdit] = useState(true)
  const [initialState, setInitialState] = useState<BookingState | null>(null)

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_skybird_key') ?? ''
    if (!key) { router.replace('/skybird/login'); return }
    setSkybirdKey(key)
    setAuthed(true)
  }, [router])

  useEffect(() => {
    if (!authed || !skybirdKey || !id) return
    fetch(`/api/skybird/bookings/${id}?key=${encodeURIComponent(skybirdKey)}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Could not load this booking')
        return d as { booking: BookingRow; canEdit: boolean }
      })
      .then(d => {
        setCanEdit(d.canEdit)
        setInitialState(mapBookingToState(d.booking))
      })
      .catch(err => setLoadError(err.message))
      .finally(() => setLoading(false))
  }, [authed, skybirdKey, id])

  if (!authed) return null

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-sky-500" />
      </div>
    )
  }

  if (loadError || !initialState) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-400" />
        <p className="text-sm font-semibold text-gray-700">{loadError ?? 'This booking could not be loaded.'}</p>
        <Link href="/skybird" className="mt-6 inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" /> Back to Inquiries
        </Link>
      </div>
    )
  }

  if (!canEdit) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-400" />
        <p className="text-sm font-semibold text-gray-700">
          This booking has already moved past the inquiry stage and can no longer be edited here.
        </p>
        <p className="mt-1 text-sm text-gray-500">Please contact Bagdrop support if something needs to change.</p>
        <Link href="/skybird" className="mt-6 inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" /> Back to Inquiries
        </Link>
      </div>
    )
  }

  return (
    <SkybirdBookingEngine
      skybirdKey={skybirdKey}
      editBookingId={id}
      initialState={initialState}
      onBackToList={() => router.push('/skybird')}
    />
  )
}
