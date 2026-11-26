import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import { INVOICE_COMPANY, INVOICE_BANK } from '@/lib/company-info'
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

// Same visual language as the Quote PDF (app/(admin)/admin/quotes/view/[lead_id]/QuotePDF.tsx):
// orange header band + amber meta strip + left-bordered cards + dark table head + white footer
// with the signatory stamp. Only the content is receipt-specific.
const ORANGE = '#f97316'
const DARK   = '#111827'
const GREY   = '#4b5563'
const LIGHT  = '#f9fafb'
const AMBER  = '#fff7ed'
const GREEN  = '#15803d'

const s = StyleSheet.create({
  page:      { fontFamily: 'Helvetica', backgroundColor: '#fff' },

  header:    { backgroundColor: ORANGE, padding: '8 28', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logoFull:  { width: 40, height: 59, marginBottom: 3 },
  logoSub:   { color: 'rgba(255,255,255,0.92)', fontSize: 9.5, fontFamily: 'Helvetica-Bold', letterSpacing: 1, marginTop: 3, textTransform: 'uppercase' },
  qnLabel:   { color: 'rgba(255,255,255,0.85)', fontSize: 9, letterSpacing: 1.5, textAlign: 'right', textTransform: 'uppercase' },
  qnValue:   { color: 'rgba(255,255,255,0.95)', fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'right', letterSpacing: 0.4, marginTop: 2 },
  qnDate:    { color: '#fff', fontSize: 20, fontFamily: 'Helvetica-Bold', textAlign: 'right', marginTop: 3 },
  paidTag:   { alignSelf: 'flex-end', marginTop: 4, backgroundColor: '#fff', borderRadius: 3, paddingVertical: 2, paddingHorizontal: 8 },
  paidTagTx: { color: GREEN, fontSize: 10.5, fontFamily: 'Helvetica-Bold', letterSpacing: 1.2 },

  strip:     { backgroundColor: AMBER, borderBottomWidth: 1, borderBottomColor: '#fed7aa', padding: '6 28', flexDirection: 'row', gap: 24 },
  stripKey:  { color: '#9a3412', fontSize: 9, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8 },
  stripVal:  { color: DARK, fontSize: 10.5, fontFamily: 'Helvetica-Bold', marginTop: 1 },

  body:      { padding: '14 28 0' },
  row2:      { flexDirection: 'row', gap: 12, marginBottom: 10 },

  card:      { flex: 1, backgroundColor: LIGHT, borderRadius: 6, padding: '9 12', borderLeftWidth: 3, borderLeftColor: ORANGE },
  cardDark:  { flex: 1, backgroundColor: LIGHT, borderRadius: 6, padding: '9 12', borderLeftWidth: 3, borderLeftColor: DARK },
  cardLbl:   { color: GREY, fontSize: 9, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  custName:  { color: DARK, fontSize: 16, fontFamily: 'Helvetica-Bold' },
  custSub:   { color: GREY, fontSize: 11, marginTop: 2 },
  addressVal:{ fontSize: 12.5, fontFamily: 'Helvetica-Bold', color: DARK },

  jtRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  jtCity:    { color: DARK, fontSize: 14, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', textAlign: 'center' },
  jtLbl:     { color: GREY, fontSize: 9, textAlign: 'center', marginBottom: 1 },
  jtLine:    { flex: 1, borderBottomWidth: 1, borderBottomColor: '#d1d5db', marginHorizontal: 6 },
  kv:        { fontSize: 10.5, color: GREY, marginTop: 3 },
  kvVal:     { fontFamily: 'Helvetica-Bold', color: DARK },

  pickupBox: { margin: '0 28 10', backgroundColor: LIGHT, borderRadius: 6, padding: '7 12', borderLeftWidth: 3, borderLeftColor: ORANGE, flexDirection: 'row', flexWrap: 'wrap' },
  pickupItem:{ fontSize: 11, color: GREY, marginRight: 18 },
  pickupVal: { fontFamily: 'Helvetica-Bold', color: DARK },

  tableWrap: { padding: '0 28' },
  tableHead: { flexDirection: 'row', backgroundColor: DARK, borderRadius: '4 4 0 0', padding: '7 10' },
  tableH:    { color: '#fff', fontSize: 10, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow:  { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', padding: '9 10', alignItems: 'flex-start' },
  cell:      { fontSize: 11.5, color: '#374151' },
  cellDesc:  { fontSize: 10, color: GREY, marginTop: 2 },
  cIdx:      { width: 22 },
  cDesc:     { flex: 1 },
  cMode:     { width: 70 },
  cRef:      { width: 105 },
  cAmt:      { width: 85, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: DARK },

  tpRow:     { flexDirection: 'row', gap: 12, padding: '12 28 8' },
  payBox:    { flex: 1, backgroundColor: LIGHT, borderRadius: 6, padding: '9 12' },
  payLbl:    { color: GREY, fontSize: 9, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 },
  payRow:    { flexDirection: 'row', marginBottom: 3 },
  payKey:    { color: GREY, fontSize: 10.5, width: 70 },
  payVal:    { color: DARK, fontSize: 10.5, fontFamily: 'Helvetica-Bold', flex: 1 },
  upiBox:    { backgroundColor: AMBER, borderWidth: 1, borderColor: '#fed7aa', borderRadius: 4, padding: '3 8', marginTop: 4 },
  upiText:   { color: DARK, fontSize: 11, fontFamily: 'Helvetica-Bold' },

  totalsBox: { flex: 1 },
  totRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  totKey:    { color: GREY, fontSize: 11.5 },
  totVal:    { color: DARK, fontSize: 11.5 },
  totDivider:{ borderTopWidth: 2, borderTopColor: DARK, paddingTop: 6, marginTop: 3 },
  grandKey:  { color: DARK, fontSize: 12.5, fontFamily: 'Helvetica-Bold' },
  grandVal:  { color: ORANGE, fontSize: 18, fontFamily: 'Helvetica-Bold' },
  amtWords:  { backgroundColor: AMBER, borderWidth: 1, borderColor: '#fed7aa', borderRadius: 4, padding: '5 8', marginTop: 6 },
  amtWLabel: { color: '#9a3412', fontSize: 9, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  amtWText:  { color: DARK, fontSize: 10.5, fontFamily: 'Helvetica-Oblique' },

  notesBox:  { margin: '4 28 8', backgroundColor: LIGHT, borderRadius: 6, padding: '6 12', borderLeftWidth: 3, borderLeftColor: ORANGE },
  notesLbl:  { color: GREY, fontSize: 9, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  notesText: { color: '#374151', fontSize: 11 },

  footer:    { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb', padding: '10 28', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ftLeft:    { flex: 1, justifyContent: 'center' },
  ftCo:      { color: DARK, fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  ftLine:    { color: GREY, fontSize: 9, marginBottom: 1, lineHeight: 1.3 },
  ftNote:    { color: GREY, fontSize: 8.5, marginTop: 3 },
  ftRight:   { alignItems: 'center', width: 170 },
  sigImage:  { width: 46, height: 46, marginBottom: 2 },
  sigLine:   { borderTopWidth: 1, borderTopColor: '#d1d5db', paddingTop: 4, width: 150, textAlign: 'center' },
  sigText:   { color: DARK, fontSize: 10, fontFamily: 'Helvetica-Bold' },
  sigSub:    { color: GREY, fontSize: 8.5, marginTop: 1 },
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
    receiptNumber, customerName, customerPhone, customerAddress,
    trackingId, amount, paymentDate, paymentMethod, paymentReference,
    route, serviceLabel, bagsCount, pickupDate, notes,
    previousPaidAmount, totalPaidAmount, bookingTotalAmount, approvalStatus,
  } = props
  const outstandingAmount = bookingTotalAmount != null && totalPaidAmount != null
    ? Math.max(0, bookingTotalAmount - totalPaidAmount)
    : null
  const isCash = paymentMethod === 'cash'
  const method = METHOD_LABELS[paymentMethod] ?? paymentMethod
  const [fromCity, toCity] = (route ?? '').split(/\s+to\s+|\s*→\s*/i)

  return (
    <Document title={`Payment Receipt ${receiptNumber}`}>
      <Page size="A4" style={s.page}>

        {/* ── Header (same as Quote) ── */}
        <View style={s.header}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image style={s.logoFull} src={LOGO_FULL_WHITE_DATA_URI} />
            <Text style={s.logoSub}>India&apos;s First Digital Baggage Infrastructure</Text>
          </View>
          <View>
            <Text style={s.qnLabel}>Payment Receipt</Text>
            <Text style={s.qnValue}>{receiptNumber}</Text>
            <Text style={s.qnDate}>{fmtDate(paymentDate)}</Text>
            <View style={s.paidTag}><Text style={s.paidTagTx}>PAID</Text></View>
          </View>
        </View>

        {/* ── Meta strip ── */}
        <View style={s.strip}>
          <View><Text style={s.stripKey}>GSTIN</Text><Text style={s.stripVal}>{INVOICE_COMPANY.gstin}</Text></View>
          <View><Text style={s.stripKey}>Booking ID</Text><Text style={s.stripVal}>{trackingId}</Text></View>
          <View><Text style={s.stripKey}>Payment Mode</Text><Text style={s.stripVal}>{method}</Text></View>
          <View><Text style={s.stripKey}>Receipt Date</Text><Text style={s.stripVal}>{fmtDate(props.receiptDate)}</Text></View>
        </View>

        <View style={s.body}>
          {/* ── Received From + Journey ── */}
          <View style={s.row2}>
            <View style={s.card}>
              <Text style={s.cardLbl}>Received From</Text>
              <Text style={s.custName}>{customerName}</Text>
              {customerPhone ? <Text style={s.custSub}>{customerPhone}</Text> : null}
            </View>
            <View style={s.cardDark}>
              <Text style={s.cardLbl}>Journey Details</Text>
              {fromCity && toCity ? (
                <View style={s.jtRow}>
                  <View><Text style={s.jtLbl}>From</Text><Text style={s.jtCity}>{fromCity}</Text></View>
                  <View style={s.jtLine} />
                  <View><Text style={s.jtLbl}>To</Text><Text style={s.jtCity}>{toCity}</Text></View>
                </View>
              ) : route ? <Text style={s.jtCity}>{route}</Text> : null}
              {serviceLabel ? <Text style={s.kv}>Service: <Text style={s.kvVal}>{serviceLabel}</Text></Text> : null}
              {bagsCount ? <Text style={s.kv}>Bags: <Text style={s.kvVal}>{bagsCount}</Text></Text> : null}
            </View>
          </View>

          {customerAddress ? (
            <View style={[s.row2, { marginBottom: 10 }]}>
              <View style={{ flex: 1, backgroundColor: LIGHT, borderRadius: 6, padding: '6 10' }}>
                <Text style={[s.cardLbl, { marginBottom: 2 }]}>Pickup Address</Text>
                <Text style={s.addressVal}>{customerAddress}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {pickupDate ? (
          <View style={s.pickupBox}>
            <Text style={s.pickupItem}>PICK UP DATE: <Text style={s.pickupVal}>{fmtDate(pickupDate)}</Text></Text>
          </View>
        ) : null}

        {/* ── Payment table ── */}
        <View style={s.tableWrap}>
          <View style={s.tableHead}>
            <Text style={[s.tableH, s.cIdx]}>#</Text>
            <Text style={[s.tableH, s.cDesc]}>Description</Text>
            <Text style={[s.tableH, s.cMode]}>Mode</Text>
            <Text style={[s.tableH, s.cRef]}>{isCash ? 'Receipt / Note' : 'Reference / UTR'}</Text>
            <Text style={[s.tableH, s.cAmt, { color: '#fff' }]}>Amount</Text>
          </View>
          <View style={s.tableRow}>
            <Text style={[s.cell, s.cIdx]}>1</Text>
            <View style={s.cDesc}>
              <Text style={[s.cell, { fontFamily: 'Helvetica-Bold', color: DARK }]}>Payment received towards booking {trackingId}</Text>
              {route ? <Text style={s.cellDesc}>{route}{serviceLabel ? ` · ${serviceLabel}` : ''}</Text> : null}
            </View>
            <Text style={[s.cell, s.cMode]}>{method}</Text>
            <Text style={[s.cell, s.cRef]}>{paymentReference || '-'}</Text>
            <Text style={[s.cell, s.cAmt]}>{fmtRs(amount)}</Text>
          </View>
        </View>

        {/* ── Payment details + totals ── */}
        <View style={s.tpRow}>
          <View style={s.payBox}>
            <Text style={s.payLbl}>{isCash ? 'Payment Details' : 'Deposited To'}</Text>
            {isCash ? (
              <View>
                <View style={s.payRow}><Text style={s.payKey}>Mode:</Text><Text style={s.payVal}>Cash</Text></View>
                <View style={s.payRow}><Text style={s.payKey}>Received:</Text><Text style={s.payVal}>In person at the Bagdrop office</Text></View>
                {paymentReference ? <View style={s.payRow}><Text style={s.payKey}>Receipt:</Text><Text style={s.payVal}>{paymentReference}</Text></View> : null}
              </View>
            ) : (
              <View>
                <View style={s.payRow}><Text style={s.payKey}>Bank:</Text><Text style={s.payVal}>{INVOICE_BANK.bankName}</Text></View>
                <View style={s.payRow}><Text style={s.payKey}>A/C No:</Text><Text style={s.payVal}>{INVOICE_BANK.accountNo}</Text></View>
                <View style={s.payRow}><Text style={s.payKey}>IFSC:</Text><Text style={s.payVal}>{INVOICE_BANK.ifsc}</Text></View>
                <View style={s.payRow}><Text style={s.payKey}>Branch:</Text><Text style={s.payVal}>{INVOICE_BANK.branch}</Text></View>
              </View>
            )}
            {approvalStatus ? <View style={s.upiBox}><Text style={[s.upiText, { fontSize: 10, color: GREEN }]}>{approvalStatus}</Text></View> : null}
          </View>

          <View style={s.totalsBox}>
            {bookingTotalAmount != null ? <View style={s.totRow}><Text style={s.totKey}>Booking Total</Text><Text style={s.totVal}>{fmtRs(bookingTotalAmount)}</Text></View> : null}
            {!!previousPaidAmount && previousPaidAmount > 0 ? <View style={s.totRow}><Text style={s.totKey}>Previously Paid</Text><Text style={s.totVal}>{fmtRs(previousPaidAmount)}</Text></View> : null}
            {outstandingAmount != null ? (
              <View style={s.totRow}>
                <Text style={s.totKey}>Balance Due</Text>
                <Text style={[s.totVal, { fontFamily: 'Helvetica-Bold', color: outstandingAmount > 0 ? '#b45309' : GREEN }]}>
                  {outstandingAmount > 0 ? fmtRs(outstandingAmount) : 'NIL (Fully Paid)'}
                </Text>
              </View>
            ) : null}
            <View style={[s.totRow, s.totDivider]}>
              <Text style={s.grandKey}>Amount Received</Text>
              <Text style={s.grandVal}>{fmtRs(amount)}</Text>
            </View>
            <View style={s.amtWords}>
              <Text style={s.amtWLabel}>Amount in Words</Text>
              <Text style={s.amtWText}>{amountInWords(amount)}</Text>
            </View>
          </View>
        </View>

        {notes ? (
          <View style={s.notesBox}>
            <Text style={s.notesLbl}>Notes</Text>
            <Text style={s.notesText}>{notes}</Text>
          </View>
        ) : null}

        {/* ── Footer (same as Quote) ── */}
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
