'use client'

import { motion } from 'framer-motion'
import {
  PlaneLanding, Home, Heart, GraduationCap, Briefcase, Package,
  ArrowRight, ArrowLeftRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { COVERAGE_CITIES, SERVICE_TYPES, VALID_ROUTES } from '@/lib/constants'
import type { BookingState, ServiceId, CityId } from '@/lib/booking-types'
import { isStep1Valid } from '@/lib/booking-types'

const SERVICE_ICONS: Record<ServiceId, React.ElementType> = {
  'airport-delivery':    PlaneLanding,
  'door-to-door':        Home,
  'destination-weddings':Heart,
  'student-relocation':  GraduationCap,
  'corporate-travel':    Briefcase,
  'excess-baggage':      Package,
}

interface StepRouteProps {
  state:    BookingState
  onChange: (patch: Partial<BookingState>) => void
  onNext:   () => void
}

const cardVariants = {
  hidden:  { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, duration: 0.4, ease: 'easeOut' as const },
  }),
}

export function StepRoute({ state, onChange, onNext }: StepRouteProps) {
  const valid = isStep1Valid(state)

  // Cities that can be selected as a pickup point
  const fromCities = COVERAGE_CITIES.filter(c =>
    VALID_ROUTES.some(r => r.from === c.id)
  )

  // Default drop cities shown before a pickup is selected
  const DEFAULT_DROP_IDS: CityId[] = [
    'mumbai',
    'mumbai-airport-t2',
    'delhi',
    'delhi-airport-t3',
    'hyderabad-airport',
    'udaipur',
    'jaipur',
    'baroda',
  ]

  // Always show the 8 default drop cities — regardless of which pickup is selected.
  const toCities = COVERAGE_CITIES.filter(c => DEFAULT_DROP_IDS.includes(c.id as CityId))

  function handleFromChange(cityId: CityId | null) {
    // Reset toCity if it is no longer valid for the new fromCity
    const stillValid =
      cityId && state.toCity
        ? VALID_ROUTES.some(r => r.from === cityId && r.to === state.toCity)
        : false
    onChange({ fromCity: cityId, toCity: stillValid ? state.toCity : null })
  }

  function swapCities() {
    const swappedFrom = state.toCity
    const swappedTo   = state.fromCity
    // Only keep toCity if the swapped pair is a valid route
    const swapValid =
      swappedFrom && swappedTo
        ? VALID_ROUTES.some(r => r.from === swappedFrom && r.to === swappedTo)
        : false
    onChange({ fromCity: swappedFrom, toCity: swapValid ? swappedTo : null })
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.35, ease: 'easeOut' as const }}
      className="space-y-8"
    >
      {/* ── Service type ── */}
      <div>
        <h2 className="font-display text-xl font-semibold text-text-primary mb-4">
          What kind of service do you need?
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SERVICE_TYPES.map((svc, i) => {
            const Icon    = SERVICE_ICONS[svc.id as ServiceId]
            const selected = state.serviceId === svc.id

            return (
              <motion.button
                key={svc.id}
                custom={i}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                onClick={() => onChange({ serviceId: svc.id as ServiceId })}
                className={cn(
                  'group flex flex-col items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  selected
                    ? 'border-brand bg-brand-light shadow-brand'
                    : 'border-border bg-white hover:border-brand/40 hover:bg-brand-light/50'
                )}
                aria-pressed={selected}
              >
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-200',
                    selected
                      ? 'bg-brand text-white'
                      : 'bg-cream text-text-secondary group-hover:bg-brand/10 group-hover:text-brand'
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div>
                  <p className={cn(
                    'text-base font-semibold',
                    selected ? 'text-brand' : 'text-text-primary'
                  )}>
                    {svc.label}
                  </p>
                  <p className="mt-0.5 text-sm text-text-muted line-clamp-2 leading-relaxed">
                    {svc.description}
                  </p>
                </div>
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* ── Route ── */}
      <div>
        <h2 className="font-display text-xl font-semibold text-text-primary mb-4">
          Where are we going?
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">
          {/* From */}
          <div className="flex-1 space-y-1.5">
            <label htmlFor="from-city" className="block text-base font-medium text-text-primary">
              Pickup city / location <span className="text-brand">*</span>
            </label>
            <select
              id="from-city"
              value={state.fromCity ?? ''}
              onChange={e => handleFromChange(e.target.value as CityId || null)}
              className="input-base"
            >
              <option value="">Select pickup location</option>
              {fromCities.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Swap button */}
          <button
            type="button"
            onClick={swapCities}
            className="mx-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-white text-text-muted transition-colors hover:border-brand/40 hover:text-brand sm:mb-0.5"
            aria-label="Swap pickup and drop locations"
            title="Swap locations"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </button>

          {/* To */}
          <div className="flex-1 space-y-1.5">
            <label htmlFor="to-city" className="block text-base font-medium text-text-primary">
              Drop city / location <span className="text-brand">*</span>
            </label>
            <select
              id="to-city"
              value={state.toCity ?? ''}
              onChange={e => onChange({ toCity: e.target.value as CityId || null })}
              className="input-base"
            >
              <option value="">Select drop location</option>
              {toCities.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

      </div>

      {/* ── CTA ── */}
      <div className="flex justify-end pt-2">
        <Button
          variant="primary"
          size="lg"
          onClick={onNext}
          disabled={!valid}
          className="group"
        >
          Continue to Bags
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </Button>
      </div>
    </motion.div>
  )
}
