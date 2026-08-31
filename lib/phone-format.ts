// BAGDROP — lib/phone-format.ts
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

  // Legacy rows: bare digits, no "+" at all. Bagdrop only served India
  // before this feature existed, so a plain 10-digit string is assumed to
  // be an Indian mobile number that's simply missing its +91 prefix.
  //
  // 2026-08-31 fix — this check now runs BEFORE the parsePhoneNumberFromString
  // attempt below, not after it. It used to run only as a fallback once that
  // attempt "failed", but for a bare 10-digit string that attempt very often
  // doesn't fail — it "succeeds" with a WRONG country, because prepending a
  // bare "+" to 10 raw digits with no real country code is genuinely
  // ambiguous, and libphonenumber-js will happily match the first few digits
  // against some real country's calling code even though the number isn't
  // actually valid for it. Confirmed by direct testing: a legacy Indian
  // mobile number like "9876543210" parses as Iran (+98, national
  // "76543210", isValid() === false) purely because "98" happens to be
  // Iran's calling code — and the old code only checked `parsed?.country`
  // (truthy for Iran) not `parsed.isValid()`, so it returned that bogus
  // Iran result and never reached this legacy-India branch at all. Same
  // false-positive hit Philippines (+63) and Turkey (+90) for other real
  // Indian mobile prefixes during testing. Since this bare-digit legacy
  // case is exactly what the Fast2SMS/WhatsApp send path
  // (lib/notifications.ts's buildInternationalRecipient) and the PhoneInput
  // edit-prefill path both rely on to correctly keep treating old Indian
  // rows as Indian, this had to be fixed here — checking the unambiguous
  // "no +, exactly 10 digits → assume India" rule FIRST means it can never
  // be shadowed by an accidental foreign-country match again.
  const digitsOnly = raw.replace(/\D/g, '')
  if (!raw.startsWith('+') && digitsOnly.length === 10) {
    return { iso2: 'IN', dialCode: '91', nationalNumber: digitsOnly, e164: `+91${digitsOnly}` }
  }

  try {
    const withPlus = raw.startsWith('+') ? raw : `+${digitsOnly}`
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
    // falls through to the final fallback below
  }

  return { ...empty, nationalNumber: digitsOnly, e164: digitsOnly ? `+${digitsOnly}` : '' }
}
