// BAGDROP ADMIN — mirrors lib/service-type.ts's shouldShowDriverDetailsStep
// on the website exactly (same normalized-value set) — added 2026-09-05 for
// the Driver Assignment & Share card on mobile. Kept in sync manually since
// this is a separate Expo project with no shared package between the two.
export function shouldShowDriverDetailsStep(serviceType: string | null | undefined): boolean {
  const normalized = (serviceType ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-')
  if (!normalized) return false

  const DESTINATION_AIRPORT = new Set([
    'doorstep-to-airport',
    'door-to-airport', // legacy alias
    'airport-to-airport',
  ])
  return DESTINATION_AIRPORT.has(normalized)
}
