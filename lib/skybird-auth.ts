import { NextRequest } from 'next/server'

/**
 * Skybird Partner Dashboard auth — completely separate from lib/admin-auth.ts
 * on purpose:
 *
 *   - Different header (x-skybird-key, not x-admin-key)
 *   - Different env var (SKYBIRD_SECRET_KEY, not ADMIN_SECRET_KEY / STAFF_SECRET_KEY)
 *   - Different code path entirely — a Skybird key must NEVER satisfy
 *     requireAdminAuth()/getAdminRole() (BagDrop Admin Dashboard + APIs), and
 *     an admin/staff key must NEVER satisfy requireSkybirdAuth() (Skybird
 *     Partner Dashboard + APIs).
 *
 * MVP auth model: one shared secret key for the whole Skybird team (matches
 * how BagDrop's own admin/staff login already works). No per-agent identity
 * yet — every Skybird-created inquiry is tagged source='skybird',
 * partner_name='Skybird USA' regardless of which individual agent submits it.
 *
 * Key can be supplied as:
 *   - x-skybird-key header
 *   - ?key= query param
 */
export type SkybirdRole = 'skybird' | null

export function getSkybirdRole(req: NextRequest): SkybirdRole {
  const provided = req.headers.get('x-skybird-key') ?? req.nextUrl.searchParams.get('key')
  if (!provided) return null
  if (process.env.SKYBIRD_SECRET_KEY && provided === process.env.SKYBIRD_SECRET_KEY) return 'skybird'
  return null
}

/** Returns true if the caller is authenticated as Skybird. */
export function requireSkybirdAuth(req: NextRequest): boolean {
  return getSkybirdRole(req) !== null
}

/** Fixed partner identity for this MVP (single-partner) launch. */
export const SKYBIRD_SOURCE = 'skybird'
export const SKYBIRD_PARTNER_NAME = 'Skybird USA'
