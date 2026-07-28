// BAGDROP ADMIN — src/shared/phone-format.ts (ported from lib/phone-format.ts — keep in sync)
//
// Thin wrapper around libphonenumber-js (Google's phone metadata, ported to
// pure JS — no native/platform dependency, so this file is portable as-is to
// the React Native apps too) for the three things the international
// PhoneInput needs: validate a number against the selected country's real
// format, build the E.164 string to persist, and parse an already-stored
// value back into {country, national number} when opening an existing
// record for editing.

import { isValidPhoneNumber, parsePhoneNumberFromString } from 'libphonenumber-js'
import { findCountry, DEFAULT_COUNTRY_ISO2 } from './phone-countries'

export interface ParsedPhone {
  iso2:           string // ISO 3166-1 alpha-2, e.g. "IN"
  dialCode:       string // e.g. "91" (no leading +)
  nationalNumber: string // digits only, no dial code, e.g. "9876543210"
  e164:           string // "" if nationalNumber is empty, else "+<dialCode><nationalNumber>"
}

/** True only if `nationalDigits` is a real, dialable number for `iso2`. */
export function isValidPhoneForCountry(nationalDigits: string, iso2: string): boolean {
  const digits = (nationalDigits ?? '').replace(/\D/g, '')
  if (!digits || !iso2) return false
  try {
    return isValidPhoneNumber(digits, iso2.toUpperCase() as Parameters<typeof isValidPhoneNumber>[1])
  } catch {
    return false
  }
}

/** Builds the full international number to persist/send — "" if no digits yet. */
export function toE164(nationalDigits: string, iso2: string): string {
  const digits = (nationalDigits ?? '').replace(/\D/g, '')
  if (!digits) return ''
  const country = findCountry(iso2) ?? findCountry(DEFAULT_COUNTRY_ISO2)!
  return `+${country.dialCode}${digits}`
}

/**
 * Parses a phone number exactly as it's stored today — a single string,
 * almost always dial-code-prefixed (e.g. "+919876543210"), but for older
 * rows written before this feature sometimes a bare 10-digit India number
 * with no "+" at all. Use this to pre-fill PhoneInput's two controlled
 * props (countryIso2 / nationalNumber) when opening an existing
 * quote/lead/booking/customer for editing, so the right flag+dial-code
 * shows automatically instead of defaulting back to India every time.
 */
export function parseStoredPhone(stored: string | null | undefined): ParsedPhone {
  const raw = (stored ?? '').trim()
  const empty: ParsedPhone = {
    iso2: DEFAULT_COUNTRY_ISO2,
    dialCode: findCountry(DEFAULT_COUNTRY_ISO2)!.dialCode,
    nationalNumber: '',
    e164: '',
  }
  if (!raw) return empty

  try {
    const withPlus = raw.startsWith('+') ? raw : `+${raw.replace(/\D/g, '')}`
    const parsed = parsePhoneNumberFromString(withPlus)
    if (parsed?.country) {
      return {
        iso2: parsed.country,
        dialCode: parsed.countryCallingCode,
        nationalNumber: parsed.nationalNumber,
        e164: parsed.number,
      }
    }
  } catch {
    // falls through to the legacy handling below
  }

  // Legacy rows: bare digits, no "+" at all. Bagdrop only served India
  // before this feature existed, so a plain 10-digit string is assumed to
  // be an Indian mobile number that's simply missing its +91 prefix.
  const digitsOnly = raw.replace(/\D/g, '')
  if (!raw.startsWith('+') && digitsOnly.length === 10) {
    return { iso2: 'IN', dialCode: '91', nationalNumber: digitsOnly, e164: `+91${digitsOnly}` }
  }

  return { ...empty, nationalNumber: digitsOnly, e164: digitsOnly ? `+${digitsOnly}` : '' }
}
