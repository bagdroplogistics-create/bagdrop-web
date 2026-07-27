// BAGDROP — lib/indemnity-notifications.ts
//
// Shared helpers for the Indemnity Bond flow: secure token generation, the
// configurable link-expiry lookup, and the (additive) Fast2SMS WhatsApp
// sends for each customer-facing event. Modeled directly on
// lib/lifecycle-notifications.ts — same "never throws, logs either way"
// contract, same env-var-gated additive pattern so nothing breaks before
// the new WhatsApp templates are submitted/approved on Meta.
//
// WhatsApp templates still need to be drafted and submitted to Fast2SMS for
// Meta approval (24-48h, same as every other template this project uses) —
// until the matching FAST2SMS_*_MESSAGE_ID env var is set, these calls
// silently no-op. Email (lib/email.ts) works today via Resend.

import crypto from 'crypto'
import { supabaseAdmin } from './supabase'
import { sendWhatsAppTemplateFast2SMS } from './notifications'

const DEFAULT_EXPIRY_DAYS = 7

/** Cryptographically random, URL-safe token for the public signing link. */
export function generateSecureToken(): string {
  return crypto.randomBytes(24).toString('base64url')
}

/**
 * Configurable via Admin Settings → settings table (key
 * 'indemnity_link_expiry_days'), so ops can change it without a deploy.
 * Falls back to 7 days if the row is missing.
 */
export async function getIndemnityExpiryDays(): Promise<number> {
  const { data } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'indemnity_link_expiry_days')
    .maybeSingle()
  const parsed = parseInt(data?.value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EXPIRY_DAYS
}

interface WhatsAppTarget {
  customerPhone: string | null
  customerName:  string | null
  trackingId:    string
}

const ENV_VAR_BY_EVENT: Record<string, string> = {
  bond_sent:              'FAST2SMS_INDEMNITY_BOND_SENT_MESSAGE_ID',
  otp_verified:           'FAST2SMS_INDEMNITY_OTP_VERIFIED_MESSAGE_ID',
  documents_submitted:    'FAST2SMS_INDEMNITY_SUBMITTED_MESSAGE_ID',
  documents_approved:     'FAST2SMS_INDEMNITY_APPROVED_MESSAGE_ID',
  resubmission_requested: 'FAST2SMS_INDEMNITY_RESUBMIT_MESSAGE_ID',
}

/**
 * Fires the WhatsApp template for an indemnity-bond lifecycle event, if a
 * template is mapped and approved. No-ops silently otherwise — see the
 * module doc comment. `variables` must already be in the exact positional
 * order the approved template expects.
 */
export async function sendIndemnityWhatsApp(
  event: keyof typeof ENV_VAR_BY_EVENT,
  target: WhatsAppTarget,
  variables: string[],
): Promise<void> {
  try {
    const envVar = ENV_VAR_BY_EVENT[event]
    const templateId = envVar ? process.env[envVar] : undefined
    if (!templateId) {
      console.log(`[IndemnityWhatsApp] Booking ${target.trackingId} — skipped (${event}): template not configured (${envVar})`)
      return
    }
    if (!target.customerPhone) {
      console.log(`[IndemnityWhatsApp] Booking ${target.trackingId} — skipped (${event}): no phone on file`)
      return
    }
    const result = await sendWhatsAppTemplateFast2SMS(target.customerPhone, templateId, variables)
    console.log(`[IndemnityWhatsApp] Booking ${target.trackingId} — ${event} ` +
      (result.success ? `sent — request_id ${result.requestId ?? '—'}` : `failed — ${result.error}`))
  } catch (err) {
    console.error('[IndemnityWhatsApp] Unexpected error (non-fatal):', err)
  }
}
