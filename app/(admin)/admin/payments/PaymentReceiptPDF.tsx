import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import { INVOICE_COMPANY } from '@/lib/company-info'
import { amountInWords } from '@/lib/number-to-words'
import { LOGO_FULL_WHITE_DATA_URI, SIGNATURE_STAMP_DATA_URI } from '@/lib/quote-pdf-images'

// BAGDROP — Payment Receipt PDF (customer-facing)
//
// The customer-facing counterpart to the admin-only HTML "Payment Receipt"
// panel (app/(admin)/admin/payments/page.tsx's PaymentReceiptPanel) — same
// core fields (receipt number, date, amount, mode, received-from, booking
// details), same company/bank branding, but as a real downloadable/
// attachable PDF, and deliberately WITHOUT that panel's internal
// double-entry "Journal" section — a customer receipt has no reason to
// show Bagdrop's own accrual/cash bookkeeping.
//
// Built via lib/payment-receipt-pdf.ts's buildPaymentReceiptPdfBuffer(),
// following the exact same "plain function component, no browser-only
// APIs, safe under Node" pattern already established by InvoicePDF.tsx and
// QuotePDF.tsx — so this can be both emailed as a real attachment and
// uploaded to Storage for a WhatsApp Document-header URL.

// Same visual language as the Quote PDF, reduced to payment-receipt content only.
const ORANGE = '#f97316'
const DARK   = '#111827'
const GREY   = '#4b5563'
const LIGHT  = '#f9fafb'
const AMBER  = '#fff7ed'
const GREEN  = '#15803d'

const s = StyleSheet.create({
  page:      { fontFamily: 'Helvetica', backgroundColor: '#fff' },

  header:    { backgroundColor: ORANGE, padding: '10 28', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logoFull:  { width: 44, height: 65, marginBottom: 3 },
  logoSub:   { color: 'rgba(255,255,255,0.92)', fontSize: 8.5, fontFamily: 'Helvetica-Bold', letterSpacing: 0.6, marginTop: 3, textTransform: 'uppercase' },
  title:     { color: '#fff', fontSize: 26, fontFamily: 'Helvetica-Bold', textAlign: 'right', letterSpacing: 1 },
  titleSub:  { color: 'rgba(255,255,255,0.95)', fontSize: 12, textAlign: 'right', marginTop: 4 },

  paidWrap:  { alignItems: 'center', marginTop: 22 },
  paidBox:   { borderWidth: 4, borderColor: GREEN, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 34 },
  paidText:  { color: GREEN, fontSize: 40, fontFamily: 'Helvetica-Bold', letterSpacing: 6 },

  body:      { padding: '22 36 0' },
  metaRow:   { flexDirection: 'row', marginBottom: 14 },
  metaBox:   { flex: 1, backgroundColor: LIGHT, borderRadius: 6, padding: '10 14', borderLeftWidth: 3, borderLeftColor: ORANGE, marginRight: 10 },
  metaBoxL:  { flex: 1, backgroundColor: LIGHT, borderRadius: 6, padding: '10 14', borderLeftWidth: 3, borderLeftColor: DARK },
  lbl:       { color: GREY, fontSize: 10, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  val:       { color: DARK, fontSize: 15, fontFamily: 'Helvetica-Bold' },
  valSub:    { color: GREY, fontSize: 12, marginTop: 2 },

  tableHead: { flexDirection: 'row', backgroundColor: DARK, borderRadius: '4 4 0 0', padding: '9 12', marginTop: 6 },
  tableH:    { color: '#fff', fontSize: 11, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow:  { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', padding: '12 12', alignItems: 'center' },
  cell:      { fontSize: 13, color: '#374151' },
  cDesc:     { flex: 1 },
  cMode:     { width: 70 },
  cRef:      { width: 130 },
  cAmt:      { width: 100, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: DARK },

  totalBox:  { marginTop: 16, backgroundColor: AMBER, borderWidth: 1, borderColor: '#fed7aa', borderRadius: 6, padding: '12 16', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalKey:  { color: DARK, fontSize: 16, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  totalVal:  { color: ORANGE, fontSize: 28, fontFamily: 'Helvetica-Bold' },
  words:     { marginTop: 10, backgroundColor: LIGHT, borderRadius: 6, padding: '9 14', borderLeftWidth: 3, borderLeftColor: ORANGE },
  wordsTx:   { color: DARK, fontSize: 13, fontFamily: 'Helvetica-Oblique' },

  notes:     { marginTop: 10, color: GREY, fontSize: 12 },

  footer:    { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb', padding: '10 28', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ftLeft:    { flex: 1, justifyContent: 'center' },
  ftCo:      { color: DARK, fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  ftLine:    { color: GREY, fontSize: 9, marginBottom: 1, lineHeight: 1.3 },
  ftNote:    { color: GREY, fontSize: 8.5, marginTop: 3 },
  ftRight:   { alignItems: 'center', width: 170 },
  sigImage:  { width: 46, height: 46, marginBottom: 2 },
  sigLine:   { borderTopWidth: 1, borderTopColor: '#d1d5db', paddingTop: 4, width: 150, textAlign: 'center' },
  sigText:   { color: DARK, fontSize: 10, fontFamily: 'Helvetica-Bold' },
  sigSub:    { color: GREY, fontSize: 8, marginTop: 1 },
})

// 'Rs.' not '₹' — react-pdf's default Helvetica font has no glyph for the
// Rupee sign (same fix already established in QuotePDF.tsx/InvoicePDF.tsx;
// confirmed here too via a rendered preview, 2026-09-07 — the ₹ silently
// fell back to an unrelated glyph instead of throwing).
function fmtRs(n: number): string {
  return 'Rs. ' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
  } catch { return d }
}

const METHOD_LABELS: Record<string, string> = {
  upi: 'UPI', qr: 'QR Code', bank: 'Bank Transfer', cash: 'Cash',
}

export interface PaymentReceiptPDFProps {
  receiptNumber:   string   // payments.payment_id — e.g. "BDP-2026-0008"
  receiptDate:     string   // ISO — when the receipt itself was generated (today)
  customerName:    string   // already formatted with title (Mr./Mrs./Ms.)
  customerPhone:   string | null
  customerAddress?: string | null
  trackingId:      string
  amount:          number
  paymentDate:     string | null   // ISO date, payments.payment_date / created_at
  paymentMethod:   string
  paymentReference: string | null
  route?:          string | null   // "From City → To City"
  serviceLabel?:   string | null
  bagsCount?:      number | null
  pickupDate?:     string | null
  notes?:          string | null

  // ── Payment Summary (Previous/Total/Outstanding) ────────────────────
  // Founder-reported 2026-09-08 (BDA-2026-0160 / BDP-2026-0016): a receipt
  // must show more than just "this transaction's amount" to be useful for
  // partial payments — the customer needs to see where this payment leaves
  // their running balance. All three are computed fresh from the live
  // `payments` ledger at send time (lib/payment-receipt-notification.ts),
  // never stored/cached on the payment row itself, so they're always
  // correct even if an earlier payment's amount is later corrected.
  // Rendered only when totalPaidAmount is provided (i.e. the caller could
  // resolve a linked booking) — omitted entirely for a payment with no
  // booking_id, same as the existing Booking Details card above.
  previousPaidAmount?: number   // sum of prior approved payments, BEFORE this one
  totalPaidAmount?:    number   // sum of all approved payments, INCLUDING this one
  bookingTotalAmount?: number   // the booking's quoted total — for Outstanding
  // Precomputed label (e.g. "Verified by Accounts on 8 September 2026") —
  // kept as a ready-made string, matching how `route`/`serviceLabel` above
  // are already precomputed by the caller rather than built from raw ids
  // inside this presentational component.
  approvalStatus?:     string | null
}

export default function PaymentReceiptPDF(props: PaymentReceiptPDFProps) {
  const { receiptNumber, customerName, customerPhone, trackingId, amount,
          paymentDate, paymentMethod, paymentReference, notes } = props
  const isCash = paymentMethod === 'cash'
  const method = METHOD_LABELS[paymentMethod] ?? paymentMethod

  return (
    <Document title={`Payment Receipt ${receiptNumber}`}>
      <Page size="A4" style={s.page}>

        <View style={s.header}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image style={s.logoFull} src={LOGO_FULL_WHITE_DATA_URI} />
            <Text style={s.logoSub}>India&apos;s First Digital Baggage Infrastructure</Text>
          </View>
          <View>
            <Text style={s.title}>PAYMENT RECEIPT</Text>
            <Text style={s.titleSub}>Receipt No: {receiptNumber}</Text>
            <Text style={s.titleSub}>Date: {fmtDate(paymentDate)}</Text>
          </View>
        </View>

        <View style={s.body}>
          <View style={s.metaRow}>
            <View style={s.metaBox}>
              <Text style={s.lbl}>Received From</Text>
              <Text style={s.val}>{customerName}</Text>
              {customerPhone ? <Text style={s.valSub}>{customerPhone}</Text> : null}
            </View>
            <View style={s.metaBoxL}>
              <Text style={s.lbl}>Booking ID</Text>
              <Text style={s.val}>{trackingId}</Text>
            </View>
          </View>

          <View style={s.tableHead}>
            <Text style={[s.tableH, s.cDesc]}>Description</Text>
            <Text style={[s.tableH, s.cMode]}>Mode</Text>
            <Text style={[s.tableH, s.cRef]}>{isCash ? 'Receipt / Note' : 'Reference / UTR'}</Text>
            <Text style={[s.tableH, s.cAmt, { color: '#fff' }]}>Amount</Text>
          </View>
          <View style={s.tableRow}>
            <Text style={[s.cell, s.cDesc, { fontFamily: 'Helvetica-Bold', color: DARK }]}>Payment received</Text>
            <Text style={[s.cell, s.cMode]}>{method}</Text>
            <Text style={[s.cell, s.cRef]}>{paymentReference || '-'}</Text>
            <Text style={[s.cell, s.cAmt]}>{fmtRs(amount)}</Text>
          </View>

          <View style={s.totalBox}>
            <Text style={s.totalKey}>Amount Received</Text>
            <Text style={s.totalVal}>{fmtRs(amount)}</Text>
          </View>
          <View style={s.words}>
            <Text style={s.lbl}>Amount in Words</Text>
            <Text style={s.wordsTx}>{amountInWords(amount)}</Text>
          </View>

          {notes ? <Text style={s.notes}>Note: {notes}</Text> : null}

          <View style={s.paidWrap}>
            <View style={s.paidBox}><Text style={s.paidText}>PAID</Text></View>
          </View>
        </View>

        <View style={s.footer} fixed>
          <View style={s.ftLeft}>
            <Text style={s.ftCo}>BAGDROP LOGISTICS SOLUTIONS PVT. LTD.</Text>
            <Text style={s.ftLine}>{INVOICE_COMPANY.addressLine1}, {INVOICE_COMPANY.addressLine2}</Text>
            <Text style={s.ftLine}>GSTIN: {INVOICE_COMPANY.gstin}  ·  CIN: {INVOICE_COMPANY.cin}</Text>
            <Text style={s.ftLine}>Tel: {INVOICE_COMPANY.phone}  ·  {INVOICE_COMPANY.email}  ·  {INVOICE_COMPANY.web}</Text>
            <Text style={s.ftNote}>This is a computer-generated receipt.</Text>
          </View>
          <View style={s.ftRight}>
            <Image style={s.sigImage} src={SIGNATURE_STAMP_DATA_URI} />
            <View style={s.sigLine}>
              <Text style={s.sigText}>Authorized Signatory</Text>
              <Text style={s.sigSub}>For Bagdrop Logistics Solutions Pvt. Ltd.</Text>
            </View>
          </View>
        </View>

      </Page>
    </Document>
  )
}
