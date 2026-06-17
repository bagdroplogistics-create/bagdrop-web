'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plane, PackageCheck, ShieldCheck, Zap,
  ArrowLeft, ArrowRight, Search, Clock,
  MapPin, CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ADDON_SERVICES } from '@/lib/constants'
import { formatINR } from '@/lib/pricing'
import { AddressAutocomplete } from './address-autocomplete'
import type { BookingState, AddonId } from '@/lib/booking-types'
import { isStep3Valid } from '@/lib/booking-types'
import type { FlightInfo } from '@/app/api/flight-lookup/route'

const ADDON_ICONS: Record<AddonId, React.ElementType> = {
  packing:   PackageCheck,
  insurance: ShieldCheck,
  express:   Zap,
}

interface StepScheduleProps {
  state:    BookingState
  onChange: (patch: Partial<BookingState>) => void
  onNext:   () => void
  onBack:   () => void
}

// Minimum date = tomorrow
function minDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

function formatScheduledTime(iso: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true,
    })
  } catch {
    return iso
  }
}

function formatScheduledDate(iso: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short',
    })
  } catch {
    return iso
  }
}

export function StepSchedule({ state, onChange, onNext, onBack }: StepScheduleProps) {
  const valid             = isStep3Valid(state)
  const isAirportService  = ['airport-delivery', 'door-to-airport'].includes(state.serviceId ?? '')

  // ── PNR / flight lookup local state ────────────────────────
  const [pnrInput,    setPnrInput]    = useState(state.flightNumber ?? '')
  const [lookupState, setLookupState] = useState<'idle' | 'loading' | 'found' | 'error'>('idle')
  const [flightInfo,  setFlightInfo]  = useState<FlightInfo | null>(null)
  const [lookupError, setLookupError] = useState('')

  const fetchFlight = useCallback(async () => {
    const pnr = pnrInput.trim()
    if (!pnr) return

    setLookupState('loading')
    setLookupError('')
    setFlightInfo(null)

    try {
      const date   = state.date || new Date().toISOString().split('T')[0]
      const params = new URLSearchParams({ flight: pnr, date })
      const res    = await fetch(`/api/flight-lookup?${params}`)
      const data   = await res.json()

      if (!res.ok) {
        setLookupError(data.error ?? 'Flight not found. Please check the number.')
        setLookupState('error')
        return
      }

      setFlightInfo(data as FlightInfo)
      setLookupState('found')

      // Auto-fill state from flight data
      onChange({
        flightNumber:   data.flightNumber,
        flightDateTime: data.departure.scheduled || data.departure.estimated,
      })
    } catch {
      setLookupError('Network error. Please try again or enter flight details manually.')
      setLookupState('error')
    }
  }, [pnrInput, state.date, onChange])

  function toggleAddon(id: AddonId) {
    const has = state.addonIds.includes(id)
    onChange({
      addonIds: has
        ? state.addonIds.filter(a => a !== id)
        : [...state.addonIds, id],
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.35, ease: 'easeOut' as const }}
      className="space-y-7"
    >
      <div>
        <h2 className="font-display text-xl font-semibold text-text-primary">When &amp; where?</h2>
        <p className="mt-1 text-base text-text-muted">
          Tell us when and where to collect your bags.
        </p>
      </div>

      {/* ── Date ── */}
      <div className="space-y-1.5">
        <label htmlFor="pickup-date" className="block text-base font-medium text-text-primary">
          Pickup date <span className="text-brand">*</span>
        </label>
        <input
          id="pickup-date"
          type="date"
          min={minDate()}
          value={state.date}
          onChange={e => onChange({ date: e.target.value })}
          className="input-base"
        />
      </div>

      {/* ── Pickup time (24 h free picker) ── */}
      <div className="space-y-1.5">
        <label htmlFor="pickup-time" className="block text-base font-medium text-text-primary">
          Preferred pickup time <span className="text-brand">*</span>
        </label>
        <div className="relative">
          <Clock
            className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted pointer-events-none"
            strokeWidth={1.75}
          />
          <input
            id="pickup-time"
            type="time"
            value={state.timeSlotId ?? ''}
            onChange={e => onChange({ timeSlotId: e.target.value || null })}
            className="input-base pl-10"
          />
        </div>
        <p className="text-xs text-text-muted">We are available 24 hours — pick any time that works for you.</p>
      </div>

      {/* ── Addresses ── */}
      <AddressAutocomplete
        id="pickup-address"
        label="Pickup address"
        value={state.pickupAddress}
        onChange={v => onChange({ pickupAddress: v })}
        placeholder="House / hotel / airport name + full address"
        required
      />

      <AddressAutocomplete
        id="drop-address"
        label="Drop address"
        value={state.dropAddress}
        onChange={v => onChange({ dropAddress: v })}
        placeholder="Delivery address"
        required
      />

      {/* ── Flight / PNR lookup (airport services only) ── */}
      {isAirportService && (
        <motion.div
          className="rounded-2xl border border-brand/20 bg-brand-light p-5 space-y-4"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center gap-2">
            <Plane className="h-4 w-4 text-brand" strokeWidth={1.75} />
            <p className="text-base font-semibold text-brand">Flight details</p>
          </div>

          {/* PNR / flight number lookup */}
          <div className="space-y-1.5">
            <label htmlFor="pnr-input" className="block text-sm font-medium text-text-primary">
              PNR / Flight number <span className="text-brand">*</span>
            </label>
            <div className="flex gap-2">
              <input
                id="pnr-input"
                type="text"
                placeholder="e.g. AI302 or 6E 204"
                value={pnrInput}
                onChange={e => {
                  setPnrInput(e.target.value)
                  // If user edits the field after a lookup, reset the found state
                  if (lookupState === 'found') {
                    setLookupState('idle')
                    setFlightInfo(null)
                  }
                  onChange({ flightNumber: e.target.value })
                }}
                onKeyDown={e => { if (e.key === 'Enter') fetchFlight() }}
                className="input-base flex-1 uppercase"
              />
              <button
                type="button"
                onClick={fetchFlight}
                disabled={!pnrInput.trim() || lookupState === 'loading'}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  !pnrInput.trim() || lookupState === 'loading'
                    ? 'border-border bg-white text-text-muted cursor-not-allowed opacity-60'
                    : 'border-brand bg-brand text-white hover:bg-brand/90'
                )}
              >
                {lookupState === 'loading'
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Search className="h-4 w-4" />}
                {lookupState === 'loading' ? 'Fetching…' : 'Fetch Flight'}
              </button>
            </div>
            <p className="text-xs text-text-muted">
              Enter your IATA flight number (from your ticket) and click Fetch Flight — we'll auto-fill your route and schedule.
            </p>
          </div>

          {/* Flight info result */}
          <AnimatePresence mode="wait">
            {lookupState === 'found' && flightInfo && (
              <motion.div
                key="found"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  <span className="text-sm font-semibold text-green-800">
                    {flightInfo.flightNumber} — {flightInfo.airline}
                  </span>
                  <span className={cn(
                    'ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                    flightInfo.status === 'landed'    ? 'bg-green-200 text-green-800' :
                    flightInfo.status === 'cancelled' ? 'bg-red-200 text-red-800' :
                    'bg-blue-100 text-blue-800'
                  )}>
                    {flightInfo.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  {/* Departure */}
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Departure</p>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 text-brand shrink-0" strokeWidth={2} />
                      <span className="font-semibold text-text-primary">{flightInfo.departure.iata}</span>
                    </div>
                    <p className="text-xs text-text-muted leading-snug">
                      {flightInfo.departure.airport}
                      {flightInfo.departure.terminal && (
                        <> · T{flightInfo.departure.terminal}</>
                      )}
                    </p>
                    <p className="text-xs font-medium text-text-primary">
                      {formatScheduledDate(flightInfo.departure.scheduled)}{' '}
                      {formatScheduledTime(flightInfo.departure.scheduled)}
                    </p>
                  </div>

                  {/* Arrival */}
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Arrival</p>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 text-green-600 shrink-0" strokeWidth={2} />
                      <span className="font-semibold text-text-primary">{flightInfo.arrival.iata}</span>
                    </div>
                    <p className="text-xs text-text-muted leading-snug">
                      {flightInfo.arrival.airport}
                      {flightInfo.arrival.terminal && (
                        <> · T{flightInfo.arrival.terminal}</>
                      )}
                    </p>
                    <p className="text-xs font-medium text-text-primary">
                      {formatScheduledDate(flightInfo.arrival.scheduled)}{' '}
                      {formatScheduledTime(flightInfo.arrival.scheduled)}
                    </p>
                  </div>
                </div>

                <p className="text-[11px] text-text-muted">
                  ✓ Flight details auto-filled. You can still edit the flight number above if needed.
                </p>
              </motion.div>
            )}

            {lookupState === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3"
              >
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{lookupError}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Manual flight date & time (always visible for override) */}
          <div className="space-y-1.5">
            <label htmlFor="flight-datetime" className="block text-sm font-medium text-text-primary">
              Flight date &amp; time{' '}
              <span className="font-normal text-text-muted">(auto-filled or enter manually)</span>
            </label>
            <input
              id="flight-datetime"
              type="datetime-local"
              value={state.flightDateTime}
              onChange={e => onChange({ flightDateTime: e.target.value })}
              className="input-base"
            />
          </div>
        </motion.div>
      )}

      {/* ── Add-ons ── */}
      <div className="space-y-2">
        <p className="text-base font-medium text-text-primary">Add-ons (optional)</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {ADDON_SERVICES.map(addon => {
            const Icon     = ADDON_ICONS[addon.id as AddonId]
            const selected = state.addonIds.includes(addon.id as AddonId)

            return (
              <button
                key={addon.id}
                type="button"
                onClick={() => toggleAddon(addon.id as AddonId)}
                className={cn(
                  'flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  selected
                    ? 'border-brand bg-brand-light shadow-brand'
                    : 'border-border bg-white hover:border-brand/40'
                )}
                aria-pressed={selected}
              >
                <div className={cn(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                  selected ? 'bg-brand text-white' : 'bg-cream text-text-muted'
                )}>
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <div>
                  <p className={cn('text-sm font-semibold', selected ? 'text-brand' : 'text-text-primary')}>
                    {addon.label}
                  </p>
                  <p className="text-xs text-text-muted">{addon.description}</p>
                  <p className="mt-1 text-xs font-semibold text-text-primary">
                    +{formatINR(addon.price)}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Navigation ── */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="secondary" size="lg" onClick={onBack} className="group">
          <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
          Back
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={onNext}
          disabled={!valid}
          className="group"
        >
          Review &amp; Confirm
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </Button>
      </div>
    </motion.div>
  )
}
