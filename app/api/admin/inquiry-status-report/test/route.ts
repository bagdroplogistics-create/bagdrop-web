// app/api/admin/inquiry-status-report/test/route.ts
//
// Manual test-trigger for the Automatic Inquiry Status Email Report
// (lib/inquiry-status-email-report.ts) — mirrors
// app/api/admin/confirmed-ongoing-summary/test/route.ts's shape. Admin-
// authenticated, never reachable by the public.
//
// Two modes:
//   dryRun: true  — builds the report HTML from live data and returns it
//                    WITHOUT sending via Resend or writing an
//                    inquiry_status_email_runs row at all. Use this to
//                    preview exactly what the real 9 AM send would contain.
//   dryRun: false — actually sends via Resend to info@bagdrop.co, using a
//                    `test_<timestamp>` report_key that can never collide
//                    with (or block) a real scheduled day's report.
//
// POST body: { dryRun?: boolean }

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/admin-auth'
import { runInquiryStatusEmailReport } from '@/lib/inquiry-status-email-report'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as { dryRun?: boolean } | null
  const result = await runInquiryStatusEmailReport({ manual: true, dryRun: !!body?.dryRun })

  return NextResponse.json({
    reportKey: result.reportKey,
    dryRun: !!body?.dryRun,
    confirmedCount: result.confirmedCount,
    ongoingCount: result.ongoingCount,
    quotePendingCount: result.quotePendingCount,
    recipients: result.recipients,
    success: result.success,
    // Full rendered HTML for eyeballing content/layout without needing
    // Supabase or Resend dashboard access.
    html: result.html,
  })
}
