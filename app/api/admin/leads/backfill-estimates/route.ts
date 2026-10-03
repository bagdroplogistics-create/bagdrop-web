import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { generateAutoQuoteForLead } from '@/lib/auto-quote'

export const runtime = 'nodejs'

// ============================================================================
// BAGDROP — Backfill Automatic Quote Generation (one-time admin action)
//
// Originally built for the v1 Automatic Estimate (lib/estimate-quote.ts,
// a separate EST- shadow record). Superseded 2026-10-03 per Founder
// follow-up: the auto-generation now creates a REAL quote (QT-YYYY-NNNN)
// + updates the linked booking — see lib/auto-quote.ts. Kept at the same
// URL/button (Leads page "Backfill Estimates") since the job is the same:
// catch up any existing open lead (no real quote yet) that was created
// before this feature shipped, or that was skipped earlier for a reason
// since fixed (e.g. the 2026-10-03 ICONIQA city-normalization bug).
//
// Safe to run more than once: generateAutoQuoteForLead() is itself a
// no-op for any lead that already has a real quote_number.
// ============================================================================

export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: leads, error } = await supabaseAdmin
    .from('leads')
    .select('id')
    .is('quote_number', null)
    .is('deleted_at', null)
    .limit(2000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let processed = 0
  for (const lead of leads ?? []) {
    await generateAutoQuoteForLead(lead.id)
    processed++
  }

  const { count: quotedCount } = await supabaseAdmin
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('quote_auto_generated', true)

  return NextResponse.json({
    success:            true,
    leads_checked:      processed,
    now_have_a_quote:   quotedCount ?? 0,
  })
}
