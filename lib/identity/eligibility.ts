// BAGDROP — booking eligibility (pure function, no I/O).
//
// The server loads facts from the database and calls this; the browser never
// decides. Every rule returns a machine-readable reason.
//
// Rules (Blueprint "payment unlocks only when"):
//   1. contact OTP verified
//   2. identity verified by provider (when the gate is required)
//   3. name: pass, or confirmed by customer (0.70–0.85), or approved on manual review
//   4. quote not expired and unchanged since issued
//   5. route serviceable / priced (no placeholder price)
//   6. session not already consumed (no duplicate booking)

export type IdentityFacts = {
  status: 'created' | 'verified' | 'failed' | 'expired'
  matchOutcome: 'pass' | 'confirm' | 'blocked' | null
  spellingConfirmed: boolean
  reviewStatus: 'pending' | 'approved' | 'rejected' | null
} | null

export type EligibilityInput = {
  gateRequired: boolean
  otpVerified: boolean
  identity: IdentityFacts
  quoteExpiresAt: string | null
  quoteHashMatches: boolean
  routeServiceable: boolean
  sessionConsumed: boolean
  now: Date
}

export type EligibilityReason =
  | 'otp_required' | 'identity_required' | 'identity_failed' | 'identity_pending_review'
  | 'identity_rejected' | 'name_mismatch_confirm_needed' | 'name_mismatch_blocked'
  | 'quote_expired' | 'quote_changed' | 'route_not_serviceable' | 'already_booked'

export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: EligibilityReason; message: string }

const MSG: Record<EligibilityReason, string> = {
  otp_required: 'Please verify your mobile number first.',
  identity_required: 'Please verify your identity to continue.',
  identity_failed: 'Identity verification did not complete. Please try again.',
  identity_pending_review: 'Your name needs a quick manual check. We will contact you shortly.',
  identity_rejected: 'We could not verify your identity for this booking. Please contact support.',
  name_mismatch_confirm_needed: 'The verified name is close to the booking name. Please confirm the spelling.',
  name_mismatch_blocked: 'The verified name does not match the booking name. It has been sent for review.',
  quote_expired: 'Your quote has expired. Please refresh it to continue.',
  quote_changed: 'The booking details changed after the quote. Please refresh the quote.',
  route_not_serviceable: 'This route has no confirmed price yet. Our team will contact you with a quote.',
  already_booked: 'A booking has already been created from this session.',
}

const no = (reason: EligibilityReason): EligibilityResult => ({ eligible: false, reason, message: MSG[reason] })

export function evaluateEligibility(i: EligibilityInput): EligibilityResult {
  if (i.sessionConsumed) return no('already_booked')
  if (!i.otpVerified) return no('otp_required')
  if (i.quoteExpiresAt && new Date(i.quoteExpiresAt).getTime() <= i.now.getTime()) return no('quote_expired')
  if (!i.quoteHashMatches) return no('quote_changed')
  if (!i.routeServiceable) return no('route_not_serviceable')

  if (i.gateRequired) {
    const id = i.identity
    if (!id) return no('identity_required')
    if (id.status !== 'verified') {
      return no(id.status === 'failed' || id.status === 'expired' ? 'identity_failed' : 'identity_required')
    }
    if (id.reviewStatus === 'approved') return { eligible: true }
    if (id.reviewStatus === 'rejected') return no('identity_rejected')
    if (id.reviewStatus === 'pending') return no('identity_pending_review')
    if (id.matchOutcome === 'pass') return { eligible: true }
    if (id.matchOutcome === 'confirm') {
      return id.spellingConfirmed ? { eligible: true } : no('name_mismatch_confirm_needed')
    }
    return no('name_mismatch_blocked')
  }
  return { eligible: true }
}
