// BAGDROP — lib/service-type.ts
//
// Pure, dependency-free helpers for deriving workflow behavior from a
// booking's raw `service_type` string. Deliberately has ZERO imports (no
// supabaseAdmin, no email/WhatsApp libs) so it's safe to import from BOTH
// the client-side Booking Workflow page (app/(admin)/admin/quotes/view/
// [lead_id]/page.tsx, a 'use client' component) and server-side API routes
// (app/api/admin/bookings/[id]/route.ts) — one shared source of truth
// instead of two copies of the same regex drifting apart.
//
// Known raw `service_type` values actually stored on bookings.service_type,
// from two different creation paths that were never unified:
//   - Admin-created quotes/leads (app/(admin)/admin/quotes/new/page.tsx,
//     app/(admin)/admin/leads/page.tsx) — directional pairs:
//       'doorstep-to-airport', 'airport-to-doorstep',
//       'doorstep-to-doorstep', 'airport-to-airport'
//     plus older aliases seen in historical data: 'door-to-airport',
//     'airport-to-door'.
//   - Public customer booking form (app/api/bookings/route.ts, contact/y2k
//     forms) — a non-directional service *category* id from
//     lib/constants.ts SERVICE_TYPES, e.g. 'airport-delivery',
//     'excess-baggage', 'door-to-door', 'destination-weddings',
//     'corporate-travel', 'student-relocation'.

/**
 * "Driver Details Shared" step — founder spec, 2026-08-22.
 *
 * Rule: the step only matters when the booking's DESTINATION leg is an
 * airport — i.e. the customer themselves has to meet the driver in person
 * at the airport to collect/hand over bags, so they need the driver's name,
 * phone, and vehicle number ahead of time. When the destination is a
 * doorstep, Bagdrop's driver comes to the customer instead, so there's
 * nothing for the customer to be told in advance.
 *
 *   Doorstep → Airport   ✅ show (destination = Airport)
 *   Airport  → Airport   ✅ show (destination = Airport)
 *   Airport  → Doorstep  ❌ hide (destination = Doorstep)
 *   Doorstep → Doorstep  ❌ hide (destination = Doorstep)
 *
 * ASSUMPTION (flag for founder confirmation): the public booking form's
 * generic 'airport-delivery' category has no stored direction, but its own
 * marketing copy describes it as "Pickup from airport, delivered to your
 * door" (lib/constants.ts) — i.e. destination = Doorstep — so it's treated
 * as hidden here, same bucket as Airport → Doorstep. If Bagdrop ever wants
 * 'airport-delivery' bookings to show this step, the public form needs to
 * start capturing an actual direction instead of one generic category.
 */
export function shouldShowDriverDetailsStep(serviceType: string | null | undefined): boolean {
  const normalized = (serviceType ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-')
  if (!normalized) return false

  const DESTINATION_AIRPORT = new Set([
    'doorstep-to-airport',
    'door-to-airport',   // legacy alias
    'airport-to-airport',
  ])
  return DESTINATION_AIRPORT.has(normalized)
}
