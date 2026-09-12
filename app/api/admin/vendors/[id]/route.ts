// BAGDROP — app/api/admin/vendors/[id]/route.ts
//
// Vendor Master CRUD (single record: get / edit / archive). See
// app/api/admin/vendors/route.ts for list/create and the module comment
// there for the vendor_id numbering rationale.
//
// vendor_id is never editable once created — every trip_expenses.vendor_id
// and vendor_notifications row links to vendors.id (the UUID), not the
// human-readable vendor_id string, so renumbering would serve no purpose
// and only risks confusion.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

const VENDOR_COLUMNS = 'id, vendor_id, vendor_name, company_name, mobile, email, address, city, gst_number, archived_at, created_at, updated_at'

export async function GET(req: NextRequest, { params }: Params) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const { data, error } = await supabaseAdmin.from('vendors').select(VENDOR_COLUMNS).eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
  return NextResponse.json({ vendor: data })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  // Founder request (§29): if a vendor's mobile/email/address changes,
  // FUTURE notifications must use the new contact info — that "just
  // works" here for free, since lib/vendor-notifications.ts always reads
  // the vendor's CURRENT row at send time. Past vendor_notifications rows
  // are unaffected — they already snapshotted the contact info that was
  // current when THEY were sent.
  if ('vendor_name'  in body) updates.vendor_name  = String(body.vendor_name ?? '').trim() || null
  if ('company_name' in body) updates.company_name = String(body.company_name ?? '').trim() || null
  if ('mobile'       in body) updates.mobile       = String(body.mobile ?? '').trim() || null
  if ('email'        in body) updates.email        = String(body.email ?? '').trim() || null
  if ('address'      in body) updates.address      = String(body.address ?? '').trim() || null
  if ('city'         in body) updates.city         = String(body.city ?? '').trim() || null
  if ('gst_number'   in body) updates.gst_number   = String(body.gst_number ?? '').trim() || null
  // Restore an archived vendor (Vendor Master UI can pass this to undo an
  // accidental archive) — never used to archive; DELETE below is the only
  // path that sets archived_at forward.
  if ('restore' in body && body.restore === true) updates.archived_at = null

  if (updates.vendor_name === null) {
    return NextResponse.json({ error: 'vendor_name cannot be cleared' }, { status: 400 })
  }
  if (updates.mobile === null) {
    return NextResponse.json({ error: 'mobile cannot be cleared — vendor notifications are sent to this number' }, { status: 400 })
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No recognized fields to update' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('vendors')
    .update(updates)
    .eq('id', id)
    .select(VENDOR_COLUMNS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ vendor: data })
}

// ── DELETE — soft-archive only, never a hard delete ────────────────────
// A hard delete would either cascade-orphan every historical trip_expense/
// vendor_notification that ever referenced this vendor (losing "who was
// this?" on old records) or fail outright on the foreign key. Archiving
// (archived_at set) removes the vendor from Vendor Master pickers and the
// default list view while keeping every past reference intact — same
// convention as leads.deleted_at elsewhere in this app.
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('vendors')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .select(VENDOR_COLUMNS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ vendor: data })
}
