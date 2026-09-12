// app/api/cron/send-vendor-notifications/route.ts
//
// Same pattern as app/api/cron/send-ops-reminders/route.ts: Vercel Hobby
// plan only allows daily-frequency cron, and vendor notifications need
// much finer resolution than that to land close to each operation's own
// configured default time. Point a free external scheduler (cron-job.org,
// EasyCron) at this URL every 10–15 minutes:
//   https://www.bagdrop.co/api/cron/send-vendor-notifications
// with header  Authorization: Bearer <CRON_SECRET>
// (same CRON_SECRET already used for send-ops-reminders/send-driver-details,
// if one is set).

import { NextRequest, NextResponse } from 'next/server'
import { sendDueVendorNotifications } from '@/lib/vendor-notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const { processed } = await sendDueVendorNotifications()
  console.log(`[Cron:send-vendor-notifications] Processed ${processed} due vendor notification(s) at ${new Date().toISOString()}`)
  return NextResponse.json({ processed })
}
