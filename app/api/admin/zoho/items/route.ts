/**
 * GET /api/admin/zoho/items
 *
 * Fetches active items (products) from Zoho Books.
 * Results are cached in-process for 10 minutes to avoid hammering the API.
 *
 * Response:
 *   { items: ZohoItem[] }
 *
 * ZohoItem:
 *   item_id, name, description, rate, tax_id, tax_name, hsn_or_sac, unit
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/admin-auth'
import { getZohoAccessToken, ZOHO_ORG_ID } from '@/lib/zoho-books'

const ZOHO_BASE = 'https://www.zohoapis.in/books/v3'

// In-process cache — survives for 10 minutes
let _cache: ZohoItem[] | null = null
let _cacheAt = 0
const CACHE_TTL_MS = 10 * 60 * 1000  // 10 min

export interface ZohoItem {
  item_id:     string
  name:        string
  description: string
  rate:        number
  tax_id:      string
  tax_name:    string
  hsn_or_sac:  string
  unit:        string
}

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Return cache if fresh
  if (_cache && Date.now() - _cacheAt < CACHE_TTL_MS) {
    return NextResponse.json({ items: _cache, cached: true })
  }

  if (!process.env.ZOHO_CLIENT_ID) {
    return NextResponse.json({ error: 'Zoho not configured' }, { status: 503 })
  }

  try {
    const token = await getZohoAccessToken()
    const qs = new URLSearchParams({
      organization_id: ZOHO_ORG_ID,
      filter_by:       'Status.Active',
      per_page:        '200',
    })

    const res = await fetch(`${ZOHO_BASE}/items?${qs}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    })

    const data = await res.json() as Record<string, unknown>

    if ((data.code as number) !== 0) {
      return NextResponse.json(
        { error: `Zoho error: ${data.message}` },
        { status: 502 }
      )
    }

    const raw = (data.items as Record<string, unknown>[]) ?? []

    const items: ZohoItem[] = raw.map(i => ({
      item_id:     String(i.item_id     ?? ''),
      name:        String(i.name        ?? ''),
      description: String(i.description ?? ''),
      rate:        Number(i.rate        ?? 0),
      tax_id:      String(i.tax_id      ?? ''),
      tax_name:    String(i.tax_name    ?? ''),
      hsn_or_sac:  String(i.hsn_or_sac ?? ''),
      unit:        String(i.unit        ?? ''),
    }))

    _cache  = items
    _cacheAt = Date.now()

    return NextResponse.json({ items, cached: false })
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 502 }
    )
  }
}
