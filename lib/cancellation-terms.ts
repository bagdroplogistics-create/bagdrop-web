// BAGDROP — lib/cancellation-terms.ts
//
// Single source of truth for the cancellation line in the quotation Terms & Conditions
// (print page, quote view page, downloadable PDF, emailed PDF, New Quote default text).
//
// Wording changed 2026-11-21 (founder): the old blanket "All Destinations: Cancellations must be
// made at least 7 days before the scheduled pick-up time…" is replaced by the sentence below.
// Quotes already saved with the old sentence keep their stored text in the database, but are
// shown with the new wording through normalizeCancelTerm() so every quote reads the same.

export const CANCEL_TERM_TEXT =
  'For all routes other than Mumbai to Vadodara, the customer must cancel the inquiry at least 7 days before the pickup date to be eligible for a full refund.'

// The two phrases that are shown in bold.
export const CANCEL_BOLD_PHRASES = ['Mumbai to Vadodara', '7 days before the pickup date'] as const

const LEGACY_CANCEL_RE =
  /All Destinations:\s*Cancellations must be made at least 7 days before the scheduled pick-?up time to receive a full refund\.?/gi

/** Swaps the old cancellation sentence for the new one; every other line is returned unchanged. */
export function normalizeCancelTerm(text: string): string {
  return text.replace(LEGACY_CANCEL_RE, CANCEL_TERM_TEXT)
}

/** True for the cancellation-policy line (old or new wording) — it gets the highlighted box. */
export function isCancelTerm(text: string): boolean {
  return /cancel the inquiry at least|cancellations? must be made/i.test(text)
}

/** Splits a term into plain / bold parts. Only the cancellation line has any bold parts. */
export function boldParts(text: string): { text: string; bold: boolean }[] {
  if (!isCancelTerm(text)) return [{ text, bold: false }]
  const re = new RegExp(`(${CANCEL_BOLD_PHRASES.join('|')})`)
  return text
    .split(re)
    .filter(Boolean)
    .map(part => ({ text: part, bold: (CANCEL_BOLD_PHRASES as readonly string[]).includes(part) }))
}
