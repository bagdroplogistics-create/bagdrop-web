import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export const runtime = 'nodejs'

// POST /api/admin/invoices/[id]/swap-number
// body: { with_invoice_number: string }
//
// Manual correction tool for when invoice numbers were assigned out of
// chronological order (e.g. an August inquiry got BLS2600043 before the
// correct July inquiry did). Swaps the invoice_number values of THIS
// invoice and whichever invoice currently holds `with_invoice_number` —
// see supabase/migrations/20260814b_swap_invoice_numbers.sql for why this
// has to be a single atomic DB function rather than two separate updates
// (the UNIQUE constraint on invoice_number would reject a naive two-step
// swap). Never touches the underlying bagdrop_invoice_seq sequence, base
// amounts, GST, or anything else on either row — invoice_number only.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const body = await req.json().catch(() => null)
  const withNumber = String(body?.with_invoice_number ?? '').trim()
  if (!withNumber) return NextResponse.json({ error: 'with_invoice_number is required' }, { status: 400 })

  const { data: thisInv, error: thisErr } = await supabaseAdmin
    .from('invoices').select('id, invoice_number').eq('id', id).single()
  if (thisErr || !thisInv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  if (!thisInv.invoice_number) {
    return NextResponse.json({ error: 'This invoice has no number yet — generate it first.' }, { status: 409 })
  }

  const { data: otherInv, error: otherErr } = await supabaseAdmin
    .from('invoices').select('id, invoice_number').eq('invoice_number', withNumber).maybeSingle()
  if (otherErr) return NextResponse.json({ error: otherErr.message }, { status: 500 })
  if (!otherInv) return NextResponse.json({ error: `No invoice found with number "${withNumber}".` }, { status: 404 })
  if (otherInv.id === thisInv.id) {
    return NextResponse.json({ error: "That's this invoice's own current number — nothing to swap." }, { status: 400 })
  }

  const { error: swapErr } = await supabaseAdmin.rpc('swap_invoice_numbers', { id_a: thisInv.id, id_b: otherInv.id })
  if (swapErr) return NextResponse.json({ error: swapErr.message }, { status: 500 })

  const { data: updated, error: reErr } = await supabaseAdmin.from('invoices').select('*').eq('id', id).single()
  if (reErr) return NextResponse.json({ error: reErr.message }, { status: 500 })

  return NextResponse.json({ invoice: updated, swapped_with: withNumber })
}
