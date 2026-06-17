'use client'

import { useEffect, useState } from 'react'
import { LogOut } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { BookingAuth }   from './booking-auth'
import { BookingEngine } from './booking-engine'
import type { User } from '@supabase/supabase-js'

export function BookingGate() {
  const [user,    setUser]    = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION immediately on mount,
    // reading the persisted session from localStorage.
    const { data: { subscription } } = supabaseBrowser.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  async function handleSignOut() {
    await supabaseBrowser.auth.signOut()
    setUser(null)
  }

  // ── Loading ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
        <p className="text-base text-text-muted">Loading…</p>
      </div>
    )
  }

  // ── Not authenticated → show OTP login ───────────────────────
  if (!user) {
    return <BookingAuth onAuth={setUser} />
  }

  // ── Authenticated → show booking engine + logout button ──────
  const displayName = user.phone
    ? user.phone.replace('+91', '+91 ')
    : user.email ?? ''

  return (
    <div className="relative">
      {/* Logout bar */}
      <div className="flex items-center justify-end gap-3 px-4 py-3 sm:px-6 lg:px-8 border-b border-border/50 bg-cream/60">
        <p className="text-sm text-text-muted">
          Signed in as <span className="font-medium text-text-primary">{displayName}</span>
        </p>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:border-red-300 hover:text-red-500"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>

     <BookingEngine />
    </div>
  )
}
