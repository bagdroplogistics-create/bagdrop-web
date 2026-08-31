// BAGDROP — lib/booking-status.ts
//
// Dependency-free source of truth for the booking status sequence. Split out
// of lib/lifecycle-notifications.ts (2026-08-24) specifically so it can be
// safely imported from CLIENT components (e.g. app/(admin)/admin/page.tsx,
// a 'use client' file). lifecycle-notifications.ts imports supabaseAdmin
// (lib/supabase.ts, which reads process.env.SUPABASE_SERVICE_ROLE_KEY at
// module scope) — pulling that into a client bundle is unsafe, the same
// class of bug already hit once this session with lib/payment-status.ts
// (fixed by extracting lib/payment-ledger.ts). This file has ZERO imports,
// so it's safe anywhere: server routes, server libs, and client components.
//
// lifecycle-notifications.ts re-exports everything from here for backward
// compatibility with its existing server-side importers — no other file
// needs to change which module it imports from unless it's a client file.

// Full booking status sequence (superset — includes the airport-only
// 'driver_details_shared' step, harmless for non-airport bookings since
// that value is simply never reached there). Used to tell forward progress
// apart from a backward move, and to derive ACTIVE_BOOKING_STATUSES below.
export const STATUS_ORDER = [
  'inquiry', 'quote_created', 'quote_sent', 'accepted',
  'payment_pending', 'payment_received', 'payment_approved',
  'confirmed', 'indemnity_bond_sent', 'indemnity_bond_signed',
  'invoice_generated', 'invoice_sent',
  'pickup_scheduled', 'picked_up', 'in_transit',
  'out_for_delivery', 'driver_details_shared', 'delivered',
  'trip_created', 'completed',
]

// Every "paid and moving through fulfillment, short of Completed" status —
// the single source of truth for what several places in this app call
// "Confirmed"/"active" bookings (Dashboard's "Total Confirmed Bookings" KPI,
// the Leads tab's Confirmed badge, the legacy quotes-table list, and the
// auto-lost-inquiry guard that must never touch a live booking).
//
// 2026-08-24 fix: this used to be FIVE separately hardcoded arrays (app/api/
// admin/leads/route.ts, app/api/admin/dashboard-analytics/route.ts, app/
// (admin)/admin/page.tsx, app/api/admin/quotes/route.ts, lib/auto-lost-
// inquiries.ts), all copy-pasted from each other and all missing
// 'indemnity_bond_signed' — added as its own distinct status (between
// indemnity_bond_sent and invoice_generated) after those lists were first
// written, and never backfilled into any of them. Net effect: a booking
// that reached Indemnity Bond Signed (a real, paid, actively-progressing
// booking) silently stopped counting as "Confirmed" anywhere, and — worse —
// lib/auto-lost-inquiries.ts's identical list is what protects a live
// booking from being auto-marked 'lost' once its pickup_date passes, so a
// delayed pickup on an indemnity-signed booking could have gotten its lead
// wrongly auto-closed. Deriving this as a STATUS_ORDER slice (the same
// proven-correct approach already used by OPS_ACTIVE_STATUSES in app/api/
// admin/reports/operations/route.ts and ONGOING_STATUSES in lib/confirmed-
// ongoing-summary.ts) means any future status inserted between
// 'payment_received' and 'completed' is automatically included everywhere
// that reads this constant — there's nothing left to fall out of sync.
export const ACTIVE_BOOKING_STATUSES = STATUS_ORDER.slice(
  STATUS_ORDER.indexOf('payment_received'),
  STATUS_ORDER.indexOf('completed'),
)

// Every status BEFORE payment has actually come in — 'inquiry' through
// 'payment_pending'. This is the "Admin hasn't committed to fulfilling this
// yet" range the Cancel Booking feature (2026-08-31) is scoped to: an
// inquiry/quote the admin decides not to proceed with (out of service area,
// route unsupported, customer declined, etc.). Deliberately excludes
// 'payment_received' onward — once money has actually come in, cancelling
// is a different, higher-stakes operation this first version doesn't cover
// (see the founder spec: "be careful with confirmed bookings... focus this
// functionality on unconfirmed inquiries/bookings"). Also excludes the
// existing terminal branches 'cancelled'/'rejected' (nothing to cancel
// twice) since those aren't in STATUS_ORDER at all, so a plain slice
// naturally never includes them.
export const UNCONFIRMED_BOOKING_STATUSES = STATUS_ORDER.slice(
  0,
  STATUS_ORDER.indexOf('payment_received'),
)

export function isForwardMove(oldStatus: string | null | undefined, newStatus: string): boolean {
  if (!oldStatus) return true
  const oldIdx = STATUS_ORDER.indexOf(oldStatus)
  const newIdx = STATUS_ORDER.indexOf(newStatus)
  // Unknown/unlisted status on either side (e.g. 'rejected', a terminal
  // branch not part of the main sequence) — default to allowing the send,
  // matching the same "unknown defaults to advanceable" rule used in
  // generate-quote's canUpdateStatus.
  if (oldIdx === -1 || newIdx === -1) return true
  return newIdx > oldIdx
}
