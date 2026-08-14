import { supabaseAdmin } from '@/lib/supabase'

// Local, atomic invoice-number assignment — replaces the earlier
// live-Zoho-Books-call approach (createZohoInvoice()) now that Bagdrop has
// stopped creating invoices directly in Zoho. See
// supabase/migrations/20260814_local_invoice_numbering.sql for the
// underlying Postgres sequence + next_invoice_number() function this
// wraps — a native sequence is what actually guarantees "no duplicates,
// never reassigned on retry", not anything in this file.
//
// Call this EXACTLY ONCE per invoice, at the moment a NEW invoice row is
// first created. Never call it again for that invoice afterwards (editing,
// regenerating the PDF, downloading, or re-sending the email must all
// reuse the invoice_number already stored on the row) — every call site in
// this codebase already follows that rule (see the `existingInv` branch in
// app/api/admin/invoices/route.ts, which never touches numbering).
export async function assignNextInvoiceNumber(): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('next_invoice_number')
  if (error || !data) {
    throw new Error(
      `Could not assign a new invoice number (database sequence call failed): ${error?.message ?? 'no value returned'}`
    )
  }
  return data as string
}
