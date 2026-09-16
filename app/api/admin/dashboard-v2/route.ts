import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/admin-auth'
import { getDashboardData, DashboardRangePreset } from '@/lib/dashboard-analytics-v2'

export const runtime = 'nodejs'

// BAGDROP — GET /api/admin/dashboard-v2
// Backs the redesigned Dashboard & Bookings admin page (founder request,
// 2026-09-16). Single endpoint for every KPI/section on the new dashboard —
// see lib/dashboard-analytics-v2.ts for the full aggregation logic and why
// this is a new file rather than an edit to the old dashboard-analytics
// route (which stays untouched — still used by the mobile admin-app).
//
// Query params:
//   range      = today | this_week | this_month | last_month | this_year | custom  (default this_month)
//   date_from, date_to = 'YYYY-MM-DD', only used when range=custom
const VALID_PRESETS = new Set(['today', 'this_week', 'this_month', 'last_month', 'this_year', 'all_time', 'custom'])

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const rangeParam = searchParams.get('range') ?? 'this_month'
  const preset: DashboardRangePreset = (VALID_PRESETS.has(rangeParam) ? rangeParam : 'this_month') as DashboardRangePreset
  const dateFrom = searchParams.get('date_from')
  const dateTo   = searchParams.get('date_to')

  try {
    const data = await getDashboardData(preset, dateFrom, dateTo)
    return NextResponse.json(data)
  } catch (err) {
    console.error('[dashboard-v2] failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Dashboard analytics failed' }, { status: 500 })
  }
}
