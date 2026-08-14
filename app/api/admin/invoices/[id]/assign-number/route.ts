import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { resolveGstTreatment, SAC_TRANSPORT } from '@/lib/zoho-books'
import { assignNextInvoiceNumber } from '@/lib/invoice-numbering'
import type { InvoicePDFLineItem } from '@/app/(admin)/admin/invoices/[id]/InvoicePDF'

export const runtime = 'nodejs'

// POST /api/admin/invoices/[id]/assign-number
//
// One-time, explicit admin action for invoices still carrying the old
// local placeholder number (BDI-{year}-{seq}, from before Bagdrop had any
// real numbering source). Assigns a real number from the current local
// "BLS26" sequence (see supabase/migrations/20260814_local_invoice_numbering.sql)
// — this used to call Zoho Books live to mint a real invoice, but Bagdrop
// has since stopped creating invoices in Zoho at all, so a legacy invoice
// getting "upgraded" now gets the exact same kind of number a brand-new
// invoice would (continuing the running BLS26 series), not a Zoho one.
//
// Deliberately does NOT recompute base_amount/cgst/sgst/igst/total_amount
// — an already-issued invoice's billed figures must never change as a
// side effect of assigning it a real number; only invoice_number and a
// few previously-empty display fields (place_of_supply/line_items/
// consignment_no) are touched, and only if not already set.
//
// Guarded against double-assignment: refuses if the invoice's current
// number doesn't look like a legacy placeholder (starts with "BDI-"), so
// clicking the button twice — or retrying after a different failure —
// can never burn a second number for the same local record.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const { data: invoice, error: invErr } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('id', id)
    .single()

  if (invErr || !invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  if (!String(invoice.invoice_number ?? '').startsWith('BDI-')) {
    return NextResponse.json({
      error: `This invoice already has a real number (${invoice.invoice_number}) — nothing to assign.`,
    }, { status: 409 })
  }

  const { placeOfSupply, isInterstate } = resolveGstTreatment(invoice.gst_number ?? null)
  const wasInterstate = Number(invoice.igst ?? 0) > 0 || isInterstate

  const description = [invoice.service_type, invoice.from_city && invoice.to_city ? `${invoice.from_city} → ${invoice.to_city}` : null]
    .filter(Boolean).join(' — ') || 'Baggage Delivery Service'

  const lineItemsSnapshot: InvoicePDFLineItem[] = [{
    name: 'Baggage Delivery Service',
    description,
    hsn: SAC_TRANSPORT,
    quantity: 1,
    rate: Number(invoice.base_amount ?? 0),
    amount: Number(invoice.base_amount ?? 0),
    ...(wasInterstate
      ? { igstPct: 5,   igstAmt: Number(invoice.igst ?? 0) }
      : { cgstPct: 2.5, cgstAmt: Number(invoice.cgst ?? 0), sgstPct: 2.5, sgstAmt: Number(invoice.sgst ?? 0) }),
  }]

  let invoiceNumber: string
  try {
    invoiceNumber = await assignNextInvoiceNumber()
  } catch (err) {
    console.error('[assign-number] Local invoice number assignment failed — local invoice left untouched:', err)
    return NextResponse.json({
      error: `Could not assign a new invoice number — the local invoice was NOT changed, so it's safe to try again. Details: ${(err as Error)?.message ?? 'unknown error'}`,
    }, { status: 500 })
  }

  const { data: updated, error: uErr } = await supabaseAdmin
    .from('invoices')
    .update({
      invoice_number:  invoiceNumber,
      // Only backfilled if not already set — never overwrites anything
      // real that was already there.
      place_of_supply: invoice.place_of_supply ?? placeOfSupply,
      line_items:       invoice.line_items ?? lineItemsSnapshot,
    })
    .eq('id', id)
    .select()
    .single()

  if (uErr) {
    // The number was already handed out by the sequence and can't be
    // un-burned — surface it clearly so it isn't silently lost.
    console.error('[assign-number] Number assigned but local update failed:', uErr.message)
    return NextResponse.json({
      error: `Assigned ${invoiceNumber} but failed to save it to the invoice: ${uErr.message}. Please retry — a gap in the sequence is expected and harmless.`,
    }, { status: 500 })
  }

  return NextResponse.json({ invoice: updated })
}
