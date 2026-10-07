import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'

// Meta WhatsApp Cloud API webhook — delivery status receiver.
//
// Why this exists: our send call only learns that Meta ACCEPTED a message
// (the "Sent" in the Communication Log). Whether it was actually delivered, or
// failed afterwards (payment/billing problem #131042, display name under
// review #131037, recipient unreachable #131026, template/parameter errors,
// etc.) is only reported here, asynchronously. Every status callback is logged
// to Vercel and saved to whatsapp_delivery_events so the real reason is visible.
//
// Meta setup (developers.facebook.com → app → WhatsApp → Configuration):
//   Callback URL : https://www.bagdrop.co/api/whatsapp/webhook
//   Verify token : same value as WHATSAPP_WEBHOOK_VERIFY_TOKEN in Vercel
//   Subscribe to : messages
// NOTE: Meta only delivers PRODUCTION webhooks once the app is published (Live).
//
// Env: WHATSAPP_WEBHOOK_VERIFY_TOKEN (required for the GET handshake),
//      WHATSAPP_APP_SECRET (recommended — verifies the X-Hub-Signature-256
//      header so only Meta can post here).
//
// Deliberately NOT under /api/admin (that prefix requires the admin key).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET — one-time verification handshake from Meta.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const mode      = p.get('hub.mode')
  const token     = p.get('hub.verify_token')
  const challenge = p.get('hub.challenge')
  const expected  = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN

  if (mode === 'subscribe' && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

function validSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !header.startsWith('sha256=')) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const given = header.slice('sha256='.length)
  const a = Buffer.from(expected)
  const b = Buffer.from(given)
  return a.length === b.length && timingSafeEqual(a, b)
}

interface WaStatusError { code?: number; title?: string; message?: string; error_data?: { details?: string } }
interface WaStatus {
  id?: string
  status?: string
  recipient_id?: string
  timestamp?: string
  errors?: WaStatusError[]
}

// POST — status callbacks (sent / delivered / read / failed).
export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  const secret = process.env.WHATSAPP_APP_SECRET
  if (secret) {
    if (!validSignature(rawBody, req.headers.get('x-hub-signature-256'), secret)) {
      console.error('[WhatsApp webhook] rejected — bad X-Hub-Signature-256')
      return new NextResponse('Invalid signature', { status: 401 })
    }
  } else {
    console.warn('[WhatsApp webhook] WHATSAPP_APP_SECRET not set — signature not verified')
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new NextResponse('Bad JSON', { status: 400 })
  }

  try {
    const entries = (payload as { entry?: Array<{ changes?: Array<{ value?: { statuses?: WaStatus[] } }> }> }).entry ?? []
    const rows: Record<string, unknown>[] = []

    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        for (const s of change.value?.statuses ?? []) {
          const err = s.errors?.[0]
          const when = s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : null
          if (s.status === 'failed') {
            console.error(
              '[WhatsApp webhook] DELIVERY FAILED',
              '| to:', s.recipient_id, '| wamid:', s.id,
              '| code:', err?.code, '| title:', err?.title,
              '| detail:', err?.error_data?.details ?? err?.message,
            )
          } else {
            console.log('[WhatsApp webhook]', s.status, '| to:', s.recipient_id, '| wamid:', s.id)
          }
          rows.push({
            wamid:        s.id ?? null,
            recipient:    s.recipient_id ?? null,
            status:       s.status ?? 'unknown',
            error_code:   err?.code ?? null,
            error_title:  err?.title ?? null,
            error_detail: err?.error_data?.details ?? err?.message ?? null,
            event_time:   when,
            raw:          s,
          })
        }
      }
    }

    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from('whatsapp_delivery_events').insert(rows)
      if (error) console.error('[WhatsApp webhook] could not save events (is the migration run?):', error.message)
    }
  } catch (err) {
    // Never return an error to Meta — it would retry the same payload repeatedly.
    console.error('[WhatsApp webhook] processing error (non-fatal):', err)
  }

  return NextResponse.json({ received: true })
}
