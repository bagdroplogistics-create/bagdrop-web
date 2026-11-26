import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import { INVOICE_COMPANY, INVOICE_BANK } from '@/lib/company-info'
import { LOGO_ICON_DATA_URI } from '@/lib/invoice-logo'
import { amountInWords } from '@/lib/number-to-words'
import { SIGNATURE_STAMP_DATA_URI } from '@/lib/quote-pdf-images'

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

const INK    = '#0f172a'   // main text — near-black for strong legibility
const LABEL  = '#475569'   // field labels (dark slate, not pale grey)
const MUTED  = '#64748b'
const LINE   = '#cbd5e1'   // table / box borders
const SOFT   = '#f1f5f9'
const GREEN  = '#15803d'
const AMBER  = '#b45309'
const ORANGE = '#FF6300'
const NAVY   = '#0b1426'

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9.5, color: INK, backgroundColor: '#ffffff', paddingBottom: 96 },

  // ── Brand header band ─────────────────────────────────────────
  band:        { backgroundColor: ORANGE, paddingVertical: 16, paddingHorizontal: 32, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logoRow:     { flexDirection: 'row', alignItems: 'center' },
  logoTile:    { backgroundColor: '#ffffff', borderRadius: 6, paddingVertical: 5, paddingHorizontal: 7, marginRight: 10 },
  logoIcon:    { width: 22, height: 29 },
  logoWordmark:{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#ffffff', letterSpacing: 0.5 },
  logoTagline: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#ffffff', letterSpacing: 1.4, marginTop: 2 },
  docTitle:    { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#ffffff', letterSpacing: 1, textAlign: 'right' },
  docSub:      { fontSize: 9, color: '#ffffff', marginTop: 3, textAlign: 'right' },
  navyStrip:   { backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 32, flexDirection: 'row', justifyContent: 'space-between' },
  navyText:    { color: '#ffffff', fontSize: 8, letterSpacing: 0.6 },

  body:        { paddingHorizontal: 32, paddingTop: 18 },

  // ── Receipt meta grid ────────────────────────────────────────
  metaGrid:    { flexDirection: 'row', borderWidth: 1, borderColor: LINE, borderRadius: 4 },
  metaCell:    { flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRightWidth: 1, borderRightColor: LINE },
  metaCellEnd: { flex: 1, paddingVertical: 8, paddingHorizontal: 10 },
  lbl:         { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: LABEL, textTransform: 'uppercase', letterSpacing: 0.7 },
  val:         { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 3 },

  // ── Two-column boxes ─────────────────────────────────────────
  twoCol:      { flexDirection: 'row', marginTop: 14 },
  box:         { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4 },
  boxHead:     { backgroundColor: SOFT, paddingVertical: 5, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: LINE },
  boxHeadTxt:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: NAVY, textTransform: 'uppercase', letterSpacing: 0.8 },
  boxBody:     { padding: 10 },
  custName:    { fontSize: 13, fontFamily: 'Helvetica-Bold', color: INK },
  line:        { fontSize: 9.5, color: '#334155', marginTop: 3, lineHeight: 1.35 },
  kvRow:       { flexDirection: 'row', marginBottom: 5 },
  kvKey:       { width: 70, fontSize: 8.5, color: LABEL, fontFamily: 'Helvetica-Bold' },
  kvVal:       { flex: 1, fontSize: 9.5, color: INK, fontFamily: 'Helvetica-Bold' },

  // ── Payment table ────────────────────────────────────────────
  table:       { marginTop: 14, borderWidth: 1, borderColor: LINE, borderRadius: 4 },
  thRow:       { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 7, paddingHorizontal: 10 },
  th:          { color: '#ffffff', fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.7 },
  tdRow:       { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 10 },
  td:          { fontSize: 10, color: INK },
  tdBold:      { fontSize: 10, color: INK, fontFamily: 'Helvetica-Bold' },

  // ── Amount + summary ─────────────────────────────────────────
  lower:       { flexDirection: 'row', marginTop: 14 },
  words:       { flex: 1, marginRight: 14, justifyContent: 'center' },
  wordsLbl:    { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: LABEL, textTransform: 'uppercase', letterSpacing: 0.7 },
  wordsTxt:    { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 4, lineHeight: 1.35 },
  summary:     { width: 250, borderWidth: 1, borderColor: LINE, borderRadius: 4 },
  sumRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  sumKey:      { fontSize: 9.5, color: '#334155' },
  sumVal:      { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: INK },
  totalRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: GREEN, paddingVertical: 9, paddingHorizontal: 10 },
  totalKey:    { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#ffffff', textTransform: 'uppercase', letterSpacing: 0.8 },
  totalVal:    { fontSize: 15, fontFamily: 'Helvetica-Bold', color: '#ffffff' },

  paidBadge:   { alignSelf: 'flex-start', borderWidth: 2, borderColor: GREEN, borderRadius: 4, paddingVertical: 3, paddingHorizontal: 12, marginTop: 8 },
  paidTxt:     { color: GREEN, fontSize: 14, fontFamily: 'Helvetica-Bold', letterSpacing: 2 },

  noteBox:     { marginTop: 14, borderLeftWidth: 3, borderLeftColor: ORANGE, backgroundColor: '#fff7ed', paddingVertical: 7, paddingHorizontal: 10 },
  noteLbl:     { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#9a3412', textTransform: 'uppercase', letterSpacing: 0.7 },
  noteTxt:     { fontSize: 9.5, color: '#7c2d12', marginTop: 3 },

  bankRow:     { marginTop: 26, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  bankBox:     { flex: 1, marginRight: 14 },
  bankTxt:     { fontSize: 9.5, color: '#334155', marginTop: 4, lineHeight: 1.4 },
  sigBox:      { alignItems: 'center', width: 170 },
  sigImage:    { width: 46, height: 46, marginBottom: 2 },
  sigLine:     { borderTopWidth: 1, borderTopColor: LABEL, paddingTop: 4, width: 160, textAlign: 'center' },
  sigText:     { color: INK, fontSize: 9.5, fontFamily: 'Helvetica-Bold' },
  sigSub:      { color: LABEL, fontSize: 7.5, marginTop: 1 },

  footer:      { position: 'absolute', left: 0, right: 0, bottom: 0 },
  footTop:     { borderTopWidth: 2, borderTopColor: ORANGE, backgroundColor: SOFT, paddingVertical: 9, paddingHorizontal: 32 },
  footBold:    { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY },
  footLine:    { fontSize: 8, color: '#334155', lineHeight: 1.45 },
  footNote:    { fontSize: 7.5, color: LABEL, marginTop: 3 },
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
  const {
    receiptNumber, receiptDate, customerName, customerPhone, customerAddress,
    trackingId, amount, paymentDate, paymentMethod, paymentReference,
    route, serviceLabel, bagsCount, pickupDate, notes,
    previousPaidAmount, totalPaidAmount, bookingTotalAmount, approvalStatus,
  } = props
  const outstandingAmount = bookingTotalAmount != null && totalPaidAmount != null
    ? Math.max(0, bookingTotalAmount - totalPaidAmount)
    : null

  const isCash = paymentMethod === 'cash'
  const method = METHOD_LABELS[paymentMethod] ?? paymentMethod
  const balanceLabel = outstandingAmount != null ? (outstandingAmount > 0 ? fmtRs(outstandingAmount) : 'NIL (Fully Paid)') : null

  return (
    <Document title={`Payment Receipt ${receiptNumber}`}>
      <Page size="A4" style={s.page}>
        {/* Brand band */}
        <View style={s.band}>
          <View style={s.logoRow}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <View style={s.logoTile}><Image style={s.logoIcon} src={LOGO_ICON_DATA_URI} /></View>
            <View>
              <Text style={s.logoWordmark}>BAGDROP</Text>
              <Text style={s.logoTagline}>BAG. BOX. DELIVERED.</Text>
            </View>
          </View>
          <View>
            <Text style={s.docTitle}>PAYMENT RECEIPT</Text>
            <Text style={s.docSub}>Receipt No. {receiptNumber}</Text>
          </View>
        </View>
        <View style={s.navyStrip}>
          <Text style={s.navyText}>{INVOICE_COMPANY.name.toUpperCase()}</Text>
          <Text style={s.navyText}>GSTIN: {INVOICE_COMPANY.gstin}</Text>
        </View>

        <View style={s.body}>
          {/* Receipt meta */}
          <View style={s.metaGrid}>
            <View style={s.metaCell}><Text style={s.lbl}>Receipt No.</Text><Text style={s.val}>{receiptNumber}</Text></View>
            <View style={s.metaCell}><Text style={s.lbl}>Receipt Date</Text><Text style={s.val}>{fmtDate(receiptDate)}</Text></View>
            <View style={s.metaCell}><Text style={s.lbl}>Booking ID</Text><Text style={s.val}>{trackingId}</Text></View>
            <View style={s.metaCellEnd}><Text style={s.lbl}>Payment Date</Text><Text style={s.val}>{fmtDate(paymentDate)}</Text></View>
          </View>

          {/* Received from + Shipment details */}
          <View style={s.twoCol}>
            <View style={{ ...s.box, marginRight: 12 }}>
              <View style={s.boxHead}><Text style={s.boxHeadTxt}>Received From</Text></View>
              <View style={s.boxBody}>
                <Text style={s.custName}>{customerName}</Text>
                {customerPhone ? <Text style={s.line}>Phone: {customerPhone}</Text> : null}
                {customerAddress ? <Text style={s.line}>{customerAddress}</Text> : null}
                <View style={s.paidBadge}><Text style={s.paidTxt}>PAID</Text></View>
              </View>
            </View>
            <View style={s.box}>
              <View style={s.boxHead}><Text style={s.boxHeadTxt}>Shipment Details</Text></View>
              <View style={s.boxBody}>
                {route ? <View style={s.kvRow}><Text style={s.kvKey}>Route</Text><Text style={s.kvVal}>{route}</Text></View> : null}
                {serviceLabel ? <View style={s.kvRow}><Text style={s.kvKey}>Service</Text><Text style={s.kvVal}>{serviceLabel}</Text></View> : null}
                {bagsCount ? <View style={s.kvRow}><Text style={s.kvKey}>No. of Bags</Text><Text style={s.kvVal}>{bagsCount}</Text></View> : null}
                {pickupDate ? <View style={s.kvRow}><Text style={s.kvKey}>Pickup Date</Text><Text style={s.kvVal}>{fmtDate(pickupDate)}</Text></View> : null}
              </View>
            </View>
          </View>

          {/* Payment table */}
          <View style={s.table}>
            <View style={s.thRow}>
              <Text style={{ ...s.th, width: '34%' }}>Description</Text>
              <Text style={{ ...s.th, width: '18%' }}>Mode</Text>
              <Text style={{ ...s.th, width: '26%' }}>{isCash ? 'Receipt / Note' : 'Reference / UTR'}</Text>
              <Text style={{ ...s.th, width: '22%', textAlign: 'right' }}>Amount</Text>
            </View>
            <View style={s.tdRow}>
              <Text style={{ ...s.tdBold, width: '34%' }}>Payment towards booking {trackingId}</Text>
              <Text style={{ ...s.td, width: '18%' }}>{method}</Text>
              <Text style={{ ...s.td, width: '26%' }}>{paymentReference || '-'}</Text>
              <Text style={{ ...s.tdBold, width: '22%', textAlign: 'right' }}>{fmtRs(amount)}</Text>
            </View>
          </View>

          {/* Amount in words + summary */}
          <View style={s.lower}>
            <View style={s.words}>
              <Text style={s.wordsLbl}>Amount in words</Text>
              <Text style={s.wordsTxt}>{amountInWords(amount)}</Text>
              {approvalStatus ? <Text style={{ ...s.line, color: GREEN, fontFamily: 'Helvetica-Bold', marginTop: 8 }}>{approvalStatus}</Text> : null}
            </View>
            <View style={s.summary}>
              {bookingTotalAmount != null ? (
                <View style={s.sumRow}><Text style={s.sumKey}>Booking Total</Text><Text style={s.sumVal}>{fmtRs(bookingTotalAmount)}</Text></View>
              ) : null}
              {!!previousPaidAmount && previousPaidAmount > 0 ? (
                <View style={s.sumRow}><Text style={s.sumKey}>Previously Paid</Text><Text style={s.sumVal}>{fmtRs(previousPaidAmount)}</Text></View>
              ) : null}
              {balanceLabel ? (
                <View style={s.sumRow}>
                  <Text style={s.sumKey}>Balance Due</Text>
                  <Text style={{ ...s.sumVal, color: outstandingAmount && outstandingAmount > 0 ? AMBER : GREEN }}>{balanceLabel}</Text>
                </View>
              ) : null}
              <View style={s.totalRow}>
                <Text style={s.totalKey}>Amount Received</Text>
                <Text style={s.totalVal}>{fmtRs(amount)}</Text>
              </View>
            </View>
          </View>

          {notes ? (
            <View style={s.noteBox}>
              <Text style={s.noteLbl}>Notes</Text>
              <Text style={s.noteTxt}>{notes}</Text>
            </View>
          ) : null}

          {/* Bank (only for non-cash) + signatory */}
          <View style={s.bankRow} wrap={false}>
            <View style={s.bankBox}>
              {isCash ? (
                <>
                  <Text style={s.lbl}>Mode of payment</Text>
                  <Text style={s.bankTxt}>Cash received in person at the Bagdrop office.</Text>
                </>
              ) : (
                <>
                  <Text style={s.lbl}>Deposited to</Text>
                  <Text style={s.bankTxt}>
                    {INVOICE_BANK.bankName} · A/C {INVOICE_BANK.accountNo}{'\n'}IFSC {INVOICE_BANK.ifsc} · {INVOICE_BANK.branch}
                  </Text>
                </>
              )}
            </View>
            <View style={s.sigBox}>
              <Image style={s.sigImage} src={SIGNATURE_STAMP_DATA_URI} />
              <View style={s.sigLine}>
                <Text style={s.sigText}>Authorized Signatory</Text>
                <Text style={s.sigSub}>For Bagdrop Logistics Solutions Pvt. Ltd.</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <View style={s.footTop}>
            <Text style={s.footBold}>{INVOICE_COMPANY.name}</Text>
            <Text style={s.footLine}>{INVOICE_COMPANY.addressLine1}, {INVOICE_COMPANY.addressLine2}</Text>
            <Text style={s.footLine}>GSTIN: {INVOICE_COMPANY.gstin} · CIN: {INVOICE_COMPANY.cin}</Text>
            <Text style={s.footLine}>{INVOICE_COMPANY.phone} · {INVOICE_COMPANY.email} · {INVOICE_COMPANY.web}</Text>
            <Text style={s.footNote}>This is a computer-generated receipt and does not require a physical signature.</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
