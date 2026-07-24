// BAGDROP — app/api/cron/send-driver-details/route.ts
//
// Scheduled target for the "Driver Details Shared" automation (Airport
// Delivery only). When an admin marks a booking's status (from the
// "Booking Workflow" stepper — see
// app/(admin)/admin/quotes/view/[lead_id]/page.tsx) before the
// 4-hour-before-flight-arrival window opens, the PATCH handler in
// app/api/admin/bookings/[id]/route.ts stores driver_details_scheduled_at
// instead of sending right away. This route needs to be hit on a schedule,
// finds bookings whose scheduled time has passed and haven't been sent
// yet, and sends them.
//
// NOT using Vercel Cron here: the Hobby plan only allows daily cron
// frequency, and this feature needs ~10-minute resolution to reliably
// land sends near the 4-hour-before-flight mark. Instead, point a free
// external scheduler (e.g. cron-job.org, EasyCron) at this URL every
// 10 minutes:
//   https://bagdrop.co/api/cron/send-driver-details
// with header  Authorization: Bearer <CRON_SECRET>  (see below).
// If you later upgrade to Vercel Pro, this can move back into
// vercel.json's `crons` array instead.
//
// Auth: set a CRON_SECRET env var (Vercel Dashboard → Settings →
// Environment Variables) — any random string — and configure your
// external scheduler to send it as `Authorization: Bearer $CRON_SECRET`.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendDriverDetails } from '@/lib/driver-details'

export const runtime = 'nodejs'
// Cron requests must not be cached.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  // If CRON_SECRET isn't set yet, the job still runs (so this doesn't
  // silently do nothing before the env var is configured) — but you
  // should add CRON_SECRET so this endpoint can't be triggered by anyone
  // who finds the URL.

  const nowIso = new Date().toISOString()

  const { data: due, error } = await supabaseAdmin
    .from('bookings')
    .select('id, tracking_id, driver_details_scheduled_at')
    .not('driver_details_scheduled_at', 'is', null)
    .is('driver_details_sent_at', null)
    .lte('driver_details_scheduled_at', nowIso)

  if (error) {
    console.error('[Cron:send-driver-details] Query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: { id: string; tracking_id: string }[] = []
  for (const booking of due ?? []) {
    await sendDriverDetails(booking.id)   // never throws — logs internally
    results.push({ id: booking.id, tracking_id: booking.tracking_id })
  }

  console.log(`[Cron:send-driver-details] Processed ${results.length} due booking(s) at ${nowIso}`)
  return NextResponse.json({ processed: results.length, bookings: results })
}
