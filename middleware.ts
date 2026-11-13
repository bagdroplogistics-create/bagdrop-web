import { NextResponse, type NextRequest } from 'next/server'

// bagdrop.co/admin-1, /new-website and /y2k transparently proxy to the
// separately-deployed bagdrop-new app (its own Vercel project, own Supabase
// project) — see next.config.ts for why this lives in middleware rather
// than rewrites(). Each destination is a basePath build of that same app
// (NEXT_PUBLIC_BASE_PATH set per-branch on its own project — see
// bagdrop-new/src/lib/basePath.ts), so its own assets/API routes resolve
// correctly under the prefix, with no effect on that app's default,
// unprefixed deployments.
const ZONES: { prefix: string; base: string }[] = [
  // Checked first: /y2k's own root ("/") IS the wedding desk on that branch
  // (its src/app/page.tsx renders it directly, unlike main/admin-1's
  // homepage there), so this stays a plain, symmetric prefix match.
  { prefix: '/y2k', base: 'https://bagdrop-new-git-deploy-y2k-bagdrops-projects.vercel.app' },
  { prefix: '/admin-1', base: 'https://bagdrop-new-git-deploy-admin-1-bagdrops-projects.vercel.app' },
  { prefix: '/new-website', base: 'https://bagdrop-new-git-deploy-new-website-bagdrops-projects.vercel.app' },
]

// bagdrop-new's branch-preview deployments sit behind Vercel's SSO
// deployment protection — BAGDROP_NEW_BYPASS_SECRET is that project's
// "Protection Bypass for Automation" secret (Vercel → bagdrop-new →
// Settings → Deployment Protection). Sent as a header, not a query param:
// a query param collides with Next.js's own `?_rsc=` segment-fetch query
// on every page that streams dynamic content, 404ing the origin.
// CORS for the admin mobile/web app (separate Vercel project, different
// origin). The app calls /api/admin/* with an x-admin-key header, which forces
// a preflight; without these headers the browser reports "Failed to fetch".
// Auth is key-based (no cookies), so an origin allowlist is sufficient.
const ADMIN_APP_ORIGINS = [
  'https://bagdrop-admin-app.vercel.app',
  ...(process.env.ADMIN_APP_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
]

function corsHeaders(origin: string | null): Record<string, string> | null {
  if (!origin) return null
  const ok = ADMIN_APP_ORIGINS.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin)
  if (!ok) return null
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-key',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl

  if (pathname.startsWith('/api/admin')) {
    const cors = corsHeaders(req.headers.get('origin'))
    if (req.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: cors ?? {} })
    }
    const res = NextResponse.next()
    if (cors) for (const [k, v] of Object.entries(cors)) res.headers.set(k, v)
    return res
  }

  const zone = ZONES.find((z) => pathname === z.prefix || pathname.startsWith(`${z.prefix}/`))
  if (!zone) return NextResponse.next()

  const url = new URL(`${zone.base}${pathname}${search}`)
  const bypass = process.env.BAGDROP_NEW_BYPASS_SECRET
  const headers = new Headers(req.headers)
  if (bypass) headers.set('x-vercel-protection-bypass', bypass)
  return NextResponse.rewrite(url, { request: { headers } })
}

export const config = {
  matcher: ['/y2k/:path*', '/admin-1/:path*', '/new-website/:path*', '/api/admin/:path*'],
}
