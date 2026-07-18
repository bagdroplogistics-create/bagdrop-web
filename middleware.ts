// BAGDROP — CORS for customer- and admin-facing API routes
//
// Both the customer mobile app and the admin mobile app (React Native +
// Expo) call these same API routes directly from a different origin —
// when running as a web preview (npx expo start --web / a Vercel-hosted
// web export) and, longer-term, any other web-based tooling that talks to
// this API. Native iOS/Android builds don't enforce CORS at all, so this
// file only matters for browser-based clients, but it costs nothing to
// have and unblocks the web preview for both apps.
//
// /api/admin/** is included so the admin mobile app's web preview can
// call it too — the admin auth model itself (x-admin-key / ADMIN_SECRET_KEY
// / STAFF_SECRET_KEY) is completely unaffected by this file, it only adds
// response headers.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
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
    '/api/admin/:path*',
  ],
}
