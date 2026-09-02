// BAGDROP — lib/branch-auth.ts
//
// Branch-scoped access, layered on top of the existing lib/admin-auth.ts
// two-key model rather than replacing it. There is no individual staff
// login anywhere in this app (see admin-auth.ts — a single shared
// ADMIN_SECRET_KEY or STAFF_SECRET_KEY, no per-user identity at all), so
// "which branch can this caller act on" can only mean "which key did they
// present," the same shape the rest of the app already uses. Founder
// decision (2026-09-02): the two existing keys become the "Super Admin"
// tier (unchanged — full access to every branch, exactly as they already
// have full access to everything else today); a brand new per-branch
// access_key (stored on branches.access_key, generated in
// app/api/admin/branches/route.ts) is the "Branch Admin/Manager" tier,
// scoped to exactly one branch.
//
// This is deliberately NOT real per-user accountability — a branch key
// says "someone with the Mumbai key did this," not "Ramesh did this." A
// genuine individual-login system would be a much larger project (see the
// conversation this was scoped in); this is the fast, backend-enforced
// option that was explicitly chosen over that.

import { NextRequest } from 'next/server'
import { supabaseAdmin } from './supabase'
import { getAdminRole } from './admin-auth'

export type BranchAccess =
  | { role: 'super_admin'; branchId: null }
  | { role: 'branch'; branchId: string }

/**
 * Resolves the caller's branch scope from the same x-admin-key header /
 * ?key= query param admin-auth.ts already reads. Returns null if the key
 * matches nothing (not the super-admin keys, not any active branch's
 * access_key) — callers should treat that as 401, same as
 * requireAdminAuth() failing.
 */
export async function getBranchAccess(req: NextRequest): Promise<BranchAccess | null> {
  // Existing admin/staff keys — full access to every branch, unchanged.
  if (getAdminRole(req) !== null) return { role: 'super_admin', branchId: null }

  const provided = req.headers.get('x-admin-key') ?? req.nextUrl.searchParams.get('key')
  if (!provided) return null

  const { data: branch } = await supabaseAdmin
    .from('branches')
    .select('id, is_active')
    .eq('access_key', provided)
    .maybeSingle()

  if (branch && branch.is_active) return { role: 'branch', branchId: branch.id }
  return null
}

/** True if `access` may act on `branchId` — super_admin always can. */
export function canAccessBranch(access: BranchAccess, branchId: string | null): boolean {
  if (access.role === 'super_admin') return true
  return branchId !== null && access.branchId === branchId
}
