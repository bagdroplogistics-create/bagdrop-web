import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'Only admin can disconnect Google Calendar' }, { status: 403 })
  }
  const { error } = await supabaseAdmin
    .from('google_calendar_connections')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
