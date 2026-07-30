import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { buildGoogleAuthUrl } from '@/lib/google-calendar'

export const runtime = 'nodejs'

// ── GET /api/admin/google-calendar/connect?key=... ─────────────────────────
// Admin-only (connecting a Google account is an account-level action, not a
// routine one — same tier as Settings). Redirects straight into Google's
// OAuth consent screen. The admin key travels in `state` so the callback can
// confirm this is still the same authenticated session when Google redirects
// back — the same "key in the URL" convention already used for every other
// GET-based admin link in this codebase (Skybird, Trip Sheets, etc.).
export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'Only admin can connect Google Calendar' }, { status: 403 })
  }
  const key = req.nextUrl.searchParams.get('key') ?? ''
  return NextResponse.redirect(buildGoogleAuthUrl(key))
}
