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

    // City landing pages — location SEO
    { url: `${base}/vadodara`,                    lastModified: now, changeFrequency: 'monthly', priority: 0.92 },
    { url: `${base}/mumbai`,                      lastModified: now, changeFrequency: 'monthly', priority: 0.92 },
    { url: `${base}/ahmedabad`,                   lastModified: now, changeFrequency: 'monthly', priority: 0.92 },
    { url: `${base}/delhi`,                       lastModified: now, changeFrequency: 'monthly', priority: 0.92 },
    { url: `${base}/goa`,                         lastModified: now, changeFrequency: 'monthly', priority: 0.90 },

    // Info pages
    { url: `${base}/faq`,                       lastModified: now, changeFrequency: 'monthly', priority: 0.75 },
    { url: `${base}/about`,                     lastModified: now, changeFrequency: 'monthly', priority: 0.65 },
    { url: `${base}/contact`,                   lastModified: now, changeFrequency: 'monthly', priority: 0.65 },
    { url: `${base}/blog`,                      lastModified: now, changeFrequency: 'weekly',  priority: 0.70 },
    { url: `${base}/blog/india-digital-baggage-infrastructure-layer`,  lastModified: now, changeFrequency: 'monthly', priority: 0.60 },
    { url: `${base}/blog/why-airline-excess-baggage-fees-are-broken`,  lastModified: now, changeFrequency: 'monthly', priority: 0.60 },
    { url: `${base}/blog/nri-travel-india-baggage-problem`,            lastModified: now, changeFrequency: 'monthly', priority: 0.60 },
    { url: `${base}/blog/destination-wedding-logistics-india`,         lastModified: now, changeFrequency: 'monthly', priority: 0.60 },
    { url: `${base}/blog/airport-integrated-baggage-services`,         lastModified: now, changeFrequency: 'monthly', priority: 0.60 },
    { url: `${base}/blog/student-relocation-baggage-guide`,            lastModified: now, changeFrequency: 'monthly', priority: 0.60 },
    { url: `${base}/track`,                     lastModified: now, changeFrequency: 'monthly', priority: 0.50 },

    // Legal
    { url: `${base}/privacy`,                   lastModified: now, changeFrequency: 'yearly',  priority: 0.20 },
    { url: `${base}/terms`,                     lastModified: now, changeFrequency: 'yearly',  priority: 0.20 },
    { url: `${base}/refund-policy`,             lastModified: now, changeFrequency: 'yearly',  priority: 0.20 },
  ]
}
