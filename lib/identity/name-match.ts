// BAGDROP — identity name matching.
//
// Method (documented, deterministic, computed by Bagdrop — NOT a score from Setu):
//   1. normalise: lower-case, strip honorifics (mr, mrs, dr, shri…), drop everything except
//      letters and spaces, split into name words;
//   2. two words MATCH when any of these is true (common Indian naming differences):
//        a. identical                                   "patel"   = "patel"
//        b. one is an INITIAL of the other              "k"       ~ "keyur"
//        c. same word apart from a respectful ending     "monali"  ~ "monaliben"
//           (ben, bhai, bai, devi — only if >= 3 letters remain)
//        d. known abbreviation / spelling group          "md" = "mohd" = "mohammed" = "muhammad"
//   3. score = matched words / the larger number of words in either name (order does not matter;
//      each word can be matched once). Identical normalised names score 1.
// Thresholds (configurable): >= 0.85 pass · 0.70–0.85 customer confirms once · < 0.70 manual review.
//
// No imports: runs in tests, server and browser.

export const NAME_MATCH_PASS = 0.85
export const NAME_MATCH_CONFIRM = 0.7

const HONORIFICS = /\b(mr|mrs|ms|miss|mx|dr|shri|smt|sri|kumari|prof)\b\.?/g
const RESPECT_SUFFIXES = ['ben', 'bhai', 'bai', 'devi']
const ALIASES: string[][] = [['md', 'mohd', 'mohammed', 'mohammad', 'muhammad', 'mohamed', 'mohamad']]

/** Lower-case, strip honorifics/punctuation, sort words. Used for exact-equality checks. */
export function normalizeName(s: string): string {
  return nameWords(s).sort().join(' ')
}

function nameWords(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .replace(HONORIFICS, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function stem(w: string): string {
  for (const suf of RESPECT_SUFFIXES) {
    if (w.length - suf.length >= 3 && w.endsWith(suf)) return w.slice(0, -suf.length)
  }
  return w
}

export function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length === 1 || b.length === 1) {               // initial
    const [i, f] = a.length === 1 ? [a, b] : [b, a]
    return f.startsWith(i)
  }
  if (stem(a) === stem(b)) return true                   // Monali ~ Monaliben
  return ALIASES.some(g => g.includes(a) && g.includes(b))
}

export function nameMatchScore(a: string, b: string): number {
  const ta = nameWords(a)
  const tb = nameWords(b)
  if (!ta.length || !tb.length) return 0
  if (normalizeName(a) === normalizeName(b)) return 1
  const used = new Set<number>()
  let hit = 0
  for (const w of ta) {
    const j = tb.findIndex((x, k) => !used.has(k) && wordsMatch(w, x))
    if (j >= 0) { used.add(j); hit++ }
  }
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
