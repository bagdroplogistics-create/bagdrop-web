import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { requireAdminAuth } from "@/lib/admin-auth"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const { data, error } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ invoice: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const body   = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  const allowed = [
    "customer_name", "customer_phone", "customer_email", "customer_address",
    "base_amount", "cgst", "sgst", "total_amount",
    "payment_status", "payment_method", "payment_reference",
    "notes", "due_date", "sent_email", "sent_whatsapp",
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if ("base_amount" in updates) {
    const base = Number(updates.base_amount) || 0
    updates.cgst         = parseFloat((base * 0.025).toFixed(2))
    updates.sgst         = parseFloat((base * 0.025).toFixed(2))
    updates.total_amount = parseFloat((base + (updates.cgst as number) + (updates.sgst as number)).toFixed(2))
  }

  const { data, error } = await supabaseAdmin.from("invoices").update(updates).eq("id", id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoice: data })
}
