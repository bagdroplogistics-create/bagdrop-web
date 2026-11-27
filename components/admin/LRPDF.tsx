import {
  Document, Page, Text, View, StyleSheet, Image,
} from '@react-pdf/renderer'
import { LR_COMPANY, LR_CHARGE_FIELDS } from '@/lib/lr-constants'
import { cityOnly } from './GCLabelsPDF'

// QR code: generated on the fly via the same api.qrserver.com endpoint
// already used for the UPI payment QR in app/api/admin/bookings/[id]/route.ts
// (sendPaymentRequestEmail) — no new dependency, react-pdf's <Image> accepts
// a remote URL directly. Encodes a compact verification string (GC number,
// date, route) rather than a public tracking URL, since there's no public
// per-LR tracking page yet.
function qrCodeUrl(data: string, size = 120) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&data=${encodeURIComponent(data)}`
}

// Company stamp/seal, supplied by the founder — public/legal/bagdrop-stamp.png
// (transparent PNG, same folder as the indemnity bond template).
const STAMP_URL = '/legal/bagdrop-stamp.png'

// Grid layout follows the real IV Cargo -style GC (Goods Consignment) form
// supplied as a reference: header identity block, PAN/GSTIN/Vehicle/Route
// row, Consignor/Consignee + running charges ledger, Billed To/Delivery
// Address, Invoice/E-way row, PKGS/CONTENT/WEIGHT table, and an Insurance/
// Payment Terms/LR Type/signature footer — recreated as a bordered grid
// (react-pdf has no native <table>) rather than a pixel copy, using
// Bagdrop's existing orange/dark palette (see TripSheetPDF.tsx, QuotePDF.tsx)
// for brand consistency with every other generated document.
//
// Landscape layout (2026-09-07, founder request: "Horizontal view layout
// design instead of vertical A4 size"). Real consignment/GC notes are
// conventionally landscape, and simply flipping the page orientation
// without re-flowing the content left the page mostly empty on the right
// and, worse, risked overflowing onto a second page — A4 landscape is only
// 595pt tall vs. portrait's 842pt, and the original design already used
// most of that portrait height. So beyond the orientation flip, the
// Consignor/Consignee, Billed To/Delivery Address, Invoice/Value/E-way/
// Mode, Package table, and Insurance/GST/Payment Terms/LR Type sections —
// previously each a separate FULL-WIDTH row stacked below the Charges
// ledger — are now nested together into one left-hand column that runs
// alongside the Charges ledger as a right-hand sidebar spanning their
// combined height, the same way Consignor/Consignee already sat beside
// Charges before. This uses the extra width landscape provides instead of
// leaving it blank, and saves roughly 120pt of vertical height (those
// sections no longer stack an extra time below the ledger), which is what
// makes everything fit on one page in landscape. The Delivery At/Remarks
// bar and the signature block are similarly merged into one footer row
// instead of two separate full-width rows — in landscape, "For Bagdrop..."
// stretching alone across a nearly-800pt-wide row left an awkward, mostly
// empty gap before the stamp; putting Delivery At/Remarks in the same row
// fills that space with useful content instead.

const ORANGE = '#f97316'
const DARK   = '#111827'
// Darkened from the previous #6b7280 (gray-500) — that read too light/washed
// out for the labels, footer text, and secondary lines throughout the LR.
// #4b5563 (gray-600) — the same shade already used for the company/contact
// strip and party address lines — keeps the same "muted secondary" role
// while being noticeably easier to read, without going as dark as the
// primary DARK text color.
const GREY   = '#4b5563'
const LIGHT  = '#f9fafb'
const BORDER = '#d1d5db'

// A4 PORTRAIT, TWO COPIES PER SHEET (founder request 2026-11-27): the LR is printed as two
// identical, separate LRs stacked on one A4 page (top + bottom half, cut line between), so the
// whole design below is a compact version sized to fit one half (595 x 421 pt).
const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', backgroundColor: '#fff', fontSize: 7 },
  copy: { width: 595.28, height: 420, overflow: 'hidden' },

  // Header
  header:  { backgroundColor: ORANGE, padding: '6 14', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logoFull:{ width: 24, height: 35, marginBottom: 2 },
  logoSub: { color: 'rgba(255,255,255,0.92)', fontSize: 5, fontFamily: 'Helvetica-Bold', letterSpacing: 0.6, marginTop: 2, textTransform: 'uppercase' },
  titleC:  { alignItems: 'center' },
  titleTxt:{ color: '#fff', fontSize: 11, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  titleSub:{ color: 'rgba(255,255,255,0.85)', fontSize: 6, marginTop: 1 },
  gcLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 5.5, letterSpacing: 1, textAlign: 'right', textTransform: 'uppercase' },
  gcValue: { color: '#fff', fontSize: 6.5, fontFamily: 'Helvetica-Bold', textAlign: 'right', marginTop: 1 },
  gcDate:  { color: '#fff', fontSize: 10, fontFamily: 'Helvetica-Bold', textAlign: 'right', marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qrBox:   { width: 32, height: 32, backgroundColor: '#fff', borderRadius: 2, padding: 1.5 },

  // Company strip
  coStrip: { backgroundColor: LIGHT, borderBottomWidth: 1, borderBottomColor: BORDER, padding: '4 14', flexDirection: 'row', justifyContent: 'space-between' },
  coLine:  { fontSize: 5.8, color: '#4b5563', lineHeight: 1.3 },
  coLineGap: { fontSize: 5.8, color: '#4b5563', lineHeight: 1.3, marginTop: 1.5 },
  coName:  { fontSize: 6.3, fontFamily: 'Helvetica-Bold', color: DARK },
  coContactRow: { flexDirection: 'row', gap: 12 },

  // Grid
  body:    { margin: '0 14' },
  gridWrap:{ borderTopWidth: 1, borderLeftWidth: 1, borderColor: BORDER, marginTop: 5 },
  row:     { flexDirection: 'row' },

  cell:    { borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER, padding: '2.5 5' },
  cellLbl: { fontSize: 5.5, color: GREY, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 1 },
  cellVal: { fontSize: 7.2, color: DARK, fontFamily: 'Helvetica-Bold' },

  sectionHead: { backgroundColor: DARK, borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER, padding: '2 5' },
  sectionHeadTxt: { color: '#fff', fontSize: 5.8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },

  partyBox: { padding: '3 5', borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER },
  partyName:{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 1 },
  partyLine:{ fontSize: 6.3, color: '#4b5563', marginBottom: 1 },
  addressVal: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 1 },

  chargeRow:  { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e5e7eb', padding: '1.6 5' },
  chargeLbl:  { fontSize: 6, color: '#4b5563', flex: 1 },
  chargeVal:  { fontSize: 6, color: DARK, width: 46, textAlign: 'right' },
  chargeTotalRow: { flexDirection: 'row', padding: '2.5 5', backgroundColor: LIGHT, borderTopWidth: 1, borderColor: BORDER },
  chargeTotalLbl: { fontSize: 6.6, color: DARK, fontFamily: 'Helvetica-Bold', flex: 1 },
  chargeTotalVal: { fontSize: 6.6, color: DARK, fontFamily: 'Helvetica-Bold', width: 46, textAlign: 'right' },
  grandTotalRow:  { flexDirection: 'row', padding: '3.5 5', backgroundColor: ORANGE },
  grandTotalLbl:  { fontSize: 7.5, color: '#fff', fontFamily: 'Helvetica-Bold', flex: 1 },
  grandTotalVal:  { fontSize: 7.5, color: '#fff', fontFamily: 'Helvetica-Bold', width: 56, textAlign: 'right' },

  // Package table
  pkgHead:  { flexDirection: 'row', backgroundColor: DARK, borderRightWidth: 1, borderColor: BORDER },
  pkgHcell: { color: '#fff', fontSize: 5.8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', padding: '2.5 5', borderRightWidth: 1, borderColor: '#374151' },
  pkgRow:   { flexDirection: 'row', borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER },
  pkgCell:  { fontSize: 6.8, color: DARK, padding: '3.5 5', borderRightWidth: 1, borderColor: BORDER },

  // Footer grid (Insurance / GST Payable / Payment Terms card)
  footRow:  { flexDirection: 'row' },
  footCell: { flex: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER, padding: '3 5' },
  footLbl:  { fontSize: 5.5, color: GREY, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 1.5 },
  footVal:  { fontSize: 7, color: DARK, fontFamily: 'Helvetica-Bold' },
  yesNo:    { flexDirection: 'row', gap: 16, marginTop: 2 },

  // Footer band
  footerBand: { margin: '5 14 0', flexDirection: 'row', borderWidth: 1, borderColor: BORDER, alignItems: 'stretch' },
  bbCell:     { flex: 0.8, padding: '3 5', borderRightWidth: 1, borderColor: BORDER },
  bbCellWide: { flex: 1.4, padding: '3 5', borderRightWidth: 1, borderColor: BORDER },
  sigCoCell:  { flex: 1.6, padding: '4 6', borderRightWidth: 1, borderColor: BORDER, justifyContent: 'center' },
  sigCo:      { fontSize: 7, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 1.5 },
  sigLine2:   { fontSize: 6, color: GREY, marginBottom: 1 },
  sigStampCell: { width: 110, padding: '4 6', alignItems: 'center', justifyContent: 'center' },
  stampImg:   { width: 34, height: 34, marginBottom: 1 },
  sigBox:     { borderTopWidth: 1, borderColor: DARK, paddingTop: 2, width: 96, textAlign: 'center' },
  sigTxt:     { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: DARK },
  sigSub:     { fontSize: 5.5, color: GREY, marginTop: 1 },

  cutLine:    { borderTopWidth: 0.8, borderStyle: 'dashed', borderColor: '#9ca3af' },
})

// Standard weights by bag count (founder, 2026-11-27): bags -> [actual kg, chargeable kg].
// Applies to 1-4 bags; any other count falls back to the weights stored on the LR.
const STANDARD_WEIGHTS: Record<number, [number, number]> = { 1: [23, 25], 2: [45, 45], 3: [69, 70], 4: [92, 95] }
export function lrWeights(bags: number | null | undefined, actual: number | null, chargeable: number | null): [number | null, number | null] {
  const std = STANDARD_WEIGHTS[Math.floor(Number(bags) || 0)]
  return std ? [std[0], std[1]] : [actual, chargeable]
}

function fmtRs(n: number | null | undefined) {
  if (n == null) return '0.00'
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  try {
    return new Date(d.includes('T') ? d : d + 'T00:00:00')
      .toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return d }
}

export interface LRPDFProps {
  lrNumber:        string
  lrDate:          string | null
  status:          string
  bookingOffice:   string | null
  vehicleNumber:   string | null
  fromCity:        string | null
  toCity:          string | null
  mode:            string | null

  consignorName:    string | null
  consignorAddress: string | null
  consignorMobile:  string | null
  consignorGstin:   string | null

  consigneeName:    string | null
  consigneeAddress: string | null
  consigneeMobile:  string | null
  consigneeGstin:   string | null

  billedToName:  string | null
  billedToGstin: string | null
  deliveryAddress: string | null

  invoiceNumber: string | null
  invoiceValue:  number | null
  ewayBillNumber:string | null

  totalBags:          number | null
  contentDescription: string | null
  actualWeight:       number | null
  chargeableWeight:   number | null
  sizeL: number | null
  sizeW: number | null
  sizeH: number | null
  privateMark: string | null
  tiTag: string | null

  charges: Record<string, number>
  subTotal:    number
  igstAmount:  number
  cgstAmount:  number
  sgstAmount:  number
  totalAmount: number

  insuranceByCustomer: boolean
  gstPayableBy: string | null
  paymentTerms: string | null
  lrType:       string | null
  deliveryAt:   string | null
  remarks:      string | null
  preparedBy:   string | null

  // Branch-Wise LR letterhead — spec section 12: the issuing branch's own
  // name/address/GST/contact, snapshotted onto the LR at creation time
  // (see lib/lr-auto-create.ts's branchSnapshotFields). All optional and
  // null for any LR created before this feature, or with no confident
  // branch match — those fall back to the single company-wide LR_COMPANY
  // letterhead exactly as before, so old LRs render unchanged.
  branchName:          string | null
  branchAddress:       string | null
  branchGstNumber:     string | null
  branchContactNumber: string | null
  branchEmail:         string | null
}

function LRCopy(p: LRPDFProps) {
  // Branch letterhead falls back field-by-field to LR_COMPANY — a branch
  // missing just a phone or GST number (not yet filled in) still shows the
  // rest of its own details rather than silently reverting the whole strip
  // to the company default.
  const coName    = p.branchName          || LR_COMPANY.name
  const coAddress = p.branchAddress       || `${LR_COMPANY.addressLine1}, ${LR_COMPANY.addressLine2}`
  const coGstin   = p.branchGstNumber     || LR_COMPANY.gstin
  const coPhone   = p.branchContactNumber || LR_COMPANY.phone
  const coEmail   = p.branchEmail         || LR_COMPANY.email

  // "At Branch" in the Payment Terms card = the issuing city, e.g. "at MUMBAI".
  const [aW, cW] = lrWeights(p.totalBags, p.actualWeight, p.chargeableWeight)
  const atBranch = (cityOnly(p.bookingOffice || p.fromCity) || p.bookingOffice || p.fromCity || '').toUpperCase()

  return (
    <View style={s.copy}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image style={s.logoFull} src="/logo-full-white.png" />
            <Text style={s.logoSub}>India&apos;s First Digital Baggage Infrastructure</Text>
          </View>
          <View style={s.titleC}>
            <Text style={s.titleTxt}>Consignment Note</Text>
            <Text style={s.titleSub}>At Owner&apos;s Risk</Text>
          </View>
          <View style={s.headerRight}>
            <Image
              style={s.qrBox}
              src={qrCodeUrl(`BAGDROP LR:${p.lrNumber} DATE:${p.lrDate ?? ''} ${p.fromCity ?? ''}->${p.toCity ?? ''}`)}
            />
            <View>
              <Text style={s.gcLabel}>GC No.</Text>
              <Text style={s.gcValue}>{p.lrNumber}</Text>
              <Text style={s.gcDate}>Date: {fmtDate(p.lrDate)}</Text>
            </View>
          </View>
        </View>

        {/* ── Company strip ── */}
        <View style={s.coStrip}>
          <View>
            <Text style={s.coName}>{coName}</Text>
            <Text style={s.coLineGap}>{coAddress}</Text>
          </View>
          <View style={s.coContactRow}>
            <View>
              <Text style={s.coLine}>Tel: {coPhone}</Text>
            </View>
            <View>
              {p.branchContactNumber ? null : <Text style={s.coLine}>{LR_COMPANY.phone2}</Text>}
              <Text style={s.coLineGap}>{coEmail}</Text>
            </View>
            <View>
              <Text style={s.coLine}>{LR_COMPANY.web}</Text>
            </View>
          </View>
        </View>

        <View style={s.body}>
          {/* ── PAN/GSTIN/Date/Vehicle/Route row ── */}
          <View style={s.gridWrap}>
            <View style={s.row}>
              <View style={[s.cell, { flex: 1.3 }]}>
                <Text style={s.cellLbl}>PAN No.</Text>
                <Text style={s.cellVal}>{LR_COMPANY.pan}</Text>
              </View>
              <View style={[s.cell, { flex: 1.6 }]}>
                <Text style={s.cellLbl}>GSTIN</Text>
                <Text style={s.cellVal}>{coGstin}</Text>
              </View>
              <View style={[s.cell, { flex: 1.2 }]}>
                <Text style={s.cellLbl}>GC Date</Text>
                <Text style={s.cellVal}>{fmtDate(p.lrDate)}</Text>
              </View>
              <View style={[s.cell, { flex: 1.2 }]}>
                <Text style={s.cellLbl}>Vehicle No.</Text>
                <Text style={s.cellVal}>{p.vehicleNumber ?? '—'}</Text>
              </View>
              <View style={[s.cell, { flex: 1.3 }]}>
                <Text style={s.cellLbl}>From</Text>
                <Text style={s.cellVal}>{p.fromCity ?? '—'}</Text>
              </View>
              <View style={[s.cell, { flex: 1.3, borderRightWidth: 1 }]}>
                <Text style={s.cellLbl}>To</Text>
                <Text style={s.cellVal}>{p.toCity ?? '—'}</Text>
              </View>
            </View>

            {/* ── Left column (Consignor/Consignee through Insurance/LR
                 Type) beside a full-height Charges sidebar — see the
                 file-header comment for why these were pulled together
                 out of separate full-width rows for the landscape layout. ── */}
            <View style={s.row}>
              <View style={{ flex: 2.4 }}>
                {/* Consignor / Consignee */}
                <View style={s.row}>
                  <View style={[s.sectionHead, { flex: 1 }]}><Text style={s.sectionHeadTxt}>Consignor&apos;s Name &amp; Address</Text></View>
                  <View style={[s.sectionHead, { flex: 1, borderRightWidth: 0 }]}><Text style={s.sectionHeadTxt}>Consignee&apos;s Name &amp; Address</Text></View>
                </View>
                <View style={s.row}>
                  <View style={[s.partyBox, { flex: 1 }]}>
                    <Text style={s.partyName}>{p.consignorName ?? '—'}</Text>
                    {p.consignorAddress ? <Text style={s.addressVal}>{p.consignorAddress}</Text> : null}
                    {p.consignorMobile ? <Text style={s.partyLine}>Mobile: {p.consignorMobile}</Text> : null}
                    <Text style={s.partyLine}>GSTIN: {p.consignorGstin ?? '—'}</Text>
                  </View>
                  <View style={[s.partyBox, { flex: 1, borderRightWidth: 0 }]}>
                    <Text style={s.partyName}>{p.consigneeName ?? '—'}</Text>
                    {p.consigneeAddress ? <Text style={s.addressVal}>{p.consigneeAddress}</Text> : null}
                    {p.consigneeMobile ? <Text style={s.partyLine}>Mobile: {p.consigneeMobile}</Text> : null}
                    <Text style={s.partyLine}>GSTIN: {p.consigneeGstin ?? '—'}</Text>
                  </View>
                </View>

                {/* Billed To / Delivery Address */}
                <View style={s.row}>
                  <View style={[s.sectionHead, { flex: 1 }]}><Text style={s.sectionHeadTxt}>Billed To (Service Receiver)</Text></View>
                  <View style={[s.sectionHead, { flex: 1, borderRightWidth: 0 }]}><Text style={s.sectionHeadTxt}>Delivery Address</Text></View>
                </View>
                <View style={s.row}>
                  <View style={[s.partyBox, { flex: 1 }]}>
                    <Text style={s.partyName}>{p.billedToName ?? '—'}</Text>
                    <Text style={s.partyLine}>GSTIN: {p.billedToGstin ?? '—'}</Text>
                  </View>
                  <View style={[s.partyBox, { flex: 1, borderRightWidth: 0 }]}>
                    <Text style={s.addressVal}>{p.deliveryAddress ?? '—'}</Text>
                  </View>
                </View>

                {/* Invoice / Value / E-way / Mode */}
                <View style={s.row}>
                  <View style={[s.cell, { flex: 1 }]}>
                    <Text style={s.cellLbl}>Invoice No.</Text>
                    <Text style={s.cellVal}>{p.invoiceNumber ?? '—'}</Text>
                  </View>
                  <View style={[s.cell, { flex: 1 }]}>
                    <Text style={s.cellLbl}>Value</Text>
                    <Text style={s.cellVal}>{p.invoiceValue != null ? 'Rs. ' + fmtRs(p.invoiceValue) : '—'}</Text>
                  </View>
                  <View style={[s.cell, { flex: 1.4 }]}>
                    <Text style={s.cellLbl}>E-way Bill No.</Text>
                    <Text style={s.cellVal}>{p.ewayBillNumber ?? '—'}</Text>
                  </View>
                  <View style={[s.cell, { flex: 1, borderRightWidth: 1 }]}>
                    <Text style={s.cellLbl}>Mode</Text>
                    <Text style={s.cellVal}>{p.mode ?? '—'}</Text>
                  </View>
                </View>

                {/* Packages table */}
                <View style={s.pkgHead}>
                  <Text style={[s.pkgHcell, { flex: 0.7 }]}>Pkgs</Text>
                  <Text style={[s.pkgHcell, { flex: 1.6 }]}>Content</Text>
                  <Text style={[s.pkgHcell, { flex: 0.9 }]}>A Weight</Text>
                  <Text style={[s.pkgHcell, { flex: 0.9 }]}>C Weight</Text>
                  <Text style={[s.pkgHcell, { flex: 1.3 }]}>Size (L×W×H)</Text>
                  <Text style={[s.pkgHcell, { flex: 1.1 }]}>Private Mark</Text>
                  <Text style={[s.pkgHcell, { flex: 1, borderRightWidth: 0 }]}>Ti-Tag</Text>
                </View>
                <View style={s.pkgRow}>
                  <Text style={[s.pkgCell, { flex: 0.7 }]}>{p.totalBags ?? 1}</Text>
                  <Text style={[s.pkgCell, { flex: 1.6 }]}>{p.contentDescription ?? '—'}</Text>
                  <Text style={[s.pkgCell, { flex: 0.9 }]}>{aW != null ? `${aW} kg` : '—'}</Text>
                  <Text style={[s.pkgCell, { flex: 0.9 }]}>{cW != null ? `${cW} kg` : '—'}</Text>
                  <Text style={[s.pkgCell, { flex: 1.3 }]}>
                    {p.sizeL != null && p.sizeW != null && p.sizeH != null ? `${p.sizeL} × ${p.sizeW} × ${p.sizeH}` : '—'}
                  </Text>
                  <Text style={[s.pkgCell, { flex: 1.1 }]}>{p.privateMark ?? '—'}</Text>
                  <Text style={[s.pkgCell, { flex: 1, borderRightWidth: 0 }]}>{p.tiTag ?? '—'}</Text>
                </View>

                {/* Insurance (both options shown, tick by hand) / GST Payable By (left blank) /
                    Payment Terms card: LR Type + At Branch */}
                <View style={s.footRow}>
                  <View style={s.footCell}>
                    <Text style={s.footLbl}>Material Insured By Customer</Text>
                    <View style={s.yesNo}>
                      <Text style={s.footVal}>YES</Text>
                      <Text style={s.footVal}>NO</Text>
                    </View>
                  </View>
                  <View style={s.footCell}>
                    <Text style={s.footLbl}>GST Payable By</Text>
                    <Text style={s.footVal}> </Text>
                  </View>
                  <View style={[s.footCell, { borderRightWidth: 1, flex: 1.6, padding: 0 }]}>
                    <Text style={[s.footLbl, { textAlign: 'center', paddingTop: 3, marginBottom: 0 }]}>Payment Terms</Text>
                    <View style={s.row}>
                      <View style={{ flex: 1, padding: '2 5', borderRightWidth: 1, borderColor: BORDER }}>
                        <Text style={s.footLbl}>LR Type</Text>
                        <Text style={s.footVal}>{p.lrType ?? '—'}</Text>
                      </View>
                      <View style={{ flex: 1, padding: '2 5' }}>
                        <Text style={s.footLbl}>At Branch</Text>
                        <Text style={s.footVal}>{atBranch ? `at ${atBranch}` : '—'}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              {/* Charges ledger — full-height sidebar alongside the whole
                  left column above, not just the Consignor/Consignee row */}
              <View style={{ flex: 1, borderRightWidth: 1, borderColor: BORDER }}>
                <View style={[s.sectionHead, { borderRightWidth: 0 }]}><Text style={s.sectionHeadTxt}>Charges</Text></View>
                {LR_CHARGE_FIELDS.map(f => (
                  <View key={f.key} style={s.chargeRow}>
                    <Text style={s.chargeLbl}>{f.label}</Text>
                    <Text style={s.chargeVal}>{fmtRs(p.charges[f.key])}</Text>
                  </View>
                ))}
                <View style={s.chargeTotalRow}>
                  <Text style={s.chargeTotalLbl}>Sub Total</Text>
                  <Text style={s.chargeTotalVal}>{fmtRs(p.subTotal)}</Text>
                </View>
                {p.igstAmount > 0 ? (
                  <View style={s.chargeRow}><Text style={s.chargeLbl}>IGST @ 5%</Text><Text style={s.chargeVal}>{fmtRs(p.igstAmount)}</Text></View>
                ) : (
                  <>
                    <View style={s.chargeRow}><Text style={s.chargeLbl}>CGST @ 2.5%</Text><Text style={s.chargeVal}>{fmtRs(p.cgstAmount)}</Text></View>
                    <View style={s.chargeRow}><Text style={s.chargeLbl}>SGST @ 2.5%</Text><Text style={s.chargeVal}>{fmtRs(p.sgstAmount)}</Text></View>
                  </>
                )}
                <View style={s.grandTotalRow}>
                  <Text style={s.grandTotalLbl}>Total</Text>
                  <Text style={s.grandTotalVal}>Rs. {fmtRs(p.totalAmount)}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ── Footer band: Delivery At / Remarks / Signature — merged into
             one row for landscape (see file-header comment) ── */}
        <View style={s.footerBand}>
          <View style={s.bbCell}>
            <Text style={s.footLbl}>Delivery At</Text>
            <Text style={s.footVal}>{p.deliveryAt ?? '—'}</Text>
          </View>
          <View style={s.bbCellWide}>
            <Text style={s.footLbl}>Remarks</Text>
            <Text style={s.footVal}>{p.remarks ?? '—'}</Text>
          </View>
          <View style={s.sigCoCell}>
            <Text style={s.sigCo}>For {coName}</Text>
            <Text style={s.sigLine2}>Prepared By: {p.preparedBy ?? 'admin'}</Text>
          </View>
          <View style={s.sigStampCell}>
            <Image style={s.stampImg} src={STAMP_URL} />
            <View style={s.sigBox}>
              <Text style={s.sigTxt}>Authorized Signatory</Text>
              <Text style={s.sigSub}>For {LR_COMPANY.shortName}</Text>
            </View>
          </View>
        </View>

    </View>
  )
}

export default function LRPDF(p: LRPDFProps) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <LRCopy {...p} />
        <View style={s.cutLine} />
        <LRCopy {...p} />
      </Page>
    </Document>
  )
}
