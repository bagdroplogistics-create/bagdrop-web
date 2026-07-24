// BAGDROP — lib/lead-acknowledgment.ts
//
// Automatic customer acknowledgment for every inquiry, regardless of source.
// Call sendLeadAcknowledgment(lead) once, immediately after a lead row is
// successfully inserted into Supabase — from any of:
//   - app/api/bookings/route.ts        (website + mobile app booking forms)
//   - app/api/contact/route.ts         (website contact form)
//   - app/api/admin/leads/route.ts     (admin manual creation, admin mobile
//                                        app, partner dashboards / API
//                                        integrations authenticated with an
//                                        admin/staff key)
//
// Any future inquiry source should create its lead through one of the
// routes above (or call this function directly right after its own insert)
// to stay covered automatically — this file is the single choke point.
//
// Responsibilities:
//   1. Guarantee the acknowledgment is sent AT MOST ONCE per lead, even
//      under concurrent/duplicate calls (e.g. a client retry) — enforced
//      with an atomic "claim" UPDATE against acknowledgment_sent_at, not
//      just an in-memory check.
//   2. Send via every channel that has both (a) the required credentials
//      configured and (b) the customer's contact detail on file.
//   3. Append one entry per channel attempted to leads.communication_log —
//      { channel, status, timestamp, detail } — regardless of outcome, so
//      failures are visible too, not just successes.
//
// Requires supabase/migrations/20260724_lead_acknowledgment.sql to have
// been run (adds acknowledgment_sent_at + communication_log to leads).

import { supabaseAdmin } from './supabase'
import { sendInquiryAcknowledgmentEmail } from './email'
import { sendWhatsAppTemplateFast2SMS } from './notifications'

export interface AcknowledgeableLead {
  id:     string
  name:   string
  phone?: string | null
  email?: string | null
}

interface CommunicationLogEntry {
  type:      'acknowledgment'
  channel:   'email' | 'whatsapp'
  status:    'sent' | 'failed' | 'skipped'
  timestamp: string
  detail:    string | null
}

/**
 * Sends the "Thank You for Your Inquiry" acknowledgment to a newly-created
 * lead over every configured channel, and logs the outcome. Safe to call
 * unconditionally right after any lead insert — it no-ops (without error)
 * if an acknowledgment was already sent for this lead.
 *
 * Never throws — all failures are caught, logged, and recorded in
 * communication_log so the parent request (booking/contact/lead creation)
 * is never affected by a notification failure.
 */
export async function sendLeadAcknowledgment(lead: AcknowledgeableLead): Promise<void> {
  if (!lead?.id) return

  try {
    // ── Atomic claim ────────────────────────────────────────────────
    // Only proceeds if acknowledgment_sent_at is still NULL, and sets it
    // in the same statement. This is what actually prevents duplicate
    // sends (a simple "check then send" is vulnerable to races between
    // concurrent requests / client retries) — the database is the lock.
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from('leads')
      .update({ acknowledgment_sent_at: new Date().toISOString() })
      .eq('id', lead.id)
      .is('acknowledgment_sent_at', null)
      .select('id, communication_log')
      .maybeSingle()

    if (claimErr) {
      // Column may not exist yet if the migration hasn't been run.
      console.error('[LeadAck] Claim failed (migration 20260724_lead_acknowledgment.sql run?):', claimErr.message)
      return
    }
    if (!claimed) {
      // Either already acknowledged, or the lead id doesn't exist — no-op.
      return
    }

    const existingLog = Array.isArray(claimed.communication_log) ? claimed.communication_log : []
    const newEntries: CommunicationLogEntry[] = []

    const name = lead.name?.trim() || 'Customer'

    // ── Email ───────────────────────────────────────────────────────
    if (lead.email) {
      const result = await sendInquiryAcknowledgmentEmail({ customerName: name, customerEmail: lead.email })
      newEntries.push({
        type:      'acknowledgment',
        channel:   'email',
        status:    result.success ? 'sent' : 'failed',
        timestamp: new Date().toISOString(),
        detail:    result.success ? (result.id ?? null) : (result.error ?? 'Unknown error'),
      })
    } else {
      newEntries.push({
        type: 'acknowledgment', channel: 'email', status: 'skipped',
        timestamp: new Date().toISOString(), detail: 'No email on file',
      })
    }

    // ── WhatsApp (via Fast2SMS, using the approved "inquiry_acknowledgment"
    // template — required because this is the first, business-initiated
    // message to a customer who hasn't messaged us first) ─────────────
    if (lead.phone) {
      const templateId = process.env.FAST2SMS_ACK_MESSAGE_ID ?? ''
      const result = await sendWhatsAppTemplateFast2SMS(lead.phone, templateId, [name])
      newEntries.push({
        type:      'acknowledgment',
        channel:   'whatsapp',
        status:    result.success ? 'sent' : 'failed',
        timestamp: new Date().toISOString(),
        detail:    result.success ? (result.requestId ?? null) : (result.error ?? 'Unknown error'),
      })
    } else {
      newEntries.push({
        type: 'acknowledgment', channel: 'whatsapp', status: 'skipped',
        timestamp: new Date().toISOString(), detail: 'No phone number on file',
      })
    }

    // ── Persist the log ─────────────────────────────────────────────
    const { error: logErr } = await supabaseAdmin
      .from('leads')
      .update({ communication_log: [...existingLog, ...newEntries] })
      .eq('id', lead.id)

    if (logErr) {
      console.error('[LeadAck] Failed to persist communication_log (non-fatal):', logErr.message)
    }

    const sentChannels = newEntries.filter(e => e.status === 'sent').map(e => e.channel)
    console.log(`[LeadAck] Lead ${lead.id} — acknowledgment sent via: ${sentChannels.join(', ') || 'none (no channels available)'}`)
  } catch (err) {
    console.error('[LeadAck] Unexpected error (non-fatal):', err)
  }
}
