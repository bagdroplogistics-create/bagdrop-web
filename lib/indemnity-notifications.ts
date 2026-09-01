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
import { sendWhatsAppTemplateFast2SMSv2 } from './notifications'

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

type IndemnityEvent =
  | 'bond_sent'
  | 'otp_verified'
  | 'documents_submitted'
  | 'documents_approved'
  | 'resubmission_requested'

// Maps each event to its approved Fast2SMS/Meta template NAME. Migrated
// 2026-09-01 off the env-var → numeric Message ID indirection (see
// sendWhatsAppTemplateFast2SMSv2's module comment in lib/notifications.ts)
// — hardcoded rather than re-routed through new env vars, matching
// lib/lifecycle-notifications.ts's TEMPLATE_BY_STATUS. Every name below
// confirmed Approved against the account's live template list
// (GET /dev/dlt_manager/whatsapp?type=template) on 2026-09-01.
//
// otp_verified is deliberately left unmapped — no template for it exists
// in the Fast2SMS account at all yet (not just unapproved), so this
// preserves the exact same silent no-op this event has always had.
const TEMPLATE_BY_EVENT: Partial<Record<IndemnityEvent, string>> = {
  bond_sent:              'indemnity_bond_sent',
  documents_submitted:    'documents_submitted',
  documents_approved:     'documents_approved',
  resubmission_requested: 'documents_resubmission',
}

/**
 * Fires the WhatsApp template for an indemnity-bond lifecycle event, if a
 * template is mapped and approved. No-ops silently otherwise — see the
 * module doc comment. `variables` must already be in the exact positional
 * order the approved template expects.
 */
export async function sendIndemnityWhatsApp(
  event: IndemnityEvent,
  target: WhatsAppTarget,
  variables: string[],
): Promise<void> {
  try {
    const templateName = TEMPLATE_BY_EVENT[event]
    if (!templateName) {
      console.log(`[IndemnityWhatsApp] Booking ${target.trackingId} — skipped (${event}): template not configured`)
      return
    }
    if (!target.customerPhone) {
      console.log(`[IndemnityWhatsApp] Booking ${target.trackingId} — skipped (${event}): no phone on file`)
      return
    }
    const result = await sendWhatsAppTemplateFast2SMSv2(target.customerPhone, templateName, variables)
    console.log(`[IndemnityWhatsApp] Booking ${target.trackingId} — ${event} ` +
      (result.success ? `sent — request_id ${result.requestId ?? '—'}` : `failed — ${result.error}`))
  } catch (err) {
    console.error('[IndemnityWhatsApp] Unexpected error (non-fatal):', err)
  }
}
