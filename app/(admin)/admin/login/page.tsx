'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Eye, EyeOff } from 'lucide-react'

export default function AdminLoginPage() {
  const router = useRouter()
  const [key, setKey]         = React.useState('')
  const [show, setShow]       = React.useState(false)
  const [error, setError]     = React.useState('')
  const [loading, setLoading] = React.useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/admin/stats?key=' + encodeURIComponent(key))
    if (res.ok) {
      sessionStorage.setItem('bagdrop_admin_key', key)
      router.push('/admin')
    } else {
      setError('Invalid admin key. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand shadow-lg">
            <Lock className="h-6 w-6 text-white" />
          </div>
          <h1 className="font-display text-2xl font-black text-text-primary">BAGDROP</h1>
          <p className="mt-1 text-sm text-text-muted">Admin Dashboard</p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-lg font-bold text-text-primary">Sign in</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Admin Secret Key
              </label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  value={key}
                  onChange={e => setKey(e.target.value)}
                  placeholder="Enter your admin key"
                  required
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 pr-12 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
                <button
                  type="button"
                  onClick={() => setShow(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
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
              className="w-full rounded-xl bg-brand py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Access Dashboard'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-text-muted">
          Bagdrop · Admin only · Not for public access
        </p>
      </div>
    </div>
  )
}
