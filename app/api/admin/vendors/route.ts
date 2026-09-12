// BAGDROP — app/api/admin/vendors/route.ts
//
// Vendor Master CRUD (list + create). See supabase/migrations/
// 20260912_vendor_master.sql for the schema. Deliberately basic — matches
// the founder's "keep vendor master basic" instruction: only the 8 fields
// in VENDOR_COLUMNS below, no vendor type/rating/bank details/pricing.
//
// vendor_id (VND-00001, VND-00002, ...) is ALWAYS server-generated (a
// DEFAULT expression on the column, backed by a dedicated Postgres
// sequence — see the migration) — never accepted from the request body,
// so there's no way for a client to collide with or spoof another
// vendor's ID.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export const runtime = 'nodejs'

const VENDOR_COLUMNS = 'id, vendor_id, vendor_name, company_name, mobile, email, address, city, gst_number, archived_at, created_at, updated_at'

// ── GET /api/admin/vendors — list (search + include-archived) ─────────
export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const search           = searchParams.get('search')?.trim()
  const includeArchived  = searchParams.get('include_archived') === 'true'

  let query = supabaseAdmin.from('vendors').select(VENDOR_COLUMNS).order('vendor_name')
  if (!includeArchived) query = query.is('archived_at', null)
  if (search) {
    // Matches on any of the fields an admin would realistically search by —
    // same "ilike over a few likely columns, OR'd together" pattern used
    // elsewhere in this app's admin list routes (e.g. leads search).
    const esc = search.replace(/[%_]/g, c => '\\' + c)
    query = query.or(
      `vendor_name.ilike.%${esc}%,company_name.ilike.%${esc}%,vendor_id.ilike.%${esc}%,mobile.ilike.%${esc}%,city.ilike.%${esc}%`
    )
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ vendors: data ?? [] })
}

// ── POST /api/admin/vendors — create ───────────────────────────────────
export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const vendorName = String(body.vendor_name ?? '').trim()
  const mobile      = String(body.mobile ?? '').trim()
  if (!vendorName) return NextResponse.json({ error: 'vendor_name is required' }, { status: 400 })
  if (!mobile)      return NextResponse.json({ error: 'mobile is required — vendor notifications are sent to this number' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('vendors')
    .insert({
      vendor_name:  vendorName,
      company_name: String(body.company_name ?? '').trim() || null,
      mobile,
      email:        String(body.email ?? '').trim() || null,
      address:      String(body.address ?? '').trim() || null,
      city:         String(body.city ?? '').trim() || null,
      gst_number:   String(body.gst_number ?? '').trim() || null,
    })
    .select(VENDOR_COLUMNS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ vendor: data }, { status: 201 })
}
