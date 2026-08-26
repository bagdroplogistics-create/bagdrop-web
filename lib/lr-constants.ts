// BAGDROP — lib/lr-constants.ts
//
// Shared constants for the LR (Lorry Receipt / GC — Goods Consignment)
// module: company registration details printed on every LR, status
// labels, and the charges-ledger field list (matches the real IV Cargo
// -style GC format supplied as a layout reference).
//
// PAN/GSTIN note: GSTIN 24AAACC9320N2ZL (PAN AAACC9320N) is Bagdrop's
// current/updated GST registration, confirmed by the founder. The old
// GSTIN 24BDMPS7461P1ZM previously hardcoded across QuotePDF.tsx,
// TripSheetPDF.tsx, the quote print views, upload-pdf route, and
// app/layout.tsx schema.org data has been updated to this one everywhere —
// see the "Update GSTIN to 24AAACC9320N2ZL app-wide" commit.
export const LR_COMPANY = {
  name:        'BAGDROP LOGISTICS SOLUTIONS PRIVATE LIMITED',
  shortName:   'Bagdrop',
  addressLine1:'TF-302, Ananta Stallion, Gotri-Sevasi Road, New Alkapuri',
  addressLine2:'Vadodara – 391101, Gujarat',
  pan:         'AAACC9320N',
  gstin:       '24AAACC9320N2ZL',
  cin:         'U63090GJ2023PTC142601',
  phone:       '+91 63571 15711',
  phone2:      '+91 63573 35733',
  email:       'info@bagdrop.co',
  web:         'www.bagdrop.co',
} as const

export const LR_STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  generated:   { label: 'Generated',   color: '#2563eb', bg: '#dbeafe' },
  dispatched:  { label: 'Dispatched',  color: '#d97706', bg: '#fef3c7' },
  in_transit:  { label: 'In Transit',  color: '#7c3aed', bg: '#ede9fe' },
  delivered:   { label: 'Delivered',   color: '#16a34a', bg: '#dcfce7' },
  cancelled:   { label: 'Cancelled',   color: '#dc2626', bg: '#fee2e2' },
}

// Ti-Tag — an optional alphanumeric tag/code (e.g. a baggage tie-tag
// number) attached to an LR. Never required to save/generate an LR; when
// present it must be letters and digits only (no spaces or punctuation).
// Shared by the New LR form (client-side check) and both LR API routes
// (server-side check) so the rule can't drift between them.
export const TI_TAG_PATTERN = /^[A-Za-z0-9]+$/

export function isValidTiTag(value: string): boolean {
  return TI_TAG_PATTERN.test(value)
}

export const LR_TYPE_OPTIONS = ['At Branch', 'TBB (MANUAL)', 'Door Delivery'] as const
export const PAYMENT_TERMS_OPTIONS = ['To Pay', 'Paid', 'To Be Billed'] as const
export const GST_PAYABLE_BY_OPTIONS = ['Consignor', 'Consignee', 'Transporter'] as const
export const MODE_OPTIONS = ['Air', 'Road', 'Rail', 'Other'] as const

// Charges-ledger field list, in the exact order printed on the reference
// GC's right-side column. `key` matches the lrs table column name.
export const LR_CHARGE_FIELDS: { key: string; label: string }[] = [
  { key: 'freight',        label: 'Freight' },
  { key: 'surcharge',      label: 'Surcharge' },
  { key: 'local_cartage',  label: 'Local Cartage' },
  { key: 'last_mile_frt',  label: 'Last Mile Frt' },
  { key: 'fov',            label: 'FOV' },
  { key: 'loading_chg',    label: 'Loading Chg' },
  { key: 'unloading_chg',  label: 'Unloading Chg' },
  { key: 'handling_chg',   label: 'Handling Chg' },
  { key: 'gc_charge',      label: 'GC Charge' },
  { key: 'other_charge',   label: 'Other Charge' },
  { key: 'eway_bill_chg',  label: 'Eway Bill Chg' },
  { key: 'aoc',            label: 'AOC' },
]

/**
 * Computes sub_total / IGST / CGST / SGST / total_amount from the raw
 * charge fields + a route's gst_type. Intrastate → CGST 2.5% + SGST 2.5%;
 * interstate → IGST 5% — same 5% total tax rate the rest of the app already
 * uses (see app/api/admin/bookings/[id]/route.ts autoCreateInvoice: cgst =
 * sgst = base * 0.025), just split differently depending on whether the
 * consignor/consignee are in the same state.
 */
export function computeLrCharges(
  charges: Record<string, number>,
  gstType: 'intrastate' | 'interstate' = 'intrastate',
) {
  const fieldKeys = LR_CHARGE_FIELDS.map(f => f.key)
  const subTotal = fieldKeys.reduce((sum, k) => sum + (Number(charges[k]) || 0), 0)

  const igst = gstType === 'interstate' ? parseFloat((subTotal * 0.05).toFixed(2))  : 0
  const cgst = gstType === 'intrastate' ? parseFloat((subTotal * 0.025).toFixed(2)) : 0
  const sgst = gstType === 'intrastate' ? parseFloat((subTotal * 0.025).toFixed(2)) : 0
  const total = parseFloat((subTotal + igst + cgst + sgst).toFixed(2))

  return { sub_total: subTotal, igst_amount: igst, cgst_amount: cgst, sgst_amount: sgst, total_amount: total }
}
