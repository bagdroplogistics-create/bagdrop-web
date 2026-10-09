import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { sendLifecycleWhatsApp } from '@/lib/lifecycle-notifications'

// Sends (or re-sends) the customer WhatsApp for the booking's CURRENT
// workflow status through the configured API provider (server-side only).
// It never changes status, payment or quote approval. The only write besides
// the status_history note (done inside sendLifecycleWhatsApp) is adding the
// status to notified_statuses after the provider accepts the message.
//
// "success" here means the provider ACCEPTED the message — not that it was
// delivered. Delivery is reported later by the Meta webhook.

export const maxDuration = 60

// Best-effort duplicate-click guard (per server instance). The UI also
// disables the button while a request is in flight.
const inFlight = new Map<string, number>()
const LOCK_MS = 20_000

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await context.params
  const body = await req.json().catch(() => ({})) as { status?: string }

  const { data: booking, error } = await supabaseAdmin
    .from('bookings').select('*').eq('id', id).single()
  if (error || !booking) {
    return NextResponse.json({ error: error?.message ?? 'Booking not found' }, { status: 404 })
  }

  const status = body.status || booking.status
  if (body.status && body.status !== booking.status) {
    return NextResponse.json({ error: `Booking is at "${booking.status}", not "${body.status}". Refresh the page.` }, { status: 409 })
  }

  const lockKey = `${id}:${status}`
  const now = Date.now()
  const started = inFlight.get(lockKey)
  if (started && now - started < LOCK_MS) {
    return NextResponse.json({ error: 'A send for this step is already in progress. Please wait.' }, { status: 429 })
  }
  inFlight.set(lockKey, now)

  try {
    const result = await sendLifecycleWhatsApp(status, booking)

    if (result.attempted && result.success) {
      const prev: string[] = Array.isArray(booking.notified_statuses) ? booking.notified_statuses : []
      if (!prev.includes(status)) {
        const { error: upErr } = await supabaseAdmin
          .from('bookings').update({ notified_statuses: [...prev, status] }).eq('id', id)
        if (upErr && !upErr.message?.includes('notified_statuses')) {
          console.error('[send-whatsapp] mark notified failed:', upErr.message)
        }
      }
    }

    return NextResponse.json({ whatsapp: result })
  } catch (e) {
    return NextResponse.json({
      whatsapp: { attempted: true, success: false, error: e instanceof Error ? e.message : String(e) },
    })
  } finally {
    inFlight.delete(lockKey)
  }
}
