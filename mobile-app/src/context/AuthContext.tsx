import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { sendOtp as apiSendOtp, verifyOtp as apiVerifyOtp } from '@/lib/api'

interface AuthContextValue {
  session: Session | null
  loading: boolean
  /** Step 1: request a one-time code by email or phone (same flow as the website). */
  requestOtp: (type: 'email' | 'phone', contact: string) => Promise<{ fallbackOtp?: string }>
  /** Step 2: verify the code, then establish a real Supabase session. */
  confirmOtp: (type: 'email' | 'phone', contact: string, otp: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const requestOtp = useCallback(async (type: 'email' | 'phone', contact: string) => {
    const res = await apiSendOtp(type, contact)
    // If SMS delivery isn't configured server-side, the API falls back to
    // returning the code directly so the customer can still sign in.
    return { fallbackOtp: res.fallback ? res.otp : undefined }
  }, [])

  const confirmOtp = useCallback(async (type: 'email' | 'phone', contact: string, otp: string) => {
    const { authEmail, tempPassword } = await apiVerifyOtp(type, contact, otp)
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: tempPassword })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <AuthContext.Provider value={{ session, loading, requestOtp, confirmOtp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
