'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { ShoppingBag, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatINR } from '@/lib/pricing'
import type { PricingBreakdown } from '@/lib/booking-types'

interface PriceSummaryProps {
  pricing:     PricingBreakdown
  compact?:    boolean   // true = mobile sticky bar
  className?:  string
}

export function PriceSummary({ pricing, compact, className }: PriceSummaryProps) {
  const { bagSubtotal, multiDiscount, routeFee, serviceAdjust, addonsTotal, subtotal, gst, total, totalBags } = pricing

  if (compact) {
    // Mobile sticky bar at the bottom
    return (
      <motion.div
        className={cn(
          'flex items-center justify-between rounded-2xl border border-border bg-white px-5 py-3.5 shadow-lg',
          className
        )}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
      >
        <div>
          <p className="text-xs text-text-muted">{totalBags} bag{totalBags !== 1 ? 's' : ''} · incl. 18% GST</p>
          <AnimatePresence mode="wait">
            <motion.p
              key={total}
              className="font-display text-xl font-bold text-text-primary"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.2 }}
            >
              {formatINR(total)}
            </motion.p>
          </AnimatePresence>
        </div>
        {multiDiscount > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-success-bg px-2.5 py-1 text-xs font-semibold text-success">
            <Tag className="h-3 w-3" />
            {formatINR(multiDiscount)} saved
          </span>
        )}
      </motion.div>
    )
  }

  // Full sidebar card
  return (
    <div className={cn('rounded-2xl border border-border bg-white p-6', className)}>
      <div className="flex items-center gap-2 mb-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-light">
          <ShoppingBag className="h-4 w-4 text-brand" strokeWidth={1.75} />
        </div>
        <h3 className="font-display text-base font-semibold text-text-primary">Price Summary</h3>
      </div>

      <div className="space-y-2.5 text-sm">
        <LineItem label={`Bags (${totalBags})`} value={bagSubtotal} />

        {multiDiscount > 0 && (
          <LineItem label="Multi-bag discount" value={-multiDiscount} highlight />
        )}

        {routeFee > 0 && (
          <LineItem label="Route fee" value={routeFee} />
        )}

        {serviceAdjust !== 0 && (
          <LineItem
            label={serviceAdjust > 0 ? 'Service premium' : 'Service discount'}
            value={serviceAdjust}
            highlight={serviceAdjust < 0}
          />
        )}

        {addonsTotal > 0 && (
          <LineItem label="Add-ons" value={addonsTotal} />
        )}

        <div className="my-3 border-t border-border" />

        <LineItem label="Subtotal" value={subtotal} />
        <LineItem label="GST (18%)" value={gst} muted />

        <div className="mt-4 flex items-center justify-between rounded-xl bg-brand-light px-4 py-3">
          <span className="font-display text-sm font-bold text-text-primary">Total</span>
          <AnimatePresence mode="wait">
            <motion.span
              key={total}
              className="font-display text-xl font-bold text-brand"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.2 }}
            >
              {formatINR(total)}
            </motion.span>
          </AnimatePresence>
        </div>

        {multiDiscount > 0 && (
          <p className="text-center text-xs font-medium text-success">
            You save {formatINR(multiDiscount)} with multi-bag discount 🎉
          </p>
        )}
      </div>
    </div>
  )
}

function LineItem({
  label,
  value,
  highlight,
  muted,
}: {
  label: string
  value: number
  highlight?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn('text-text-secondary', muted && 'text-text-muted text-xs')}>
        {label}
      </span>
      <span
        className={cn(
          'font-medium tabular-nums',
          highlight ? 'text-success' : 'text-text-primary',
          muted && 'text-text-muted text-xs'
        )}
      >
        {value < 0 ? `−${formatINR(Math.abs(value))}` : formatINR(value)}
      </span>
    </div>
  )
}
