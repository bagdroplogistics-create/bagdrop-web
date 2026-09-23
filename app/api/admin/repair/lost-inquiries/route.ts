import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

/**
 * GET /api/admin/repair/lost-inquiries
 *
 * Lists rows from inquiry_creation_failures (see
 * supabase/migrations/20260822_inquiry_creation_failures.sql /
 * lib/creation-failure-alert.ts) — every time a BDA/BDL number was minted
 * but the actual booking/lead insert then failed, leaving the customer's
 * inquiry number burned with nothing saved. Powers the Lost Inquiries admin
 * page (app/(admin)/admin/repair/lost-inquiries), which lets an admin
 * recreate a lost website/mobile-app booking with one click straight from
 * its captured raw_payload (see recreate-lost-inquiry's
 * flattenRawBookingPayload) instead of hand-copying fields out of a JSON
 * blob or emailing/calling the customer to re-ask for their details.
 *
 * Read-only, staff-or-admin (requireAdminAuth) — the actual recreate action
 * (POST /api/admin/repair/recreate-lost-inquiry) stays admin-only.
 *
 * ?resolved=true shows already-resolved rows instead (default: unresolved
 * only, resolved_at IS NULL) — for looking back at what's already been
 * handled.
 */
export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const showResolved = req.nextUrl.searchParams.get('resolved') === 'true'

  let query = supabaseAdmin
    .from('inquiry_creation_failures')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  query = showResolved ? query.not('resolved_at', 'is', null) : query.is('resolved_at', null)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ failures: data ?? [] })
}

/**
 * PATCH /api/admin/repair/lost-inquiries
 *
 * Marks a failure row resolved WITHOUT recreating anything — for the "bot
 * probe / not a real customer" case the original migration's own comment
 * anticipated ("...or confirmed it's safe to ignore (e.g. a bot probe)"),
 * which the Lost Inquiries page otherwise has no way to clear.
 */
export async function PATCH(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const id = body?.id?.trim()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('inquiry_creation_failures')
    .update({
      resolved_at:   new Date().toISOString(),
      resolved_note: (body?.resolved_note?.trim()) || 'Marked resolved (no recreation) — not a real customer inquiry.',
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
