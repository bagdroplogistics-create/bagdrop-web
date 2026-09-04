import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { syncBagCountToBooking, mintBagIds } from '@/lib/group-booking'
import * as XLSX from 'xlsx'

// Accepts the template downloaded from GET .../template (or a plain CSV
// with the same headers). Two modes, driven by the `mode` form field:
//   - 'preview' (default): parse + validate only, no DB writes. Returns
//     parsed rows + per-row errors so the UI can show a preview before
//     committing (spec section 11: "Validate the data. Show errors before
//     saving. Show preview.").
//   - 'commit': same validation, then actually creates the guest + bag
//     records (mirrors POST .../guests' auto-bag-creation, just batched).
//
// Duplicate-import guard: a row whose Mobile Number matches an existing,
// non-deleted guest already on this group booking is SKIPPED (reported
// back, not silently dropped) rather than creating a second guest/bag set
// — re-running the same import file twice is a no-op the second time.

const HEADER_MAP: Record<string, string> = {
  'guest name':        'guest_name',
  'mobile number':     'mobile_number',
  'email':             'email',
  'number of bags':    'bags_count',
  'hotel':             'hotel_name',
  'room number':       'room_number',
  'delivery location': 'delivery_location',
  'remarks':           'remarks',
}

interface ParsedRow {
  row: number
  guest_name: string
  mobile_number: string
  email: string | null
  bags_count: number
  hotel_name: string | null
  room_number: string | null
  delivery_location: string | null
  remarks: string | null
  errors: string[]
  status: 'ok' | 'skipped_duplicate' | 'error'
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await context.params

  const { data: booking } = await supabaseAdmin.from('bookings').select('id').eq('id', id).eq('booking_type', 'group').maybeSingle()
  if (!booking) return NextResponse.json({ error: 'Group booking not found' }, { status: 404 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  const mode = (form?.get('mode') as string) === 'commit' ? 'commit' : 'preview'
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }

  let sheetRows: Record<string, unknown>[]
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const wb  = XLSX.read(buf, { type: 'buffer' })
    const ws  = wb.Sheets[wb.SheetNames[0]]
    sheetRows = XLSX.utils.sheet_to_json(ws, { defval: '' })
  } catch (err) {
    return NextResponse.json({ error: `Could not read file: ${err instanceof Error ? err.message : 'invalid format'}` }, { status: 400 })
  }

  if (sheetRows.length === 0) {
    return NextResponse.json({ error: 'File has no data rows' }, { status: 400 })
  }

  // Normalize whatever header casing/spacing the sheet actually has to our
  // canonical field names.
  const normalized = sheetRows.map(raw => {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(raw)) {
      const canonical = HEADER_MAP[key.trim().toLowerCase()]
      if (canonical) out[canonical] = val
    }
    return out
  })

  const { data: existingGuests } = await supabaseAdmin
    .from('group_guests')
    .select('mobile_number')
    .eq('booking_id', id)
    .is('deleted_at', null)
  const existingMobiles = new Set((existingGuests ?? []).map(g => (g.mobile_number ?? '').replace(/\D/g, '')).filter(Boolean))

  const seenInFile = new Set<string>()
  const parsed: ParsedRow[] = normalized.map((r, i) => {
    const errors: string[] = []
    const guest_name    = String(r.guest_name ?? '').trim()
    const mobile_number = String(r.mobile_number ?? '').trim()
    const mobileDigits  = mobile_number.replace(/\D/g, '')
    const bags_count    = Number(r.bags_count) || 0

    if (!guest_name)          errors.push('Guest Name is required')
    if (!mobile_number)       errors.push('Mobile Number is required')
    if (bags_count < 1)       errors.push('Number of Bags must be at least 1')
    if (bags_count > 500)     errors.push('Number of Bags looks too high — check for a typo')

    let status: ParsedRow['status'] = errors.length > 0 ? 'error' : 'ok'
    if (status === 'ok' && mobileDigits && existingMobiles.has(mobileDigits)) status = 'skipped_duplicate'
    if (status === 'ok' && mobileDigits && seenInFile.has(mobileDigits)) {
      errors.push('Duplicate Mobile Number within this file')
      status = 'error'
    }
    if (mobileDigits) seenInFile.add(mobileDigits)

    return {
      row: i + 2, // +2 = header row + 1-indexed
      guest_name, mobile_number,
      email:             String(r.email ?? '').trim() || null,
      bags_count,
      hotel_name:        String(r.hotel_name ?? '').trim() || null,
      room_number:       String(r.room_number ?? '').trim() || null,
      delivery_location: String(r.delivery_location ?? '').trim() || null,
      remarks:           String(r.remarks ?? '').trim() || null,
      errors, status,
    }
  })

  const okRows = parsed.filter(r => r.status === 'ok')

  if (mode === 'preview') {
    return NextResponse.json({
      mode: 'preview',
      total: parsed.length,
      valid: okRows.length,
      skipped: parsed.filter(r => r.status === 'skipped_duplicate').length,
      errors: parsed.filter(r => r.status === 'error').length,
      rows: parsed,
    })
  }

  // ── commit ──────────────────────────────────────────────────────────
  const created: { guest: unknown; bags: unknown[] }[] = []
  const failed: { row: number; guest_name: string; error: string }[] = []

  for (const r of okRows) {
    const { data: guest, error: guestErr } = await supabaseAdmin
      .from('group_guests')
      .insert({
        booking_id: id, guest_name: r.guest_name, mobile_number: r.mobile_number, email: r.email,
        hotel_name: r.hotel_name, room_number: r.room_number, delivery_location: r.delivery_location, remarks: r.remarks,
      })
      .select('*')
      .single()

    if (guestErr || !guest) {
      failed.push({ row: r.row, guest_name: r.guest_name, error: guestErr?.message ?? 'guest insert failed' })
      continue
    }

    try {
      const bagNumbers = await mintBagIds(r.bags_count)
      const { data: bags, error: bagsErr } = await supabaseAdmin
        .from('group_bags')
        .insert(bagNumbers.map(bag_number => ({
          booking_id: id, guest_id: guest.id, bag_number, status: 'pending',
          hotel_name: r.hotel_name, room_number: r.room_number, delivery_location: r.delivery_location,
        })))
        .select('*')
      if (bagsErr) {
        failed.push({ row: r.row, guest_name: r.guest_name, error: `guest created, bags failed: ${bagsErr.message}` })
        created.push({ guest, bags: [] })
        continue
      }
      created.push({ guest, bags: bags ?? [] })
    } catch (err) {
      failed.push({ row: r.row, guest_name: r.guest_name, error: `guest created, bag ID generation failed: ${err instanceof Error ? err.message : 'unknown'}` })
      created.push({ guest, bags: [] })
    }
  }

  if (created.some(c => c.bags.length > 0)) {
    await syncBagCountToBooking(id)
  }

  return NextResponse.json({
    mode: 'commit',
    created_guests: created.length,
    created_bags: created.reduce((s, c) => s + c.bags.length, 0),
    skipped: parsed.filter(r => r.status === 'skipped_duplicate').length,
    failed,
  })
}
