// BAGDROP — CORS for customer-facing API routes
//
// The Bagdrop mobile app (React Native + Expo) calls these same API routes
// directly from a different origin — both when running as a web preview
// (npx expo start --web, served from localhost:8081) and, longer-term, any
// other web-based tooling that talks to this API. Native iOS/Android builds
// don't enforce CORS at all, so this file only matters for browser-based
// clients, but it costs nothing to have and unblocks the web preview.
//
// Scope is intentionally limited to the public, customer-facing endpoints
// the app actually calls. /api/admin/** is NOT touched — the admin
// dashboard's auth model is unaffected by this file.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

export function middleware(req: NextRequest) {
  // Preflight — answer directly, don't hit the route handler.
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
  }

  const res = NextResponse.next()
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.headers.set(key, value)
  }
  return res
}

export const config = {
  matcher: [
    '/api/auth/:path*',
    '/api/bookings',
    '/api/bookings/:path*',
    '/api/track',
    '/api/orders',
    '/api/flight-lookup',
    '/api/my-bookings',
    '/api/my-bookings/:path*',
    '/api/contact',
  ],
}
