import { NextRequest, NextResponse } from 'next/server'
import { getAdminRole } from '@/lib/admin-auth'

/** Returns the role of the provided key — used by the login page to store role in sessionStorage */
export async function GET(req: NextRequest) {
  const role = getAdminRole(req)
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ role })
}
