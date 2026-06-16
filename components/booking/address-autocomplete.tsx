'use client'

import { useEffect, useRef } from 'react'
import { MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AddressAutocompleteProps {
  id:           string
  label:        string
  value:        string
  onChange:     (value: string) => void
  placeholder?: string
  error?:       string
  required?:    boolean
  className?:   string
}

/**
 * Address input with Google Maps Places Autocomplete.
 * Falls back to a plain text input if the Maps API is not loaded
 * (e.g., missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY).
 *
 * The Maps script is loaded in app/(booking)/layout.tsx.
 */
export function AddressAutocomplete({
  id,
  label,
  value,
  onChange,
  placeholder = 'Enter full address',
  error,
  required,
  className,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autocompleteRef = useRef<any>(null)

  useEffect(() => {
    let attempts = 0
    const maxAttempts = 20
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any

    const init = () => {
      if (
        typeof window === 'undefined' ||
        !win.google?.maps?.places ||
        !inputRef.current
      ) {
        attempts++
        if (attempts < maxAttempts) setTimeout(init, 500)
        return
      }

      const ac = new win.google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'in' },
        fields: ['formatted_address', 'geometry'],
        types: ['address'],
      })

      ac.addListener('place_changed', () => {
        const place = ac.getPlace()
        if (place.formatted_address) onChange(place.formatted_address)
      })

      autocompleteRef.current = ac
    }

    init()

    return () => {
      if (autocompleteRef.current) {
        win.google?.maps?.event?.clearInstanceListeners(autocompleteRef.current)
      }
    }
  }, [onChange])

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-text-primary">
        {label}
        {required && <span className="ml-0.5 text-brand">*</span>}
      </label>

      <div className="relative">
        <MapPin
          className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted pointer-events-none"
          strokeWidth={1.75}
        />
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          aria-required={required}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(
            'input-base pl-10',
            error && 'border-red-400 focus:border-red-400 focus:ring-red-400/20'
          )}
          autoComplete="off"
        />
      </div>

      {error && (
        <p id={`${id}-error`} className="text-xs text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
