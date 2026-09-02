// BAGDROP — app/api/admin/branches/[id]/rotate-key/route.ts
//
// Generates a fresh access_key for a branch, invalidating the previous
// one immediately (whoever had the old key loses access on their very
// next request). Admin-only, same as every other branch-management action.
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized — branch management requires an admin key' }, { status: 401 })
  }
  const { id } = await params

  const accessKey = crypto.randomBytes(24).toString('base64url')
  const { data: branch, error } = await supabaseAdmin
    .from('branches')
    .update({ access_key: accessKey })
    .eq('id', id)
    .select('id, branch_code, branch_name')
    .single()

  if (error) return NextResponse.json({ error: 'Branch not found' }, { status: 404 })

  return NextResponse.json({ branch, access_key: accessKey })
}
