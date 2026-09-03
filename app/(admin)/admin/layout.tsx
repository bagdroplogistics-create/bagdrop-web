'use client'

import { usePathname } from 'next/navigation'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

// Wraps all /admin/* pages with the sidebar shell.
// Login page bypasses the shell and renders standalone.
export default function AdminShellLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLogin  = pathname === '/admin/login'

  if (isLogin) {
    return <>{children}</>
  }

  return (
    // print:h-auto print:overflow-visible on both wrapper and <main> — the
    // screen layout pins this to exactly one viewport height with internal
    // scrolling (h-screen overflow-hidden), which would clip a printed
    // multi-page document (e.g. Leads "Print List") to a single page.
    // Screen behavior is unchanged; this only relaxes the constraint for
    // @media print.
    <div className="flex h-screen overflow-hidden bg-gray-50 print:h-auto print:overflow-visible">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto print:h-auto print:overflow-visible print:w-full">
        {children}
      </main>
    </div>
  )
}
