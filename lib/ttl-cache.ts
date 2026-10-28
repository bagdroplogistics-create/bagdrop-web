// BAGDROP — lib/ttl-cache.ts
// Tiny in-memory cache for admin read endpoints (per server instance).
// Concurrent callers share one in-flight computation, and results are reused
// for `ttlMs`. Only use AFTER the auth check, and only for read-only data.

type Entry = { at: number; value?: unknown; promise?: Promise<unknown> }
const store = new Map<string, Entry>()

export async function cached<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = store.get(key)
  if (hit) {
    if (hit.promise) return hit.promise as Promise<T>
    if (now - hit.at < ttlMs) return hit.value as T
  }
  const promise = compute().then(
    v => { store.set(key, { at: Date.now(), value: v }); return v },
    e => { store.delete(key); throw e },
  )
  store.set(key, { at: now, promise })
  if (store.size > 200) {
    for (const [k, e] of store) if (!e.promise && now - e.at > ttlMs) store.delete(k)
  }
  return promise
}

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/admin-auth'

/** Wrap an existing admin GET handler: auth first, then reuse its JSON for ttlMs. */
export function cachedAdminGet(ttlMs: number, handler: (req: NextRequest) => Promise<Response>) {
  return async function GET(req: NextRequest) {
    if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const sp = new URLSearchParams(req.nextUrl.search)
    sp.delete('key'); sp.delete('_')
    const k = `route:${req.nextUrl.pathname}?${sp.toString()}`
    try {
      const body = await cached(k, ttlMs, async () => {
        const res = await handler(req)
        if (!res.ok) throw Object.assign(new Error('upstream'), { res })
        return res.json()
      })
      return NextResponse.json(body)
    } catch (e) {
      const res = (e as { res?: Response }).res
      if (res) return res
      throw e
    }
  }
}
