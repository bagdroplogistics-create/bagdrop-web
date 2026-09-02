// BAGDROP — app/api/admin/branches/route.ts
//
// Branch registry CRUD (list + create). See supabase/migrations/
// 20260902_branch_wise_lr.sql for the schema and lib/branch-auth.ts for
// the access model this enforces.
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'
import { getBranchAccess } from '@/lib/branch-auth'
import { indianFinancialYear } from '@/lib/financial-year'

// access_key is deliberately never included in list/detail selects below —
// it's shown in full exactly once, at creation and at /rotate-key, same
// pattern as any other secret-token flow in this app (see
// lib/indemnity-notifications.ts's generateSecureToken() usage). Callers
// that need to know "is a key configured" can check has_access_key instead.
const PUBLIC_COLUMNS = 'id, branch_code, branch_name, city, state, address, pincode, gst_number, contact_number, email, branch_manager, is_active, lr_series_prefix, lr_include_fy, lr_start_number, lr_padding, created_at, updated_at'

export async function GET(req: NextRequest) {
  const access = await getBranchAccess(req)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let query = supabaseAdmin.from('branches').select(`${PUBLIC_COLUMNS}, access_key`).order('branch_name')

  // Branch-scoped callers only ever see their own branch — "Branch Admin/
  // Manager... cannot access another branch's records unless specifically
  // permitted" (spec section 11), enforced here at the query level, not
  // just by hiding rows in the UI.
  if (access.role === 'branch') query = query.eq('id', access.branchId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Strip the raw key back out of the response, replacing it with a
  // boolean — a GET (even for your own branch) should never re-expose the
  // secret; only the create/rotate responses do that, once.
  const branches = (data ?? []).map(({ access_key, ...rest }) => ({
    ...rest,
    has_access_key: !!access_key,
  }))

  return NextResponse.json({ branches })
}

export async function POST(req: NextRequest) {
  // "Manage branch settings" is Super Admin only (spec section 11) —
  // requireAdmin (not requireAdminAuth) excludes the legacy 'staff' key,
  // matching how lib/roles.ts already gates ACCESS_SETTINGS admin-only.
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized — branch management requires an admin key' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const branchCode = String(body.branch_code ?? '').trim().toUpperCase()
  const branchName = String(body.branch_name ?? '').trim()
  const city        = String(body.city ?? '').trim()

  if (!branchCode || !branchName || !city) {
    return NextResponse.json({ error: 'branch_code, branch_name, and city are required' }, { status: 400 })
  }
  if (!/^[A-Z0-9]{2,10}$/.test(branchCode)) {
    return NextResponse.json({ error: 'branch_code must be 2-10 letters/digits (e.g. MUM, DEL, AMD)' }, { status: 400 })
  }

  const lrSeriesPrefix = String(body.lr_series_prefix ?? branchCode).trim().toUpperCase() || branchCode
  const lrIncludeFy    = body.lr_include_fy !== false // default true
  const lrStartNumber  = Number.isFinite(Number(body.lr_start_number)) && Number(body.lr_start_number) > 0
    ? Math.floor(Number(body.lr_start_number)) : 1
  const lrPadding      = Number.isFinite(Number(body.lr_padding)) && Number(body.lr_padding) >= 4 && Number(body.lr_padding) <= 10
    ? Math.floor(Number(body.lr_padding)) : 6

  const accessKey = crypto.randomBytes(24).toString('base64url')

  const { data: branch, error } = await supabaseAdmin
    .from('branches')
    .insert({
      branch_code:      branchCode,
      branch_name:      branchName,
      city,
      state:             (body.state ?? '').trim() || null,
      address:           (body.address ?? '').trim() || null,
      pincode:           (body.pincode ?? '').trim() || null,
      gst_number:        (body.gst_number ?? '').trim() || null,
      contact_number:    (body.contact_number ?? '').trim() || null,
      email:             (body.email ?? '').trim() || null,
      branch_manager:    (body.branch_manager ?? '').trim() || null,
      is_active:         body.is_active !== false,
      access_key:        accessKey,
      lr_series_prefix:  lrSeriesPrefix,
      lr_include_fy:     lrIncludeFy,
      lr_start_number:   lrStartNumber,
      lr_padding:        lrPadding,
    })
    .select(PUBLIC_COLUMNS)
    .single()

  if (error) {
    const friendly = error.message.includes('branches_branch_code_key')
      ? `Branch code "${branchCode}" is already in use.`
      : error.message
    return NextResponse.json({ error: friendly }, { status: 400 })
  }

  // Seed the branch's LR counter so the FIRST number issued equals
  // lr_start_number exactly (e.g. Starting Number: 1 → first LR is
  // .../000001, not .../000002). ignoreDuplicates makes this a no-op if
  // this series/year row somehow already exists (shouldn't, for a brand
  // new branch_code, but harmless either way — never overwrites a counter
  // that's already been advanced).
  const fy = indianFinancialYear()
  await supabaseAdmin
    .from('bagdrop_number_counters')
    .upsert(
      { series: `${lrSeriesPrefix}-LR`, year: fy.startYear, last_seq: lrStartNumber - 1 },
      { onConflict: 'series,year', ignoreDuplicates: true },
    )

  return NextResponse.json({ branch: { ...branch, access_key: accessKey } }, { status: 201 })
}
