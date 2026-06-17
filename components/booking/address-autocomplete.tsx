'use client'

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
 * Plain address text input.
 * No external API dependency — works without any API key.
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
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-base font-medium text-text-primary">
        {label}
        {required && <span className="ml-0.5 text-brand">*</span>}
      </label>

      <div className="relative">
        <MapPin
          className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted pointer-events-none"
          strokeWidth={1.75}
        />
        <input
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
