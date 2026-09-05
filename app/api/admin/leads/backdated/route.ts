import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createBackdatedInquiry, type BackdatedInquiryInput } from '@/lib/backdated-inquiry'

// BAGDROP — Backdated Inquiry creation (founder request, 2026-09-05).
//
// Deliberately its own route, separate from POST /api/admin/leads — see
// lib/backdated-inquiry.ts's module comment for the full reasoning. Gated
// to full admins only (not staff), matching the sensitivity of every other
// route that can hand-assign a tracking number (e.g. PUT /api/admin/
// settings) rather than mint one atomically.
export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as BackdatedInquiryInput | null
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  try {
    const result = await createBackdatedInquiry(body)
    return NextResponse.json(result.body, { status: result.status })
  } catch (err) {
    console.error('[leads/backdated POST] Unhandled error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create backdated inquiry (unexpected server error)' },
      { status: 500 }
    )
  }
}
