import Link from 'next/link'
import { Instagram, Linkedin } from 'lucide-react'
import { BagdropLogo } from '@/components/ui/logo'

// Facebook SVG (lucide doesn't include it)
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  )
}

const FOOTER_LINKS = {
  Services: [
    { label: 'Airport Delivery',     href: '/airport-delivery' },
    { label: 'Door-to-Door',         href: '/door-to-door' },
    { label: 'Destination Weddings', href: '/destination-weddings' },
    { label: 'Student Relocation',   href: '/student-relocation' },
    { label: 'Corporate Travel',     href: '/corporate-travel' },
    { label: 'Excess Baggage',       href: '/excess-baggage' },
  ],
  Company: [
    { label: 'About Bagdrop', href: '/about' },
    { label: 'Contact Us',    href: '/contact' },
    { label: 'Blog',          href: '/blog' },
  ],
  Support: [
    { label: 'Track My Bag',  href: '/track' },
    { label: 'FAQ',           href: '/faq' },
    { label: 'WhatsApp Us',   href: 'https://wa.me/916357115711', external: true },
    { label: 'Refund Policy', href: '/refund-policy' },
  ],
  Legal: [
    { label: 'Privacy Policy',   href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
  ],
}

const SOCIAL_LINKS = [
  { label: 'Instagram', href: 'https://www.instagram.com/bagdropofficial', Icon: Instagram },
  { label: 'Facebook',  href: 'https://www.facebook.com/profile.php?id=61579334791456', Icon: FacebookIcon },
  { label: 'LinkedIn',  href: 'https://www.linkedin.com/in/adizworld/', Icon: Linkedin },
]

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-border bg-white" aria-label="Site footer">
      <div className="section-container py-16">
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-5">

          {/* Brand column */}
          <div className="col-span-2 lg:col-span-1 space-y-4">
            <Link href="/" aria-label="Bagdrop — Home">
              <BagdropLogo variant="default" />
            </Link>
            <p className="text-sm leading-relaxed text-text-muted max-w-[200px]">
              Travel light. We handle the bags.
            </p>
            <div className="flex items-center gap-3">
              {SOCIAL_LINKS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-muted transition-colors hover:border-gray-400 hover:text-gray-900"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([groupLabel, links]) => (
            <div key={groupLabel} className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
                {groupLabel}
              </h3>
              <ul className="space-y-3" role="list">
                {links.map(link => (
                  <li key={link.href}>
                    {'external' in link && link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-text-muted transition-colors hover:text-gray-900"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-text-muted transition-colors hover:text-gray-900"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 sm:flex-row">
          <p className="text-xs text-text-muted">
            © {year} Bagdrop Logistics Solutions Pvt. Ltd. All rights reserved.
          </p>
          <span className="text-xs text-text-muted">
            Operating in Mumbai · Delhi · Ahmedabad · Goa
          </span>
        </div>
      </div>
    </footer>
  )
}
