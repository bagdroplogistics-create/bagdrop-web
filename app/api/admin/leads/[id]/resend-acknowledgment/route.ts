// BAGDROP — app/api/admin/leads/[id]/resend-acknowledgment/route.ts
//
// Manual "Resend Acknowledgment (WhatsApp)" action — added 2026-09-01
// alongside the Fast2SMS Meta-format migration (sendWhatsAppTemplateFast2SMSv2
// in lib/notifications.ts) specifically to let an admin re-send the
// WhatsApp acknowledgment for a lead whose original automatic attempt
// failed before the migration (e.g. BDL-2026-0137 / Mr. Ameet, whose
// +1 US number was rejected by Fast2SMS's old India-only endpoint).
//
// Deliberately separate from lib/lead-acknowledgment.ts's
// sendLeadAcknowledgment() rather than just calling that function again —
// that function's at-most-once guarantee is enforced by an atomic claim on
// leads.acknowledgment_sent_at, and that claim is already set for any lead
// whose acknowledgment flow has already run once (regardless of whether
// every channel succeeded) — calling it again would silently no-op even
// though the WhatsApp leg specifically failed. This route bypasses that
// claim on purpose: it only ever resends WhatsApp (email already succeeded
// in the cases this exists for), and every attempt — success or failure —
// is appended to communication_log as its own entry, so the full history
// (original failed attempt + this manual resend) stays visible, matching
// the "never overwrite, always append" pattern used everywhere else in
// this file's communication_log writes.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { sendWhatsAppTemplate } from '@/lib/notifications'
import { formatCustomerName } from '@/lib/constants'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  const { data: lead, error: fetchErr } = await supabaseAdmin
    .from('leads')
    .select('id, lead_number, title, name, phone, communication_log, is_test')
    .eq('id', id)
    .maybeSingle()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!lead)     return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (!lead.phone) return NextResponse.json({ error: 'No phone number on file for this lead' }, { status: 400 })

  const name        = lead.name?.trim() || 'Customer'
  const displayName = formatCustomerName(lead.title, name) || name

  // Test Mode leads must never trigger a real send, even via this manual
  // admin button — see lib/lead-acknowledgment.ts's matching guard.
  // Founder request 2026-09-04: "this is dummy test inquiry so dont send
  // any message through fast2sms for this."
  const result = lead.is_test
    ? { success: true as const, error: undefined, requestId: undefined, provider: undefined }
    : await sendWhatsAppTemplate(lead.phone, 'inquiry_acknowledgment', [displayName])

  const existingLog = Array.isArray(lead.communication_log) ? lead.communication_log : []
  const entry = {
    type:      'acknowledgment',
    channel:   'whatsapp',
    status:    lead.is_test ? 'skipped' : (result.success ? 'sent' : 'failed'),
    timestamp: new Date().toISOString(),
    detail:    lead.is_test
                  ? 'Test Mode — manual resend skipped, no real message sent'
                  : (result.success
                      ? `Manual resend by admin via ${result.provider ?? '—'} — request_id ${result.requestId ?? '—'}`
                      : `Manual resend by admin via ${result.provider ?? '—'} — failed: ${result.error}`),
  }

  const { error: logErr } = await supabaseAdmin
    .from('leads')
    .update({ communication_log: [...existingLog, entry] })
    .eq('id', id)

  if (logErr) {
    console.error('[ResendAcknowledgment] Failed to persist communication_log (non-fatal):', logErr.message)
  }

  console.log(`[ResendAcknowledgment] Lead ${lead.lead_number ?? id} — WhatsApp resend ${result.success ? 'sent' : 'failed: ' + result.error}`)

  return NextResponse.json({
    success: result.success,
    error:   result.success ? undefined : result.error,
    entry,
  })
}
