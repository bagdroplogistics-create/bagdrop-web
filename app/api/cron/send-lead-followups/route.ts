import { NextRequest, NextResponse } from 'next/server'
import { processSalesFollowups } from '@/lib/sales-followup-reminders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Vercel's default function timeout (10s on Hobby) was almost certainly
// what was killing this route before cron-job.org's own 30s job timeout
// ever kicked in — the function gets cut off mid-request, the external
// poller never gets a response, and it reports a generic "timeout" with
// no useful error body. 60s is the max allowed on Hobby; combined with
// the smaller per-tick batch size (25, was 200) and the new 10s cap on
// each individual Fast2SMS call, a normal tick should finish in a few
// seconds — this is headroom for an unusually large backlog, not the
// expected run time.
export const maxDuration = 60

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
