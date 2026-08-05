import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { getFollowupSettings } from '@/lib/sales-followup-reminders'

export const dynamic = 'force-dynamic'

// Dedicated, self-contained endpoint for the Dashboard's "Sales Follow-up"
// cards — deliberately NOT folded into app/api/admin/dashboard-analytics/
// route.ts to avoid any risk to that existing, already-tuned endpoint.
// Everything here is computed live from leads (+ the one linked booking
// per lead, for the response-track stop condition) — nothing depends on
// lead_followups having already been scheduled by a cron tick, so the
// counts are accurate even if the external cron scheduler is briefly down.
export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await getFollowupSettings()

  const { data: leads, error } = await supabaseAdmin
    .from('leads')
    .select('id, quote_number, quote_date, created_at, customer_responded_at, status, booking_id')
    .neq('status', 'lost')
    .limit(2000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const bookingIds = (leads ?? []).map(l => l.booking_id).filter(Boolean) as string[]
  let bookingRows: { id: string; status: string }[] = []
  if (bookingIds.length) {
    const { data } = await supabaseAdmin.from('bookings').select('id, status').in('id', bookingIds)
    bookingRows = data ?? []
  }
  const bookingStatusById = new Map(bookingRows.map(b => [b.id, b.status]))

  const now = Date.now()
  const quoteThresholdMs = settings.quoteReminderHours * 3600000
  const responseThresholdMs = settings.responseReminderHours * 3600000

  // IST day boundaries for "today" / "tomorrow", expressed in UTC ms.
  const IST_OFFSET_MS = (5 * 60 + 30) * 60000
  const nowIst = new Date(now + IST_OFFSET_MS)
  const istMidnightUtcMs = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()) - IST_OFFSET_MS
  const todayStart = istMidnightUtcMs
  const todayEnd = todayStart + 24 * 3600000
  const tomorrowStart = todayEnd
  const tomorrowEnd = tomorrowStart + 24 * 3600000

  let quotesPending = 0, overdueQuotes = 0
  let followupPending = 0, overdueFollowups = 0
  let todaysFollowups = 0, tomorrowsFollowups = 0

  for (const l of leads ?? []) {
    if (!l.quote_number) {
      quotesPending++
      if (now - new Date(l.created_at).getTime() >= quoteThresholdMs) overdueQuotes++
      continue
    }

    if (l.customer_responded_at) continue
    const bStatus = l.booking_id ? bookingStatusById.get(l.booking_id) : undefined
    if (bStatus && bStatus !== 'quote_sent' && bStatus !== 'quote_created' && bStatus !== 'inquiry') continue
    if (!l.quote_date) continue

    followupPending++
    const dueAt = new Date(l.quote_date).getTime() + responseThresholdMs
    if (now >= dueAt) overdueFollowups++
    else if (dueAt >= todayStart && dueAt < todayEnd) todaysFollowups++
    else if (dueAt >= tomorrowStart && dueAt < tomorrowEnd) tomorrowsFollowups++
  }

  return NextResponse.json({
    quotesPending, followupPending, overdueQuotes, overdueFollowups,
    todaysFollowups, tomorrowsFollowups,
  })
}
