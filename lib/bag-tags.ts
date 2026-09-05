// BAGDROP — Operational Baggage Tag System (Phase 1)
//
// Shared helpers for the BagDrop Bag ID / QR / tag-tracking system. Used
// by both Individual bookings (bags created here, on confirm) and Group
// bookings (bags already created via the manifest — guests/import routes
// — this file just adds the bag_label + tag lifecycle on top).
//
// IMPORTANT: BagDrop's own Bag ID/QR are an OPERATIONAL tracking tag
// only — never represented as an airline-issued baggage tag, and this
// file never generates an airline baggage identifier (see the separate
// airline_* columns on group_bags, always staff-entered).
import { supabaseAdmin } from './supabase'
import { mintBagIds } from './group-booking'

// ── Canonical 8-stage status vocabulary ───────────────────────────────
// Forward chain: tag_generated → tag_printed → pickup_pending →
// picked_up → airport_handover → in_transit → delivered.
// delivery_exception is a side-branch (can be reached from any active
// status), not part of the forward chain.
export const BAG_STATUSES = [
  'tag_generated',
  'tag_printed',
  'pickup_pending',
  'picked_up',
  'airport_handover',
  'in_transit',
  'delivered',
  'delivery_exception',
] as const
export type BagStatus = typeof BAG_STATUSES[number]

export const BAG_STATUS_LABELS: Record<BagStatus, string> = {
  tag_generated:      'Tag Generated',
  tag_printed:        'Tag Printed',
  pickup_pending:     'Pickup Pending',
  picked_up:          'Picked Up',
  airport_handover:   'Airport Handover',
  in_transit:         'In Transit',
  delivered:          'Delivered',
  delivery_exception: 'Delivery Failed / Exception',
}

export function isBagStatus(v: unknown): v is BagStatus {
  return typeof v === 'string' && (BAG_STATUSES as readonly string[]).includes(v)
}

// ── Bag Label generation ──────────────────────────────────────────────
// {booking identifier}-{seq}. Individual bookings use bookings.tracking_id
// (BDL-2026-0152) and pad to 2 digits (spec example: -01, -02). Group
// bookings use group_booking_details.group_booking_number (GBL-2026-0001)
// and pad to 3 digits (spec example: -001 .. -150, "support large group
// bookings such as 150 bags"). Padding is fixed per booking type rather
// than derived from the eventual total, since group bags are added
// incrementally over time (manifest import, guest-by-guest) — a fixed
// width means an already-printed tag's label never has to change if more
// guests/bags are added later.
export function generateBagLabel(bookingIdentifier: string, seq: number, isGroup: boolean): string {
  const width = isGroup ? 3 : 2
  return `${bookingIdentifier}-${String(seq).padStart(width, '0')}`
}

// ── Ensure bags exist for a booking (Individual bookings) ─────────────
// Individual bookings have no manifest UI — this is the ONLY place their
// group_bags rows get created, called right after a booking's status
// reaches 'confirmed' (see app/api/admin/bookings/[id]/route.ts). Group
// bookings never call this — their bags come from the guest/import flow.
//
// Idempotent: if bags already exist for this booking (e.g. re-confirmed,
// or this ran once already), it does nothing and returns the existing
// rows. Never throws — callers treat this as best-effort, exactly like
// the existing auto-create-LR-on-payment_received pattern.
export async function ensureBagsForBooking(bookingId: string): Promise<{ created: number; error?: string }> {
  try {
    const { count: existingCount } = await supabaseAdmin
      .from('group_bags')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', bookingId)
      .is('deleted_at', null)

    if ((existingCount ?? 0) > 0) return { created: 0 } // already has bags — no-op

    const { data: booking, error: bookingErr } = await supabaseAdmin
      .from('bookings')
      .select('id, tracking_id, booking_type, total_bags, status')
      .eq('id', bookingId)
      .maybeSingle()

    if (bookingErr || !booking) return { created: 0, error: bookingErr?.message ?? 'Booking not found' }
    if (booking.booking_type === 'group') return { created: 0 } // group bags come from the manifest, not here

    const totalBags = Math.max(1, Number(booking.total_bags) || 1)
    const now = new Date().toISOString()

    // bag_number still uses the same atomic GBAG series every group-
    // booking bag uses (lib/group-booking.ts's mintBagIds/nextBagId) —
    // kept purely as an internal, never-reused, never-shown database
    // key; bag_label (below) is the real tag/QR-facing id.
    const bagNumbers = await mintBagIds(totalBags)

    const rows = bagNumbers.map((bag_number, i) => ({
      booking_id:        bookingId,
      guest_id:          null, // Individual bookings have no guest/manifest concept
      bag_number,
      bag_label:         generateBagLabel(booking.tracking_id, i + 1, false),
      status:            'tag_generated',
      tag_generated_at:  now,
    }))

    const { error: insertErr } = await supabaseAdmin.from('group_bags').insert(rows)
    if (insertErr) return { created: 0, error: insertErr.message }

    // Log one tracking event per bag so the operational history starts
    // from tag generation, same shape Phase 2's scan events will use.
    const { data: inserted } = await supabaseAdmin
      .from('group_bags').select('id').eq('booking_id', bookingId).is('deleted_at', null)
    if (inserted?.length) {
      await supabaseAdmin.from('bag_tracking_events').insert(
        inserted.map(b => ({ bag_id: b.id, status: 'tag_generated', note: 'Tag auto-generated on booking confirmation', changed_by: 'system' }))
      )
    }

    return { created: totalBags }
  } catch (err) {
    return { created: 0, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ── Next Group Bag Labels ──────────────────────────────────────────────
// Group bookings add bags incrementally (guest-by-guest, or a bulk
// import) rather than all at once like an Individual booking's
// ensureBagsForBooking above — so label sequencing has to pick up from
// wherever the manifest currently is. Counts ALL bags ever created for
// this booking (including soft-deleted ones), never just the active
// count, so a removed bag's sequence number/label is never reissued —
// same rule the rest of this module follows for bag_number.
export async function nextGroupBagLabels(bookingId: string, groupBookingNumber: string, count: number): Promise<string[]> {
  const { count: everCreated } = await supabaseAdmin
    .from('group_bags')
    .select('id', { count: 'exact', head: true })
    .eq('booking_id', bookingId)

  const startSeq = (everCreated ?? 0) + 1
  return Array.from({ length: count }, (_, i) => generateBagLabel(groupBookingNumber, startSeq + i, true))
}

// ── Tracking event logger ──────────────────────────────────────────────
// Shared by every status-changing action (Phase 1: manual admin edits;
// Phase 2: driver QR-scan). Never throws — a failed log write must not
// block the actual status update it's recording.
export async function trackBagEvent(
  bagId: string,
  status: string,
  opts?: { note?: string; changedBy?: string; latitude?: number; longitude?: number }
): Promise<void> {
  try {
    await supabaseAdmin.from('bag_tracking_events').insert({
      bag_id:     bagId,
      status,
      note:       opts?.note ?? null,
      changed_by: opts?.changedBy ?? 'admin',
      latitude:   opts?.latitude ?? null,
      longitude:  opts?.longitude ?? null,
    })
  } catch (err) {
    console.error('[trackBagEvent] Failed to log tracking event (non-fatal):', err)
  }
}

// Bag-tag QR payload — the bag's own bag_label ONLY. Deliberately never
// encodes customer name/phone/address (spec: "Do not put sensitive
// customer information directly inside the QR code") — the scan page
// (Phase 2) looks the label up server-side to show full detail.
export function bagTrackingUrl(bagLabel: string): string {
  return `https://www.bagdrop.co/track-bag/${encodeURIComponent(bagLabel)}`
}
