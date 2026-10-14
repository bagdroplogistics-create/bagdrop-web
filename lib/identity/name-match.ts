// BAGDROP — identity name matching.
//
// Method: the rule from the Bagdrop OS Blueprint (Identity gate → "Name match
// rule"), implemented as documented there:
//   1. normalise: lower-case, strip honorifics, drop everything except letters
//      and spaces, split into tokens and sort them (token ORDER differences
//      such as "Amin Mihir" vs "Mihir Amin" do not matter);
//   2. identical token sets → score 1
//   3. otherwise score = shared tokens / max(tokens in either name).
// Thresholds (blueprint, configurable): >= 0.85 pass, 0.70–0.85 customer
// confirms the spelling once, < 0.70 blocked and sent to manual review.
//
// This is a deterministic, auditable string-comparison score computed by
// Bagdrop — it is NOT a score returned by Setu (DigiLocker returns the name
// only). No transliteration or phonetic matching is attempted; such cases fall
// into the confirm / manual-review bands by design.
//
// No imports: runs in tests, server and browser.

export const NAME_MATCH_PASS = 0.85
export const NAME_MATCH_CONFIRM = 0.7

const HONORIFICS = /\b(mr|mrs|ms|miss|mx|dr|shri|smt|sri|kumari|prof)\b\.?/g

export function normalizeName(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(HONORIFICS, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ')
}

export function nameMatchScore(a: string, b: string): number {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const ta = na.split(' ')
  const tb = nb.split(' ')
  let hit = 0
  for (const t of ta) if (tb.includes(t)) hit++
  return hit / Math.max(ta.length, tb.length)
}

export type MatchOutcome = 'pass' | 'confirm' | 'blocked'

export function classifyMatch(
  score: number,
  thresholds: { pass: number; confirm: number } = { pass: NAME_MATCH_PASS, confirm: NAME_MATCH_CONFIRM },
): MatchOutcome {
  if (score >= thresholds.pass) return 'pass'
  if (score >= thresholds.confirm) return 'confirm'
  return 'blocked'
}
