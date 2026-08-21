// app/api/cron/mark-lost-inquiries/route.ts
//
// Same pattern as the other app/api/cron/* routes (send-ops-reminders,
// send-lead-followups, etc.) — Vercel Hobby plan only allows daily-
// frequency native cron, and this only needs to run once a day anyway.
// Point a free external scheduler (cron-job.org, EasyCron) at this URL
// once daily (e.g. just after midnight IST):
//   https://www.bagdrop.co/api/cron/mark-lost-inquiries
// with header  Authorization: Bearer <CRON_SECRET>
// (same CRON_SECRET already used for the other cron routes, if one is
// set). GET /api/admin/leads also runs this opportunistically on every
// load, so the Leads tab self-heals even before this cron is registered —
// this route just makes it reliable on days nobody opens the dashboard.

import { NextRequest, NextResponse } from 'next/server'
import { autoMarkLostInquiries } from '@/lib/auto-lost-inquiries'

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

  const result = await autoMarkLostInquiries()
  console.log(`[Cron:mark-lost-inquiries] checked ${result.checked}, marked ${result.marked} at ${new Date().toISOString()}`)
  return NextResponse.json(result)
}
