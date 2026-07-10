/**
 * GET /api/admin/zoho/estimates/[estimate_id]
 *
 * Fetches a single estimate from Zoho Books by estimate_id.
 * Returns the full estimate object including line_items, custom_fields, totals.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/admin-auth'
import { getZohoAccessToken, ZOHO_ORG_ID } from '@/lib/zoho-books'

const ZOHO_BASE = 'https://www.zohoapis.in/books/v3'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ estimate_id: string }> }
) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.ZOHO_CLIENT_ID) {
    return NextResponse.json({ error: 'Zoho not configured' }, { status: 503 })
  }

  const { estimate_id } = await params

  try {
    const token = await getZohoAccessToken()
    const qs = new URLSearchParams({ organization_id: ZOHO_ORG_ID })

    const res = await fetch(`${ZOHO_BASE}/estimates/${estimate_id}?${qs}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    })

    const data = await res.json() as Record<string, unknown>

    if ((data.code as number) !== 0) {
      return NextResponse.json(
        { error: `Zoho error: ${data.message}` },
        { status: 502 }
      )
    }

    return NextResponse.json({ estimate: data.estimate })
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 502 }
    )
  }
}
