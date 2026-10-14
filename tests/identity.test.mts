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
  assert.equal(nameMatchScore('Mihir Kumar Amin Shah', 'Mihir Kumar Amin'), 0.75)
  assert.equal(classifyMatch(0.75), 'confirm')
})
t('thresholds', () => {
  assert.equal(classifyMatch(0.85), 'pass')
  assert.equal(classifyMatch(0.8499), 'confirm')
  assert.equal(classifyMatch(0.7), 'confirm')
  assert.equal(classifyMatch(0.6999), 'blocked')
})
t('empty name → 0', () => assert.equal(nameMatchScore('', 'A B'), 0))

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
