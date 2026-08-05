import { NextRequest, NextResponse } from 'next/server'
import { processSalesFollowups } from '@/lib/sales-followup-reminders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Poll this route every 10-15 min from an external scheduler (cron-job.org
// / EasyCron), same convention as app/api/cron/send-ops-reminders/route.ts.
// Add: GET https://<domain>/api/cron/send-lead-followups
//      Header: Authorization: Bearer <CRON_SECRET>
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const { scheduled, processed } = await processSalesFollowups()
  console.log(`[Cron:send-lead-followups] Scheduled ${scheduled}, processed ${processed} reminder(s) at ${new Date().toISOString()}`)
  return NextResponse.json({ scheduled, processed })
}
