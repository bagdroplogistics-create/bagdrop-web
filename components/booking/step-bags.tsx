'use client'

import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Minus, Plus, ArrowLeft, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { BAG_TYPES } from '@/lib/constants'
import type { BookingState, BagItem } from '@/lib/booking-types'
import { isStep2Valid } from '@/lib/booking-types'
import type { BagTypeId } from '@/lib/constants'

const BAG_ORDER: BagTypeId[] = ['cabin', 'medium', 'large', 'oversized', 'sports', 'wedding']

interface StepBagsProps {
  state:    BookingState
  onChange: (patch: Partial<BookingState>) => void
  onNext:   () => void
  onBack:   () => void
}

export function StepBags({ state, onChange, onNext, onBack }: StepBagsProps) {
  const valid = isStep2Valid(state)

  function getCount(type: BagTypeId): number {
    return state.bags.find(b => b.type === type)?.quantity ?? 0
  }

  function setCount(type: BagTypeId, delta: number) {
    const current = getCount(type)
    const next    = Math.max(0, Math.min(10, current + delta))

    const filtered = state.bags.filter(b => b.type !== type)
    const newBags: BagItem[] = next > 0
      ? [...filtered, { type, quantity: next }]
      : filtered

    onChange({ bags: newBags })
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
          Select bag types and quantity. Mix and match as needed.
        </p>
      </div>

      {/* Bag cards grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BAG_ORDER.map((typeId, i) => {
          const bag   = BAG_TYPES[typeId]
          const count = getCount(typeId)
          const selected = count > 0

          return (
            <motion.div
              key={typeId}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.4, ease: 'easeOut' as const }}
              className={cn(
                'relative flex flex-col rounded-2xl border-2 p-5 transition-all duration-200',
                selected
                  ? 'border-brand bg-brand-light shadow-brand'
                  : 'border-border bg-white hover:border-brand/30'
              )}
            >
              {/* Selected badge */}
              <AnimatePresence>
                {selected && (
                  <motion.div
                    className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  >
                    <span className="text-[10px] font-bold">{count}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* SVG illustration */}
              <div className="mb-4 flex justify-center">
                <div className="relative h-16 w-16">
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
                  'font-display text-base font-semibold',
                  selected ? 'text-brand' : 'text-text-primary'
                )}>
                  {bag.label}
                </h3>
                <p className="mt-0.5 text-sm text-text-muted">{bag.maxWeight}</p>
              </div>

              {/* Quantity stepper */}
              <div className="mt-4 flex items-center justify-center gap-3">
                <button
                  onClick={() => setCount(typeId, -1)}
                  disabled={count === 0}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border transition-colors',
                    count > 0
                      ? 'border-brand text-brand hover:bg-brand hover:text-white'
                      : 'border-border text-text-muted opacity-40 cursor-not-allowed'
                  )}
                  aria-label={"Remove one " + bag.label}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>

                <AnimatePresence mode="wait">
                  <motion.span
                    key={count}
                    className="w-6 text-center font-display text-lg font-bold text-text-primary tabular-nums"
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
                  disabled={count >= 10}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-brand text-brand transition-colors hover:bg-brand hover:text-white"
                  aria-label={"Add one " + bag.label}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Dimensions */}
              <p className="mt-3 text-center text-xs text-text-muted">{bag.dimensions}</p>
            </motion.div>
          )
        })}
      </div>

      {/* Multi-bag hint */}
      {totalBags >= 2 && (
        <motion.p
          className="text-center text-sm font-medium text-success"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          Multi-bag booking — our team will confirm the best rate for {totalBags} bags
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
