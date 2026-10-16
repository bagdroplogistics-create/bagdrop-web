import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/admin-auth'
import { sendIndemnityBondForBooking } from '@/lib/indemnity-send'

export const runtime = 'nodejs'

// ── POST /api/admin/bookings/[id]/indemnity/send ─────────────────────
// Step 1 of the Indemnity Bond flow. Admin clicks "Send Indemnity Bond" on a Booking Confirmed
// booking. The logic lives in lib/indemnity-send.ts (shared with the automatic send that runs
// after the customer's Aadhaar is verified). Body is optional: { admin_approve: true } creates the
// link and advances the status without notifying the customer.
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await context.params
  const body = await req.json().catch(() => ({}))
  const r = await sendIndemnityBondForBooking(id, body?.admin_approve === true)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ success: true, secure_link: r.secureLink, expires_at: r.expiresAt })
}
