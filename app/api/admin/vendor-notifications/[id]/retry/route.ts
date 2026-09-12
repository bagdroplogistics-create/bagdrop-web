// BAGDROP — app/api/admin/vendor-notifications/[id]/retry/route.ts
//
// Manual retry for a FAILED vendor notification channel (founder spec
// §23: "Allow an authorized admin to manually retry the failed channel.
// Retrying must NOT create a duplicate successful notification.").
// lib/vendor-notifications.ts's retryVendorNotification() does the actual
// atomic re-claim (WHERE status='failed') — this route is just the auth
// + HTTP wrapper, same convention as every other admin action route.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/admin-auth'
import { retryVendorNotification } from '@/lib/vendor-notifications'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const result = await retryVendorNotification(id)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ success: true })
}
