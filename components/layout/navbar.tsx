'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, useScroll, useMotionValueEvent } from 'framer-motion'
import { Menu, X, ChevronDown, Luggage } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SERVICE_TYPES } from '@/lib/constants'
import { BagdropLogo } from '@/components/ui/logo'

const NAV_LINKS = [
  { label: 'Services', href: '/services', hasDropdown: true },
  { label: 'About Us', href: '/about',    hasDropdown: false },
  { label: 'FAQ',      href: '/faq',      hasDropdown: false },
]

export function Navbar() {
  const pathname = usePathname()
  const { scrollY } = useScroll()
  const [scrolled, setScrolled]         = React.useState(false)
  const [mobileOpen, setMobileOpen]     = React.useState(false)
  const [servicesOpen, setServicesOpen] = React.useState(false)

  useMotionValueEvent(scrollY, 'change', (latest) => {
    setScrolled(latest > 20)
  })

  React.useEffect(() => {
    setMobileOpen(false)
    setServicesOpen(false)
  }, [pathname])

  return (
    <>
      <motion.header
        className={cn(
          'fixed inset-x-0 top-0 z-50 bg-brand transition-all duration-300',
          scrolled && 'shadow-lg shadow-black/20'
        )}
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' as const }}
      >
        <div className="section-container">
          <nav className="flex h-[72px] items-center justify-between" aria-label="Main navigation">

            {/* ── Logo (white variant on orange bg) ── */}
            <Link
              href="/"
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-md"
              aria-label="Bagdrop — Home"
            >
              <BagdropLogo variant="light" showTagline />
            </Link>

            {/* ── Desktop nav links ── */}
            <ul className="hidden items-center gap-1 md:flex" role="list">
              {NAV_LINKS.map(link => (
                <li key={link.href} className="relative">
                  {link.hasDropdown ? (
                    <div
                      onMouseEnter={() => setServicesOpen(true)}
                      onMouseLeave={() => setServicesOpen(false)}
                    >
                      <button
                        className="flex items-center gap-1 rounded-lg px-4 py-2 text-lg font-medium text-white/85 transition-colors hover:bg-white/15 hover:text-white"
                        aria-expanded={servicesOpen}
                        aria-haspopup="true"
                      >
                        {link.label}
                        <ChevronDown
                          className={cn(
                            'h-3.5 w-3.5 transition-transform duration-200',
                            servicesOpen && 'rotate-180'
                          )}
                        />
                      </button>

                      {/* Services dropdown */}
                      {servicesOpen && (
                        <div className="absolute left-1/2 top-full mt-1 w-80 -translate-x-1/2 rounded-2xl border border-border bg-white p-4 shadow-xl">
                          <div className="space-y-1">
                            {SERVICE_TYPES.map(service => (
                              <Link
                                key={service.id}
                                href={service.href}
                                className="flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-cream group"
                              >
                                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand group-hover:bg-brand group-hover:text-white transition-colors">
                                  <Luggage className="h-4 w-4" />
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-text-primary">{service.label}</p>
                                  <p className="text-xs text-text-muted">{service.description}</p>
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <Link
                      href={link.href}
                      className={cn(
                        'block rounded-lg px-4 py-2 text-lg font-medium text-white/85 transition-colors hover:bg-white/15 hover:text-white',
                        pathname === link.href && 'text-white font-semibold'
                      )}
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>

            {/* ── Desktop CTAs ── */}
            <div className="hidden items-center gap-3 md:flex">
              {/* Track — white outline */}
              <Link
                href="/track"
                className="inline-flex h-9 items-center rounded-lg border border-white/50 px-4 text-lg font-semibold text-white transition-all hover:bg-white/15 hover:border-white"
              >
                Track Bag
              </Link>
              {/* Book — solid white pill */}
              <Link
                href="/book"
                className="inline-flex h-9 items-center rounded-lg bg-white px-4 text-lg font-semibold text-brand transition-all hover:bg-white/90 shadow-sm"
              >
                Book Now
              </Link>
            </div>

            {/* ── Mobile toggle ── */}
            <button
              className="flex h-10 w-10 items-center justify-center rounded-lg text-white hover:bg-white/15 md:hidden transition-colors"
              onClick={() => setMobileOpen(prev => !prev)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </nav>
        </div>
      </motion.header>

      {/* ── Mobile Menu ── */}
      {mobileOpen && (
        <div
          id="mobile-menu"
          className="fixed inset-0 top-[72px] z-40 bg-white"
          role="dialog"
          aria-label="Mobile navigation"
        >
          <div className="section-container py-6 space-y-6">
            <div className="space-y-1">
              {NAV_LINKS.map(link => (
                <React.Fragment key={link.href}>
                  <Link
                    href={link.href}
                    className="flex items-center justify-between rounded-xl px-4 py-3 text-lg font-medium text-text-primary hover:bg-cream transition-colors"
                  >
                    {link.label}
                    {link.hasDropdown && <ChevronDown className="h-4 w-4 text-text-muted" />}
                  </Link>
                  {link.hasDropdown && (
                    <div className="ml-4 space-y-1">
                      {SERVICE_TYPES.map(service => (
                        <Link
                          key={service.id}
                          href={service.href}
                          className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm text-text-secondary hover:text-brand hover:bg-brand-light transition-colors"
                        >
                          <Luggage className="h-4 w-4 shrink-0" />
                          {service.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>

            <div className="space-y-3 border-t border-border pt-6">
              <Link
                href="/track"
                className="flex h-12 w-full items-center justify-center rounded-xl border-2 border-brand text-lg font-semibold text-brand transition-colors hover:bg-brand-light"
              >
                Track My Bag
              </Link>
              <Link
                href="/book"
                className="flex h-12 w-full items-center justify-center rounded-xl bg-brand text-lg font-semibold text-white transition-opacity hover:opacity-90"
              >
                Book Now
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
