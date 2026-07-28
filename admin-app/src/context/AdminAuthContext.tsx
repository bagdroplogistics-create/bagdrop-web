import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { getAdminRole, AdminApiError } from '@/lib/api'

export type AdminRole = 'admin' | 'staff'

interface AdminAuthContextValue {
  adminKey: string | null
  role: AdminRole | null
  loading: boolean
  /** Verifies the key against the website's existing /api/admin/auth-role
   *  endpoint (same ADMIN_SECRET_KEY / STAFF_SECRET_KEY check as the site),
   *  then persists it for future app launches. */
  signIn: (key: string) => Promise<void>
  signOut: () => Promise<void>
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null)

const KEY_STORAGE = 'bagdrop_admin_key'
const ROLE_STORAGE = 'bagdrop_admin_role'

// expo-secure-store has no web implementation — fall back to
// localStorage there (this mirrors how the website itself stores the
// admin key, in sessionStorage, since web has no secure keychain anyway).
const storage = {
  async get(k: string): Promise<string | null> {
    if (Platform.OS === 'web') return typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null
    return SecureStore.getItemAsync(k)
  },
  async set(k: string, v: string): Promise<void> {
    if (Platform.OS === 'web') { if (typeof localStorage !== 'undefined') localStorage.setItem(k, v); return }
    await SecureStore.setItemAsync(k, v)
  },
  async remove(k: string): Promise<void> {
    if (Platform.OS === 'web') { if (typeof localStorage !== 'undefined') localStorage.removeItem(k); return }
    await SecureStore.deleteItemAsync(k)
  },
}

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [adminKey, setAdminKey] = useState<string | null>(null)
  const [role, setRole] = useState<AdminRole | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [storedKey, storedRole] = await Promise.all([storage.get(KEY_STORAGE), storage.get(ROLE_STORAGE)])
      if (storedKey && storedRole) {
        setAdminKey(storedKey)
        setRole(storedRole as AdminRole)
      }
      setLoading(false)
    })()
  }, [])

  const signIn = useCallback(async (key: string) => {
    const trimmed = key.trim()
    if (!trimmed) throw new Error('Enter your admin key.')
    let result
    try {
      result = await getAdminRole(trimmed)
    } catch (e) {
      if (e instanceof AdminApiError && e.status === 401) throw new Error('Invalid admin key. Please try again.')
      throw new Error(e instanceof Error ? e.message : 'Could not sign in. Please try again.')
    }
    await Promise.all([storage.set(KEY_STORAGE, trimmed), storage.set(ROLE_STORAGE, result.role)])
    setAdminKey(trimmed)
    setRole(result.role)
  }, [])

  const signOut = useCallback(async () => {
    await Promise.all([storage.remove(KEY_STORAGE), storage.remove(ROLE_STORAGE)])
    setAdminKey(null)
    setRole(null)
  }, [])

  return (
    <AdminAuthContext.Provider value={{ adminKey, role, loading, signIn, signOut }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider')
  return ctx
}
