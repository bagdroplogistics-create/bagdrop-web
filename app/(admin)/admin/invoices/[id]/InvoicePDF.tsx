import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import { INVOICE_COMPANY, INVOICE_BANK } from '@/lib/company-info'
import { LOGO_ICON_DATA_URI } from '@/lib/invoice-logo'

// BAGDROP — Invoice PDF, rebuilt to match Zoho Books' ACTUAL rendered
// invoice structure, sourced 2026-08-18 straight from Zoho's own
// HTML/CSS for the real reference invoice (BLS2600042, fetched via the
// Zoho Books MCP connector's get_invoice with accept:'html' — NOT the
// accept:'pdf' variant, whose binary payload gets corrupted in transit).
// That HTML confirmed several real structural gaps this file previously
// had versus Zoho's template ("excel" style):
//
//   1. The ENTIRE invoice (header through totals) sits inside one
//      continuous bordered rectangle (.pcs-template-bodysection), not
//      just a series of horizontal rules.
//   2. The metadata strip (# / Invoice Date / ... left, Place of Supply /
//      Consignment No / ... right) has a vertical divider line between
//      its two columns.
//   3. Bill To / Ship To has the same vertical divider between columns.
//   4. The item table is a full Excel-style GRID — vertical border lines
//      between every column, not just horizontal row rules.
//   5. The totals box has a left border separating it from Notes/Bank
//      Details, and a bottom border closing off the box after Balance Due.
//   6. A page-number footer with a top border.
//
// Column widths below use the exact percentages read from Zoho's own
// itemtable CSS (# 5%, Item & Description 28%, HSN/SAC 10%, Qty 11%,
// Rate 11%, CGST 11% / SGST 11% as merged super-columns, Amount 13% —
// sums to 100%); the %/Amt split within each tax super-column isn't
// separately specified in Zoho's CSS, so that inner split (4.5/6.5) is a
// reasonable visual approximation, not a verified exact figure.
//
// Deliberate, explicit deviations from the Zoho reference (kept on
// purpose, not oversights):
//   - The logo is Bagdrop's own orange mark + "BAG. BOX. DELIVERED."
//     tagline, not Zoho's old logo.
//   - Bank Details show Bagdrop's actual Indian Overseas Bank account
//     (confirmed correct by the founder) — NOT the "Central Bank of
//     India" details that happen to appear as one-off free-text Notes
//     content on that one specific historical reference invoice.

const DARK   = '#111827'
const GREY   = '#4b5563'
const LIGHT  = '#f2f3f4'  // Zoho's exact itemtable-header background (#f2f3f4)
const BORDER = '#9e9e9e'  // Zoho's exact rule/border color (#9e9e9e)
const GREEN  = '#16a34a'
const RED    = '#dc2626'
// Bagdrop brand orange — matches textColor/#FF6300 in components/ui/logo.tsx
const ORANGE = '#FF6300'

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: DARK, backgroundColor: '#fff', padding: '28 32 46' },

  // Thin black bar across the very top of the page — a deliberate Bagdrop
  // accent stripe sitting above Zoho's own bordered body box below.
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 5, backgroundColor: DARK },

  // The single continuous bordered box wrapping the whole invoice body —
  // matches Zoho's .pcs-template-bodysection { border: 1px solid #9e9e9e }.
  bodyBox: { borderWidth: 1, borderColor: BORDER, padding: 14, marginTop: 10 },

  // Header
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logoRow:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  logoIcon:     { width: 20, height: 26 },
  logoTextCol:  { flexDirection: 'column' },
  logoWordmark: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: ORANGE, letterSpacing: -0.3 },
  logoTagline:  { fontSize: 5.5, fontFamily: 'Helvetica-Bold', color: GREY, letterSpacing: 1, marginTop: 1 },
  coName:    { fontSize: 11, fontFamily: 'Helvetica-Bold', color: DARK },
  coLine:    { fontSize: 8, color: GREY, marginTop: 1.5 },
  taxInvTitle: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: DARK, textAlign: 'right' },

  // Metadata strip — bordered top+bottom, with a vertical divider between
  // the two columns (Zoho's invoice-detailstable border-right).
  metaBox:    { flexDirection: 'row', marginTop: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: BORDER, paddingVertical: 8 },
  metaCol:    { flex: 1, paddingHorizontal: 10 },
  metaColDiv: { borderRightWidth: 1, borderRightColor: BORDER },
  metaRow:    { flexDirection: 'row', marginBottom: 3 },
  metaKey:    { width: 92, fontSize: 8, color: GREY },
  metaVal:    { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK, flex: 1 },

  // Bill To / Ship To — same vertical-divider treatment as the metadata
  // strip (Zoho's pcs-addresstable border-right on the left cell).
  addrRow:    { flexDirection: 'row', marginTop: 12 },
  addrCol:    { flex: 1, paddingHorizontal: 10 },
  addrColDiv: { borderRightWidth: 1, borderRightColor: BORDER },
  addrLbl:    { fontSize: 8, fontFamily: 'Helvetica-Bold', color: GREY, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: BORDER, paddingBottom: 3 },
  addrName:   { fontSize: 10, fontFamily: 'Helvetica-Bold', color: DARK },
  addrLine:   { fontSize: 8.5, color: '#374151', marginTop: 1.5 },

  // Item table — full Excel-style grid: every cell gets a right border
  // (removed on the last column) AND a bottom border, matching Zoho's
  // pcs-item-row / pcs-itemtable-header rules exactly, not just the
  // horizontal-only rules this file used before.
  table:        { marginTop: 14, borderTopWidth: 1, borderTopColor: DARK, borderLeftWidth: 1, borderLeftColor: BORDER, borderRightWidth: 1, borderRightColor: BORDER },
  thRow:        { flexDirection: 'row', backgroundColor: LIGHT },
  thSubRow:     { flexDirection: 'row', backgroundColor: LIGHT, borderBottomWidth: 1, borderBottomColor: DARK },
  thCell:       { paddingVertical: 5, paddingHorizontal: 6, borderRightWidth: 1, borderRightColor: BORDER, borderBottomWidth: 1, borderBottomColor: BORDER },
  thCellLast:   { paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: BORDER },
  th:           { color: DARK, fontSize: 7.5, fontFamily: 'Helvetica-Bold' },
  thSub:        { color: GREY, fontSize: 7, fontFamily: 'Helvetica-Bold' },
  tRow:         { flexDirection: 'row', alignItems: 'stretch' },
  tCell:        { paddingVertical: 6, paddingHorizontal: 6, borderRightWidth: 1, borderRightColor: BORDER, borderBottomWidth: 1, borderBottomColor: BORDER },
  tCellLast:    { paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: BORDER },
  td:           { fontSize: 8.5, color: '#374151' },
  tdDesc:       { fontSize: 7.5, color: GREY, marginTop: 1.5 },
  alignCenter:  { textAlign: 'center' },
  alignRight:   { textAlign: 'right' },

  // Column widths — exact percentages from Zoho's itemtable CSS (see file
  // header comment). Sums to 100% either branch (CGST+SGST or IGST-only).
  wIdx:       { width: '5%' },
  wDesc:      { width: '28%' },
  wHsn:       { width: '10%' },
  wQty:       { width: '11%' },
  wRate:      { width: '11%' },
  wTaxGroup:  { width: '11%' },
  wTaxPct:    { width: '4.5%' },
  wTaxAmt:    { width: '6.5%' },
  wIgstGroup: { width: '22%' },
  wIgstPct:   { width: '9%' },
  wIgstAmt:   { width: '13%' },
  // Tighter padding + smaller type for the narrow %/Amt sub-columns only
  // — the 11%-wide CGST/SGST group is genuinely tight at the standard 6pt
  // cell padding, so these cells use their own compact variant instead of
  // widening the column (which would drift from Zoho's verified 11%/11%
  // CGST/SGST split).
  taxCell:    { paddingHorizontal: 2 },
  taxText:    { fontSize: 7 },
  wAmt:       { width: '13%' },
  amtBold:    { fontFamily: 'Helvetica-Bold', color: DARK },

  // Bottom section: Notes/Bank (left) + Totals (right) — totals gets a
  // left border only, matching Zoho's .pcs-totaltable { border-left }.
  bottomRow: { flexDirection: 'row', marginTop: 14 },
  leftCol:   { flex: 1.2, paddingRight: 14 },
  rightCol:  { flex: 1, borderLeftWidth: 1, borderLeftColor: BORDER, paddingLeft: 14 },

  wordsLbl:  { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: GREY, textTransform: 'uppercase', marginBottom: 2 },
  wordsTxt:  { fontSize: 8.5, fontFamily: 'Helvetica-Oblique', color: DARK, marginBottom: 10 },

  notesLbl:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: GREY, marginBottom: 2, marginTop: 8 },
  notesTxt:  { fontSize: 8, color: '#374151', lineHeight: 1.4 },

  bankLbl:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: GREY, marginBottom: 4, marginTop: 10 },
  bankRow:   { flexDirection: 'row', marginBottom: 2 },
  bankKey:   { width: 92, fontSize: 8, color: GREY },
  bankVal:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK, flex: 1 },

  totRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.5 },
  totKey:    { fontSize: 9, color: GREY },
  totVal:    { fontSize: 9, color: DARK },
  grandRow:  { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: DARK, marginTop: 3, paddingTop: 5 },
  grandKey:  { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: DARK },
  grandVal:  { fontSize: 12, fontFamily: 'Helvetica-Bold', color: DARK },
  paidRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 3 },
  paidKey:   { fontSize: 9, color: RED },
  paidVal:   { fontSize: 9, fontFamily: 'Helvetica-Bold', color: RED },
  // Closes off the totals box with a bottom border after Balance Due,
  // matching Zoho's trailing bordered-empty row under the totals table.
  balRow:    { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: BORDER, borderBottomWidth: 1, borderBottomColor: BORDER, marginTop: 3, paddingTop: 5, paddingBottom: 8 },
  balKey:    { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: DARK },
  balVal:    { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: DARK },

  // Signature — just the line + label
  sigWrap:   { marginTop: 30, alignItems: 'flex-end' },
  sigLine:   { borderTopWidth: 1, borderTopColor: BORDER, width: 140, textAlign: 'center', paddingTop: 4 },
  sigText:   { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: DARK },

  // Page-number footer — matches Zoho's .pcs-template-footer (bordered
  // top rule + right-aligned page number).
  footer:     { position: 'absolute', bottom: 18, left: 32, right: 32, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 4, flexDirection: 'row', justifyContent: 'flex-end' },
  footerText: { fontSize: 7.5, color: GREY },

  // PAID ribbon
  ribbonWrap: { position: 'absolute', top: 34, left: -34, width: 150, alignItems: 'center' },
  ribbon:     { backgroundColor: GREEN, paddingVertical: 3, transform: 'rotate(-40deg)' },
  ribbonText: { color: '#fff', fontSize: 10, fontFamily: 'Helvetica-Bold', letterSpacing: 2 },
})

function fmtRs(n: number | null | undefined) {
  if (n == null) return '—'
  // 'Rs.' not '₹' — react-pdf's default Helvetica has no Rupee glyph (see
  // the same fix in QuotePDF.tsx's fmtRs).
  return 'Rs. ' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
// Bare number, no "Rs." prefix — used only in the narrow CGST/SGST/IGST
// "Amt" sub-columns, which are already labelled "Amt" by their own header
// cell, so repeating "Rs." there is redundant AND doesn't fit the width.
function fmtNum(n: number | null | undefined) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  try { return new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return d }
}

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
function b100(x: number): string { return x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : '') }
function b1000(x: number): string { return x < 100 ? b100(x) : ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + b100(x % 100) : '') }
function toWords(n: number): string {
  if (!n || n <= 0) return 'Zero Rupees Only'
  const r = Math.floor(n); let result = ''
  if (r >= 10000000) result += b1000(Math.floor(r / 10000000)) + ' Crore '
  if (r % 10000000 >= 100000) result += b1000(Math.floor((r % 10000000) / 100000)) + ' Lakh '
  if (r % 100000 >= 1000) result += b1000(Math.floor((r % 100000) / 1000)) + ' Thousand '
  if (r % 1000 >= 100) result += ones[Math.floor((r % 1000) / 100)] + ' Hundred '
  if (r % 100 > 0) result += b100(r % 100) + ' '
  return result.trim() + ' Rupees Only'
}

export interface InvoicePDFLineItem {
  name: string; description?: string | null; hsn: string
  quantity: number; rate: number; amount: number
  cgstPct?: number; cgstAmt?: number
  sgstPct?: number; sgstAmt?: number
  igstPct?: number; igstAmt?: number
}

export interface InvoicePDFProps {
  invoiceNumber:  string
  invoiceDate:    string | null
  dueDate:        string | null
  terms:          string | null      // e.g. "Due on Receipt"
  poNumber:       string | null      // e.g. salesperson/agent name, matches Zoho's "P.O.#" field
  placeOfSupply:  string | null
  consignmentNo:  string | null
  totalBags:      number | null
  pickupDate:     string | null
  deliveryDate:   string | null

  billToName:     string
  billToAddress:  string | null
  billToPhone:    string | null
  billToEmail:    string | null
  billToGstin:    string | null

  shipToLabel:    string            // e.g. "Delivery Location"
  shipToLines:    string[]          // free-form lines (city/address)

  lineItems:      InvoicePDFLineItem[]
  subtotal:       number
  cgst:           number
  sgst:           number
  igst:           number
  total:          number
  paymentMade:    number            // 0 if unpaid
  balanceDue:     number

  notes:          string | null
  termsText:      string | null
  paid:           boolean           // real payment_status === 'paid' only
}

export default function InvoicePDF(p: InvoicePDFProps) {
  const hasIgst = p.igst > 0
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.topBar} fixed />

        {p.paid && (
          <View style={s.ribbonWrap} fixed>
            <View style={s.ribbon}><Text style={s.ribbonText}>PAID</Text></View>
          </View>
        )}

        <View style={s.bodyBox}>

          {/* Header */}
          <View style={s.headerRow}>
            <View>
              <View style={s.logoRow}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image style={s.logoIcon} src={LOGO_ICON_DATA_URI} />
                <View style={s.logoTextCol}>
                  <Text style={s.logoWordmark}>BAGDROP</Text>
                  <Text style={s.logoTagline}>BAG. BOX. DELIVERED.</Text>
                </View>
              </View>
              <Text style={s.coName}>{INVOICE_COMPANY.name}</Text>
              <Text style={s.coLine}>{INVOICE_COMPANY.addressLine1}</Text>
              <Text style={s.coLine}>{INVOICE_COMPANY.addressLine2}</Text>
              <Text style={s.coLine}>GSTIN: {INVOICE_COMPANY.gstin}</Text>
              <Text style={s.coLine}>{INVOICE_COMPANY.phone}  ·  {INVOICE_COMPANY.email}</Text>
              <Text style={s.coLine}>{INVOICE_COMPANY.web}</Text>
            </View>
            <Text style={s.taxInvTitle}>TAX INVOICE</Text>
          </View>

          {/* Metadata strip */}
          <View style={s.metaBox}>
            <View style={[s.metaCol, s.metaColDiv]}>
              <View style={s.metaRow}><Text style={s.metaKey}># :</Text><Text style={s.metaVal}>{p.invoiceNumber}</Text></View>
              <View style={s.metaRow}><Text style={s.metaKey}>Invoice Date :</Text><Text style={s.metaVal}>{fmtDate(p.invoiceDate)}</Text></View>
              {p.terms ? <View style={s.metaRow}><Text style={s.metaKey}>Terms :</Text><Text style={s.metaVal}>{p.terms}</Text></View> : null}
              {p.dueDate ? <View style={s.metaRow}><Text style={s.metaKey}>Due Date :</Text><Text style={s.metaVal}>{fmtDate(p.dueDate)}</Text></View> : null}
              {p.poNumber ? <View style={s.metaRow}><Text style={s.metaKey}>P.O.# :</Text><Text style={s.metaVal}>{p.poNumber}</Text></View> : null}
            </View>
            <View style={s.metaCol}>
              {p.placeOfSupply ? <View style={s.metaRow}><Text style={s.metaKey}>Place Of Supply :</Text><Text style={s.metaVal}>{p.placeOfSupply}</Text></View> : null}
              {p.consignmentNo ? <View style={s.metaRow}><Text style={s.metaKey}>Consignment No :</Text><Text style={s.metaVal}>{p.consignmentNo}</Text></View> : null}
              {p.totalBags ? <View style={s.metaRow}><Text style={s.metaKey}>No Of Bags :</Text><Text style={s.metaVal}>{p.totalBags}</Text></View> : null}
              {p.pickupDate ? <View style={s.metaRow}><Text style={s.metaKey}>Pickup Date :</Text><Text style={s.metaVal}>{fmtDate(p.pickupDate)}</Text></View> : null}
              {p.deliveryDate ? <View style={s.metaRow}><Text style={s.metaKey}>Delivery Date :</Text><Text style={s.metaVal}>{fmtDate(p.deliveryDate)}</Text></View> : null}
            </View>
          </View>

          {/* Bill To / Ship To */}
          <View style={s.addrRow}>
            <View style={[s.addrCol, s.addrColDiv]}>
              <Text style={s.addrLbl}>Bill To</Text>
              <Text style={s.addrName}>{p.billToName}</Text>
              {p.billToAddress ? <Text style={s.addrLine}>{p.billToAddress}</Text> : null}
              {p.billToPhone ? <Text style={s.addrLine}>{p.billToPhone}</Text> : null}
              {p.billToEmail ? <Text style={s.addrLine}>{p.billToEmail}</Text> : null}
              {p.billToGstin ? <Text style={s.addrLine}>GSTIN: {p.billToGstin}</Text> : null}
            </View>
            <View style={s.addrCol}>
              <Text style={s.addrLbl}>{p.shipToLabel}</Text>
              {p.shipToLines.map((line, i) => <Text key={i} style={s.addrLine}>{line}</Text>)}
            </View>
          </View>

          {/* Item table — full Excel-style grid, matching Zoho's
              template_type:"excel" reference exactly: vertical border on
              every column (dropped on the last) plus horizontal rules,
              two-row header with merged CGST/SGST (or IGST) super-columns. */}
          <View style={s.table}>
            <View style={s.thRow}>
              <View style={[s.thCell, s.wIdx]}><Text style={s.th}>#</Text></View>
              <View style={[s.thCell, s.wDesc]}><Text style={s.th}>Item &amp; Description</Text></View>
              <View style={[s.thCell, s.wHsn]}><Text style={[s.th, s.alignCenter]}>HSN/SAC</Text></View>
              <View style={[s.thCell, s.wQty]}><Text style={[s.th, s.alignCenter]}>Qty</Text></View>
              <View style={[s.thCell, s.wRate]}><Text style={[s.th, s.alignRight]}>Rate</Text></View>
              {hasIgst ? (
                <View style={[s.thCell, s.wIgstGroup]}><Text style={[s.th, s.alignCenter]}>IGST</Text></View>
              ) : (
                <>
                  <View style={[s.thCell, s.wTaxGroup]}><Text style={[s.th, s.alignCenter]}>CGST</Text></View>
                  <View style={[s.thCell, s.wTaxGroup]}><Text style={[s.th, s.alignCenter]}>SGST</Text></View>
                </>
              )}
              <View style={[s.thCellLast, s.wAmt]}><Text style={[s.th, s.alignRight]}>Amount</Text></View>
            </View>
            <View style={s.thSubRow}>
              <View style={[s.thCell, s.wIdx]} />
              <View style={[s.thCell, s.wDesc]} />
              <View style={[s.thCell, s.wHsn]} />
              <View style={[s.thCell, s.wQty]} />
              <View style={[s.thCell, s.wRate]} />
              {hasIgst ? (
                <>
                  <View style={[s.thCell, s.wIgstPct, s.taxCell]}><Text style={[s.thSub, s.alignCenter]}>%</Text></View>
                  <View style={[s.thCell, s.wIgstAmt, s.taxCell]}><Text style={[s.thSub, s.alignCenter]}>Amt</Text></View>
                </>
              ) : (
                <>
                  <View style={[s.thCell, s.wTaxPct, s.taxCell]}><Text style={[s.thSub, s.alignCenter]}>%</Text></View>
                  <View style={[s.thCell, s.wTaxAmt, s.taxCell]}><Text style={[s.thSub, s.alignCenter]}>Amt</Text></View>
                  <View style={[s.thCell, s.wTaxPct, s.taxCell]}><Text style={[s.thSub, s.alignCenter]}>%</Text></View>
                  <View style={[s.thCell, s.wTaxAmt, s.taxCell]}><Text style={[s.thSub, s.alignCenter]}>Amt</Text></View>
                </>
              )}
              <View style={[s.thCellLast, s.wAmt]} />
            </View>
            {p.lineItems.map((li, idx) => (
              <View key={idx} style={s.tRow}>
                <View style={[s.tCell, s.wIdx]}><Text style={s.td}>{idx + 1}</Text></View>
                <View style={[s.tCell, s.wDesc]}>
                  <Text style={[s.td, { fontFamily: 'Helvetica-Bold' }]}>{li.name}</Text>
                  {li.description ? <Text style={s.tdDesc}>{li.description}</Text> : null}
                </View>
                <View style={[s.tCell, s.wHsn]}><Text style={[s.td, s.alignCenter]}>{li.hsn}</Text></View>
                <View style={[s.tCell, s.wQty]}><Text style={[s.td, s.alignCenter]}>{li.quantity}</Text></View>
                <View style={[s.tCell, s.wRate]}><Text style={[s.td, s.alignRight]}>{fmtRs(li.rate)}</Text></View>
                {hasIgst ? (
                  <>
                    <View style={[s.tCell, s.wIgstPct, s.taxCell]}><Text style={[s.td, s.taxText, s.alignCenter]}>{li.igstPct ?? 5}%</Text></View>
                    <View style={[s.tCell, s.wIgstAmt, s.taxCell]}><Text style={[s.td, s.taxText, s.alignRight]}>{fmtNum(li.igstAmt ?? 0)}</Text></View>
                  </>
                ) : (
                  <>
                    <View style={[s.tCell, s.wTaxPct, s.taxCell]}><Text style={[s.td, s.taxText, s.alignCenter]}>{li.cgstPct ?? 2.5}%</Text></View>
                    <View style={[s.tCell, s.wTaxAmt, s.taxCell]}><Text style={[s.td, s.taxText, s.alignRight]}>{fmtNum(li.cgstAmt ?? 0)}</Text></View>
                    <View style={[s.tCell, s.wTaxPct, s.taxCell]}><Text style={[s.td, s.taxText, s.alignCenter]}>{li.sgstPct ?? 2.5}%</Text></View>
                    <View style={[s.tCell, s.wTaxAmt, s.taxCell]}><Text style={[s.td, s.taxText, s.alignRight]}>{fmtNum(li.sgstAmt ?? 0)}</Text></View>
                  </>
                )}
                <View style={[s.tCellLast, s.wAmt]}><Text style={[s.td, s.alignRight, s.amtBold]}>{fmtRs(li.amount)}</Text></View>
              </View>
            ))}
          </View>

          {/* Bottom: Notes/Bank (left) + Totals (right) */}
          <View style={s.bottomRow}>
            <View style={s.leftCol}>
              {p.total > 0 && (
                <>
                  <Text style={s.wordsLbl}>Total In Words</Text>
                  <Text style={s.wordsTxt}>{toWords(p.total)}</Text>
                </>
              )}

              {p.notes ? (
                <>
                  <Text style={s.notesLbl}>Notes</Text>
                  <Text style={s.notesTxt}>{p.notes}</Text>
                </>
              ) : null}

              {p.termsText ? (
                <>
                  <Text style={s.notesLbl}>Terms &amp; Conditions</Text>
                  <Text style={s.notesTxt}>{p.termsText}</Text>
                </>
              ) : null}

              <Text style={s.bankLbl}>Bank Details</Text>
              <View style={s.bankRow}><Text style={s.bankKey}>Bank Name :</Text><Text style={s.bankVal}>{INVOICE_BANK.bankName}</Text></View>
              <View style={s.bankRow}><Text style={s.bankKey}>Account Number :</Text><Text style={s.bankVal}>{INVOICE_BANK.accountNo}</Text></View>
              <View style={s.bankRow}><Text style={s.bankKey}>IFSC Code :</Text><Text style={s.bankVal}>{INVOICE_BANK.ifsc}</Text></View>
              <View style={s.bankRow}><Text style={s.bankKey}>Branch :</Text><Text style={s.bankVal}>{INVOICE_BANK.branch}</Text></View>
            </View>

            <View style={s.rightCol}>
              <View style={s.totRow}><Text style={s.totKey}>Sub Total</Text><Text style={s.totVal}>{fmtRs(p.subtotal)}</Text></View>
              {hasIgst ? (
                <View style={s.totRow}><Text style={s.totKey}>IGST</Text><Text style={s.totVal}>{fmtRs(p.igst)}</Text></View>
              ) : (
                <>
                  <View style={s.totRow}><Text style={s.totKey}>CGST</Text><Text style={s.totVal}>{fmtRs(p.cgst)}</Text></View>
                  <View style={s.totRow}><Text style={s.totKey}>SGST</Text><Text style={s.totVal}>{fmtRs(p.sgst)}</Text></View>
                </>
              )}
              <View style={s.grandRow}><Text style={s.grandKey}>Total</Text><Text style={s.grandVal}>{fmtRs(p.total)}</Text></View>
              {p.paymentMade > 0 && (
                <View style={s.paidRow}><Text style={s.paidKey}>Payment Made</Text><Text style={s.paidVal}>(-) {fmtRs(p.paymentMade)}</Text></View>
              )}
              <View style={s.balRow}><Text style={s.balKey}>Balance Due</Text><Text style={s.balVal}>{fmtRs(p.balanceDue)}</Text></View>

              <View style={s.sigWrap}>
                <View style={s.sigLine}>
                  <Text style={s.sigText}>Authorized Signature</Text>
                </View>
              </View>
            </View>
          </View>

        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>

      </Page>
    </Document>
  )
}
