// BAGDROP — lib/sales-followup-reminders.ts
//
// Automated Sales Follow-up & Reminder System (Phase 1).
//
// Purely additive background automation layer, modeled closely on the
// existing lib/ops-reminders.ts pattern. Never touches the existing
// inquiry/quotation/booking workflow — it only *reads* leads (+ the one
// booking each lead already has) and, when a reminder is due, sends an
// internal WhatsApp/email notice and logs the attempt. All timers are
// computed on every cron tick from live lead data (created_at,
// quote_number, quote_date, customer_responded_at, the linked booking's
// status) — nothing here can desync from what actually happened.
//
// Two reminder tracks, each with up to 3 escalation tiers (24h / 48h /
// 72h — 48h/72h only fire if sales_followup_escalation_enabled is on):
//   quote_pending_*  — no quote created yet since the inquiry came in.
//   response_*       — quote created, but the customer hasn't responded
//                      (no accept/reject on the linked booking, and no
//                      manual "Mark Customer Responded").
//
// Dedup / at-most-once: lead_followups has UNIQUE(lead_id, reminder_type,
// channel) — scheduling always upserts onto that constraint, and the
// cron claim is an atomic UPDATE ... WHERE status = 'pending' so
// concurrent cron ticks can't double-send. See
// supabase/migrations/20260805_sales_followup_reminders.sql.
//
// Stop conditions (checked both when scheduling AND re-checked at send
// time, since a lead's state can change between the two):
//   quote_pending — stops the moment quote_number is set, or lead.status
//                   becomes 'lost'.
//   response      — stops the moment customer_responded_at is set, the
//                   linked booking's status moves past 'quote_sent'
//                   (i.e. accepted/rejected/anything further along — see
//                   lib/lifecycle-notifications.ts's STATUS_ORDER), or
//                   lead.status becomes 'lost'.

import { supabaseAdmin } from './supabase'
import { sendWhatsAppTemplateFast2SMS } from './notifications'
import { sendEmail } from './email'

type TierHour = 24 | 48 | 72
const TIERS: TierHour[] = [24, 48, 72]

const QUOTE_PENDING_TYPE: Record<TierHour, string> = {
  24: 'quote_pending_24h', 48: 'quote_pending_48h', 72: 'quote_pending_72h',
}
const RESPONSE_TYPE: Record<TierHour, string> = {
  24: 'response_24h', 48: 'response_48h', 72: 'response_72h',
}

const STAGE_LABEL: Record<TierHour, string> = {
  24: '1st Reminder',
  48: '2nd Reminder (48h)',
  72: 'FINAL ESCALATION (72h) — OVERDUE',
}

export interface FollowupSettings {
  enabled: boolean
  whatsappEnabled: boolean
  emailEnabled: boolean
  whatsapp: string
  email: string[]
  quoteReminderHours: number
  responseReminderHours: number
  escalationEnabled: boolean
}

// Exported so the Dashboard "Sales Follow-up" summary endpoint can reuse
// the exact same reminder-hour thresholds instead of hardcoding 24h.
export async function getFollowupSettings(): Promise<FollowupSettings> {
  const { data } = await supabaseAdmin
    .from('settings')
    .select('key, value')
    .in('key', [
      'sales_followup_enabled', 'sales_followup_whatsapp_enabled', 'sales_followup_email_enabled',
      'sales_followup_whatsapp', 'sales_followup_email',
      'sales_followup_quote_reminder_hours', 'sales_followup_response_reminder_hours',
      'sales_followup_escalation_enabled',
    ])
  const map = Object.fromEntries((data ?? []).map(r => [r.key, r.value as string]))
  return {
    enabled:                map.sales_followup_enabled !== 'false',           // default on
    whatsappEnabled:        map.sales_followup_whatsapp_enabled !== 'false',  // default on
    emailEnabled:           map.sales_followup_email_enabled === 'true',      // default off
    whatsapp:               map.sales_followup_whatsapp || '+916357115711',
    email:                  (map.sales_followup_email || '').split(',').map(s => s.trim()).filter(Boolean),
    quoteReminderHours:     Number(map.sales_followup_quote_reminder_hours) || 24,
    responseReminderHours:  Number(map.sales_followup_response_reminder_hours) || 24,
    escalationEnabled:      map.sales_followup_escalation_enabled === 'true', // default off
  }
}

function hoursAgo(iso: string, hours: number): boolean {
  return new Date(iso).getTime() <= Date.now() - hours * 3600000
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  })
}

interface LeadRow {
  id: string; lead_number: string; name: string; phone: string
  from_city: string | null; to_city: string | null
  created_at: string; status: string
  quote_number: string | null; quote_date: string | null
  customer_responded_at: string | null
  booking_id: string | null
}

const LEAD_SELECT = 'id, lead_number, name, phone, from_city, to_city, created_at, status, quote_number, quote_date, customer_responded_at, booking_id'

async function appendCommunicationLog(leadId: string, entry: Record<string, unknown>): Promise<void> {
  const { data } = await supabaseAdmin.from('leads').select('communication_log').eq('id', leadId).maybeSingle()
  const log = Array.isArray(data?.communication_log) ? data!.communication_log : []
  log.push(entry)
  await supabaseAdmin.from('leads').update({ communication_log: log }).eq('id', leadId)
}

/**
 * Schedules (upserts) every reminder tier that has newly become due for
 * every still-eligible lead. Idempotent — safe to call every cron tick;
 * the UNIQUE constraint + onConflict just no-ops rows that already exist.
 * Never throws.
 */
async function scheduleDueTiers(settings: FollowupSettings): Promise<{ scheduled: number }> {
  let scheduled = 0
  if (!settings.enabled) return { scheduled }

  const channels: Array<'whatsapp' | 'email'> = [
    ...(settings.whatsappEnabled ? ['whatsapp' as const] : []),
    ...(settings.emailEnabled && settings.email.length > 0 ? ['email' as const] : []),
  ]
  if (channels.length === 0) return { scheduled }

  try {
    // ── Track 1: quote not yet created ──────────────────────────────
    const { data: pendingQuoteLeads } = await supabaseAdmin
      .from('leads')
      .select(LEAD_SELECT)
      .is('quote_number', null)
      .neq('status', 'lost')
      .limit(500)

    for (const lead of (pendingQuoteLeads ?? []) as LeadRow[]) {
      for (const tier of TIERS) {
        if (tier > 24 && !settings.escalationEnabled) continue
        const thresholdHours = tier === 24 ? settings.quoteReminderHours : tier
        if (!hoursAgo(lead.created_at, thresholdHours)) continue
        const scheduledFor = new Date(new Date(lead.created_at).getTime() + thresholdHours * 3600000).toISOString()
        for (const channel of channels) {
          const { error } = await supabaseAdmin.from('lead_followups').upsert(
            {
              lead_id: lead.id, reminder_type: QUOTE_PENDING_TYPE[tier], channel,
              scheduled_for: scheduledFor, status: 'pending', sent_at: null, delivery_status: null,
              recipient: channel === 'whatsapp' ? settings.whatsapp : settings.email.join(', '), detail: null,
            },
            { onConflict: 'lead_id,reminder_type,channel', ignoreDuplicates: true }
          )
          if (!error) scheduled++
        }
      }
    }

    // ── Track 2: quote sent, no response yet ────────────────────────
    const { data: awaitingResponseLeads } = await supabaseAdmin
      .from('leads')
      .select(LEAD_SELECT)
      .not('quote_number', 'is', null)
      .is('customer_responded_at', null)
      .neq('status', 'lost')
      .not('quote_date', 'is', null)
      .limit(500)

    const bookingIds = (awaitingResponseLeads ?? []).map(l => l.booking_id).filter(Boolean) as string[]
    let bookingRows: { id: string; status: string }[] = []
    if (bookingIds.length) {
      const { data } = await supabaseAdmin.from('bookings').select('id, status').in('id', bookingIds)
      bookingRows = data ?? []
    }
    const bookingStatusById = new Map(bookingRows.map(b => [b.id, b.status]))

    for (const lead of (awaitingResponseLeads ?? []) as LeadRow[]) {
      const bStatus = lead.booking_id ? bookingStatusById.get(lead.booking_id) : undefined
      // Anything other than still sitting at 'quote_sent' (or no booking
      // status info at all) means the customer has already moved —
      // accepted, rejected, or the workflow progressed further.
      if (bStatus && bStatus !== 'quote_sent' && bStatus !== 'quote_created' && bStatus !== 'inquiry') continue

      for (const tier of TIERS) {
        if (tier > 24 && !settings.escalationEnabled) continue
        const thresholdHours = tier === 24 ? settings.responseReminderHours : tier
        if (!hoursAgo(lead.quote_date as string, thresholdHours)) continue
        const scheduledFor = new Date(new Date(lead.quote_date as string).getTime() + thresholdHours * 3600000).toISOString()
        for (const channel of channels) {
          const { error } = await supabaseAdmin.from('lead_followups').upsert(
            {
              lead_id: lead.id, reminder_type: RESPONSE_TYPE[tier], channel,
              scheduled_for: scheduledFor, status: 'pending', sent_at: null, delivery_status: null,
              recipient: channel === 'whatsapp' ? settings.whatsapp : settings.email.join(', '), detail: null,
            },
            { onConflict: 'lead_id,reminder_type,channel', ignoreDuplicates: true }
          )
          if (!error) scheduled++
        }
      }
    }
  } catch (err) {
    console.error('[sales-followup] scheduleDueTiers error (non-fatal):', err)
  }

  return { scheduled }
}

interface DueRow {
  id: string; lead_id: string; reminder_type: string; channel: 'whatsapp' | 'email'
}

/**
 * Finds every pending reminder whose scheduled_for has arrived, atomically
 * claims and sends each one (re-validating stop conditions right before
 * sending, since state can change between scheduling and this tick), and
 * logs the outcome on the reminder row + the lead's communication_log.
 * Never throws.
 */
async function sendDuePending(): Promise<{ processed: number }> {
  const nowIso = new Date().toISOString()
  let processed = 0

  try {
    const { data: due, error } = await supabaseAdmin
      .from('lead_followups')
      .select('id, lead_id, reminder_type, channel')
      .eq('status', 'pending')
      .lte('scheduled_for', nowIso)
      .limit(200)

    if (error) {
      console.error('[sales-followup] due-query failed:', error.message)
      return { processed: 0 }
    }

    for (const row of (due ?? []) as DueRow[]) {
      // Atomic claim — same lock-via-WHERE pattern as ops-reminders.ts.
      const { data: claimed } = await supabaseAdmin
        .from('lead_followups')
        .update({ status: 'sent', sent_at: nowIso })
        .eq('id', row.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()
      if (!claimed) continue
      processed++

      const { data: lead } = await supabaseAdmin.from('leads').select(LEAD_SELECT).eq('id', row.lead_id).maybeSingle()
      if (!lead) {
        await supabaseAdmin.from('lead_followups').update({ status: 'cancelled', detail: 'Lead no longer exists' }).eq('id', row.id)
        continue
      }
      const isQuoteTrack = row.reminder_type.startsWith('quote_pending')
      const tier = (row.reminder_type.endsWith('72h') ? 72 : row.reminder_type.endsWith('48h') ? 48 : 24) as TierHour

      // Re-check stop conditions at send time.
      let skipReason: string | null = null
      if (lead.status === 'lost') skipReason = 'Lead is now closed/lost'
      else if (isQuoteTrack && lead.quote_number) skipReason = `Quote ${lead.quote_number} was already created`
      else if (!isQuoteTrack) {
        if (lead.customer_responded_at) skipReason = 'Customer response already recorded'
        else if (lead.booking_id) {
          const { data: bk } = await supabaseAdmin.from('bookings').select('status').eq('id', lead.booking_id).maybeSingle()
          if (bk && bk.status !== 'quote_sent' && bk.status !== 'quote_created' && bk.status !== 'inquiry') {
            skipReason = `Booking status is now '${bk.status}'`
          }
        }
      }

      if (skipReason) {
        await supabaseAdmin.from('lead_followups').update({ status: 'cancelled', detail: `Skipped at send time — ${skipReason}` }).eq('id', row.id)
        continue
      }

      const settings = await getFollowupSettings()
      const route = [lead.from_city, lead.to_city].filter(Boolean).join(' → ') || '—'
      const stageLabel = STAGE_LABEL[tier]

      if (row.channel === 'whatsapp') {
        const templateId = isQuoteTrack
          ? (process.env.FAST2SMS_QUOTE_PENDING_MESSAGE_ID ?? '')
          : (process.env.FAST2SMS_SALES_FOLLOWUP_MESSAGE_ID ?? '')
        const variables = isQuoteTrack
          ? [lead.name || 'Customer', lead.lead_number, route, fmtDateTime(lead.created_at), lead.phone || '—', stageLabel]
          : [lead.name || 'Customer', lead.lead_number, fmtDateTime(lead.quote_date), route, lead.phone || '—', stageLabel]

        const result = await sendWhatsAppTemplateFast2SMS(settings.whatsapp, templateId, variables)
        await supabaseAdmin.from('lead_followups').update({
          status: result.success ? 'sent' : 'failed',
          delivery_status: result.success ? (result.requestId ?? 'sent') : (result.error ?? 'Unknown error'),
          recipient: settings.whatsapp,
          detail: `${isQuoteTrack ? 'Quote pending' : 'Customer follow-up'} reminder (${stageLabel}) for ${lead.lead_number}`,
        }).eq('id', row.id)

        await appendCommunicationLog(lead.id, {
          channel: 'whatsapp', status: result.success ? 'sent' : 'failed', timestamp: nowIso,
          detail: `Sales follow-up reminder (${row.reminder_type}) to ${settings.whatsapp}` + (result.success ? '' : ` — ${result.error ?? 'unknown error'}`),
        })
      } else {
        const subject = isQuoteTrack
          ? `Quote Pending Reminder — ${lead.lead_number}`
          : `Customer Follow-up Reminder — ${lead.lead_number}`
        const html = isQuoteTrack
          ? `<p><strong>${stageLabel}</strong></p><p>A customer inquiry has not yet been quoted.</p>
             <p>Customer: ${lead.name}<br/>Inquiry ID: ${lead.lead_number}<br/>Route: ${route}<br/>
             Inquiry Date: ${fmtDateTime(lead.created_at)}<br/>Mobile: ${lead.phone}</p>
             <p>Please review this inquiry and send the quotation as soon as possible.</p>`
          : `<p><strong>${stageLabel}</strong></p><p>The customer has not responded to the quotation.</p>
             <p>Customer: ${lead.name}<br/>Inquiry ID: ${lead.lead_number}<br/>Quote Date: ${fmtDateTime(lead.quote_date)}<br/>
             Route: ${route}<br/>Mobile: ${lead.phone}</p>
             <p>Please follow up with the customer by phone, WhatsApp, or email.</p>`

        const result = await sendEmail(settings.email, subject, html, `sales-followup:${row.reminder_type}`)
        await supabaseAdmin.from('lead_followups').update({
          status: result.success ? 'sent' : 'failed',
          delivery_status: result.success ? (result.id ?? 'sent') : (result.error ?? 'Unknown error'),
          recipient: settings.email.join(', '),
          detail: `${isQuoteTrack ? 'Quote pending' : 'Customer follow-up'} reminder (${stageLabel}) for ${lead.lead_number}`,
        }).eq('id', row.id)

        await appendCommunicationLog(lead.id, {
          channel: 'email', status: result.success ? 'sent' : 'failed', timestamp: nowIso,
          detail: `Sales follow-up reminder (${row.reminder_type}) to ${settings.email.join(', ')}` + (result.success ? '' : ` — ${result.error ?? 'unknown error'}`),
        })
      }
    }
  } catch (err) {
    console.error('[sales-followup] sendDuePending error (non-fatal):', err)
  }

  return { processed }
}

/** Single cron entry point — schedules newly-due tiers, then sends whatever is due. Never throws. */
export async function processSalesFollowups(): Promise<{ scheduled: number; processed: number }> {
  const settings = await getFollowupSettings()
  const { scheduled } = await scheduleDueTiers(settings)
  const { processed } = await sendDuePending()
  return { scheduled, processed }
}
