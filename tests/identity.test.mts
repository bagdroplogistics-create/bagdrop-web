import assert from 'node:assert/strict'
import { nameMatchScore, classifyMatch, normalizeName } from '../lib/identity/name-match.ts'
import { evaluateEligibility } from '../lib/identity/eligibility.ts'

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name) }

t('identical after normalising', () => assert.equal(nameMatchScore('Mr. Mihir Amin', 'AMIN MIHIR'), 1))
t('honorific stripped', () => assert.equal(normalizeName('Dr. Asha Rao'), 'asha rao'))
t('one of two tokens → 0.5 → blocked', () => {
  const s = nameMatchScore('Mihir Amin', 'Mihir Shah')
  assert.equal(s, 0.5)
  assert.equal(classifyMatch(s), 'blocked')
})
t('2 of 3 tokens → 0.667 blocked; 3 of 4 → 0.75 confirm', () => {
  assert.equal(classifyMatch(nameMatchScore('Mihir K Amin', 'Mihir Amin Shah')), 'blocked')
  assert.equal(nameMatchScore('Mihir Kumar Amin Shah', 'Mihir Kumar Amin Joshi'), 0.75)
  assert.equal(classifyMatch(0.75), 'confirm')
})
t('middle name left out → full match (Monali Patel vs Monaliben Keyur Patel)', () => {
  assert.equal(nameMatchScore('Monali Patel', 'Monaliben Keyur Patel'), 1)
  assert.equal(classifyMatch(nameMatchScore('Ms. Monali Patel', 'MONALIBEN KEYUR PATEL')), 'pass')
  assert.equal(nameMatchScore('Mihir Kumar Amin Shah', 'Mihir Kumar Amin'), 1)
  // a single word is NOT enough, and different people still fail
  assert.ok(nameMatchScore('Monali', 'Monaliben Keyur Patel') < 0.7)
  assert.ok(nameMatchScore('Rahul Shah', 'Priya Patel') === 0)
})
t('thresholds', () => {
  assert.equal(classifyMatch(0.85), 'pass')
  assert.equal(classifyMatch(0.8499), 'confirm')
  assert.equal(classifyMatch(0.7), 'confirm')
  assert.equal(classifyMatch(0.6999), 'blocked')
})
t('empty name → 0', () => assert.equal(nameMatchScore('', 'A B'), 0))
t('real case: "Monali K Patel" vs Aadhaar "Monaliben Keyur Patel" passes', () => {
  const s = nameMatchScore('Monali K Patel', 'Monaliben Keyur Patel')
  assert.equal(s, 1); assert.equal(classifyMatch(s), 'pass')
})
t('initials, -ben/-bhai endings and Mohammed aliases', () => {
  assert.equal(nameMatchScore('Rajesh K Shah', 'Rajeshbhai Kumar Shah'), 1)
  assert.equal(nameMatchScore('Md Faisal Khan', 'Mohammed Faisal Khan'), 1)
  assert.equal(nameMatchScore('Priya Mehta', 'Priya Mehta Shah') >= 0.66, true)
})
t('different people still blocked', () => {
  assert.equal(classifyMatch(nameMatchScore('Rahul Shah', 'Priya Mehta')), 'blocked')
  assert.equal(classifyMatch(nameMatchScore('Rahul Patel', 'Ramesh Patel')), 'blocked')   // 1 of 2 words
  assert.equal(classifyMatch(nameMatchScore('Amit Shah', 'Sumit Shah')), 'blocked')
})
t('initial must really be the first letter', () => assert.equal(nameMatchScore('B Patel', 'Keyur Patel'), 0.5))
t('word order does not matter and words match only once', () => {
  assert.equal(nameMatchScore('Patel Keyur', 'Keyur Patel'), 1)
  assert.equal(nameMatchScore('Patel Patel', 'Keyur Patel') <= 0.5, true)
})

const base = {
  gateRequired: true, otpVerified: true, quoteExpiresAt: null, quoteHashMatches: true,
  routeServiceable: true, sessionConsumed: false, now: new Date('2026-10-14T00:00:00Z'),
  identity: { status: 'verified' as const, matchOutcome: 'pass' as const, spellingConfirmed: false, reviewStatus: null },
}
const reason = (o: object) => { const r = evaluateEligibility({ ...base, ...o }); return r.eligible ? 'ok' : r.reason }

t('eligible happy path', () => assert.equal(reason({}), 'ok'))
t('otp required', () => assert.equal(reason({ otpVerified: false }), 'otp_required'))
t('identity missing', () => assert.equal(reason({ identity: null }), 'identity_required'))
t('gate off ignores identity', () => assert.equal(reason({ gateRequired: false, identity: null }), 'ok'))
t('quote expired', () => assert.equal(reason({ quoteExpiresAt: '2026-10-13T00:00:00Z' }), 'quote_expired'))
t('quote changed', () => assert.equal(reason({ quoteHashMatches: false }), 'quote_changed'))
t('route unpriced', () => assert.equal(reason({ routeServiceable: false }), 'route_not_serviceable'))
t('duplicate', () => assert.equal(reason({ sessionConsumed: true }), 'already_booked'))
t('confirm band needs confirmation', () => {
  const id = { status: 'verified' as const, matchOutcome: 'confirm' as const, spellingConfirmed: false, reviewStatus: null }
  assert.equal(reason({ identity: id }), 'name_mismatch_confirm_needed')
  assert.equal(reason({ identity: { ...id, spellingConfirmed: true } }), 'ok')
})
t('blocked until approved', () => {
  const id = { status: 'verified' as const, matchOutcome: 'blocked' as const, spellingConfirmed: false, reviewStatus: null }
  assert.equal(reason({ identity: id }), 'name_mismatch_blocked')
  assert.equal(reason({ identity: { ...id, reviewStatus: 'pending' as const } }), 'identity_pending_review')
  assert.equal(reason({ identity: { ...id, reviewStatus: 'approved' as const } }), 'ok')
  assert.equal(reason({ identity: { ...id, reviewStatus: 'rejected' as const } }), 'identity_rejected')
})
t('provider failure', () => {
  assert.equal(reason({ identity: { status: 'failed', matchOutcome: null, spellingConfirmed: false, reviewStatus: null } }), 'identity_failed')
})
console.log(`${n} passed`)
