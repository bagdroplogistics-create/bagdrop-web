import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import { INVOICE_COMPANY, INVOICE_BANK } from '@/lib/company-info'

// BAGDROP — Invoice PDF, styled to match the Zoho Books tax-invoice layout
// used as the visual reference (logo + company block left / TAX INVOICE
// right, a bordered metadata strip, Bill To / Ship To two-up, a dark
// item-table header with HSN/tax columns, a right-aligned totals box,
// Amount in Words, Notes + Bank Details + Authorized Signature footer, and
// a diagonal PAID ribbon when the invoice is actually paid).
//
// Pure presentational component (props only, no data fetching) — same
// pattern as ../../quotes/view/[lead_id]/QuotePDF.tsx — so it can be
// imported directly server-side (email attachment generation) or
// dynamically imported client-side (Download PDF button) without any
// duplication between the two call sites.

const DARK   = '#111827'
const GREY   = '#4b5563'
const LIGHT  = '#f9fafb'
const BORDER = '#e5e7eb'
const GREEN  = '#16a34a'

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: DARK, backgroundColor: '#fff', padding: '28 32' },

  // Header
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  // Full BAGDROP lockup (icon + wordmark + tagline), pre-cropped to its
  // visible content bounds — aspect ratio ~1.965:1. Sized here by width,
  // with height derived from that ratio, so it never looks squashed.
  logo:      { width: 118, height: 60, marginBottom: 6 },
  coName:    { fontSize: 11, fontFamily: 'Helvetica-Bold', color: DARK },
  coLine:    { fontSize: 8, color: GREY, marginTop: 1.5 },
  taxInvTitle: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: DARK, textAlign: 'right' },

  // Metadata strip
  metaBox:   { flexDirection: 'row', marginTop: 14, borderWidth: 1, borderColor: BORDER, borderRadius: 4 },
  metaCol:   { flex: 1, padding: '8 12' },
  metaColL:  { borderRightWidth: 1, borderRightColor: BORDER },
  metaRow:   { flexDirection: 'row', marginBottom: 3 },
  metaKey:   { width: 90, fontSize: 8, color: GREY },
  metaVal:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK, flex: 1 },

  // Bill To / Ship To
  addrRow:   { flexDirection: 'row', gap: 12, marginTop: 12 },
  addrBox:   { flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: '8 12' },
  addrLbl:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: GREY, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: BORDER, paddingBottom: 3 },
  addrName:  { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#2563eb' },
  addrLine:  { fontSize: 8.5, color: '#374151', marginTop: 1.5 },

  // Item table
  table:     { marginTop: 14 },
  thRow:     { flexDirection: 'row', backgroundColor: DARK, padding: '6 6' },
  th:        { color: '#fff', fontSize: 7.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  tRow:      { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER, padding: '6 6', alignItems: 'flex-start' },
  td:        { fontSize: 8.5, color: '#374151' },
  tdDesc:    { fontSize: 7.5, color: GREY, marginTop: 1.5 },
  cIdx:      { width: 16 },
  cDesc:     { flex: 1 },
  cHsn:      { width: 42, textAlign: 'center' },
  cQty:      { width: 26, textAlign: 'center' },
  cRate:     { width: 48, textAlign: 'right' },
  cTaxPct:   { width: 26, textAlign: 'center' },
  cTaxAmt:   { width: 42, textAlign: 'right' },
  cAmt:      { width: 56, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: DARK },

  // Bottom section: Notes/Bank (left) + Totals (right)
  bottomRow: { flexDirection: 'row', marginTop: 14, gap: 16 },
  leftCol:   { flex: 1.2 },
  rightCol:  { flex: 1 },

  wordsBox:  { backgroundColor: LIGHT, borderRadius: 4, padding: '6 10', marginBottom: 10 },
  wordsLbl:  { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: GREY, textTransform: 'uppercase', marginBottom: 2 },
  wordsTxt:  { fontSize: 8.5, fontFamily: 'Helvetica-Oblique', color: DARK },

  notesLbl:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: GREY, marginBottom: 2, marginTop: 8 },
  notesTxt:  { fontSize: 8, color: '#374151', lineHeight: 1.4 },

  bankBox:   { marginTop: 10, borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: '8 10' },
  bankLbl:   { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: GREY, textTransform: 'uppercase', marginBottom: 4 },
  bankRow:   { flexDirection: 'row', marginBottom: 2 },
  bankKey:   { width: 78, fontSize: 8, color: GREY },
  bankVal:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK, flex: 1 },

  totRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.5 },
  totKey:    { fontSize: 9, color: GREY },
  totVal:    { fontSize: 9, color: DARK },
  totDivider:{ borderTopWidth: 1, borderTopColor: BORDER, marginTop: 3, paddingTop: 4 },
  grandRow:  { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 2, borderTopColor: DARK, marginTop: 3, paddingTop: 5 },
  grandKey:  { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: DARK },
  grandVal:  { fontSize: 12, fontFamily: 'Helvetica-Bold', color: DARK },
  paidRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 3 },
  paidKey:   { fontSize: 9, color: GREEN },
  paidVal:   { fontSize: 9, fontFamily: 'Helvetica-Bold', color: GREEN },
  balRow:    { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: BORDER, marginTop: 3, paddingTop: 5 },
  balKey:    { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: DARK },
  balVal:    { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: DARK },

  // Signature
  sigWrap:   { marginTop: 30, alignItems: 'flex-end' },
  sigLine:   { borderTopWidth: 1, borderTopColor: '#9ca3af', width: 140, textAlign: 'center', paddingTop: 4 },
  sigText:   { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: DARK },
  sigSub:    { fontSize: 7, color: GREY, marginTop: 1 },

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

        {p.paid && (
          <View style={s.ribbonWrap} fixed>
            <View style={s.ribbon}><Text style={s.ribbonText}>PAID</Text></View>
          </View>
        )}

        {/* Header */}
        <View style={s.headerRow}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image style={s.logo} src="/images/bagdrop-logo-invoice.png" />
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
          <View style={[s.metaCol, s.metaColL]}>
            <View style={s.metaRow}><Text style={s.metaKey}>Invoice #</Text><Text style={s.metaVal}>{p.invoiceNumber}</Text></View>
            <View style={s.metaRow}><Text style={s.metaKey}>Invoice Date</Text><Text style={s.metaVal}>{fmtDate(p.invoiceDate)}</Text></View>
            {p.terms ? <View style={s.metaRow}><Text style={s.metaKey}>Terms</Text><Text style={s.metaVal}>{p.terms}</Text></View> : null}
            {p.dueDate ? <View style={s.metaRow}><Text style={s.metaKey}>Due Date</Text><Text style={s.metaVal}>{fmtDate(p.dueDate)}</Text></View> : null}
            {p.poNumber ? <View style={s.metaRow}><Text style={s.metaKey}>P.O.#</Text><Text style={s.metaVal}>{p.poNumber}</Text></View> : null}
          </View>
          <View style={s.metaCol}>
            {p.placeOfSupply ? <View style={s.metaRow}><Text style={s.metaKey}>Place Of Supply</Text><Text style={s.metaVal}>{p.placeOfSupply}</Text></View> : null}
            {p.consignmentNo ? <View style={s.metaRow}><Text style={s.metaKey}>Consignment No</Text><Text style={s.metaVal}>{p.consignmentNo}</Text></View> : null}
            {p.totalBags ? <View style={s.metaRow}><Text style={s.metaKey}>No Of Bags</Text><Text style={s.metaVal}>{p.totalBags}</Text></View> : null}
            {p.pickupDate ? <View style={s.metaRow}><Text style={s.metaKey}>Pickup Date</Text><Text style={s.metaVal}>{fmtDate(p.pickupDate)}</Text></View> : null}
            {p.deliveryDate ? <View style={s.metaRow}><Text style={s.metaKey}>Delivery Date</Text><Text style={s.metaVal}>{fmtDate(p.deliveryDate)}</Text></View> : null}
          </View>
        </View>

        {/* Bill To / Ship To */}
        <View style={s.addrRow}>
          <View style={s.addrBox}>
            <Text style={s.addrLbl}>Bill To</Text>
            <Text style={s.addrName}>{p.billToName}</Text>
            {p.billToAddress ? <Text style={s.addrLine}>{p.billToAddress}</Text> : null}
            {p.billToPhone ? <Text style={s.addrLine}>{p.billToPhone}</Text> : null}
            {p.billToEmail ? <Text style={s.addrLine}>{p.billToEmail}</Text> : null}
            {p.billToGstin ? <Text style={s.addrLine}>GSTIN: {p.billToGstin}</Text> : null}
          </View>
          <View style={s.addrBox}>
            <Text style={s.addrLbl}>{p.shipToLabel}</Text>
            {p.shipToLines.map((line, i) => <Text key={i} style={s.addrLine}>{line}</Text>)}
          </View>
        </View>

        {/* Item table */}
        <View style={s.table}>
          <View style={s.thRow}>
            <Text style={[s.th, s.cIdx]}>#</Text>
            <Text style={[s.th, s.cDesc]}>Item &amp; Description</Text>
            <Text style={[s.th, s.cHsn]}>HSN/SAC</Text>
            <Text style={[s.th, s.cQty]}>Qty</Text>
            <Text style={[s.th, s.cRate]}>Rate</Text>
            {hasIgst ? (
              <>
                <Text style={[s.th, s.cTaxPct]}>IGST%</Text>
                <Text style={[s.th, s.cTaxAmt]}>IGST Amt</Text>
              </>
            ) : (
              <>
                <Text style={[s.th, s.cTaxPct]}>CGST%</Text>
                <Text style={[s.th, s.cTaxAmt]}>CGST Amt</Text>
                <Text style={[s.th, s.cTaxPct]}>SGST%</Text>
                <Text style={[s.th, s.cTaxAmt]}>SGST Amt</Text>
              </>
            )}
            <Text style={[s.th, s.cAmt, { color: '#fff' }]}>Amount</Text>
          </View>
          {p.lineItems.map((li, idx) => (
            <View key={idx} style={s.tRow}>
              <Text style={[s.td, s.cIdx]}>{idx + 1}</Text>
              <View style={s.cDesc}>
                <Text style={[s.td, { fontFamily: 'Helvetica-Bold' }]}>{li.name}</Text>
                {li.description ? <Text style={s.tdDesc}>{li.description}</Text> : null}
              </View>
              <Text style={[s.td, s.cHsn]}>{li.hsn}</Text>
              <Text style={[s.td, s.cQty]}>{li.quantity}</Text>
              <Text style={[s.td, s.cRate]}>{fmtRs(li.rate)}</Text>
              {hasIgst ? (
                <>
                  <Text style={[s.td, s.cTaxPct]}>{li.igstPct ?? 5}%</Text>
                  <Text style={[s.td, s.cTaxAmt]}>{fmtRs(li.igstAmt ?? 0)}</Text>
                </>
              ) : (
                <>
                  <Text style={[s.td, s.cTaxPct]}>{li.cgstPct ?? 2.5}%</Text>
                  <Text style={[s.td, s.cTaxAmt]}>{fmtRs(li.cgstAmt ?? 0)}</Text>
                  <Text style={[s.td, s.cTaxPct]}>{li.sgstPct ?? 2.5}%</Text>
                  <Text style={[s.td, s.cTaxAmt]}>{fmtRs(li.sgstAmt ?? 0)}</Text>
                </>
              )}
              <Text style={[s.td, s.cAmt]}>{fmtRs(li.amount)}</Text>
            </View>
          ))}
        </View>

        {/* Bottom: Notes/Bank (left) + Totals (right) */}
        <View style={s.bottomRow}>
          <View style={s.leftCol}>
            {p.total > 0 && (
              <View style={s.wordsBox}>
                <Text style={s.wordsLbl}>Total In Words</Text>
                <Text style={s.wordsTxt}>{toWords(p.total)}</Text>
              </View>
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

            <View style={s.bankBox}>
              <Text style={s.bankLbl}>Payment / Bank Details</Text>
              <View style={s.bankRow}><Text style={s.bankKey}>Bank Name</Text><Text style={s.bankVal}>{INVOICE_BANK.bankName}</Text></View>
              <View style={s.bankRow}><Text style={s.bankKey}>Account Name</Text><Text style={s.bankVal}>{INVOICE_BANK.accountName}</Text></View>
              <View style={s.bankRow}><Text style={s.bankKey}>Account No</Text><Text style={s.bankVal}>{INVOICE_BANK.accountNo}</Text></View>
              <View style={s.bankRow}><Text style={s.bankKey}>IFSC Code</Text><Text style={s.bankVal}>{INVOICE_BANK.ifsc}</Text></View>
              <View style={s.bankRow}><Text style={s.bankKey}>UPI</Text><Text style={s.bankVal}>{INVOICE_BANK.upi}</Text></View>
            </View>
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
                <Text style={s.sigSub}>For {INVOICE_COMPANY.name}</Text>
              </View>
            </View>
          </View>
        </View>

      </Page>
    </Document>
  )
}
