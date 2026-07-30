import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/admin-auth'
import { isCalendarConnected } from '@/lib/google-calendar'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const status = await isCalendarConnected()
  return NextResponse.json(status)
}
