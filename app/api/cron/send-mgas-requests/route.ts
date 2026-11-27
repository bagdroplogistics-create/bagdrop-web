// app/api/cron/send-mgas-requests/route.ts
//
// Daily scheduler target (cron-job.org, 9:00 AM IST, Authorization: Bearer CRON_SECRET)
// for MGAS baggage-code requests: sends the consolidated request for every
// Mumbai T2 arrival whose arrival date is exactly 2 calendar days away.
//
// Safe by default: lib/mgas.ts only sends when settings.mgas_mode is 'live'.
// 'off' = dry-run (records the message, sends nothing). Repeated polls are
// harmless: rows are claimed atomically and already-sent bookings are skipped.
// Before 9:00 AM IST the route does nothing.

import { NextRequest, NextResponse } from 'next/server'
import { runDailyMgas } from '@/lib/mgas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const istHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  if (istHour < 9) return NextResponse.json({ ran: false, reason: 'before 9:00 AM IST' })
  try {
    const r = await runDailyMgas()
    console.log(`[Cron:send-mgas-requests] mode=${r.outcome.mode} due=${r.due.length} batches=${r.outcome.batches} errors=${r.outcome.errors.length}`)
    return NextResponse.json({ ran: true, ...r })
  } catch (e) {
    console.error('[Cron:send-mgas-requests] failed', e)
    return NextResponse.json({ ran: false, error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
