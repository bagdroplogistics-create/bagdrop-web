'use client'

import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Minus, Plus, ArrowLeft, ArrowRight, Heart, Luggage } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { BAG_TYPES } from '@/lib/constants'
import { WEDDING_EVENT_TYPES } from '@/lib/booking-types'
import type { BookingState, BagItem, WeddingEventType } from '@/lib/booking-types'
import { isStep2Valid } from '@/lib/booking-types'
import type { BagTypeId } from '@/lib/constants'

// Only two bag types shown in the booking form
const BAG_ORDER: BagTypeId[] = ['travel', 'wedding']

const BAG_ICONS: Partial<Record<BagTypeId, React.ElementType>> = {
  wedding: Heart,
}

interface StepBagsProps {
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

export function StepBags({ state, onChange, onNext, onBack }: StepBagsProps) {
  const valid        = isStep2Valid(state)
  const hasWedding   = state.bags.some(b => b.type === 'wedding' && b.quantity > 0)
  const weddingCount = state.bags.find(b => b.type === 'wedding')?.quantity ?? 0

  function getCount(type: BagTypeId): number {
    return state.bags.find(b => b.type === type)?.quantity ?? 0
  }

  function setCount(type: BagTypeId, delta: number) {
    const current = getCount(type)
    const next    = Math.max(0, Math.min(20, current + delta))

    const filtered = state.bags.filter(b => b.type !== type)
    const newBags: BagItem[] = next > 0
      ? [...filtered, { type, quantity: next }]
      : filtered

    // Clear wedding fields when wedding bag is removed
    const updates: Partial<BookingState> = { bags: newBags }
    if (type === 'wedding' && next === 0) {
      updates.weddingGuests              = null
      updates.weddingEventType           = ''
      updates.weddingEventDate           = ''
      updates.weddingPickupLocation      = ''
      updates.weddingDropLocation        = ''
      updates.weddingSpecialInstructions = ''
    }

    onChange(updates)
  }

  const totalBags = state.bags.reduce((s, b) => s + b.quantity, 0)

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.35, ease: 'easeOut' as const }}
      className="space-y-6"
    >
      <div>
        <h2 className="font-display text-xl font-semibold text-text-primary">
          What are we collecting?
        </h2>
        <p className="mt-1 text-base text-text-muted">
          Select the type of luggage and quantity.
        </p>
      </div>

      {/* ── Bag Type Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        {BAG_ORDER.map((typeId, i) => {
          const bag      = BAG_TYPES[typeId]
          const count    = getCount(typeId)
          const selected = count > 0
          const IconComp = BAG_ICONS[typeId]

          return (
            <motion.div
              key={typeId}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.4, ease: 'easeOut' as const }}
              className={cn(
                'relative flex flex-col rounded-2xl border-2 p-6 transition-all duration-200',
                selected
                  ? 'border-brand bg-brand-light shadow-brand'
                  : 'border-border bg-white hover:border-brand/30'
              )}
            >
              {/* Selected badge */}
              <AnimatePresence>
                {selected && (
                  <motion.div
                    className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  >
                    <span className="text-[11px] font-bold">{count}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* SVG / Icon */}
              <div className="mb-4 flex justify-center">
                <div className="relative h-20 w-20">
                  <Image
                    src={bag.svgPath}
                    alt={bag.label}
                    fill
                    className="object-contain"
                  />
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 text-center">
                <h3 className={cn(
                  'font-display text-lg font-semibold flex items-center justify-center gap-1.5',
                  selected ? 'text-brand' : 'text-text-primary'
                )}>
                  {IconComp && <IconComp className="h-4 w-4" />}
                  {bag.label}
                </h3>
                <p className="mt-1 text-sm text-text-muted">{bag.description}</p>
                <p className="mt-0.5 text-xs text-text-muted">{bag.maxWeight}</p>
              </div>

              {/* Quantity stepper */}
              <div className="mt-5 flex items-center justify-center gap-4">
                <button
                  onClick={() => setCount(typeId, -1)}
                  disabled={count === 0}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full border transition-colors',
                    count > 0
                      ? 'border-brand text-brand hover:bg-brand hover:text-white'
                      : 'border-border text-text-muted opacity-40 cursor-not-allowed'
                  )}
                  aria-label={'Remove one ' + bag.label}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>

                <AnimatePresence mode="wait">
                  <motion.span
                    key={count}
                    className="w-8 text-center font-display text-xl font-bold text-text-primary tabular-nums"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.15 }}
                  >
                    {count}
                  </motion.span>
                </AnimatePresence>

                <button
                  onClick={() => setCount(typeId, +1)}
                  disabled={count >= 20}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-brand text-brand transition-colors hover:bg-brand hover:text-white"
                  aria-label={'Add one ' + bag.label}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              <p className="mt-3 text-center text-xs text-text-muted">{bag.dimensions}</p>
            </motion.div>
          )
        })}
      </div>

      {/* ── Wedding Details Panel ── */}
      <AnimatePresence>
        {hasWedding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border-2 border-brand/30 bg-brand-light p-6 space-y-5">
              {/* Header */}
              <div className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-brand" strokeWidth={2} />
                <p className="font-display text-base font-semibold text-brand">
                  Wedding Logistics Details
                </p>
              </div>
              <p className="text-sm text-text-muted -mt-3">
                Help us plan the perfect handoff for your big day. All fields marked * are required.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Number of Luggage Items — shows current count, read-only guidance */}
                <div className="sm:col-span-2 rounded-xl bg-white border border-brand/20 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Number of Luggage Items</p>
                    <p className="text-2xl font-bold text-brand mt-0.5">{weddingCount}</p>
                    <p className="text-xs text-text-muted">Use the +/− controls on the card above to adjust</p>
                  </div>
                  <Luggage className="h-10 w-10 text-brand/30" strokeWidth={1.5} />
                </div>

                {/* Number of Guests */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-text-primary">
                    Number of Guests <span className="text-brand">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    placeholder="e.g. 200"
                    value={state.weddingGuests ?? ''}
                    onChange={e => onChange({ weddingGuests: e.target.value ? Number(e.target.value) : null })}
                    className="input-base"
                  />
                </div>

                {/* Event Type */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-text-primary">
                    Event Type <span className="text-brand">*</span>
                  </label>
                  <select
                    value={state.weddingEventType}
                    onChange={e => onChange({ weddingEventType: e.target.value as WeddingEventType | '' })}
                    className="input-base"
                  >
                    <option value="">Select event type</option>
                    {WEDDING_EVENT_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Event Date */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="block text-sm font-medium text-text-primary">
                    Event Date <span className="text-brand">*</span>
                  </label>
                  <input
                    type="date"
                    min={minDate()}
                    value={state.weddingEventDate}
                    onChange={e => onChange({ weddingEventDate: e.target.value })}
                    className="input-base"
                  />
                </div>

                {/* Pickup Location — syncs to pickupAddress for step 3 validation */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-text-primary">
                    Pickup Location <span className="text-brand">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Home, hotel, or venue address"
                    value={state.weddingPickupLocation}
                    onChange={e => onChange({
                      weddingPickupLocation: e.target.value,
                      pickupAddress:         e.target.value,   // keeps step 3 validation in sync
                    })}
                    className="input-base"
                  />
                </div>

                {/* Delivery Location — syncs to dropAddress for step 3 validation */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-text-primary">
                    Delivery Location <span className="text-brand">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Venue, hotel, or destination address"
                    value={state.weddingDropLocation}
                    onChange={e => onChange({
                      weddingDropLocation: e.target.value,
                      dropAddress:         e.target.value,     // keeps step 3 validation in sync
                    })}
                    className="input-base"
                  />
                </div>

                {/* Special Instructions */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="block text-sm font-medium text-text-primary">
                    Special Instructions
                    <span className="ml-1 text-xs font-normal text-text-muted">(optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Fragile items, specific handling requests, delivery timing, etc."
                    value={state.weddingSpecialInstructions}
                    onChange={e => onChange({ weddingSpecialInstructions: e.target.value })}
                    className="input-base resize-none"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Multi-bag hint */}
      {totalBags >= 3 && (
        <motion.p
          className="text-center text-sm font-medium text-success"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {totalBags} items — our team will confirm the best rate for your booking
        </motion.p>
      )}

      {/* Wedding validation nudge */}
      {hasWedding && !valid && (
        <motion.p
          className="text-center text-sm font-medium text-amber-600"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          Please fill in all required wedding details above to continue
        </motion.p>
      )}

      {/* Navigation */}
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
          Continue to Schedule
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </Button>
      </div>
    </motion.div>
  )
}
