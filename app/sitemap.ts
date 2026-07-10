import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://bagdrop.co'
  const now  = new Date()

  return [
    // Core pages — highest priority
    { url: base,                                lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${base}/excess-baggage`,            lastModified: now, changeFrequency: 'monthly', priority: 0.95 },
    { url: `${base}/airport-delivery`,          lastModified: now, changeFrequency: 'monthly', priority: 0.95 },
    { url: `${base}/door-to-door`,              lastModified: now, changeFrequency: 'monthly', priority: 0.90 },

    // Service pages
    { url: `${base}/destination-weddings`,      lastModified: now, changeFrequency: 'monthly', priority: 0.85 },
    { url: `${base}/student-relocation`,        lastModified: now, changeFrequency: 'monthly', priority: 0.85 },
    { url: `${base}/corporate-travel`,          lastModified: now, changeFrequency: 'monthly', priority: 0.80 },

    // Info pages
    { url: `${base}/faq`,                       lastModified: now, changeFrequency: 'monthly', priority: 0.75 },
    { url: `${base}/about`,                     lastModified: now, changeFrequency: 'monthly', priority: 0.65 },
    { url: `${base}/contact`,                   lastModified: now, changeFrequency: 'monthly', priority: 0.65 },
    { url: `${base}/blog`,                      lastModified: now, changeFrequency: 'weekly',  priority: 0.70 },
    { url: `${base}/track`,                     lastModified: now, changeFrequency: 'monthly', priority: 0.50 },

    // Legal
    { url: `${base}/privacy`,                   lastModified: now, changeFrequency: 'yearly',  priority: 0.20 },
    { url: `${base}/terms`,                     lastModified: now, changeFrequency: 'yearly',  priority: 0.20 },
    { url: `${base}/refund-policy`,             lastModified: now, changeFrequency: 'yearly',  priority: 0.20 },
  ]
}
