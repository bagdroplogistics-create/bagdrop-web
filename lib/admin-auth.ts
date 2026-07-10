import { NextRequest } from 'next/server'

export type AdminRole = 'admin' | 'staff' | null

/**
 * Returns the role of the caller, or null if unauthorized.
 *
 * Env vars:
 *   ADMIN_SECRET_KEY  — full admin access
 *   STAFF_SECRET_KEY  — limited staff access
 *
 * Key can be supplied as:
 *   - x-admin-key header
 *   - ?key= query param
 */
export function getAdminRole(req: NextRequest): AdminRole {
  const provided = req.headers.get('x-admin-key') ?? req.nextUrl.searchParams.get('key')
  if (!provided) return null
  if (process.env.ADMIN_SECRET_KEY && provided === process.env.ADMIN_SECRET_KEY) return 'admin'
  if (process.env.STAFF_SECRET_KEY  && provided === process.env.STAFF_SECRET_KEY)  return 'staff'
  return null
}

/** Returns true if the caller is authenticated as either admin or staff. */
export function requireAdminAuth(req: NextRequest): boolean {
  return getAdminRole(req) !== null
}

/** Returns true only if the caller is an admin (not staff). */
export function requireAdmin(req: NextRequest): boolean {
  return getAdminRole(req) === 'admin'
}
