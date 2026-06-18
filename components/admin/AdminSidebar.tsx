'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Package, Users, UserCheck, FileText,
  Receipt, CreditCard, BarChart3, Settings, LogOut,
  ChevronRight, Menu, X, Luggage,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  {
    group: 'Operations',
    items: [
      { label: 'Dashboard & Bookings', href: '/admin', icon: LayoutDashboard },
    ],
  },
  {
    group: 'CRM',
    items: [
      { label: 'Leads',      href: '/admin/leads',     icon: Users       },
      { label: 'Customers',  href: '/admin/customers', icon: UserCheck   },
      { label: 'Quotes',     href: '/admin/quotes',    icon: FileText    },
      { label: 'Invoices',   href: '/admin/invoices',  icon: Receipt     },
      { label: 'Payments',   href: '/admin/payments',  icon: CreditCard  },
    ],
  },
  {
    group: 'Analytics',
    items: [
      { label: 'Reports',    href: '/admin/reports',   icon: BarChart3 },
      { label: 'Settings',   href: '/admin/settings',  icon: Settings  },
    ],
  },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const [open, setOpen] = useState(false)

  function logout() {
    sessionStorage.removeItem('bagdrop_admin_key')
    router.replace('/admin/login')
  }

  function isActive(href: string) {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex items-center gap-2.5 border-b border-orange-100 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-white">
          <Luggage className="h-4 w-4" strokeWidth={2} />
        </div>
        <div>
          <p className="text-sm font-black tracking-tight text-gray-900">BAGDROP</p>
          <p className="text-[10px] font-medium text-orange-500">Admin Panel</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV.map(section => (
          <div key={section.group}>
            <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
              {section.group}
            </p>
            <ul className="space-y-0.5">
              {section.items.map(item => {
                const active = isActive(item.href)
                const Icon   = item.icon
                return (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                        active
                          ? 'bg-orange-50 text-orange-600'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      )}
                    >
                      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-orange-500' : 'text-gray-400')} strokeWidth={1.75} />
                      {item.label}
                      {active && <ChevronRight className="ml-auto h-3.5 w-3.5 text-orange-400" />}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Logout */}
      <div className="border-t border-gray-100 p-3">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-4 w-4 shrink-0 text-gray-400" strokeWidth={1.75} />
          Logout
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 border-r border-gray-200 bg-white lg:flex lg:flex-col">
        <SidebarContent />
      </aside>

      {/* Mobile: hamburger + drawer */}
      <div className="lg:hidden">
        <button
          onClick={() => setOpen(true)}
          className="fixed left-4 top-4 z-40 flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white shadow-sm"
        >
          <Menu className="h-4 w-4 text-gray-600" />
        </button>

        {/* Overlay */}
        {open && (
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setOpen(false)}
          />
        )}

        {/* Drawer */}
        <div className={cn(
          'fixed inset-y-0 left-0 z-50 w-56 bg-white shadow-xl transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full'
        )}>
          <button
            onClick={() => setOpen(false)}
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
          <SidebarContent />
        </div>
      </div>
    </>
  )
}
