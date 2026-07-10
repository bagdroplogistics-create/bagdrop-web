'use client'

import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const STEPS = [
  { n: 1, label: 'Route' },
  { n: 2, label: 'Bags' },
  { n: 3, label: 'Schedule' },
  { n: 4, label: 'Review' },
]

interface StepIndicatorProps {
  current: number // 1-4
}

export function StepIndicator({ current }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-0" role="list" aria-label="Booking steps">
      {STEPS.map((step, i) => {
        const done   = step.n < current
        const active = step.n === current

        return (
          <div key={step.n} className="flex items-center" role="listitem">
            {/* Step circle */}
            <div className="flex flex-col items-center gap-1.5">
              <motion.div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full text-base font-bold transition-colors duration-300',
                  done   && 'bg-brand text-white',
                  active && 'bg-brand text-white ring-4 ring-brand/20',
                  !done && !active && 'bg-border text-text-muted'
                )}
                animate={active ? { scale: [1, 1.08, 1] } : {}}
                transition={{ duration: 0.3 }}
              >
                {done ? (
                  <Check className="h-4 w-4" strokeWidth={3} />
                ) : (
                  step.n
                )}
              </motion.div>
              <span
                className={cn(
                  'text-base font-medium hidden sm:block',
                  active ? 'text-brand' : done ? 'text-text-secondary' : 'text-text-muted'
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div className="relative mx-2 h-px w-12 sm:w-20 bg-border overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-brand"
                  initial={{ width: '0%' }}
                  animate={{ width: done ? '100%' : '0%' }}
                  transition={{ duration: 0.4, ease: 'easeInOut' }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
