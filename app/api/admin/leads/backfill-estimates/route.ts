import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { generateEstimateForLead } from '@/lib/estimate-quote'

export const runtime = 'nodejs'

// ============================================================================
// BAGDROP — Backfill Automatic Estimate Quotes (one-time admin action)
//
// Founder report (2026-10-03): after deploying Automatic Estimate Quote
// (lib/estimate-quote.ts), existing open leads created BEFORE that deploy
// showed no Estimate badge in the Leads dashboard. By design,
// generateEstimateForLead() only ever fires at inquiry-creation time or on
// a from_city/to_city/bags_count edit — it never runs retroactively on its
// own. This route is the one-time catch-up: it walks every open lead (no
// real quote_number yet, not soft-deleted) and runs the exact same
// generateEstimateForLead() used everywhere else, so leads that predate
// the feature — or that only ever lacked an estimate because of the
// ICONIQA city-normalization gap fixed the same day (lib/city-normalize.ts,
// 2026-10-03) — pick one up retroactively wherever a real route_pricing
// match now exists.
//
// Safe to run more than once: generateEstimateForLead() is itself a no-op
// for any lead that already has a real quote (quote_number set /
// estimate_status 'converted'), and simply recalculates (not duplicates)
// the estimate for everything else.
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
    await generateEstimateForLead(lead.id)
    processed++
  }

  const { count: estimatedCount } = await supabaseAdmin
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('estimate_status', 'generated')

  return NextResponse.json({
    success:         true,
    leads_checked:   processed,
    now_have_estimate: estimatedCount ?? 0,
  })
}
