import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getBranchAccess } from '@/lib/branch-auth'
import { indianFinancialYear } from '@/lib/financial-year'

export const runtime = 'nodejs'

// BAGDROP — Branch-Wise LR Reports (v1, lightweight — spec section 10)
//
// Deliberately scoped down from a full BI/reports surface: this returns one
// aggregate row per branch (Total LRs, Total Bags, Pending vs Delivered,
// current-FY count) computed directly from `lrs`, not wired into the
// generic app/api/admin/reports/detailed engine (that engine is built
// around the booking/lead pipeline, not the branch dimension, and bolting
// branch-wise LR aggregation onto it would be a much larger change than
// this feature warrants). If richer branch analytics are needed later,
// this is the natural place to extend rather than replace.
//
// GET /api/admin/branches/lr-summary
// Branch-scoped keys only ever get their own branch's row — same
// backend-enforced pattern as every other branch-wise endpoint.
export async function GET(req: NextRequest) {
  const access = await getBranchAccess(req)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let branchQuery = supabaseAdmin
    .from('branches')
    .select('id, branch_code, branch_name, is_active')
    .order('branch_code')
  if (access.role === 'branch') branchQuery = branchQuery.eq('id', access.branchId)

  const { data: branches, error: branchErr } = await branchQuery
  if (branchErr) return NextResponse.json({ error: branchErr.message }, { status: 500 })
  if (!branches || branches.length === 0) return NextResponse.json({ summary: [] })

  let lrQuery = supabaseAdmin
    .from('lrs')
    .select('branch_id, status, total_bags, financial_year')
    .not('branch_id', 'is', null)
  if (access.role === 'branch') lrQuery = lrQuery.eq('branch_id', access.branchId)

  const { data: lrs, error: lrErr } = await lrQuery
  if (lrErr) return NextResponse.json({ error: lrErr.message }, { status: 500 })

  const currentFy = indianFinancialYear().label

  const summary = branches.map(b => {
    const branchLrs = (lrs ?? []).filter(l => l.branch_id === b.id)
    const delivered = branchLrs.filter(l => l.status === 'delivered').length
    const cancelled = branchLrs.filter(l => l.status === 'cancelled').length
    const pending   = branchLrs.length - delivered - cancelled
    return {
      branch_id:      b.id,
      branch_code:    b.branch_code,
      branch_name:    b.branch_name,
      is_active:      b.is_active,
      total_lrs:      branchLrs.length,
      total_bags:     branchLrs.reduce((sum, l) => sum + (l.total_bags ?? 0), 0),
      pending_count:  pending,
      delivered_count: delivered,
      cancelled_count: cancelled,
      current_fy_count: branchLrs.filter(l => l.financial_year === currentFy).length,
    }
  })

  return NextResponse.json({ summary, financial_year: currentFy })
}
