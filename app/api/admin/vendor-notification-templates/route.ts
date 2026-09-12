// BAGDROP — app/api/admin/vendor-notification-templates/route.ts
//
// Admin-editable EMAIL wording for each vendor operation category (founder
// spec BAGDROP-VENDOR-AUTOMATION-001 §17). WhatsApp deliberately has no
// per-category editable template here — it uses ONE fixed, Meta-approved
// shared template (see lib/vendor-notifications.ts's WHATSAPP_TEMPLATE_ENV
// comment) since any wording change would need a fresh Meta review; email
// has no such platform restriction, so its subject/body are fully
// admin-editable per category, filled in from {{var}} placeholders at send
// time (see lib/vendor-notifications.ts's sendOneNotification()).
//
// Rows are pre-seeded (one per category) by
// supabase/migrations/20260912_vendor_master.sql — this route only reads
// and updates them, it never inserts new categories.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth, requireAdmin } from '@/lib/admin-auth'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('vendor_notification_templates')
    .select('category, email_subject, email_body, updated_at')
    .order('category')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data ?? [] })
}

export async function PUT(req: NextRequest) {
  // Admin only — same access level as every other messaging-template edit.
  if (!requireAdmin(req)) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body?.category) return NextResponse.json({ error: 'category is required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('vendor_notification_templates')
    .update({
      email_subject: body.email_subject ?? '',
      email_body:    body.email_body    ?? '',
    })
    .eq('category', body.category)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
