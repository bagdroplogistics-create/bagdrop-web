import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireSkybirdAuth, SKYBIRD_PARTNER_NAME } from '@/lib/skybird-auth'
import { STATUS_ORDER } from '@/lib/booking-status'
import { PATCH as adminBookingsPatch } from '@/app/api/admin/bookings/[id]/route'

// ============================================================================
// SKYBIRD PARTNER DASHBOARD — booking workflow status change
// ============================================================================
// Founder spec (SKYBIRD-BOOKING-WORKFLOW-001, 2026-09-07): "Do not create a
// separate workflow from scratch. Reuse the existing Bagdrop booking
// workflow, statuses, business rules, and components wherever possible" /
// "Inspect the actual Bagdrop Admin code/database/API and use the statuses
// currently implemented there."
//
// The real status vocabulary + transition rules live in
// app/api/admin/bookings/[id]/route.ts's PATCH handler — ~900 lines covering
// lifecycle WhatsApp/email de-duped by notified_statuses, LR auto-creation on
// Payment Received, bag-tag generation on Confirmed, Google Calendar sync,
// ops-reminder sync, payment-status recompute, and the payment_approved →
// confirmed auto-chain. Re-implementing any slice of that here for Skybird
// would drift from it the first time that handler changes (the exact class
// of bug STATUS_ORDER/ACTIVE_BOOKING_STATUSES already caused once when it
// was five separately hardcoded copies — see lib/booking-status.ts).
//
// So this route does NOT duplicate that logic. After verifying Skybird auth
// + booking ownership + the same locks the main dashboard's StatusSelect
// enforces, it calls that exact same exported PATCH function in-process,
// with a synthetic request carrying the real ADMIN_SECRET_KEY (read
// server-side from env only — never sent to or seen by the Skybird browser
// client). Effect: byte-for-byte identical behavior to a Bagdrop admin
// changing the same booking's status from the main dashboard — same DB row,
// same tracking ID, no duplicate booking/inquiry, and the change is
// immediately visible in Bagdrop Admin too, since it IS the same write.
//
// Kept as its own route (not folded into app/api/skybird/bookings/[id]/
// route.ts) so Skybird's auth/ownership boundary stays the single obvious
// gate in front of the delegation call, matching this codebase's established
// convention of self-contained, ownership-scoped Skybird routes.
// ============================================================================

// Every status a Skybird admin may set/see — the exact same vocabulary as
// the main Bagdrop Admin Dashboard's STATUS_CONFIG
// (app/(admin)/admin/page.tsx): STATUS_ORDER (lib/booking-status.ts, the
// canonical dependency-free source of truth) plus the three terminal
// branches that live outside the main forward sequence. Kept in sync via
// this comment with STATUS_CONFIG's key list — if a new status is ever added
// there, add it to one of these two places too.
const TERMINAL_STATUSES = ['rejected', 'closed', 'cancelled']
const ALLOWED_STATUSES = new Set<string>([...STATUS_ORDER, ...TERMINAL_STATUSES])

// Same pre-quote lock as the main dashboard's StatusSelect
// (PRE_QUOTE_STATUSES in app/(admin)/admin/page.tsx) — an inquiry with no
// quote yet has nothing meaningful to advance to; a quote must be created
// first via the Bagdrop Admin Leads tab.
const PRE_QUOTE_STATUSES = new Set(['inquiry', 'pending'])

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireSkybirdAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const body = await req.json().catch(() => null)
  const status = body?.status

  if (!status || typeof status !== 'string') {
    return NextResponse.json({ error: 'status is required' }, { status: 400 })
  }
  if (!ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: `Unknown status: ${status}` }, { status: 400 })
  }

  // Ownership boundary — a Skybird key may only ever change a booking it
  // created (partner_name === 'Skybird USA'), same guard as
  // app/api/skybird/bookings/[id]/route.ts's loadOwnedBooking().
  const { data: booking, error: loadErr } = await supabaseAdmin
    .from('bookings')
    .select('id, status, partner_name')
    .eq('id', id)
    .maybeSingle()

  if (loadErr || !booking || booking.partner_name !== SKYBIRD_PARTNER_NAME) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  if (booking.status === status) {
    return NextResponse.json({ error: 'Booking is already at that status' }, { status: 409 })
  }
  if (booking.status === 'completed') {
    return NextResponse.json({ error: 'Booking is completed and cannot be modified' }, { status: 403 })
  }
  if (PRE_QUOTE_STATUSES.has(booking.status)) {
    return NextResponse.json(
      { error: 'A quote must be created for this inquiry before its status can change. Please wait for Bagdrop to send a quote.' },
      { status: 409 }
    )
  }

  const adminKey = process.env.ADMIN_SECRET_KEY
  if (!adminKey) {
    console.error('[skybird booking status] ADMIN_SECRET_KEY not configured — cannot delegate to admin booking handler')
    return NextResponse.json({ error: 'Server misconfiguration. Please contact Bagdrop support.' }, { status: 500 })
  }

  // Synthetic request into the real admin PATCH handler — status-only
  // change, no admin_approve (Skybird should never silently skip the
  // customer notification the way an internal Bagdrop admin sometimes
  // deliberately does), no mark_historical/approved_without_payment (those
  // stay gated to role === 'admin' inside that handler regardless, since
  // we're presenting a genuine ADMIN_SECRET_KEY, but this route never sends
  // them either way).
  const syntheticReq = new NextRequest(new URL(req.url), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-admin-key': adminKey },
    body: JSON.stringify({
      status,
      reason: 'Status updated by Skybird partner dashboard',
    }),
  })

  const adminRes  = await adminBookingsPatch(syntheticReq, { params: Promise.resolve({ id }) })
  const adminJson = await adminRes.json().catch(() => null)

  if (!adminRes.ok) {
    return NextResponse.json({ error: adminJson?.error ?? 'Failed to update status' }, { status: adminRes.status })
  }

  return NextResponse.json({ booking: adminJson?.booking })
}
