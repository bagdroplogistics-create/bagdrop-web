import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Bagdrop Admin',
  robots: 'noindex, nofollow',
}

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-gray-50">{children}</div>
}
