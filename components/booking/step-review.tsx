'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Luggage, MapPin, Calendar, Clock,
  Plane, User, Mail, Phone, MessageSquare, Send,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { COVERAGE_CITIES, SERVICE_TYPES, BAG_TYPES, ADDON_SERVICES, TIME_SLOTS } from '@/lib/constants'
import type { BookingState } from '@/lib/booking-types'
import { isStep4Valid } from '@/lib/booking-types'

interface StepReviewProps {
  state:    BookingState
  onChange: (patch: Partial<BookingState>) => void
  onBack:   () => void
  onBook:   () => void
}

export function StepReview({ state, onChange, onBack, onBook }: StepReviewProps) {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const valid = isStep4Valid(state)

  const fromCity   = COVERAGE_CITIES.find(c => c.id === state.fromCity)
  const toCity     = COVERAGE_CITIES.find(c => c.id === state.toCity)
  const service    = SERVICE_TYPES.find(s => s.id === state.serviceId)
  const timeSlot   = TIME_SLOTS.find(t => t.id === state.timeSlotId)
  const addons     = ADDON_SERVICES.filter(a => state.addonIds.includes(a.id as never))
  const activeBags = state.bags.filter(b => b.quantity > 0)

  const formattedDate = state.date
    ? new Date(state.date + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      })
    : ''

  async function handleSubmit() {
    if (!valid || loading) return
    setError(null)
    setLoading(true)
    try {
      onBook()
    } catch (err) {
      setLoading(false)
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.35, ease: 'easeOut' as const }}
      className="space-y-6"
    >
      <div>
        <h2 className="font-display text-lg font-semibold text-text-primary">Review &amp; confirm</h2>
        <p className="mt-1 text-sm text-text-muted">Fill in your details and we will get in touch to confirm your booking.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: customer form */}
        <div className="rounded-2xl border border-border bg-white p-5 space-y-4">
          <h3 className="font-display text-sm font-semibold text-text-primary">Your details</h3>
          <FormField
            id="name" label="Full name" icon={User} required
            type="text" placeholder="Priya Mehta"
            value={state.name} onChange={v => onChange({ name: v })}
          />
          <FormField
            id="email" label="Email address" icon={Mail} required
            type="email" placeholder="priya@example.com"
            value={state.email} onChange={v => onChange({ email: v })}
          />
          <FormField
            id="phone" label="Phone number" icon={Phone} required
            type="tel" placeholder="98765 43210"
            value={state.phone} onChange={v => onChange({ phone: v })}
            hint="10-digit Indian mobile number"
          />
          <FormField
            id="notes" label="Special instructions" icon={MessageSquare}
            type="textarea" placeholder="e.g. Ring doorbell twice, fragile items inside..."
            value={state.notes} onChange={v => onChange({ notes: v })}
          />
        </div>

        {/* Right: booking summary + submit */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-white p-5 space-y-3 text-sm">
            <h3 className="font-display text-sm font-semibold text-text-primary mb-1">Booking summary</h3>
            <SummaryRow icon={Luggage}  label="Service" value={service?.label ?? '—'} />
            <SummaryRow icon={MapPin}   label="Route"   value={(fromCity?.label ?? '—') + ' → ' + (toCity?.label ?? '—')} />
            <SummaryRow icon={Calendar} label="Date"    value={formattedDate || '—'} />
            <SummaryRow icon={Clock}    label="Time"    value={timeSlot ? timeSlot.label + ' (' + timeSlot.range + ')' : '—'} />
            {state.flightNumber && (
              <SummaryRow icon={Plane} label="Flight" value={state.flightNumber.toUpperCase()} />
            )}
            <div className="my-2 border-t border-border" />
            {activeBags.map(b => (
              <SummaryRow key={b.type} icon={Luggage} label={BAG_TYPES[b.type].label} value={'\xd7' + b.quantity} />
            ))}
            {addons.length > 0 && (
              <>
                <div className="my-2 border-t border-border" />
                {addons.map(a => (
                  <SummaryRow key={a.id} icon={Luggage} label={a.label} value="Added" />
                ))}
              </>
            )}
          </div>

          {error && (
            <motion.p
              className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              role="alert"
            >
              {error}
            </motion.p>
          )}

          <Button
            variant="primary"
            size="xl"
            className="w-full group"
            onClick={handleSubmit}
            disabled={!valid || loading}
            loading={loading}
          >
            {!loading && (
              <>
                <Send className="h-4 w-4" />
                Confirm Booking Request
              </>
            )}
          </Button>

          <p className="text-center text-xs text-text-muted">
            No payment required now &middot; Our team will call to confirm &middot; 100% free to request
          </p>
        </div>
      </div>

      <div className="pt-2">
        <Button variant="secondary" size="lg" onClick={onBack} className="group" disabled={loading}>
          <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
          Back to Schedule
        </Button>
      </div>
    </motion.div>
  )
}

function FormField({
  id, label, icon: Icon, type, placeholder, value, onChange, required, hint,
}: {
  id: string; label: string; icon: React.ElementType
  type: 'text' | 'email' | 'tel' | 'textarea'
  placeholder: string; value: string; onChange: (v: string) => void
  required?: boolean; hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-text-primary">
        {label}{required && <span className="ml-0.5 text-brand">*</span>}
      </label>
      <div className="relative">
        <Icon className="absolute left-3.5 top-3 h-4 w-4 text-text-muted pointer-events-none" strokeWidth={1.75} />
        {type === 'textarea' ? (
          <textarea
            id={id} value={value} onChange={e => onChange(e.target.value)}
            placeholder={placeholder} rows={3}
            className={cn('input-base pl-10 resize-none')}
          />
        ) : (
          <input
            id={id} type={type} value={value} onChange={e => onChange(e.target.value)}
            placeholder={placeholder} required={required}
            className="input-base pl-10"
          />
        )}
      </div>
      {hint && <p className="text-[11px] text-text-muted">{hint}</p>}
    </div>
  )
}

function SummaryRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-text-muted">
        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
        <span>{label}</span>
      </div>
      <span className="font-medium text-text-primary text-right">{value}</span>
    </div>
  )
}
