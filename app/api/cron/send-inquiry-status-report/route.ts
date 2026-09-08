// app/api/cron/send-inquiry-status-report/route.ts
//
// Scheduled target for the Automatic Inquiry Status Email Report
// (lib/inquiry-status-email-report.ts) — sends one email to info@bagdrop.co
// daily at 9:00 AM IST covering Confirmed & Ongoing bookings and New
// Inquiries still awaiting a quote.
//
// Same convention as every other cron route in this app (see
// app/api/cron/send-confirmed-ongoing-summary/route.ts): Vercel Hobby only
// allows daily-frequency native cron, so this is polled by an external
// scheduler instead. Add this URL to the existing cron-job.org (or
// EasyCron) poller alongside the other /api/cron/* routes, hit every
// 10 minutes:
//   https://www.bagdrop.co/api/cron/send-inquiry-status-report
// with header  Authorization: Bearer <CRON_SECRET>
//
// isReportDueNow() checks real IST time via Intl (not server/Vercel default
// timezone), and the report_key claim inside runInquiryStatusEmailReport
// guarantees at-most-one send per day even if this fires on every single
// 10-minute poll inside the due window.

import { NextRequest, NextResponse } from 'next/server'
import { isReportDueNow, runInquiryStatusEmailReport } from '@/lib/inquiry-status-email-report'

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

  if (!isReportDueNow()) {
    return NextResponse.json({ due: false })
  }

  const result = await runInquiryStatusEmailReport()
  console.log(
    `[Cron:send-inquiry-status-report] skipped=${result.skipped} confirmed=${result.confirmedCount} ongoing=${result.ongoingCount} quotePending=${result.quotePendingCount} success=${result.success} at ${new Date().toISOString()}`
  )
  return NextResponse.json({
    due: true, skipped: result.skipped, reason: result.reason,
    confirmedCount: result.confirmedCount, ongoingCount: result.ongoingCount,
    quotePendingCount: result.quotePendingCount, recipients: result.recipients, success: result.success,
  })
}
