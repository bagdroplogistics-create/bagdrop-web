'use client'

// BAGDROP — PM audit fix (2026-09-28), Issue #5: /track was a static
// "coming soon" placeholder even though app/api/track/route.ts already
// exposes a working, PII-stripped lookup (tracking_id, status, first name,
// route, dates, bag count, status_history) reading straight from the same
// bookings table Ops already updates. This client component wires that
// existing API up to a real self-serve lookup UI, closing the gap between
// the "Digital Baggage Infrastructure — always in the loop" brand promise
// and what a visitor to this exact page actually saw.
//
// Deliberately NOT touching app/api/track/route.ts's contract (id-only,
// no phone param) — the mobile app already calls it exactly this way
// (mobile-app/src/lib/api.ts's trackBooking()), so changing the contract
// would risk breaking a shipped app. Same-origin lookup by tracking ID
// alone, with the response already stripped to first-name-only, matches
// the risk level of a airline/courier "track by AWB number" flow.

import * as React from 'react'
import Link from 'next/link'
import { Package, MessageCircle, Search, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

interface TrackedBooking {
  trackingId: string
  status: string
  customerName: string
  serviceLabel: string
  fromCity: string
  toCity: string
  pickupDate: string | null
  timeSlot: string | null
  totalBags: number
  statusHistory: { status?: string; to?: string; timestamp?: string; note?: string }[] | null
  createdAt: string
  updatedAt: string
}

// Customer-facing labels only — deliberately a smaller, friendlier vocabulary
// than the internal admin/ops status list (lib/booking-status.ts's
// STATUS_ORDER), since a customer doesn't need to see internal steps like
// "Invoice Generated" or "Indemnity Bond Signed".
const CUSTOMER_STEPS: { key: string; label: string }[] = [
  { key: 'confirmed',        label: 'Booking Confirmed' },
  { key: 'pickup_scheduled', label: 'Pickup Scheduled' },
  { key: 'picked_up',        label: 'Bags Picked Up' },
  { key: 'in_transit',       label: 'In Transit' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'delivered',        label: 'Delivered' },
]

const STATUS_DISPLAY: Record<string, string> = {
  inquiry:               'Inquiry Received',
  quote_created:         'Quote Being Prepared',
  quote_sent:            'Quote Sent',
  accepted:               'Quote Accepted',
  payment_pending:       'Payment Pending',
  payment_received:      'Payment Received',
  payment_approved:      'Payment Confirmed',
  confirmed:             'Booking Confirmed',
  indemnity_bond_sent:   'Booking Confirmed',
  indemnity_bond_signed: 'Booking Confirmed',
  invoice_generated:     'Booking Confirmed',
  invoice_sent:          'Booking Confirmed',
  pickup_scheduled:      'Pickup Scheduled',
  picked_up:             'Bags Picked Up',
  in_transit:            'In Transit',
  out_for_delivery:      'Out for Delivery',
  driver_details_shared: 'Out for Delivery',
  delivered:             'Delivered',
  trip_created:          'Delivered',
  completed:             'Delivered',
}

function currentStepIndex(status: string): number {
  // Map any raw status onto the nearest customer-facing milestone so the
  // progress bar always has something sensible to highlight, even for the
  // internal-only statuses (indemnity/invoice steps) that sit between
  // "Confirmed" and "Pickup Scheduled" in the real fulfillment pipeline.
  const displayLabel = STATUS_DISPLAY[status] ?? status
  const idx = CUSTOMER_STEPS.findIndex(s => s.label === displayLabel)
  return idx === -1 ? 0 : idx
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return d }
}

export default function TrackClient() {
  const [id, setId]             = React.useState('')
  const [loading, setLoading]   = React.useState(false)
  const [error, setError]       = React.useState('')
  const [result, setResult]     = React.useState<TrackedBooking | null>(null)
  const [searched, setSearched] = React.useState(false)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = id.trim()
    if (!trimmed) return
    setLoading(true)
    setError('')
    setResult(null)
    setSearched(true)
    try {
      const res = await fetch(`/api/track?id=${encodeURIComponent(trimmed)}`)
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setResult(data as TrackedBooking)
      } else {
        setError(data?.error || 'Tracking ID not found. Please check and try again.')
      }
    } catch {
      setError('Network error — please try again or WhatsApp us.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Hero */}
      <section className="relative bg-[#111] py-20 lg:py-28 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-55"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1540339832862-474599807836?w=1400&q=80')" }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/35 to-black/10" aria-hidden="true" />
        <div className="relative z-10">
          <div className="section-container text-center">
            <span className="eyebrow text-white/50">Bag Tracking</span>
            <h1 className="mt-3 font-display text-display-lg font-bold text-white">
              Track your bags
            </h1>
            <p className="mt-4 text-lg text-white/60 max-w-md mx-auto">
              Enter your Booking ID to see live status — pickup, transit, and delivery.
            </p>
          </div>
        </div>
      </section>

      {/* Search */}
      <div className="section-container py-16 max-w-xl">
        <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={id}
            onChange={e => setId(e.target.value)}
            placeholder="Booking ID — e.g. BDA-2026-0123"
            className="flex-1 rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          <button
            type="submit"
            disabled={loading || !id.trim()}
            className="flex items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3.5 font-bold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Track
          </button>
        </form>

        {/* Result */}
        {result && (
          <div className="mt-8 rounded-2xl border border-border bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Booking ID</p>
                <p className="font-display text-lg font-bold text-text-primary">{result.trackingId}</p>
              </div>
              <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-bold text-brand">
                {STATUS_DISPLAY[result.status] ?? result.status.replace(/_/g, ' ')}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div><p className="text-text-muted text-xs">Customer</p><p className="font-semibold text-text-primary">{result.customerName}</p></div>
              <div><p className="text-text-muted text-xs">Service</p><p className="font-semibold text-text-primary">{result.serviceLabel}</p></div>
              <div><p className="text-text-muted text-xs">Bags</p><p className="font-semibold text-text-primary">{result.totalBags}</p></div>
              <div><p className="text-text-muted text-xs">From</p><p className="font-semibold text-text-primary">{result.fromCity}</p></div>
              <div><p className="text-text-muted text-xs">To</p><p className="font-semibold text-text-primary">{result.toCity}</p></div>
              <div><p className="text-text-muted text-xs">Pickup Date</p><p className="font-semibold text-text-primary">{fmtDate(result.pickupDate)}</p></div>
            </div>

            {/* Progress timeline */}
            <div className="mt-6">
              <div className="flex items-center justify-between">
                {CUSTOMER_STEPS.map((step, i) => {
                  const active = i <= currentStepIndex(result.status)
                  return (
                    <div key={step.key} className="flex flex-1 flex-col items-center text-center">
                      <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold ${active ? 'bg-brand text-white' : 'bg-stone-100 text-text-muted'}`}>
                        {active ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                      </div>
                      <p className={`mt-1.5 text-[10px] leading-tight ${active ? 'font-semibold text-text-primary' : 'text-text-muted'}`}>{step.label}</p>
                    </div>
                  )
                })}
              </div>
              <div className="mt-2 h-1 w-full rounded-full bg-stone-100">
                <div
                  className="h-1 rounded-full bg-brand transition-all"
                  style={{ width: `${(currentStepIndex(result.status) / (CUSTOMER_STEPS.length - 1)) * 100}%` }}
                />
              </div>
            </div>

            <p className="mt-6 text-center text-xs text-text-muted">
              Questions about this delivery?{' '}
              <a href="https://wa.me/916357115711" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">
                WhatsApp us
              </a>
            </p>
          </div>
        )}

        {searched && !result && !loading && error && (
          <div className="mt-8 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-5">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
            <div>
              <p className="text-sm font-semibold text-red-700">{error}</p>
              <p className="mt-1 text-xs text-red-500">
                Double-check your Booking ID (e.g. BDA-2026-0123), or WhatsApp us and we&apos;ll look it up for you.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* What you get today — kept from the original page, still true regardless of self-serve lookup */}
      <div className="section-container pb-20 text-center max-w-xl">
        <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-full bg-brand/10">
          <Package className="h-8 w-8 text-brand" strokeWidth={1.5} />
        </div>
        <h2 className="font-display text-xl font-bold text-text-primary">
          We keep you in the loop
        </h2>
        <p className="mt-3 text-sm text-text-secondary leading-relaxed">
          Alongside this page, you also get WhatsApp and email updates at every stage —
          pickup confirmed, in transit, and delivered.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            href="https://wa.me/916357115711"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 font-bold text-white hover:opacity-90 transition-opacity"
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp for updates
          </a>
          <Link
            href="/book"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-6 py-3 font-semibold text-text-primary hover:border-brand hover:text-brand transition-colors"
          >
            Book a delivery
          </Link>
        </div>
      </div>
    </div>
  )
}
