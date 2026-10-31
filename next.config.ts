import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Razorpay SDK is a Node-only package — prevent Turbopack from bundling it
  serverExternalPackages: ['razorpay', '@react-pdf/renderer'],

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
      {
        source: '/icons/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },

  async redirects() {
    return [
      // Search Console "Not found (404)" report, 2026-10-07 — old static-site URLs
      // that Google still has. Placed before the host redirect so bagdrop.co
      // variants reach the final page in one hop.
      { source: '/index.html',            destination: 'https://www.bagdrop.co/',                 permanent: true },
      { source: '/baggage-delivery.html', destination: 'https://www.bagdrop.co/excess-baggage',   permanent: true },
      { source: '/about.html',            destination: 'https://www.bagdrop.co/about',            permanent: true },
      { source: '/refund',                destination: 'https://www.bagdrop.co/refund-policy',    permanent: true },
      // SEO (Search Console review 2026-10-07): Google was indexing bagdrop.co and
      // www.bagdrop.co as two sites, splitting ranking strength. 308-redirect the
      // bare domain to www for PUBLIC marketing pages only. Admin, API, payment,
      // partner and indemnity routes stay on whichever host they are opened on
      // (admin sessions and the mobile apps call bagdrop.co directly).
      {
        source:      '/',
        has:         [{ type: 'host', value: 'bagdrop.co' }],
        destination: 'https://www.bagdrop.co',
        permanent:   true,
      },
      {
        source:      '/:path((?!admin|admin-1|new-website|api|_next|indemnity|payment-verification|iconiqa|y2k|skybird|favicon.ico).*)',
        has:         [{ type: 'host', value: 'bagdrop.co' }],
        destination: 'https://www.bagdrop.co/:path',
        permanent:   true,
      },
      // [ESCALATE TO BEIS] — Old blog slug exposed strategic partnership target.
      // Renamed slug + 301 permanent redirect to preserve any inbound links.
      {
        source:      '/blog/adani-airports-partnership-opportunity',
        destination: '/blog/airport-integrated-baggage-services',
        permanent:   true,
      },
    ]
  },

  // New platform preview (2026-10-31) — bagdrop.co/admin-1 and /new-website
  // transparently proxy to the separately-deployed bagdrop-new app (its own
  // Vercel project, own Supabase project), so the browser's address bar
  // stays on bagdrop.co instead of jumping to a .vercel.app URL. Each
  // destination is a basePath build of that same app (NEXT_PUBLIC_BASE_PATH
  // set per-branch on its own project — see bagdrop-new/src/lib/basePath.ts)
  // so its own assets/API routes resolve correctly under the prefix, with
  // no effect on that app's default, unprefixed deployments. Both paths are
  // also excluded from the bagdrop.co -> www.bagdrop.co redirect above (same
  // treatment as the existing /admin), so this redirect never intercepts
  // them before the rewrite gets a chance to run.
  //
  // bagdrop-new's branch-preview URLs sit behind Vercel's SSO deployment
  // protection — BAGDROP_NEW_BYPASS_SECRET is that project's "Protection
  // Bypass for Automation" secret (Vercel → bagdrop-new → Settings →
  // Deployment Protection), appended as the query param Vercel's own docs
  // specify for exactly this: letting a trusted server-to-server request
  // (this rewrite) through without a human SSO login.
  async rewrites() {
    const bypass = process.env.BAGDROP_NEW_BYPASS_SECRET
    const dest = (base: string, path: string) =>
      `${base}${path}${bypass ? `?x-vercel-protection-bypass=${bypass}&x-vercel-set-bypass-cookie=true` : ''}`
    const ADMIN1 = 'https://bagdrop-new-git-deploy-admin-1-bagdrops-projects.vercel.app'
    const NEWSITE = 'https://bagdrop-new-git-deploy-new-website-bagdrops-projects.vercel.app'
    return [
      { source: '/admin-1', destination: dest(ADMIN1, '/admin-1') },
      { source: '/admin-1/:path*', destination: dest(ADMIN1, '/admin-1/:path*') },
      { source: '/new-website', destination: dest(NEWSITE, '/new-website') },
      { source: '/new-website/:path*', destination: dest(NEWSITE, '/new-website/:path*') },
    ]
  },
}

export default nextConfig
