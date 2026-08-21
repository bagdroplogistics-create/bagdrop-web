// BAGDROP — app/api/admin/customer-follow-ups/route.ts
//
// Manual, admin-initiated customer follow-up log for the Booking Workflow
// page's "Follow Up" action (available once a booking is Quote Created /
// Quote Sent). Purely additive — never touches bookings.status, payment
// status, or any other workflow field. See
// supabase/migrations/20260820_customer_follow_ups.sql for the table this
// reads/writes, and its comment for why this is a separate table from the
// existing `lead_followups` (that one is the automated internal reminder
// system that pings OPS — unrelated to this).
//
// WhatsApp follow-ups: the actual "send" happens client-side (a wa.me deep
// link opens on the admin's own device/WhatsApp — see FollowUpPanel in
// app/(admin)/admin/page.tsx). This route just records that it happened;
// status is always 'sent' for WhatsApp rows since there is no delivery
// confirmation to check.
//
// Email follow-ups: this route actually sends the email server-side via
// the existing Resend integration (lib/email.ts's sendEmail()) — a real,
// confirmed send, not a deep link — and records the true result.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { sendEmail } from '@/lib/email'

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const bookingId = req.nextUrl.searchParams.get('booking_id')
  if (!bookingId) {
    return NextResponse.json({ error: 'booking_id is required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('customer_follow_ups')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })

  if (error) {
    // Most likely cause: the migration hasn't been run yet. Fail soft with
    // an empty list rather than a 500, so the History panel just shows
    // "No follow-ups yet" instead of an error, until the table exists.
    console.error('[customer-follow-ups] GET failed:', error.message)
    return NextResponse.json({ followUps: [] })
  }

  return NextResponse.json({ followUps: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { booking_id, method, message, subject, initiated_by } = body as {
    booking_id?: string
    method?: 'whatsapp' | 'email'
    message?: string
    subject?: string
    initiated_by?: string | null
  }

  if (!booking_id || (method !== 'whatsapp' && method !== 'email')) {
    return NextResponse.json({ error: 'booking_id and a valid method (whatsapp/email) are required' }, { status: 400 })
  }
  if (!message?.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  // Look the booking up server-side rather than trusting a client-supplied
  // target — "Automatically use the customer's registered mobile number /
  // email address" per the feature spec means the SEND TARGET always comes
  // from the booking record, never from the request body. Only the message
  // text itself is editable by the admin.
  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from('bookings')
    .select('id, lead_id, tracking_id, customer_email, customer_phone')
    .eq('id', booking_id)
    .single()

  if (bookingErr || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  let status: 'sent' | 'failed' = 'sent'
  let sendError: string | null = null

  if (method === 'email') {
    if (!booking.customer_email) {
      return NextResponse.json({ error: 'No email address on file for this customer.' }, { status: 400 })
    }
    if (!subject?.trim()) {
      return NextResponse.json({ error: 'subject is required for an email follow-up.' }, { status: 400 })
    }
    // Plain-text follow-up wrapped in minimal HTML — this is a manual,
    // personal-sounding nudge (not one of the branded transactional
    // templates in lib/email.ts), so it deliberately stays simple rather
    // than reusing the branded header/footer templates those use.
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1f2937;white-space:pre-wrap;max-width:560px">${escapeHtml(message)}</div>`
    const result = await sendEmail(booking.customer_email, subject.trim(), html, `follow-up:${booking.tracking_id}`)
    status = result.success ? 'sent' : 'failed'
    sendError = result.error ?? null
  } else {
    // WhatsApp: nothing to send server-side — just needs a phone on file
    // for the record to make sense.
    if (!booking.customer_phone) {
      return NextResponse.json({ error: 'No phone number on file for this customer.' }, { status: 400 })
    }
  }

  const { data: row, error: insertErr } = await supabaseAdmin
    .from('customer_follow_ups')
    .insert({
      booking_id: booking.id,
      lead_id:    booking.lead_id ?? null,
      method,
      status,
      subject:    method === 'email' ? subject!.trim() : null,
      message,
      initiated_by: initiated_by?.trim() || null,
      error:      sendError,
    })
    .select()
    .single()

  if (insertErr) {
    console.error('[customer-follow-ups] insert failed:', insertErr.message)
    // The email may have already sent successfully even if the history
    // row failed to save — don't report a false failure for that case.
    return NextResponse.json({
      success: status === 'sent',
      status,
      error: status === 'failed' ? sendError : 'Follow-up sent, but the history log failed to save.',
    }, { status: status === 'sent' ? 200 : 500 })
  }

  return NextResponse.json({ success: status === 'sent', status, error: sendError, followUp: row })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
