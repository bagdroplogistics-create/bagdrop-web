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
      // The /admin-1, /new-website and /y2k rewrites below proxy to a
      // separately-deployed app whose pages are dynamic/authenticated —
      // Vercel's edge was observed serving a 100+ minute old cached copy
      // of one of these pages regardless of that app's own Cache-Control,
      // so force no-store here rather than relying on the proxied origin's
      // headers surviving the hop.
      {
        source: '/:zone(admin-1|new-website|y2k)',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      {
        source: '/:zone(admin-1|new-website|y2k)/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
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
      // bagdrop-new's "/" is its public marketing homepage (shared by both
      // basePath builds), so bare /admin-1 would otherwise show that
      // homepage instead of the admin console. Send it straight to the
      // admin area, same as bagdrop.co/admin already behaves. Not
      // permanent: the admin path may change shape before this preview
      // becomes the real thing.
      {
        source:      '/admin-1',
        destination: '/admin-1/admin',
        permanent:   false,
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

  // New platform preview (2026-10-31) — bagdrop.co/admin-1, /new-website and
  // /y2k transparently proxy to the separately-deployed bagdrop-new app.
  // Moved from next.config.js rewrites() to middleware.ts (2026-11-06): the
  // rewrites() version attached the Vercel deployment-protection bypass
  // secret as a query param, which collided with Next.js's own `?_rsc=`
  // segment-fetch query on every page that streams dynamic content — the
  // origin 404'd on the malformed URL, leaving those pages stuck on their
  // loading state forever. middleware.ts sends the same secret as the
  // `x-vercel-protection-bypass` header instead (Vercel's primary documented
  // method, and immune to this collision since headers and query strings
  // don't share a namespace). See middleware.ts for the actual proxying.
}

export default nextConfig
