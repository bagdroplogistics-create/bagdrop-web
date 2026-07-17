import React, { createContext, useContext, useState, useCallback, useMemo } from 'react'
import { INITIAL_BOOKING_STATE, type BookingState } from '@/shared/booking-types'
import { calculatePrice } from '@/shared/pricing'

interface BookingContextValue {
  state: BookingState
  update: (patch: Partial<BookingState>) => void
  reset: () => void
  pricing: ReturnType<typeof calculatePrice>
}

const BookingContext = createContext<BookingContextValue | null>(null)

export function BookingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BookingState>(INITIAL_BOOKING_STATE)

  const update = useCallback((patch: Partial<BookingState>) => {
    setState(prev => ({ ...prev, ...patch }))
  }, [])

  const reset = useCallback(() => setState(INITIAL_BOOKING_STATE), [])

  const pricing = useMemo(() => calculatePrice(state), [state])

  return (
    <BookingContext.Provider value={{ state, update, reset, pricing }}>
      {children}
    </BookingContext.Provider>
  )
}

export function useBooking() {
  const ctx = useContext(BookingContext)
  if (!ctx) throw new Error('useBooking must be used within BookingProvider')
  return ctx
}
