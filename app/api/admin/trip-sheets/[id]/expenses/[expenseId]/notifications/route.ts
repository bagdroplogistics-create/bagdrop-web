// BAGDROP — app/api/admin/trip-sheets/[id]/expenses/[expenseId]/notifications/route.ts
//
// Read-only vendor notification history for one Trip Expense (Trip
// Expenses UI's "Notification: Sent ✓ / Pending / Failed" status, clicked
// to see the full history — founder spec §21/§25). One row per channel
// (WhatsApp/Email) per lib/vendor-notifications.ts's UNIQUE(trip_expense_id,
// channel) — never more than 2 rows per expense.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string; expenseId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { expenseId } = await params

  const { data, error } = await supabaseAdmin
    .from('vendor_notifications')
    .select('*')
    .eq('trip_expense_id', expenseId)
    .order('channel')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notifications: data ?? [] })
}
