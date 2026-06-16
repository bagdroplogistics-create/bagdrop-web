import { NextRequest } from 'next/server'

export function requireAdminAuth(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET_KEY
  if (!secret) return false
  const auth = req.headers.get('x-admin-key') ?? req.nextUrl.searchParams.get('key')
  return auth === secret
}
