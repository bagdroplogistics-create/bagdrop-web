// app/api/admin/confirmed-ongoing-summary/test/route.ts
//
// Manual test-trigger for the Confirmed & Ongoing Inquiry WhatsApp summary
// (lib/confirmed-ongoing-summary.ts) — per spec item 15 ("do not wait
// until the next morning to discover problems"). Admin-authenticated
// (same requireAdminAuth as every other admin API route), never reachable
// by the public.
//
// Two modes:
//   dryRun: true  — builds the report content and returns it WITHOUT
//                    calling Fast2SMS or writing a scheduled_report_runs
//                    row at all. Use this to preview exactly what a real
//                    9AM/6PM send would contain (inquiry count, message
//                    part count, full rendered text) with zero side
//                    effects and zero Fast2SMS cost.
//   dryRun: false  — actually sends via Fast2SMS to the configured
//                    recipients, using a `test_<timestamp>_<type>`
//                    report_key that can never collide with (or block) a
//                    real scheduled day's report — see the migration
//                    comment in 20260818d_confirmed_ongoing_summary.sql.
//
// POST body: { reportType: 'morning' | 'evening', dryRun?: boolean }

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/admin-auth'
import { runScheduledSummary, type ReportType } from '@/lib/confirmed-ongoing-summary'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as { reportType?: string; dryRun?: boolean } | null
  const reportType = body?.reportType
  if (reportType !== 'morning' && reportType !== 'evening') {
    return NextResponse.json({ error: "reportType must be 'morning' or 'evening'" }, { status: 400 })
  }

  const result = await runScheduledSummary(reportType as ReportType, { manual: true, dryRun: !!body?.dryRun })

  return NextResponse.json({
    reportKey: result.reportKey,
    dryRun: !!body?.dryRun,
    inquiryCount: result.inquiryCount,
    confirmedCount: result.confirmedCount,
    ongoingCount: result.ongoingCount,
    messageParts: result.messageParts,
    recipients: result.recipients,
    success: result.success,
    // Full rendered text for every part — lets a tester eyeball the exact
    // WhatsApp content (character counts, field values, chunking) without
    // needing Supabase or Fast2SMS dashboard access.
    chunks: result.chunks,
    fast2sms: result.fastResults,
  })
}
