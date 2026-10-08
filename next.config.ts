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
        source:      '/:path((?!admin|api|_next|indemnity|payment-verification|iconiqa|y2k|skybird|favicon.ico).*)',
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
}

export default nextConfig
