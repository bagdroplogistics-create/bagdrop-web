'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { LogOut, ArrowLeft } from 'lucide-react'

// Wraps all /skybird/* pages with a lightweight co-branded header.
// Login page bypasses the shell and renders standalone (same pattern as
// app/(admin)/admin/layout.tsx).
export default function SkybirdShellLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const isLogin  = pathname === '/skybird/login'
  // Any page other than the inquiries list itself gets a back link — keeps
  // this automatic for future subpages under /skybird/* without needing to
  // add a back button on each page individually.
  const isDashboardRoot = pathname === '/skybird'

  if (isLogin) {
    return <>{children}</>
  }

  function handleLogout() {
    sessionStorage.removeItem('bagdrop_skybird_key')
    sessionStorage.removeItem('bagdrop_skybird_role')
    router.replace('/skybird/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <Image
            src="/images/skybird-logo.png"
            alt="Skybird Travel & Tours"
            width={120}
            height={30}
            className="h-7 w-auto object-contain"
          />
          <span className="text-sm font-semibold text-gray-300">×</span>
          <span className="text-sm font-black tracking-tight text-gray-900">BAGDROP</span>
          <span className="ml-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">
            Partner Dashboard
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
        >
          <LogOut className="h-4 w-4" /> Log out
        </button>
      </header>
      {!isDashboardRoot && (
        <div className="border-b border-stone-200 bg-white px-6 py-2.5">
          <Link
            href="/skybird"
            className="flex w-fit items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-sky-700"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
        </div>
      )}
      <main>{children}</main>
      <footer className="px-6 py-4 text-center text-xs text-gray-400">
        Baggage delivery powered by Bagdrop · Skybird USA partner access only
      </footer>
    </div>
  )
}
