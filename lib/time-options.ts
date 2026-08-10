/**
 * Shared time options — 06:00 AM to 05:30 AM in 30-minute steps (12-hour AM/PM).
 * Order: 06:00 AM … 11:30 PM → 12:00 AM … 05:30 AM
 * value = 24-hour string stored in DB ("06:00", "13:30", etc.)
 * label = 12-hour display string ("06:00 AM", "01:30 PM", etc.)
 *
 * Used across the booking form, admin leads form, and quote form.
 */

function to12h(h24: number, m: number): string {
  const period = h24 < 12 ? 'AM' : 'PM'
  const h12    = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24
  return `${String(h12).padStart(2, '0')}:${m === 0 ? '00' : '30'} ${period}`
}

// Build slots in the requested order: 06:00 → 23:30, then 00:00 → 05:30
const morning:    [number, number][] = Array.from({ length: 36 }, (_, i) => [Math.floor((i + 12) / 2), (i + 12) % 2 === 0 ? 0 : 30] as [number, number])
const earlyMorn:  [number, number][] = Array.from({ length: 12 }, (_, i) => [Math.floor(i / 2),         i % 2 === 0 ? 0 : 30]         as [number, number])

export interface TimeOption { value: string; label: string }

export const TIME_OPTIONS: TimeOption[] = [...morning, ...earlyMorn].map(([h, m]) => ({
  value: `${String(h).padStart(2, '0')}:${m === 0 ? '00' : '30'}`,
  label: to12h(h, m),
}))

// Formats a stored pickup/delivery time value for display anywhere in the
// app (Quote PDF, Quote View preview, etc.). Handles every shape this
// column has actually held: the normal 24-hour "HH:MM" (and "HH:MM:SS")
// this form saves via TIME_OPTIONS' value, and an already-12-hour
// "HH:MM AM/PM" string (e.g. an older row) passed straight through
// unchanged. Returns '' for null/empty/unparseable input rather than
// throwing, so callers can safely do `{fmtTimeLabel(x) || null}`-style
// conditionals. Converts the exact minute value (not just :00/:30, unlike
// to12h above) so it's safe for any stored time, not just TIME_OPTIONS slots.
export function fmtTimeLabel(t: string | null | undefined): string {
  if (!t) return ''
  const trimmed = t.trim()
  if (/am|pm/i.test(trimmed)) return trimmed.toUpperCase()
  const m = trimmed.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return trimmed
  const h24 = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (Number.isNaN(h24) || Number.isNaN(min) || h24 > 23 || min > 59) return trimmed
  const period = h24 < 12 ? 'AM' : 'PM'
  const h12    = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24
  return `${String(h12).padStart(2, '0')}:${String(min).padStart(2, '0')} ${period}`
}
