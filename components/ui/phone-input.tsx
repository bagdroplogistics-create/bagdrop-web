'use client'

// BAGDROP — components/ui/phone-input.tsx
//
// International phone number field: searchable country selector (flag +
// name + dial code, Bagdrop's top inquiry countries pinned above the
// alphabetical full list) + a national-number input, with per-country
// format validation via libphonenumber-js. Replaces every hand-rolled
// "<select> + <input type=tel>" pair across the admin panel and public
// booking flow — see lib/phone-format.ts for the validate/parse helpers
// this pairs with.
//
// Controlled as TWO separate props (countryIso2 / nationalNumber) rather
// than one combined value, matching how every call site already tracked
// country code and phone digits as separate form-state fields before this
// component existed (e.g. LeadForm.countryCode + LeadForm.phone) — this
// keeps the integration a near drop-in swap instead of a state-shape
// rewrite, and naturally supports storing country code and number
// separately in the DB. Call toE164() from lib/phone-format.ts at submit
// time to build the full string for the existing single-column DB fields.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ALL_COUNTRIES,
  PREFERRED_COUNTRIES,
  DEFAULT_COUNTRY_ISO2,
  findCountry,
  type CountryDialCode,
} from '@/lib/phone-countries'
import { isValidPhoneForCountry } from '@/lib/phone-format'

export interface PhoneInputProps {
  countryIso2:      string
  nationalNumber:   string
  onCountryChange:  (iso2: string) => void
  onNumberChange:   (digits: string) => void
  id?:              string
  required?:        boolean
  disabled?:        boolean
  placeholder?:     string
  className?:       string
  /** Show the red-border + helper-text validation state. Default true. */
  showValidation?:  boolean
  /**
   * 'admin' (default) matches the admin dashboard's plain gray/orange form
   * style. 'public' matches the marketing/booking-flow design system
   * (input-base / border-border / bg-cream / text-brand tokens from
   * app/globals.css) — use this on any customer-facing page.
   */
  variant?:         'admin' | 'public'
}

export function PhoneInput({
  countryIso2,
  nationalNumber,
  onCountryChange,
  onNumberChange,
  id,
  required,
  disabled,
  placeholder,
  className,
  showValidation = true,
  variant = 'admin',
}: PhoneInputProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const country: CountryDialCode =
    findCountry(countryIso2) ?? findCountry(DEFAULT_COUNTRY_ISO2)!

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // Focus the search box the moment the dropdown opens
  useEffect(() => {
    if (open) {
      setSearch('')
      const raf = requestAnimationFrame(() => searchRef.current?.focus())
      return () => cancelAnimationFrame(raf)
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) {
      const preferred = PREFERRED_COUNTRIES.map(iso => findCountry(iso)).filter(
        (c): c is CountryDialCode => !!c
      )
      const rest = ALL_COUNTRIES.filter(c => !PREFERRED_COUNTRIES.includes(c.iso2))
      return { preferredCount: preferred.length, list: [...preferred, ...rest] }
    }
    const list = ALL_COUNTRIES.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        c.dialCode.includes(q.replace('+', '')) ||
        c.iso2.toLowerCase() === q
    )
    return { preferredCount: 0, list }
  }, [search])

  const digitsEntered = nationalNumber.trim().length > 0
  const invalid = showValidation && digitsEntered && !isValidPhoneForCountry(nationalNumber, countryIso2)
  const isPublic = variant === 'public'

  return (
    <div className={cn('w-full', className)}>
      <div ref={wrapRef} className="relative flex gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(o => !o)}
          className={cn(
            'flex shrink-0 items-center gap-1 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
            isPublic
              ? 'h-12 rounded-lg border border-border-strong bg-white px-2.5 text-sm text-text-secondary hover:bg-cream focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20'
              : 'rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-600 hover:bg-gray-100 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400'
          )}
          aria-label="Select country calling code"
          aria-expanded={open}
        >
          <span className="text-base leading-none">{country.flag}</span>
          <span>+{country.dialCode}</span>
          <ChevronDown className={cn('text-gray-400', isPublic ? 'h-3.5 w-3.5' : 'h-3 w-3')} />
        </button>

        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          required={required}
          disabled={disabled}
          value={nationalNumber}
          onChange={e => onNumberChange(e.target.value.replace(/[^\d]/g, ''))}
          placeholder={placeholder ?? 'Phone number'}
          className={cn(
            isPublic ? 'flex-1 h-12 rounded-lg border px-4 text-base focus:outline-none focus:ring-2' : 'flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1',
            invalid
              ? (isPublic ? 'border-red-300 focus:border-red-400 focus:ring-red-400/20' : 'border-red-300 focus:border-red-400 focus:ring-red-400')
              : (isPublic ? 'border-border-strong bg-white text-text-primary placeholder:text-text-muted focus:border-brand focus:ring-brand/20' : 'border-gray-200 focus:border-orange-400 focus:ring-orange-400')
          )}
        />

        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 max-h-80 w-72 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="border-b border-gray-100 p-2">
              <div className="flex items-center gap-1.5 rounded-md border border-gray-200 px-2 py-1.5">
                <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search country or code"
                  className="w-full text-xs text-gray-700 outline-none"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {filtered.list.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-gray-400">No countries match</p>
              )}
              {filtered.list.map((c, idx) => (
                <div key={c.iso2}>
                  {idx === filtered.preferredCount && idx > 0 && (
                    <div className="my-1 border-t border-gray-100" />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onCountryChange(c.iso2)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-orange-50',
                      c.iso2 === country.iso2 && 'bg-orange-50 font-semibold text-orange-600'
                    )}
                  >
                    <span className="text-base leading-none">{c.flag}</span>
                    <span className="flex-1 truncate text-gray-700">{c.name}</span>
                    <span className="text-gray-400">+{c.dialCode}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {invalid && (
        <p className="mt-1 text-xs text-red-500">
          Enter a valid {country.name} phone number
        </p>
      )}
    </div>
  )
}
