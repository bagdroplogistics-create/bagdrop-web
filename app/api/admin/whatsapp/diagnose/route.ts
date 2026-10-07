import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'

/**
 * GET  /api/admin/whatsapp/diagnose  — asks Meta directly why messages are
 *                                      not being delivered.
 * POST /api/admin/whatsapp/diagnose  — { action: 'subscribe' } subscribes
 *                                      Bagdrop's Meta app to this WhatsApp
 *                                      Business Account so delivery-status
 *                                      webhooks reach /api/whatsapp/webhook.
 *
 * Founder report 2026-10-07: Communication Log says "Sent" (Meta accepted the
 * request) but the customer receives nothing, and the delivery-status webhook
 * table stays empty. This reports, straight from Meta's Graph API:
 *   - the phone number's status / name_status / platform type / account mode
 *   - health_status for the phone number AND the WABA — Meta's own "can this
 *     account send messages, and if not, exactly why" (payment method, display
 *     name review, partner/credit-line problems, etc.)
 *   - which apps are subscribed to the WABA (webhooks only reach an app that is
 *     subscribed to the WABA, regardless of the callback URL set in the app)
 *   - whether the token can read this WABA's templates at all.
 * Read-only except the explicit 'subscribe' action. Admin-only.
 */
const GRAPH = 'https://graph.facebook.com/v26.0'

async function graph(path: string, token: string, method: 'GET' | 'POST' = 'GET') {
  try {
    const res = await fetch(`${GRAPH}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.error) {
      return { ok: false, status: res.status, error: data?.error ?? data }
    }
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function config() {
  return {
    token:   process.env.WHATSAPP_ACCESS_TOKEN,
    phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID || '995935626929789',
    wabaId:  process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '1974418209770877',
  }
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized — full admin key required' }, { status: 401 })
  }
  const { token, phoneId, wabaId } = config()
  if (!token) return NextResponse.json({ error: 'WHATSAPP_ACCESS_TOKEN is not set' }, { status: 500 })

  const [phone, phoneHealth, waba, wabaHealth, subscribedApps, templatesProbe] = await Promise.all([
    graph(`/${phoneId}?fields=display_phone_number,verified_name,name_status,quality_rating,status,platform_type,account_mode,code_verification_status,messaging_limit_tier`, token),
    graph(`/${phoneId}?fields=health_status`, token),
    graph(`/${wabaId}?fields=name,currency,account_review_status,business_verification_status`, token),
    graph(`/${wabaId}?fields=health_status`, token),
    graph(`/${wabaId}/subscribed_apps`, token),
    graph(`/${wabaId}/message_templates?limit=1&fields=name,status`, token),
  ])

  return NextResponse.json({
    ids: { phoneId, wabaId },
    phone, phoneHealth, waba, wabaHealth, subscribedApps, templatesProbe,
  })
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized — full admin key required' }, { status: 401 })
  }
  const body = await req.json().catch(() => null)
  if (body?.action !== 'subscribe') {
    return NextResponse.json({ error: "Unknown action — use { action: 'subscribe' }" }, { status: 400 })
  }
  const { token, wabaId } = config()
  if (!token) return NextResponse.json({ error: 'WHATSAPP_ACCESS_TOKEN is not set' }, { status: 500 })

  const result = await graph(`/${wabaId}/subscribed_apps`, token, 'POST')
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
