import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/admin-auth'
import { findOpenWebsiteInquiry } from '@/lib/duplicate-inquiry-check'

// GET /api/admin/leads/check-duplicate?phone=...&email=...
//
// Read-only lookup powering the New Quote page's live inline warning (spec
// 2026-08-25: "add a live duplicate check after the admin enters the
// customer's mobile number / email / name"). Never creates or changes
// anything — the actual enforcement is the 409 guard on POST /api/admin/
// leads (see lib/duplicate-inquiry-check.ts); this just lets the UI warn
// the admin BEFORE they get that far, while they're still filling in the
// form. Safe to call on every keystroke (debounced client-side) since it's
// a plain SELECT.
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const phone      = searchParams.get('phone')
  const email      = searchParams.get('email')
  const pickupDate = searchParams.get('pickup_date')
  const fromCity   = searchParams.get('from_city')
  const toCity     = searchParams.get('to_city')

  const duplicate = await findOpenWebsiteInquiry({ phone, email, pickupDate, fromCity, toCity })
  return NextResponse.json({ duplicate })
}
