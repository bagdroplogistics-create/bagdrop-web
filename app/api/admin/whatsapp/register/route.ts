import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'

/**
 * POST /api/admin/whatsapp/register
 *
 * One-time(ish) fix for Meta Cloud API error #133010 "Account not
 * registered" — a lower-level state than the phone number simply being
 * "Connected"/shared with an app in Business Manager. A Cloud API phone
 * number must be explicitly registered for messaging via this exact
 * endpoint before ANY app (Fast2SMS's, or Bagdrop's own direct Meta app)
 * can send through it — this is almost certainly the true root cause
 * behind the entire Sep 22-25 WhatsApp outage investigation: Fast2SMS's
 * partner-app access being broken was a real, separate problem, but even
 * after routing every send through Bagdrop's own working Meta app
 * (see lib/notifications.ts's 2026-09-25 sendWhatsAppTemplate change),
 * the exact same #133010 error persisted — pointing at the number's Cloud
 * API registration itself, not any particular app's access to it.
 *
 * Calls Meta's own POST /{phone-number-id}/register with the two-step
 * verification PIN for this number (create a new 6-digit PIN here if one
 * isn't already known/remembered — Meta accepts a fresh PIN at register
 * time). The PIN is taken from the request body and forwarded directly to
 * Meta — never logged, never stored anywhere in our own database.
 *
 * Admin-only (requireAdmin, not requireAdminAuth) since this is an
 * account-level action with real consequences if run against the wrong
 * number.
 */
export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized — full admin key required' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const pin = typeof body?.pin === 'string' ? body.pin.trim() : ''
  if (!/^\d{6}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN must be exactly 6 digits' }, { status: 400 })
  }

  const token   = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '995935626929789'
  if (!token) {
    return NextResponse.json({ error: 'WHATSAPP_ACCESS_TOKEN is not set — cannot call Meta' }, { status: 500 })
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v26.0/${phoneId}/register`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok || data?.error) {
      return NextResponse.json({
        error: data?.error?.message ?? `Meta returned HTTP ${res.status}`,
        metaResponse: data,
      }, { status: 502 })
    }

    return NextResponse.json({ success: true, metaResponse: data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Request to Meta failed: ${msg}` }, { status: 500 })
  }
}
