import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'

// POST /api/admin/branches/bulk-gc-style  { style: 'cm' | 'legacy', padding?: 3-10 }
// Sets the GC number format (and optionally the sequence zero-padding) on ALL
// active branches in one go. Only affects numbers issued from now on — already
// issued LR/GC numbers are never touched, and running sequences carry on.
export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized — branch management requires an admin key' }, { status: 401 })
  }
  const body = await req.json().catch(() => null)
  const style = body?.style
  if (style !== 'cm' && style !== 'legacy') {
    return NextResponse.json({ error: "style must be 'cm' or 'legacy'" }, { status: 400 })
  }
  const updates: Record<string, unknown> = { gc_number_style: style }
  if (body?.padding != null && body.padding !== '') {
    const pad = Math.floor(Number(body.padding))
    if (!Number.isFinite(pad) || pad < 3 || pad > 10) {
      return NextResponse.json({ error: 'padding must be between 3 and 10' }, { status: 400 })
    }
    updates.lr_padding = pad
  }

  const { data, error } = await supabaseAdmin
    .from('branches').update(updates).eq('is_active', true).select('id')
  if (error) {
    const msg = error.message.includes('gc_number_style')
      ? 'The database is missing the gc_number_style column — run supabase/migrations/20261013_gc_number_style.sql in the Supabase SQL Editor first.'
      : error.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  return NextResponse.json({ updated: data?.length ?? 0, style, padding: updates.lr_padding ?? null })
}
