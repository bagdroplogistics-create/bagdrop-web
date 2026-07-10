'use client'

import * as React from 'react'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Package, CheckCircle2, Truck, MapPin,
  Clock, Calendar, ArrowRight, AlertCircle
} from 'lucide-react'
import Link from 'next/link'

type BookingStatus = 'pending' | 'confirmed' | 'picked_up' | 'in_transit' | 'delivered' | 'cancelled'

interface TrackResult {
  trackingId:    string
  status:        BookingStatus
  customerName:  string
  serviceLabel:  string
  fromCity:      string
  toCity:        string
  pickupDate:    string | null
  timeSlot:      string | null
  totalBags:     number
  statusHistory: Array<{ status: string; timestamp: string; note?: string }>
  createdAt:     string
  updatedAt:     string
}

const TIMELINE_STEPS: { key: BookingStatus; label: string; desc: string }[] = [
  { key: 'pending',    label: 'Request Received',  desc: 'Your booking inquiry is confirmed' },
  { key: 'confirmed',  label: 'Booking Confirmed', desc: 'Team has confirmed your pickup slot' },
  { key: 'picked_up',  label: 'Bags Picked Up',    desc: 'Your bags have been collected' },
  { key: 'in_transit', label: 'In Transit',         desc: 'Bags are on the way to destination' },
  { key: 'delivered',  label: 'Delivered',          desc: 'Bags delivered successfully' },
]

const STATUS_ORDER: BookingStatus[] = ['pending', 'confirmed', 'picked_up', 'in_transit', 'delivered']

function getStepIndex(status: BookingStatus) {
  return STATUS_ORDER.indexOf(status)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function StatusBadge({ status }: { status: BookingStatus }) {
  const MAP: Record<BookingStatus, { label: string; class: string }> = {
    pending:    { label: 'Pending Confirmation', class: 'bg-amber-50 text-amber-700 border-amber-200'   },
    confirmed:  { label: 'Confirmed',             class: 'bg-blue-50 text-blue-700 border-blue-200'     },
    picked_up:  { label: 'Picked Up',             class: 'bg-purple-50 text-purple-700 border-purple-200' },
    in_transit: { label: 'In Transit',            class: 'bg-orange-50 text-brand border-orange-200'    },
    delivered:  { label: 'Delivered ✓',           class: 'bg-green-50 text-green-700 border-green-200'  },
    cancelled:  { label: 'Cancelled',             class: 'bg-red-50 text-red-700 border-red-200'        },
  }
  const cfg = MAP[status]
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${cfg.class}`}>
      {status === 'in_transit' && (
        <span className="mr-2 relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
        </span>
      )}
      {cfg.label}
    </span>
  )
}

 function TrackPageContent() {
  const searchParams = useSearchParams()
  const [input, setInput]     = React.useState(searchParams.get('id') ?? '')
  const [result, setResult]   = React.useState<TrackResult | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError]     = React.useState('')

  async function handleTrack(e?: React.FormEvent) {
    e?.preventDefault()
    const id = input.trim().toUpperCase()
    if (!id) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res  = await fetch(`/api/track?id=${encodeURIComponent(id)}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Not found'); return }
      setResult(data)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Auto-track if ?id= is in URL
  React.useEffect(() => {
    if (searchParams.get('id')) handleTrack()
  }, []) // eslint-disable-line

  const currentStep = result ? getStepIndex(result.status) : -1

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
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="eyebrow text-white/50">Live Tracking</span>
            <h1 className="mt-3 font-display text-display-lg font-bold text-white">
              Where are your bags?
            </h1>
            <p className="mt-4 text-lg text-white/60 max-w-md mx-auto">
              Enter your tracking ID to see real-time status.
            </p>

            {/* Search */}
            <form onSubmit={handleTrack} className="mt-10 flex max-w-md mx-auto gap-2">
              <div className="relative flex-1">
                <Package className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/30" />
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value.toUpperCase())}
                  placeholder="BD-XXXXXX"
                  maxLength={9}
                  className="w-full rounded-xl border border-white/15 bg-white/10 py-4 pl-11 pr-4 font-mono text-lg font-bold tracking-widest text-white placeholder:text-white/25 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="rounded-xl bg-brand px-6 py-4 font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {loading ? '...' : <Search className="h-5 w-5" />}
              </button>
            </form>
          </motion.div>
        </div>
        </div>
      </section>

      {/* Results */}
      <div className="section-container py-12">
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 text-center"
            >
              <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-500" />
              <p className="font-semibold text-red-700">{error}</p>
              <p className="mt-1 text-sm text-red-500">
                Check your email for the tracking ID (format: BD-XXXXXX)
              </p>
            </motion.div>
          )}

          {result && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mx-auto max-w-2xl space-y-6"
            >
              {/* Header card */}
              <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Tracking ID</p>
                    <p className="font-mono text-2xl font-black text-brand">{result.trackingId}</p>
                    <p className="mt-1 text-sm text-text-secondary">Hi {result.customerName} 👋</p>
                  </div>
                  <StatusBadge status={result.status} />
                </div>

                <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    { icon: MapPin,     label: 'From',    value: result.fromCity },
                    { icon: MapPin,     label: 'To',      value: result.toCity },
                    { icon: Calendar,   label: 'Date',    value: result.pickupDate ?? 'TBD' },
                    { icon: Package,    label: 'Bags',    value: `${result.totalBags} bag${result.totalBags !== 1 ? 's' : ''}` },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="rounded-xl bg-stone-50 p-3">
                      <div className="flex items-center gap-1.5 text-text-muted mb-1">
                        <Icon className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">{label}</span>
                      </div>
                      <p className="text-sm font-semibold text-text-primary">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Timeline */}
              {result.status !== 'cancelled' && (
                <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                  <h2 className="mb-6 font-display text-lg font-bold text-text-primary">Journey Timeline</h2>
                  <div className="space-y-0">
                    {TIMELINE_STEPS.map((step, i) => {
                      const done    = i <= currentStep
                      const active  = i === currentStep
                      const isLast  = i === TIMELINE_STEPS.length - 1
                      return (
                        <div key={step.key} className="flex gap-4">
                          {/* Line + dot */}
                          <div className="flex flex-col items-center">
                            <div className={[
                              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                              done
                                ? active
                                  ? 'border-brand bg-brand text-white shadow-lg shadow-brand/30'
                                  : 'border-brand bg-brand text-white'
                                : 'border-stone-200 bg-white text-stone-300',
                            ].join(' ')}>
                              {done && !active
                                ? <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} />
                                : active
                                  ? <span className="relative flex h-2.5 w-2.5">
                                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
                                    </span>
                                  : <span className="h-2 w-2 rounded-full bg-stone-200" />
                              }
                            </div>
                            {!isLast && (
                              <div className={`mt-1 w-0.5 flex-1 min-h-[2rem] ${done && !active ? 'bg-brand' : 'bg-stone-100'}`} />
                            )}
                          </div>
                          {/* Content */}
                          <div className={`pb-6 ${isLast ? 'pb-0' : ''}`}>
                            <p className={`text-sm font-semibold ${active ? 'text-brand' : done ? 'text-text-primary' : 'text-text-muted'}`}>
                              {step.label}
                            </p>
                            <p className="text-xs text-text-muted">{step.desc}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Status history */}
              {result.statusHistory?.length > 0 && (
                <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                  <h2 className="mb-4 font-display text-lg font-bold text-text-primary">Activity Log</h2>
                  <div className="space-y-3">
                    {[...result.statusHistory].reverse().map((h, i) => (
                      <div key={i} className="flex items-start gap-3 text-sm">
                        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                        <div>
                          <span className="font-medium text-text-primary capitalize">{h.status.replace('_', ' ')}</span>
                          {h.note && <span className="text-text-muted"> · {h.note}</span>}
                          <p className="text-xs text-text-muted">{formatDate(h.timestamp)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CTA */}
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/contact"
                  className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-5 py-3 text-sm font-semibold text-text-primary shadow-sm hover:border-brand hover:text-brand transition-colors"
                >
                  Need help? Contact us <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/book"
                  className="flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white hover:opacity-90 transition-opacity"
                >
                  Book another delivery <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </motion.div>
          )}

          {!result && !error && !loading && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-16 text-center"
            >
              <Package className="mx-auto mb-4 h-12 w-12 text-stone-300" />
              <p className="text-text-muted">Enter your tracking ID above to see status</p>
              <p className="mt-1 text-sm text-text-muted">
                Check your confirmation email for the ID (format: BD-XXXXXX)
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
export default function TrackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream" />}>
      <TrackPageContent />
    </Suspense>
  )
}
