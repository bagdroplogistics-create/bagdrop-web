'use client'

import { motion } from 'framer-motion'
import {
  Plane, ShieldCheck, Sun, Sunset, Moon, Sunrise,
  ArrowLeft, ArrowRight, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ADDON_SERVICES, TIME_SLOTS } from '@/lib/constants'
import { formatINR } from '@/lib/pricing'
import { AddressAutocomplete } from './address-autocomplete'
import type { BookingState, AddonId } from '@/lib/booking-types'
import { isStep3Valid } from '@/lib/booking-types'

const SLOT_ICONS: Record<string, React.ElementType> = {
  Morning:   Sunrise,
  Afternoon: Sun,
  Evening:   Sunset,
  Night:     Moon,
}

const ADDON_ICONS: Record<string, React.ElementType> = {
  'shield-check': ShieldCheck,
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

export function StepSchedule({ state, onChange, onNext, onBack }: StepScheduleProps) {
  const valid            = isStep3Valid(state)
  const isAirportService = ['airport-delivery', 'door-to-airport'].includes(state.serviceId ?? '')

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

      {/* ── Pickup Date ── */}
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

      {/* ── Time Slot Cards ── */}
      <div className="space-y-2">
        <p className="block text-base font-medium text-text-primary">
          Preferred pickup time <span className="text-brand">*</span>
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TIME_SLOTS.map(slot => {
            const Icon     = SLOT_ICONS[slot.label] ?? Clock
            const selected = state.timeSlotId === slot.id

            return (
              <button
                key={slot.id}
                type="button"
                onClick={() => onChange({ timeSlotId: slot.id })}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-2xl border-2 p-4 text-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  selected
                    ? 'border-brand bg-brand-light shadow-brand'
                    : 'border-border bg-white hover:border-brand/40 hover:bg-brand-light/50'
                )}
                aria-pressed={selected}
              >
                <div className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                  selected ? 'bg-brand text-white' : 'bg-cream text-text-muted'
                )}>
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <div>
                  <p className={cn('text-sm font-semibold', selected ? 'text-brand' : 'text-text-primary')}>
                    {slot.label}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-text-muted">{slot.range}</p>
                </div>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-text-muted">All timings in IST. Our team will confirm the exact time.</p>
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

      {/* ── Flight / PNR details (airport services only) ── */}
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

          {/* Flight Number / PNR */}
          <div className="space-y-1.5">
            <label htmlFor="flight-number" className="block text-sm font-medium text-text-primary">
              Flight number / PNR <span className="text-brand">*</span>
            </label>
            <input
              id="flight-number"
              type="text"
              placeholder="e.g. AI302, 6E 204, or PNR: ABC123"
              value={state.flightNumber}
              onChange={e => onChange({ flightNumber: e.target.value })}
              className="input-base uppercase"
            />
            <p className="text-xs text-text-muted">
              Enter your IATA flight number (e.g. AI302) or PNR from your ticket.
            </p>
          </div>

          {/* Flight date & time */}
          <div className="space-y-1.5">
            <label htmlFor="flight-datetime" className="block text-sm font-medium text-text-primary">
              Flight date &amp; time{' '}
              <span className="font-normal text-text-muted">(optional — helps us time your pickup)</span>
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
      {ADDON_SERVICES.length > 0 && (
        <div className="space-y-2">
          <p className="text-base font-medium text-text-primary">Add-ons (optional)</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {ADDON_SERVICES.map(addon => {
              const IconComp = ADDON_ICONS[addon.icon] ?? ShieldCheck
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
                    <IconComp className="h-4 w-4" strokeWidth={1.75} />
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
      )}

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
