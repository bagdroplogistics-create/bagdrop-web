import { NextRequest, NextResponse } from 'next/server'
import { getSkybirdRole } from '@/lib/skybird-auth'

/** Returns 'skybird' for a valid Skybird key — used by the Skybird login page to store role in sessionStorage. */
export async function GET(req: NextRequest) {
  const role = getSkybirdRole(req)
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ role })
}
