import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { exchangeCodeForTokens } from '@/lib/google-calendar'

export const runtime = 'nodejs'

const RETURN_URL = 'https://bagdrop.co/admin/reports/operations'

// ── GET /api/admin/google-calendar/callback ─────────────────────────────────
// Google redirects here after the admin approves the consent screen, with
// ?code=... and ?state=<the admin key we sent in /connect>. Exchanges the
// code for tokens, looks up the connected account's email (via the Calendar
// API itself — GET /calendars/primary returns {id: "the account's email"}
// once authorized, so no extra OAuth scope is needed just to display it),
// and stores everything as the single google_calendar_connections row
// (deletes any prior row first — one shared connection, not one per admin).
export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state') ?? ''
  const err   = req.nextUrl.searchParams.get('error')

  if (err) {
    return NextResponse.redirect(`${RETURN_URL}?calendar_error=${encodeURIComponent(err)}`)
  }
  if (!code) {
    return NextResponse.redirect(`${RETURN_URL}?calendar_error=missing_code`)
  }

  // `state` carries the admin key from /connect — verify it's still valid
  // rather than trusting an unauthenticated redirect blindly. Inlined (not
  // via getAdminRole) since there's no real NextRequest to hand it here —
  // this callback is an unauthenticated redirect from Google, the only
  // "auth" available is whatever we round-tripped through `state`.
  const role = process.env.ADMIN_SECRET_KEY && state === process.env.ADMIN_SECRET_KEY ? 'admin' : null
  if (role !== 'admin') {
    return NextResponse.redirect(`${RETURN_URL}?calendar_error=unauthorized`)
  }

  const tokens = await exchangeCodeForTokens(code)
  if (!tokens) {
    return NextResponse.redirect(`${RETURN_URL}?calendar_error=token_exchange_failed`)
  }

  let googleEmail: string | null = null
  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (res.ok) {
      const json = await res.json()
      googleEmail = json.id ?? null // the primary calendar's id IS the account email
    }
  } catch {
    // Non-fatal — connection still works without a display email.
  }

  // Single shared connection — clear any prior row before inserting the new one.
  await supabaseAdmin.from('google_calendar_connections').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  const { error: insertErr } = await supabaseAdmin.from('google_calendar_connections').insert({
    google_email:     googleEmail,
    access_token:     tokens.access_token,
    refresh_token:    tokens.refresh_token,
    token_expires_at: new Date(Date.now() + (Number(tokens.expires_in) || 3600) * 1000).toISOString(),
    calendar_id:      'primary',
    connected_by:     role,
  })

  if (insertErr) {
    console.error('[google-calendar callback] failed to save connection:', insertErr.message)
    return NextResponse.redirect(`${RETURN_URL}?calendar_error=save_failed`)
  }

  return NextResponse.redirect(`${RETURN_URL}?calendar_connected=1`)
}
