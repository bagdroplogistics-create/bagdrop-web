// BAGDROP — lib/auto-lost-inquiries.ts
//
// Auto-close stale inquiries: once a lead's requested pickup_date has
// already passed and the lead never turned into a real, paid/committed
// booking, flip leads.status to 'lost' so it drops out of the active
// pipeline the same way a manually-marked-Lost lead does — excluded from
// the Leads tab's default view and the Dashboard's Pending/Total Inquiry
// counts (see app/api/admin/leads/route.ts's default-view `.neq('status',
// 'lost')` filter and app/api/admin/dashboard-analytics/route.ts's
// rejected-bucket mapping).
//
// Deliberately conservative about what counts as "already committed" —
// PROTECTED_BOOKING_STATUSES below mirrors ACTIVE_STATUSES in
// app/api/admin/leads/route.ts (must stay in sync with it) plus
// 'completed'. Anything from an actual payment landing
// (payment_received/payment_approved) through Confirmed/pickup/delivery/
// Completed is left completely untouched, even though its pickup_date is
// now necessarily in the past for a Completed booking — that's expected,
// not a sign the inquiry died. Only leads still sitting at status
// 'new'/'contacted'/'qualified' — i.e. nobody ever explicitly converted or
// lost them — whose linked booking (if one even exists) never progressed
// past quote/acceptance/payment-pending are touched.
//
// Run two ways: (1) app/api/cron/mark-lost-inquiries/route.ts, meant to be
// hit once daily by an external scheduler (cron-job.org/EasyCron — same
// pattern as the other app/api/cron/* routes, since Vercel Hobby only
// allows daily-frequency native cron); (2) opportunistically inside GET
// /api/admin/leads, so the Leads tab self-heals the moment it's opened
// even before that external cron is registered.

import { supabaseAdmin } from './supabase'

const PROTECTED_BOOKING_STATUSES = [
  'payment_received', 'payment_approved', 'confirmed', 'invoice_generated', 'invoice_sent',
  'pickup_scheduled', 'picked_up', 'in_transit', 'out_for_delivery', 'driver_details_shared',
  'indemnity_bond_sent', 'delivered', 'trip_created', 'completed',
]

export interface AutoLostResult {
  checked: number
  marked: number
  leadIds: string[]
  error?: string
}

export async function autoMarkLostInquiries(): Promise<AutoLostResult> {
  // Plain `date` column (YYYY-MM-DD) — string comparison is safe here.
  const today = new Date().toISOString().slice(0, 10)

  let candidates: { id: string; booking_id: string | null; pickup_date: string | null }[] | null = null
  let candErr: { message: string } | null = null

  {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('id, booking_id, pickup_date')
      .in('status', ['new', 'contacted', 'qualified'])
      .not('pickup_date', 'is', null)
      .lt('pickup_date', today)
      .is('deleted_at', null)
    candidates = data; candErr = error
  }

  // Defensive fallback: deleted_at may not exist yet on some environments
  // (same situation already handled in GET /api/admin/leads).
  if (candErr && candErr.message?.includes('deleted_at')) {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('id, booking_id, pickup_date')
      .in('status', ['new', 'contacted', 'qualified'])
      .not('pickup_date', 'is', null)
      .lt('pickup_date', today)
    candidates = data; candErr = error
  }

  if (candErr) {
    console.error('[auto-lost-inquiries] candidate query failed:', candErr.message)
    return { checked: 0, marked: 0, leadIds: [], error: candErr.message }
  }
  if (!candidates || candidates.length === 0) {
    return { checked: 0, marked: 0, leadIds: [] }
  }

  const bookingIds = candidates.map(l => l.booking_id).filter((id): id is string => !!id)
  let protectedBookingIds = new Set<string>()
  if (bookingIds.length > 0) {
    const { data: bookings } = await supabaseAdmin
      .from('bookings')
      .select('id, status')
      .in('id', bookingIds)
      .in('status', PROTECTED_BOOKING_STATUSES)
    protectedBookingIds = new Set((bookings ?? []).map(b => b.id))
  }

  const toMark = candidates.filter(l => !l.booking_id || !protectedBookingIds.has(l.booking_id))
  if (toMark.length === 0) {
    return { checked: candidates.length, marked: 0, leadIds: [] }
  }

  const leadIds = toMark.map(l => l.id)
  const { error: updateErr } = await supabaseAdmin
    .from('leads')
    .update({ status: 'lost' })
    .in('id', leadIds)

  if (updateErr) {
    console.error('[auto-lost-inquiries] update failed:', updateErr.message)
    return { checked: candidates.length, marked: 0, leadIds: [], error: updateErr.message }
  }

  // Best-effort audit trail per lead — same communication_log append
  // pattern already used by lib/sales-followup-reminders.ts. Not fatal if
  // this fails; the status change above is what actually matters and has
  // already succeeded.
  for (const lead of toMark) {
    try {
      const { data: row } = await supabaseAdmin
        .from('leads')
        .select('communication_log')
        .eq('id', lead.id)
        .maybeSingle()
      const log = Array.isArray(row?.communication_log) ? row.communication_log : []
      log.push({
        type: 'status_change',
        channel: 'system',
        status: 'sent',
        timestamp: new Date().toISOString(),
        detail: `Auto-marked Lost — pickup date (${lead.pickup_date}) passed with no booking progress.`,
      })
      await supabaseAdmin.from('leads').update({ communication_log: log }).eq('id', lead.id)
    } catch (e) {
      console.warn('[auto-lost-inquiries] communication_log append failed for', lead.id, e)
    }
  }

  console.log(`[auto-lost-inquiries] Marked ${leadIds.length} stale inquiry(ies) Lost:`, leadIds)
  return { checked: candidates.length, marked: leadIds.length, leadIds }
}
