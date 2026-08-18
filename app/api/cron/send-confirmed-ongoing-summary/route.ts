// app/api/cron/send-confirmed-ongoing-summary/route.ts
//
// Scheduled target for the Confirmed & Ongoing Inquiry WhatsApp summary
// (lib/confirmed-ongoing-summary.ts) — sends a report of every currently
// Confirmed/Ongoing booking to the internal ops WhatsApp numbers at
// 9:00 AM and 6:00 PM IST.
//
// Same convention as every other cron route in this app (see
// app/api/cron/send-ops-reminders/route.ts): Vercel Hobby only allows
// daily-frequency native cron, so this is polled by an external scheduler
// instead. Point cron-job.org (or EasyCron) at this URL every 10 minutes:
//   https://bagdrop.co/api/cron/send-confirmed-ongoing-summary
// with header  Authorization: Bearer <CRON_SECRET>
//
// The route itself decides whether a report is actually due right now
// (determineDueReportType checks real IST time via Intl, NOT server/
// Vercel default timezone) and the report_key claim in
// runScheduledSummary guarantees at-most-one send per day per report type
// even if this fires on every single 10-minute poll inside the due window.

import { NextRequest, NextResponse } from 'next/server'
import { determineDueReportType, runScheduledSummary } from '@/lib/confirmed-ongoing-summary'

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

  const due = determineDueReportType()
  if (!due) {
    return NextResponse.json({ due: false })
  }

  const result = await runScheduledSummary(due)
  console.log(
    `[Cron:send-confirmed-ongoing-summary] type=${due} skipped=${result.skipped} inquiries=${result.inquiryCount} parts=${result.messageParts} success=${result.success} at ${new Date().toISOString()}`
  )
  return NextResponse.json({
    due: true, reportType: due, skipped: result.skipped, reason: result.reason,
    inquiryCount: result.inquiryCount, confirmedCount: result.confirmedCount, ongoingCount: result.ongoingCount,
    messageParts: result.messageParts, recipients: result.recipients, success: result.success,
  })
}
