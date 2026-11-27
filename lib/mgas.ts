// BAGDROP — lib/mgas.ts
//
// DB + sending layer for the MGAS baggage-code request workflow.
// Pure rules live in lib/mgas-core.ts. Reuses the existing WhatsApp
// infrastructure (sendWhatsAppTemplate: Fast2SMS primary -> Meta fallback).
//
// SAFETY: settings.mgas_mode gates everything. 'off' (default) = dry-run only,
// nothing is sent anywhere. 'test' = sends only to settings.mgas_test_number
// and never marks bookings as requested. 'live' = sends to settings.mgas_recipient.
// Code replies from the MGAS contact are NOT read automatically; an admin types
// them in. Codes are never generated or guessed. Customers are never auto-messaged.

import { supabaseAdmin } from './supabase'
import { sendWhatsAppTemplate } from './notifications'
import {
  MGAS_CONFIRMED_STATUSES, planBooking, buildBatches, batchKey, istDateStr, requestDueDate,
  normalizeIndianMobile, type MgasBooking, type PlanAction,
} from './mgas-core'

export type MgasMode = 'off' | 'test' | 'live'
export interface MgasConfig { mode: MgasMode; recipient: string | null; testNumber: string | null; template: string }

const BOOKING_COLS =
  'id, tracking_id, status, title, customer_name, customer_phone, from_city, to_city, pickup_address, pickup_date, flight_number, flight_datetime, total_bags, service_type, service_label, is_test'

export async function getMgasConfig(): Promise<MgasConfig> {
  const { data } = await supabaseAdmin.from('settings').select('key, value')
    .in('key', ['mgas_mode', 'mgas_recipient', 'mgas_test_number', 'mgas_template_name'])
  const m = Object.fromEntries((data ?? []).map(r => [r.key as string, (r.value as string) ?? '']))
  const mode: MgasMode = m.mgas_mode === 'live' ? 'live' : m.mgas_mode === 'test' ? 'test' : 'off'
  return {
    mode,
    recipient: normalizeIndianMobile(m.mgas_recipient),
    testNumber: normalizeIndianMobile(m.mgas_test_number),
    template: m.mgas_template_name || 'bagdrop_mgas_code_request',
  }
}

async function audit(requestId: string | null, bookingId: string | null, action: string, actor: string, detail?: unknown) {
  await supabaseAdmin.from('mgas_audit').insert({ request_id: requestId, booking_id: bookingId, action, actor, detail: detail ?? null })
}

/**
 * Brings mgas_requests in line with bookings (idempotent). Creates rows for
 * eligible/review candidates, RECALCULATES dates when a booking's pickup date
 * changed (unless already sent), and cancels/excludes bookings that became
 * ineligible. Never touches a request already marked sent.
 */
export async function syncRequests(today: string = istDateStr()): Promise<{ created: number; updated: number }> {
  const { data: bookings, error } = await supabaseAdmin.from('bookings').select(BOOKING_COLS)
    .eq('is_test', false).ilike('from_city', '%mumbai%').gte('pickup_date', today).limit(2000)
  if (error) throw new Error(`bookings read failed: ${error.message}`)
  const { data: existing } = await supabaseAdmin.from('mgas_requests').select('*')
  const byBooking = new Map((existing ?? []).map(r => [r.booking_id as string, r]))
  let created = 0, updated = 0

  const seen = new Set<string>()
  for (const b of (bookings ?? []) as MgasBooking[]) {
    seen.add(b.id)
    const cur = byBooking.get(b.id)
    if (cur && (cur.request_status === 'sent' || cur.request_status === 'sending')) continue
    const approved = !!cur?.review_approved_at
    const plan = planBooking(b, today, approved)
    const status =
      plan.action === 'exclude' ? (MGAS_CONFIRMED_STATUSES.includes(b.status) ? 'excluded' : 'cancelled')
      : plan.action === 'review' ? 'needs_review'
      : plan.action === 'late_review' ? 'late_review'
      : cur?.request_status === 'failed' ? 'failed' : 'pending'
    if (plan.action === 'exclude' && !cur) continue // never clutter the table with ineligible bookings
    const patch = {
      arrival_date: plan.arrivalDate, scheduled_request_date: plan.requestDate,
      request_status: status, review_reason: plan.action === 'wait' || plan.action === 'send' ? null : plan.reason,
      eligibility_note: plan.reason, updated_at: new Date().toISOString(),
    }
    if (!cur) {
      const { data: row } = await supabaseAdmin.from('mgas_requests').insert({ booking_id: b.id, ...patch }).select('id').maybeSingle()
      created++; await audit(row?.id ?? null, b.id, 'created', 'system', { status, date: plan.requestDate })
    } else if (cur.arrival_date !== plan.arrivalDate || cur.request_status !== status || cur.scheduled_request_date !== plan.requestDate) {
      await supabaseAdmin.from('mgas_requests').update(patch).eq('id', cur.id)
      updated++
      if (cur.arrival_date !== plan.arrivalDate) await audit(cur.id, b.id, 'rescheduled', 'system', { from: cur.arrival_date, to: plan.arrivalDate })
    }
  }
  // Requests whose booking vanished from the window (cancelled/moved/past) and were never sent.
  for (const r of existing ?? []) {
    if (seen.has(r.booking_id) || ['sent', 'sending', 'cancelled', 'excluded'].includes(r.request_status)) continue
    await supabaseAdmin.from('mgas_requests').update({ request_status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', r.id)
    await audit(r.id, r.booking_id, 'cancelled', 'system', { reason: 'booking no longer eligible/in window' }); updated++
  }
  return { created, updated }
}

export interface SendOutcome { batches: number; bookings: number; mode: MgasMode; dryRun: boolean; errors: string[]; previews: string[] }

/**
 * Sends the given request ids (already validated as sendable by the caller's
 * planBooking). Atomic claim: only rows still pending/failed/late_review/needs_review
 * flip to 'sending' — a concurrent run can never claim the same row.
 */
export async function sendRequests(requestIds: string[], trigger: 'auto' | 'manual' | 'resend' | 'retry', actor: string, today = istDateStr()): Promise<SendOutcome> {
  const cfg = await getMgasConfig()
  const out: SendOutcome = { batches: 0, bookings: 0, mode: cfg.mode, dryRun: cfg.mode === 'off', errors: [], previews: [] }
  if (requestIds.length === 0) return out
  const target = cfg.mode === 'live' ? cfg.recipient : cfg.mode === 'test' ? cfg.testNumber : null
  if (cfg.mode !== 'off' && !target) { out.errors.push(`mgas_mode=${cfg.mode} but the ${cfg.mode === 'live' ? 'recipient' : 'test number'} is missing/invalid`); return out }

  const claimFrom = trigger === 'resend' ? ['sent'] : ['pending', 'failed', 'late_review', 'needs_review']
  // Dry-run / test never claim rows (nothing is marked sent), so they can be repeated safely.
  const claimable = cfg.mode === 'live'
    ? (await supabaseAdmin.from('mgas_requests').update({ request_status: 'sending', updated_at: new Date().toISOString() })
        .in('id', requestIds).in('request_status', claimFrom).select('id, booking_id')).data ?? []
    : (await supabaseAdmin.from('mgas_requests').select('id, booking_id').in('id', requestIds)).data ?? []
  if (claimable.length === 0) return out

  const { data: bks } = await supabaseAdmin.from('bookings').select(BOOKING_COLS).in('id', claimable.map(c => c.booking_id))
  const bookings = (bks ?? []) as MgasBooking[]
  const reqByBooking = new Map(claimable.map(c => [c.booking_id as string, c.id as string]))

  // Final safety gate right before sending (state may have changed since the list was built).
  const sendable: MgasBooking[] = []
  for (const b of bookings) {
    const { data: row } = await supabaseAdmin.from('mgas_requests').select('review_approved_at').eq('id', reqByBooking.get(b.id) as string).maybeSingle()
    const p = planBooking(b, today, !!row?.review_approved_at)
    const manualOk = trigger !== 'auto' && (p.action === 'late_review' || p.action === 'send' || p.action === 'wait')
    if (p.action === 'send' || manualOk) sendable.push(b)
    else {
      out.errors.push(`${b.tracking_id}: not sent (${p.reason})`)
      if (cfg.mode === 'live') await supabaseAdmin.from('mgas_requests').update({ request_status: p.action === 'review' ? 'needs_review' : p.action === 'late_review' ? 'late_review' : 'excluded' }).eq('id', reqByBooking.get(b.id) as string)
    }
  }

  const istDay = today
  for (const batch of buildBatches(sendable)) {
    const ids = batch.bookings.map(b => b.id)
    const key = batchKey(`${trigger}-${cfg.mode}`, istDay + (trigger === 'auto' ? '' : `-${Date.now()}`), ids)
    out.previews.push(batch.text)
    const { data: bRow, error: bErr } = await supabaseAdmin.from('mgas_batches').insert({
      batch_key: key, trigger, mode: cfg.mode, recipient: target, message_text: batch.text,
      booking_count: ids.length, status: cfg.mode === 'off' ? 'dry_run' : 'claimed', created_by: actor,
    }).select('id').maybeSingle()
    if (bErr || !bRow) { out.errors.push(`batch claim failed: ${bErr?.message ?? 'duplicate batch'}`); continue }
    out.batches++; out.bookings += ids.length
    if (cfg.mode === 'off') continue

    const res = await sendWhatsAppTemplate(target as string, cfg.template, batch.vars)
    const ok = !!res.success
    await supabaseAdmin.from('mgas_batches').update({
      status: ok ? (cfg.mode === 'live' ? 'sent' : 'test_sent') : 'failed',
      provider_request_id: (res as { requestId?: string }).requestId ?? null, error: ok ? null : (res.error ?? 'unknown error'),
      sent_at: ok ? new Date().toISOString() : null,
    }).eq('id', bRow.id)
    if (!ok) out.errors.push(`send failed: ${res.error}`)
    if (cfg.mode !== 'live') continue // test mode never marks bookings requested

    for (const b of batch.bookings) {
      const rid = reqByBooking.get(b.id) as string
      const { data: cur } = await supabaseAdmin.from('mgas_requests').select('send_attempts').eq('id', rid).maybeSingle()
      await supabaseAdmin.from('mgas_requests').update(ok
        ? { request_status: 'sent', sent_at: new Date().toISOString(), batch_id: bRow.id, codes_status: 'awaiting', last_error: null, send_attempts: (cur?.send_attempts ?? 0) + 1, updated_at: new Date().toISOString() }
        : { request_status: 'failed', last_error: res.error ?? 'send failed', send_attempts: (cur?.send_attempts ?? 0) + 1, updated_at: new Date().toISOString() }
      ).eq('id', rid)
      await audit(rid, b.id, ok ? (trigger === 'resend' ? 'resent' : 'sent') : 'send_failed', actor, { batch: bRow.id, error: res.error })
    }
  }
  return out
}

/** Daily cron entry: sync, find requests due today, send. Respects mgas_mode. */
export async function runDailyMgas(today: string = istDateStr()): Promise<{ today: string; synced: unknown; due: string[]; outcome: SendOutcome }> {
  const synced = await syncRequests(today)
  const { data: due } = await supabaseAdmin.from('mgas_requests').select('id, booking_id')
    .eq('scheduled_request_date', today).in('request_status', ['pending', 'failed'])
  const ids = (due ?? []).map(d => d.id as string)
  const outcome = await sendRequests(ids, 'auto', 'cron', today)
  return { today, synced, due: ids, outcome }
}

export { requestDueDate }
export type { PlanAction }
