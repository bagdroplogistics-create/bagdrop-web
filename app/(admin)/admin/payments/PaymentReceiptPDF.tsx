import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import { INVOICE_COMPANY, INVOICE_BANK } from '@/lib/company-info'
import { LOGO_ICON_DATA_URI } from '@/lib/invoice-logo'
import { amountInWords } from '@/lib/number-to-words'

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

const DARK   = '#111827'
const GREY   = '#4b5563'
const BORDER = '#d1d5db'
const GREEN  = '#16a34a'
const ORANGE = '#FF6300'

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: DARK, backgroundColor: '#fff', padding: '32 36 40' },

  topBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 5, backgroundColor: DARK },

  headerRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  logoRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logoIcon:    { width: 20, height: 26 },
  logoTextCol: { flexDirection: 'column' },
  logoWordmark:{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: ORANGE, letterSpacing: -0.3 },
  logoTagline: { fontSize: 5.5, fontFamily: 'Helvetica-Bold', color: GREY, letterSpacing: 1, marginTop: 1 },
  coBlock:     { marginTop: 8 },
  coName:      { fontSize: 10, fontFamily: 'Helvetica-Bold', color: DARK },
  coLine:      { fontSize: 7.5, color: GREY, marginTop: 1.5 },

  titleCol:    { alignItems: 'flex-end' },
  docTitle:    { fontSize: 18, fontFamily: 'Helvetica-Bold', color: DARK, letterSpacing: 0.5 },
  paidPill:    { marginTop: 6, backgroundColor: GREEN, color: '#fff', fontSize: 8, fontFamily: 'Helvetica-Bold',
                 paddingVertical: 3, paddingHorizontal: 10, borderRadius: 3, letterSpacing: 0.5 },

  metaBox:     { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: BORDER, paddingVertical: 10, marginBottom: 16 },
  metaCol:     { flex: 1 },
  metaRow:     { flexDirection: 'row', marginBottom: 4 },
  metaKey:     { width: 110, fontSize: 8, color: GREY },
  metaVal:     { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: DARK, flex: 1 },

  amountBox:   { backgroundColor: GREEN, borderRadius: 6, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', marginBottom: 16 },
  amountLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#dcfce7', letterSpacing: 1, textTransform: 'uppercase' },
  amountValue: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#fff', marginTop: 3 },
  amountWords: { fontSize: 8, color: '#dcfce7', marginTop: 4, textAlign: 'center' },

  sectionRow:  { flexDirection: 'row', gap: 16, marginBottom: 16 },
  // flex:1 here is only correct for a card used INSIDE sectionRow (a flex
  // row, where it means "share the row equally"). A card used on its own
  // as a direct Page child must NOT reuse this — Page is a column flex
  // container, so flex:1 there means "stretch to fill all remaining
  // vertical space", which silently blew the Booking Details card up to
  // fill the rest of the page (confirmed via a rendered preview,
  // 2026-09-07) and pushed the Notes box down into the fixed footer. Use
  // cardFull below for any standalone, full-width card instead.
  card:        { flex: 1, backgroundColor: '#f9fafb', borderRadius: 6, padding: 12 },
  cardFull:    { backgroundColor: '#f9fafb', borderRadius: 6, padding: 12 },
  cardLabel:   { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  cardName:    { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#1d4ed8' },
  cardLine:    { fontSize: 8.5, color: GREY, marginTop: 2 },

  fieldGrid:   { flexDirection: 'row', flexWrap: 'wrap' },
  field:       { width: '50%', marginBottom: 6 },
  fieldLabel:  { fontSize: 7, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldValue:  { fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK, marginTop: 1.5 },

  divider:     { borderTopWidth: 1, borderTopColor: '#f3f4f6', marginVertical: 12 },

  notesBox:    { backgroundColor: '#fff7ed', borderRadius: 6, padding: 10, marginBottom: 16 },
  notesLabel:  { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#9a3412', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 },
  notesText:   { fontSize: 8.5, color: '#78350f' },

  footer:      { position: 'absolute', left: 36, right: 36, bottom: 28, borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 10 },
  footerLine:  { fontSize: 7.5, color: '#9ca3af', lineHeight: 1.5 },
  footerBold:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#374151' },
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
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
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

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.topBar} fixed />

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
            <View style={s.coBlock}>
              <Text style={s.coName}>{INVOICE_COMPANY.name}</Text>
              <Text style={s.coLine}>{INVOICE_COMPANY.addressLine1}</Text>
              <Text style={s.coLine}>{INVOICE_COMPANY.addressLine2}</Text>
              <Text style={s.coLine}>GSTIN: {INVOICE_COMPANY.gstin}</Text>
              <Text style={s.coLine}>{INVOICE_COMPANY.phone} · {INVOICE_COMPANY.email}</Text>
            </View>
          </View>
          <View style={s.titleCol}>
            <Text style={s.docTitle}>PAYMENT RECEIPT</Text>
            <Text style={s.paidPill}>PAID</Text>
          </View>
        </View>

        {/* Meta strip */}
        <View style={s.metaBox}>
          <View style={s.metaCol}>
            <View style={s.metaRow}><Text style={s.metaKey}>Receipt Number</Text><Text style={s.metaVal}>{receiptNumber}</Text></View>
            <View style={s.metaRow}><Text style={s.metaKey}>Receipt Date</Text><Text style={s.metaVal}>{fmtDate(receiptDate)}</Text></View>
          </View>
          <View style={s.metaCol}>
            <View style={s.metaRow}><Text style={s.metaKey}>Booking / Tracking ID</Text><Text style={s.metaVal}>{trackingId}</Text></View>
            <View style={s.metaRow}><Text style={s.metaKey}>Payment Date</Text><Text style={s.metaVal}>{fmtDate(paymentDate)}</Text></View>
          </View>
        </View>

        {/* Amount */}
        <View style={s.amountBox}>
          <Text style={s.amountLabel}>Amount Received</Text>
          <Text style={s.amountValue}>{fmtRs(amount)}</Text>
          <Text style={s.amountWords}>{amountInWords(amount)}</Text>
        </View>

        {/* Received From + Payment Details */}
        <View style={s.sectionRow}>
          <View style={s.card}>
            <Text style={s.cardLabel}>Received From</Text>
            <Text style={s.cardName}>{customerName}</Text>
            {customerAddress ? <Text style={s.cardLine}>{customerAddress}</Text> : null}
            {customerPhone ? <Text style={s.cardLine}>{customerPhone}</Text> : null}
          </View>
          <View style={s.card}>
            <Text style={s.cardLabel}>Payment Details</Text>
            <View style={s.fieldGrid}>
              <View style={s.field}>
                <Text style={s.fieldLabel}>Payment Method</Text>
                <Text style={s.fieldValue}>{METHOD_LABELS[paymentMethod] ?? paymentMethod}</Text>
              </View>
              <View style={s.field}>
                <Text style={s.fieldLabel}>Reference / Transaction No.</Text>
                <Text style={s.fieldValue}>{paymentReference || '—'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Booking details */}
        {(route || serviceLabel || bagsCount || pickupDate) && (
          <View style={{ ...s.cardFull, marginBottom: 16 }}>
            <Text style={s.cardLabel}>Booking Details</Text>
            <View style={s.fieldGrid}>
              {route ? (
                <View style={s.field}>
                  <Text style={s.fieldLabel}>Route</Text>
                  <Text style={s.fieldValue}>{route}</Text>
                </View>
              ) : null}
              {serviceLabel ? (
                <View style={s.field}>
                  <Text style={s.fieldLabel}>Service Type</Text>
                  <Text style={s.fieldValue}>{serviceLabel}</Text>
                </View>
              ) : null}
              {bagsCount ? (
                <View style={s.field}>
                  <Text style={s.fieldLabel}>No. of Bags</Text>
                  <Text style={s.fieldValue}>{bagsCount}</Text>
                </View>
              ) : null}
              {pickupDate ? (
                <View style={s.field}>
                  <Text style={s.fieldLabel}>Pickup Date</Text>
                  <Text style={s.fieldValue}>{fmtDate(pickupDate)}</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

        {/* Payment Summary — Previous Paid / Total Paid / Outstanding /
            Approval Status. Only rendered when the caller could resolve a
            linked booking's ledger (totalPaidAmount provided) — see the
            PaymentReceiptPDFProps doc comment above. */}
        {totalPaidAmount != null && (
          <View style={{ ...s.cardFull, marginBottom: 16 }}>
            <Text style={s.cardLabel}>Payment Summary</Text>
            <View style={s.fieldGrid}>
              <View style={s.field}>
                <Text style={s.fieldLabel}>This Payment</Text>
                <Text style={s.fieldValue}>{fmtRs(amount)}</Text>
              </View>
              {!!previousPaidAmount && previousPaidAmount > 0 && (
                <View style={s.field}>
                  <Text style={s.fieldLabel}>Previously Paid</Text>
                  <Text style={s.fieldValue}>{fmtRs(previousPaidAmount)}</Text>
                </View>
              )}
              <View style={s.field}>
                <Text style={s.fieldLabel}>Total Paid</Text>
                <Text style={[s.fieldValue, { color: GREEN }]}>{fmtRs(totalPaidAmount)}</Text>
              </View>
              {outstandingAmount != null && (
                <View style={s.field}>
                  <Text style={s.fieldLabel}>Outstanding</Text>
                  <Text style={[s.fieldValue, outstandingAmount > 0 ? { color: '#d97706' } : { color: GREEN }]}>
                    {outstandingAmount > 0 ? fmtRs(outstandingAmount) : 'Fully Paid'}
                  </Text>
                </View>
              )}
              {approvalStatus ? (
                <View style={s.field}>
                  <Text style={s.fieldLabel}>Approval Status</Text>
                  <Text style={[s.fieldValue, { color: GREEN }]}>{approvalStatus}</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

        <View style={s.divider} />

        {/* Bank details */}
        <View style={{ marginBottom: notes ? 12 : 0 }}>
          <Text style={s.cardLabel}>Deposited To</Text>
          <Text style={{ fontSize: 8.5, color: GREY, marginTop: 3 }}>
            {INVOICE_BANK.bankName} · A/C {INVOICE_BANK.accountNo} · IFSC {INVOICE_BANK.ifsc} · {INVOICE_BANK.branch}
          </Text>
        </View>

        {notes ? (
          <View style={s.notesBox}>
            <Text style={s.notesLabel}>Notes</Text>
            <Text style={s.notesText}>{notes}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerBold}>{INVOICE_COMPANY.name}</Text>
          <Text style={s.footerLine}>{INVOICE_COMPANY.addressLine1}, {INVOICE_COMPANY.addressLine2}</Text>
          <Text style={s.footerLine}>GSTIN: {INVOICE_COMPANY.gstin} · CIN: {INVOICE_COMPANY.cin}</Text>
          <Text style={s.footerLine}>{INVOICE_COMPANY.phone} · {INVOICE_COMPANY.email} · {INVOICE_COMPANY.web}</Text>
          <Text style={{ ...s.footerLine, marginTop: 4, color: '#c1c5cc' }}>
            This is a system-generated receipt and does not require a physical signature.
          </Text>
        </View>
      </Page>
    </Document>
  )
}
