'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Eye, EyeOff } from 'lucide-react'

export default function AdminLoginPage() {
  const router  = useRouter()
  const [key,     setKey]     = useState('')
  const [show,    setShow]    = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/admin/auth-role?key=' + encodeURIComponent(key))
      if (!res.ok) {
        setError('Invalid key. Please try again.')
        setLoading(false)
        return
      }
      const { role } = await res.json()
      sessionStorage.setItem('bagdrop_admin_key',  key)
      sessionStorage.setItem('bagdrop_admin_role', role)
      router.replace('/admin')
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* Full logo lockup, stacked — the real orange icon (same asset
              used on the website) plus the "BAGDROP" wordmark plus the
              "BAG. BOX. DELIVERED" tagline, exactly like the brand mark
              you sent, just centered above "Admin Dashboard" instead of a
              separate plain heading. */}
          <Image src="/images/logo-icon.png" alt="Bagdrop" width={200} height={260}
            className="mx-auto h-24 w-auto" priority />
          <p className="mt-2 text-3xl font-black tracking-tight text-[#FF6300]">BAGDROP</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
            Bag. Box. Delivered
          </p>
          <p className="mt-3 text-sm text-gray-500">Admin Dashboard</p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-lg font-bold text-gray-900">Sign in</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-600">
                Admin Secret Key
              </label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  value={key}
                  onChange={e => setKey(e.target.value)}
                  placeholder="Enter your admin key"
                  required
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 pr-12 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShow(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && (
              <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || !key}
              className="w-full rounded-xl bg-orange-500 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Verifying…' : 'Access Dashboard'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Bagdrop Admin · Authorised personnel only
        </p>
      </div>
    </div>
  )
}
