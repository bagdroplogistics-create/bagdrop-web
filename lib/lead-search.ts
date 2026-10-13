// BAGDROP — lib/lead-search.ts
//
// Pure helpers for the Leads search (GET /api/admin/leads). Kept free of any
// Supabase/Next imports so they can be unit-tested in isolation.
//
// Why this exists: the old search built a PostgREST `.or()` string by
// pasting the raw search text into it. A comma, bracket or quote in the text
// (e.g. "Patel, Sachin" or "A/C (new)") silently broke the whole filter, only
// name/phone/email/inquiry-no. were searched (no quote no., route or
// addresses), tracking IDs were only resolved when the text started with
// "BDA", and phone numbers only matched when typed in exactly the stored
// format.

/** Collapse whitespace, trim. */
export function normalizeSearch(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim()
}

/** True for things like "+91 98765 43210", "98765-43210", "(022) 1234567". */
export function looksLikePhone(s: string): boolean {
  return /^[+\d\s\-().]+$/.test(s) && s.replace(/\D/g, '').length >= 4
}

export function digitsOnly(s: string): string {
  return s.replace(/\D/g, '')
}

/**
 * Split into AND-ed tokens ("sachin patel" matches "Sachin R Patel").
 * A phone-looking query stays a single token so "98765 43210" isn't split.
 * At most 5 tokens, each at least 1 char.
 */
export function tokenizeSearch(raw: string | null | undefined): string[] {
  const s = normalizeSearch(raw)
  if (!s) return []
  if (looksLikePhone(s)) return [s]
  return s.split(' ').filter(Boolean).slice(0, 5)
}

/**
 * Make a value safe to embed inside a PostgREST `or=(col.ilike.<value>,…)`
 * filter: LIKE wildcards typed by the user are escaped (so "50%" is searched
 * literally), then the whole pattern is double-quoted so commas, dots and
 * parentheses cannot terminate the clause.
 */
export function ilikeValue(term: string): string {
  const escapedLike = term.replace(/[\\%_]/g, m => '\\' + m)
  const quoted = escapedLike.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"%${quoted}%"`
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Text columns on `leads` searched for every token. */
export const LEAD_SEARCH_COLUMNS = [
  'name', 'phone', 'email',
  'lead_number',                       // Inquiry ID
  'quote_number', 'return_quote_number', 'zoho_estimate_number',  // Quote IDs
  'from_city', 'to_city', 'pickup_address', 'drop_address',       // Route / locations
] as const

/**
 * PostgREST `or` expression body for one token.
 * @param extraLeadIds   lead ids resolved elsewhere (phone-format-insensitive match)
 * @param bookingIds     booking ids whose tracking_id matched the token
 */
export function buildTokenOr(
  token: string,
  extraLeadIds: string[] = [],
  bookingIds: string[] = [],
): string {
  const v = ilikeValue(token)
  const parts: string[] = LEAD_SEARCH_COLUMNS.map(c => `${c}.ilike.${v}`)
  if (UUID_RE.test(token)) {
    parts.push(`id.eq.${token}`, `booking_id.eq.${token}`)
  }
  if (extraLeadIds.length > 0) parts.push(`id.in.(${extraLeadIds.join(',')})`)
  if (bookingIds.length > 0)   parts.push(`booking_id.in.(${bookingIds.join(',')})`)
  return parts.join(',')
}

/**
 * Format-insensitive phone match, done in JS over (id, phone) rows so
 * "+91 98765-43210", "9876543210" and "919876543210" all find each other.
 * Compares the last 10 digits when the query is long enough (ignores country
 * code differences), otherwise plain digit substring.
 */
export function phoneMatches(storedPhone: string | null | undefined, queryDigits: string): boolean {
  const stored = digitsOnly(storedPhone ?? '')
  if (!stored || queryDigits.length < 4) return false
  if (queryDigits.length >= 10) return stored.endsWith(queryDigits.slice(-10)) || stored.includes(queryDigits)
  return stored.includes(queryDigits)
}
