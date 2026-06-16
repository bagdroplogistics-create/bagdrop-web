'use client'

import { motion } from 'framer-motion'
import { Sunrise, Sun, Sunset, Plane, PackageCheck, ShieldCheck, Zap, ArrowLeft, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ADDON_SERVICES } from '@/lib/constants'
import { formatINR } from '@/lib/pricing'
import { AddressAutocomplete } from './address-autocomplete'
import type { BookingState, TimeSlotId, AddonId } from '@/lib/booking-types'
import { isStep3Valid } from '@/lib/booking-types'

const TIME_SLOT_CONFIG: Record<TimeSlotId, { Icon: React.ElementType; label: string; range: string }> = {
  morning:   { Icon: Sunrise, label: 'Morning',   range: '7 AM – 11 AM' },
  afternoon: { Icon: Sun,     label: 'Afternoon', range: '12 PM – 4 PM' },
  evening:   { Icon: Sunset,  label: 'Evening',   range: '5 PM – 9 PM'  },
}

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

export function StepSchedule({ state, onChange, onNext, onBack }: StepScheduleProps) {
  const valid             = isStep3Valid(state)
  const isAirportDelivery = state.serviceId === 'airport-delivery'

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
        <h2 className="font-display text-lg font-semibold text-text-primary">When & where?</h2>
        <p className="mt-1 text-sm text-text-muted">
          Tell us when and where to collect your bags.
        </p>
      </div>

      {/* ── Date ── */}
      <div className="space-y-1.5">
        <label htmlFor="pickup-date" className="block text-sm font-medium text-text-primary">
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

      {/* ── Time slot ── */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-text-primary">
          Pickup time slot <span className="text-brand">*</span>
        </p>
        <div className="grid grid-cols-3 gap-3">
          {(Object.keys(TIME_SLOT_CONFIG) as TimeSlotId[]).map(slotId => {
            const { Icon, label, range } = TIME_SLOT_CONFIG[slotId]
            const selected = state.timeSlotId === slotId

            return (
              <button
                key={slotId}
                type="button"
                onClick={() => onChange({ timeSlotId: slotId })}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  selected
                    ? 'border-brand bg-brand-light shadow-brand'
                    : 'border-border bg-white hover:border-brand/40'
                )}
                aria-pressed={selected}
              >
                <Icon
                  className={cn('h-5 w-5', selected ? 'text-brand' : 'text-text-muted')}
                  strokeWidth={1.75}
                />
                <span className={cn('text-sm font-semibold', selected ? 'text-brand' : 'text-text-primary')}>
                  {label}
                </span>
                <span className="text-[10px] text-text-muted">{range}</span>
              </button>
            )
          })}
        </div>
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

      {/* ── Flight details (Airport Delivery only) ── */}
      {isAirportDelivery && (
        <motion.div
          className="rounded-2xl border border-brand/20 bg-brand-light p-5 space-y-4"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center gap-2">
            <Plane className="h-4 w-4 text-brand" strokeWidth={1.75} />
            <p className="text-sm font-semibold text-brand">Flight details</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="flight-number" className="block text-sm font-medium text-text-primary">
                Flight number <span className="text-brand">*</span>
              </label>
              <input
                id="flight-number"
                type="text"
                placeholder="e.g. AI 302"
                value={state.flightNumber}
                onChange={e => onChange({ flightNumber: e.target.value })}
                className="input-base uppercase"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="flight-datetime" className="block text-sm font-medium text-text-primary">
                Flight date &amp; time
              </label>
              <input
                id="flight-datetime"
                type="datetime-local"
                value={state.flightDateTime}
                onChange={e => onChange({ flightDateTime: e.target.value })}
                className="input-base"
              />
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Add-ons ── */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-text-primary">Add-ons (optional)</p>
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
          Review &amp; Pay
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </Button>
      </div>
    </motion.div>
  )
}
