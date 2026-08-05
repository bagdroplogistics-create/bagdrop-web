import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth, requireAdmin } from '@/lib/admin-auth'

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin.from('settings').select('key, value')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Convert array of {key,value} to plain object
  const settings = Object.fromEntries((data ?? []).map(r => [r.key, r.value]))
  return NextResponse.json({ settings })
}

export async function PUT(req: NextRequest) {
  // Only admin can change settings
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const allowed = [
    'company_name', 'company_gst', 'company_address', 'company_phone', 'company_email',
    'payment_upi', 'payment_bank_name', 'payment_account_no', 'payment_ifsc',
    'notif_email', 'notif_whatsapp', 'notif_sms',
    // Internal Ops WhatsApp pickup reminders — see lib/ops-reminders.ts.
    'ops_reminder_enabled', 'ops_reminder_whatsapp',
    'ops_reminder_day_before_time', 'ops_reminder_day_of_time', 'ops_reminder_hours_before_flight',
    // Sales Follow-up & Reminder System — see lib/sales-followup-reminders.ts.
    // No dedicated Settings tab UI yet (Phase 2) — allow-listed here so
    // these can already be edited via this API or directly in Supabase.
    'sales_followup_enabled', 'sales_followup_whatsapp_enabled', 'sales_followup_email_enabled',
    'sales_followup_whatsapp', 'sales_followup_email',
    'sales_followup_quote_reminder_hours', 'sales_followup_response_reminder_hours',
    'sales_followup_escalation_enabled',
  ]

  const upserts = Object.entries(body as Record<string, string>)
    .filter(([key]) => allowed.includes(key))
    .map(([key, value]) => ({ key, value: String(value) }))

  if (upserts.length === 0) {
    return NextResponse.json({ error: 'No valid settings keys provided' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('settings')
    .upsert(upserts, { onConflict: 'key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, updated: upserts.length })
}
