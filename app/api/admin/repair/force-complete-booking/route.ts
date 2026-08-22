import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

/**
 * POST /api/admin/repair/force-complete-booking
 * Body: { tracking_id: string } OR { booking_id: string }
 *
 * Administrative override: jumps a booking straight to 'completed',
 * bypassing the normal Booking Workflow steps (payment → LR → tripsheet →
 * delivery), for cases where the service genuinely happened but wasn't
 * tracked through the full digital workflow — e.g. a lead that got
 * auto-marked Lost by the pickup-date sweep before the founder had a
 * chance to record the real outcome (founder request, 2026-08-22, lead
 * BDL-2026-0119 / Ms. Anjna Desai).
 *
 * Deliberately narrow — only ever sets status to 'completed', never
 * anything else, so this can't be used to skip validation on any other
 * transition. Uses the exact same lock as the generic PATCH
 * /api/admin/bookings/[id] (an already-completed booking can't be
 * re-completed or otherwise modified).
 *
 * Note on the Leads tab: a lead's badge is its own separate leads.status
 * field. GET /api/admin/leads now shows a lead's *real* booking status
 * once that booking reaches 'completed' (added 2026-08-22, same fix as
 * this route) — but the default Leads view also hard-excludes anything
 * with leads.status = 'lost' (query.neq('status','lost')), so a lead
 * would still be invisible there even with a correct "Completed" badge
 * available. So this ALSO flips the linked lead's raw status from 'lost'
 * to 'converted' when it force-completes a booking, purely so the record
 * shows up in normal browsing again — the badge itself will still read
 * "Completed" either way, since that's driven by the booking status, not
 * this field.
 */
export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const trackingId: string | undefined = body?.tracking_id
  const bookingId:  string | undefined = body?.booking_id
  if (!trackingId && !bookingId) {
    return NextResponse.json({ error: 'tracking_id or booking_id is required' }, { status: 400 })
  }

  const bookingQuery = supabaseAdmin.from('bookings').select('id, tracking_id, status, status_history')
  const { data: booking, error: fetchErr } = bookingId
    ? await bookingQuery.eq('id', bookingId).maybeSingle()
    : await bookingQuery.eq('tracking_id', trackingId).maybeSingle()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!booking)  return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  if (booking.status === 'completed') {
    return NextResponse.json({ booking, updated: false, message: 'Already completed' })
  }

  const history = Array.isArray(booking.status_history) ? booking.status_history : []
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('bookings')
    .update({
      status: 'completed',
      status_history: [
        ...history,
        {
          from: booking.status,
          to: 'completed',
          timestamp: new Date().toISOString(),
          changed_by: 'admin',
          note: 'Force-completed via repair tool — service confirmed done outside the tracked workflow',
        },
      ],
    })
    .eq('id', booking.id)
    .select()
    .single()

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Flip the linked lead off 'lost' so it's visible in normal browsing
  // again (see module comment above) — only touches it if it was
  // literally 'lost'; leaves any other status (new/contacted/qualified/
  // converted) exactly as it was.
  let leadUpdated = false
  const { data: linkedLead } = await supabaseAdmin
    .from('leads')
    .select('id, status')
    .eq('booking_id', booking.id)
    .maybeSingle()
  if (linkedLead && linkedLead.status === 'lost') {
    const { error: leadUpdateErr } = await supabaseAdmin
      .from('leads')
      .update({ status: 'converted' })
      .eq('id', linkedLead.id)
    if (leadUpdateErr) {
      console.error('[force-complete-booking] Failed to un-Lost linked lead:', leadUpdateErr.message)
    } else {
      leadUpdated = true
    }
  }

  return NextResponse.json({ booking: updated, updated: true, lead_unlost: leadUpdated })
}
