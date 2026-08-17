import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { requireAdminAuth } from "@/lib/admin-auth"
import { resolveGstTreatment } from "@/lib/zoho-books"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const { data, error } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  // Read-only fallback enrichment for legacy invoices — invoices upgraded
  // from an old BDI- placeholder via /assign-number only ever backfilled
  // place_of_supply/line_items (see that route's comment), so older rows
  // can still be missing due_date/consignment_no/pickup_date/delivery_date/
  // po_number even though the booking they're linked to actually has this
  // data. Same "compute from the linked booking, never write it back"
  // pattern already used for Leads/Payments this session — this never
  // touches the invoices table, so it's safe to run on every GET.
  const invoice: Record<string, unknown> = { ...data }
  if (invoice.booking_id && (
    !invoice.due_date || !invoice.place_of_supply || !invoice.consignment_no ||
    !invoice.pickup_date || !invoice.delivery_date || !invoice.po_number
  )) {
    const [{ data: booking }, { data: lead }] = await Promise.all([
      supabaseAdmin.from('bookings').select('tracking_id, pickup_date, delivery_date, gst_number')
        .eq('id', invoice.booking_id as string).maybeSingle(),
      supabaseAdmin.from('leads').select('agent_name, salesperson_name, gst_number')
        .eq('booking_id', invoice.booking_id as string).maybeSingle(),
    ])

    if (!invoice.due_date) invoice.due_date = invoice.invoice_date ?? null // "Due on Receipt"
    if (!invoice.consignment_no) invoice.consignment_no = booking?.tracking_id ?? null
    if (!invoice.pickup_date) invoice.pickup_date = booking?.pickup_date ?? null
    if (!invoice.delivery_date) invoice.delivery_date = booking?.delivery_date ?? null
    if (!invoice.po_number) invoice.po_number = lead?.agent_name?.trim() || lead?.salesperson_name?.trim() || null
    if (!invoice.place_of_supply) {
      const gstin = (invoice.gst_number as string | null) ?? booking?.gst_number ?? lead?.gst_number ?? null
      invoice.place_of_supply = resolveGstTreatment(gstin).placeOfSupply
    }
  }

  return NextResponse.json({ invoice })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const body   = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  const allowed = [
    "customer_name", "customer_phone", "customer_email", "customer_address",
    "base_amount", "cgst", "sgst", "igst", "total_amount",
    "payment_status", "payment_method", "payment_reference",
    "notes", "due_date", "sent_email", "sent_whatsapp",
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if ("base_amount" in updates) {
    const base = Number(updates.base_amount) || 0
    // Preserve whichever GST treatment this invoice was actually created
    // with (see resolveGstTreatment() in lib/zoho-books.ts) — an interstate
    // invoice keeps recalculating igst on edit, never silently reintroduces
    // cgst/sgst it was never meant to have, and vice versa.
    const { data: existing } = await supabaseAdmin.from("invoices").select("igst").eq("id", id).maybeSingle()
    const wasInterstate = Number(existing?.igst ?? 0) > 0
    if (wasInterstate) {
      updates.igst          = parseFloat((base * 0.05).toFixed(2))
      updates.cgst          = 0
      updates.sgst          = 0
      updates.total_amount  = parseFloat((base + (updates.igst as number)).toFixed(2))
    } else {
      updates.cgst          = parseFloat((base * 0.025).toFixed(2))
      updates.sgst          = parseFloat((base * 0.025).toFixed(2))
      updates.igst          = 0
      updates.total_amount  = parseFloat((base + (updates.cgst as number) + (updates.sgst as number)).toFixed(2))
    }
  }

  const { data, error } = await supabaseAdmin.from("invoices").update(updates).eq("id", id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoice: data })
}
