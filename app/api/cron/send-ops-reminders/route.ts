// app/api/cron/send-ops-reminders/route.ts
//
// Same pattern as app/api/cron/send-driver-details/route.ts: Vercel Hobby
// plan only allows daily-frequency cron, and reminders need much finer
// resolution than that to land near "1 day before" / "a few hours before
// pickup". Point a free external scheduler (cron-job.org, EasyCron) at
// this URL every 10–15 minutes:
//   https://www.bagdrop.co/api/cron/send-ops-reminders
// with header  Authorization: Bearer <CRON_SECRET>
// (same CRON_SECRET already used for send-driver-details, if one is set).
// If you upgrade to Vercel Pro later this can move into vercel.json's
// `crons` array instead.

import { NextRequest, NextResponse } from 'next/server'
import { sendDueReminders } from '@/lib/ops-reminders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// See matching comment in app/api/cron/send-lead-followups/route.ts —
// same fix, same reasoning (Vercel's default 10s Hobby timeout was likely
// killing this route before cron-job.org's own timeout fired).
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const { processed } = await sendDueReminders()
  console.log(`[Cron:send-ops-reminders] Processed ${processed} due reminder(s) at ${new Date().toISOString()}`)
  return NextResponse.json({ processed })
}
