// app/api/admin/mgas/route.ts — admin API for the MGAS code-request workflow.
// GET  -> list requests (+ review queue) with booking info, config, recent batches.
// POST -> { action, ... }: sync | send | resend | approve_review | record_codes | verify_codes | customer_notified
// Auth: x-admin-key (admin or staff). Customer-facing sends are NOT implemented here on purpose.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth, getAdminRole } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getMgasConfig, syncRequests, sendRequests } from '@/lib/mgas'
import { parseMgasCodes, istDateStr } from '@/lib/mgas-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  if (sp.get('sync') === '1') { try { await syncRequests() } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) } }
  const { data: rows } = await supabaseAdmin.from('mgas_requests').select('*').order('arrival_date', { ascending: true }).limit(500)
  const ids = (rows ?? []).map(r => r.booking_id)
  const { data: bks } = ids.length
    ? await supabaseAdmin.from('bookings').select('id, tracking_id, title, customer_name, customer_phone, status, pickup_address, pickup_date, flight_number, total_bags').in('id', ids)
    : { data: [] as Record<string, unknown>[] }
  const bmap = new Map((bks ?? []).map(b => [b.id as string, b]))
  const { data: batches } = await supabaseAdmin.from('mgas_batches').select('id, trigger, mode, recipient, status, booking_count, message_text, error, created_at, sent_at').order('created_at', { ascending: false }).limit(20)
  const cfg = await getMgasConfig()
  return NextResponse.json({
    today: istDateStr(), config: { mode: cfg.mode, recipientSet: !!cfg.recipient, testNumberSet: !!cfg.testNumber, template: cfg.template },
    requests: (rows ?? []).map(r => ({ ...r, booking: bmap.get(r.booking_id) ?? null })), batches: batches ?? [],
  })
}

export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const actor = getAdminRole(req) ?? 'admin'
  const body = await req.json().catch(() => ({})) as { action?: string; ids?: string[]; id?: string; codes?: string; note?: string }
  const ids = Array.isArray(body.ids) ? body.ids.filter(x => typeof x === 'string') : body.id ? [body.id] : []
  const audit = (rid: string, bid: string | null, action: string, detail?: unknown) =>
    supabaseAdmin.from('mgas_audit').insert({ request_id: rid, booking_id: bid, action, actor, detail: detail ?? null })

  switch (body.action) {
    case 'sync': return NextResponse.json({ ok: true, ...(await syncRequests()) })
    case 'send': case 'resend': {
      if (!ids.length) return NextResponse.json({ error: 'ids required' }, { status: 400 })
      return NextResponse.json({ ok: true, ...(await sendRequests(ids, body.action === 'resend' ? 'resend' : 'manual', actor)) })
    }
    case 'approve_review': {
      if (!ids.length) return NextResponse.json({ error: 'ids required' }, { status: 400 })
      const now = new Date().toISOString()
      await supabaseAdmin.from('mgas_requests').update({ review_approved_by: actor, review_approved_at: now, updated_at: now }).in('id', ids).in('request_status', ['needs_review', 'late_review'])
      for (const id of ids) await audit(id, null, 'review_approved')
      return NextResponse.json({ ok: true, ...(await syncRequests()) })
    }
    case 'record_codes': {
      if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
      const p = parseMgasCodes(body.codes ?? '')
      if (p.error || !p.codes.length) return NextResponse.json({ error: p.error ?? 'No codes' }, { status: 400 })
      const { data: r } = await supabaseAdmin.from('mgas_requests').select('booking_id, total:booking_id').eq('id', body.id).maybeSingle()
      const { data: b } = await supabaseAdmin.from('bookings').select('total_bags').eq('id', r?.booking_id ?? '').maybeSingle()
      const warn = b?.total_bags && b.total_bags !== p.count ? `Entered ${p.count} code(s) but booking has ${b.total_bags} bag(s)` : null
      await supabaseAdmin.from('mgas_requests').update({ codes: p.codes, codes_status: 'received', codes_note: body.note ?? null, codes_received_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', body.id)
      await audit(body.id, r?.booking_id ?? null, 'codes_recorded', { codes: p.codes, warn })
      return NextResponse.json({ ok: true, codes: p.codes, warning: warn })
    }
    case 'verify_codes': {
      if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
      const now = new Date().toISOString()
      await supabaseAdmin.from('mgas_requests').update({ codes_status: 'verified', codes_verified_by: actor, codes_verified_at: now, updated_at: now }).eq('id', body.id).eq('codes_status', 'received')
      await audit(body.id, null, 'codes_verified')
      return NextResponse.json({ ok: true })
    }
    case 'customer_notified': { // manual bookkeeping only — nothing is sent to the customer from here
      if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
      const now = new Date().toISOString()
      await supabaseAdmin.from('mgas_requests').update({ codes_status: 'customer_notified', customer_notified_at: now, updated_at: now }).eq('id', body.id).eq('codes_status', 'verified')
      await audit(body.id, null, 'customer_marked_notified')
      return NextResponse.json({ ok: true })
    }
    default: return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}
