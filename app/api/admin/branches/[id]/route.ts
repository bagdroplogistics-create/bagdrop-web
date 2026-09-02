// BAGDROP — app/api/admin/branches/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'
import { getBranchAccess, canAccessBranch } from '@/lib/branch-auth'
import { citiesEqual } from '@/lib/city-normalize'

const PUBLIC_COLUMNS = 'id, branch_code, branch_name, city, state, address, pincode, gst_number, contact_number, email, branch_manager, is_active, lr_series_prefix, lr_include_fy, lr_start_number, lr_padding, created_at, updated_at'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await getBranchAccess(req)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  if (!canAccessBranch(access, id)) {
    return NextResponse.json({ error: 'This key does not have access to that branch' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin.from('branches').select(`${PUBLIC_COLUMNS}, access_key`).eq('id', id).single()
  if (error) return NextResponse.json({ error: 'Branch not found' }, { status: 404 })

  const { access_key, ...rest } = data
  return NextResponse.json({ branch: { ...rest, has_access_key: !!access_key } })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Editing branch settings (including the numbering config that future
  // LRs depend on) is Super Admin only — same gate as creating a branch.
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized — branch management requires an admin key' }, { status: 401 })
  }
  const { id } = await params

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { data: existing, error: fetchErr } = await supabaseAdmin.from('branches').select('*').eq('id', id).single()
  if (fetchErr || !existing) return NextResponse.json({ error: 'Branch not found' }, { status: 404 })

  const allowed = [
    'branch_name', 'city', 'state', 'address', 'pincode', 'gst_number',
    'contact_number', 'email', 'branch_manager', 'is_active',
    'lr_include_fy', 'lr_padding',
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  // Same "keep only one branch per city" guard as create (POST /api/admin/
  // branches) — a rename that would collide with a DIFFERENT active
  // branch's city is rejected, not silently allowed to create a duplicate
  // pair. Excludes this branch itself and any inactive branch (a
  // deliberately deactivated duplicate shouldn't block the survivor from
  // being edited).
  if (typeof updates.city === 'string' && updates.city.trim() && !citiesEqual(updates.city, existing.city)) {
    const { data: activeBranches } = await supabaseAdmin
      .from('branches')
      .select('id, branch_code, branch_name, city')
      .eq('is_active', true)
      .neq('id', id)
    const cityDup = (activeBranches ?? []).find(b => citiesEqual(b.city, updates.city as string))
    if (cityDup) {
      return NextResponse.json({
        error: `A branch for this city already exists: ${cityDup.branch_name} (${cityDup.branch_code}). Merge into that branch instead of creating a duplicate.`,
      }, { status: 409 })
    }
  }

  // branch_code and lr_series_prefix are editable too, but changing either
  // renames the underlying LR numbering series — handled specially below
  // (migrate the counter row) rather than just written through like the
  // fields above, so an in-flight sequence never silently resets to 1.
  const newBranchCode  = 'branch_code' in body ? String(body.branch_code).trim().toUpperCase() : null
  const newLrPrefix    = 'lr_series_prefix' in body ? String(body.lr_series_prefix).trim().toUpperCase() : null

  if (newBranchCode) {
    if (!/^[A-Z0-9]{2,10}$/.test(newBranchCode)) {
      return NextResponse.json({ error: 'branch_code must be 2-10 letters/digits' }, { status: 400 })
    }
    updates.branch_code = newBranchCode
  }
  if (newLrPrefix) updates.lr_series_prefix = newLrPrefix

  const oldSeries = `${existing.lr_series_prefix}-LR`
  const newSeries = `${newLrPrefix ?? existing.lr_series_prefix}-LR`

  const { data: branch, error } = await supabaseAdmin
    .from('branches')
    .update(updates)
    .eq('id', id)
    .select(PUBLIC_COLUMNS)
    .single()

  if (error) {
    const friendly = error.message.includes('branches_branch_code_key')
      ? `Branch code "${newBranchCode}" is already in use.`
      : error.message
    return NextResponse.json({ error: friendly }, { status: 400 })
  }

  // Carry the running LR sequence over to the new series name so a code/
  // prefix rename can never silently restart numbering at 1 — every
  // existing bagdrop_number_counters row for the old series (one per
  // financial year it's ever been used in) is renamed in place.
  if (newSeries !== oldSeries) {
    const { error: renameErr } = await supabaseAdmin
      .from('bagdrop_number_counters')
      .update({ series: newSeries })
      .eq('series', oldSeries)
    if (renameErr) {
      console.error(`[branches PATCH] Failed to carry LR sequence from "${oldSeries}" to "${newSeries}" (non-fatal, but the new prefix will start counting from 0 — fix bagdrop_number_counters manually):`, renameErr.message)
    }
  }

  return NextResponse.json({ branch })
}

// Soft "delete" — sets is_active = false, same convention as the Active/
// Inactive Status field the spec itself asks for. Never a hard delete:
// branches.id is referenced by lrs.branch_id (ON DELETE SET NULL), and a
// deactivated branch's already-issued LRs must keep showing correctly —
// which they do regardless, since every LR snapshots its branch's letterhead
// at creation time rather than reading it live (see the migration's
// module comment).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized — branch management requires an admin key' }, { status: 401 })
  }
  const { id } = await params

  const { error } = await supabaseAdmin.from('branches').update({ is_active: false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, deactivated: true })
}
