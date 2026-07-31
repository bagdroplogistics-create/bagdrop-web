import {
  Document, Page, Text, View, StyleSheet,
} from '@react-pdf/renderer'
import { LR_COMPANY, LR_CHARGE_FIELDS } from '@/lib/lr-constants'

// Grid layout follows the real IV Cargo -style GC (Goods Consignment) form
// supplied as a reference: header identity block, PAN/GSTIN/Vehicle/Route
// row, Consignor/Consignee + running charges ledger, Billed To/Delivery
// Address, Invoice/E-way row, PKGS/CONTENT/WEIGHT table, and an Insurance/
// Payment Terms/LR Type/signature footer — recreated as a bordered grid
// (react-pdf has no native <table>) rather than a pixel copy, using
// Bagdrop's existing orange/dark palette (see TripSheetPDF.tsx, QuotePDF.tsx)
// for brand consistency with every other generated document.

const ORANGE = '#f97316'
const DARK   = '#111827'
const GREY   = '#6b7280'
const LIGHT  = '#f9fafb'
const BORDER = '#d1d5db'

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', backgroundColor: '#fff', paddingBottom: 30, fontSize: 8 },

  // Header
  header:  { backgroundColor: ORANGE, padding: '16 24', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo:    { color: '#fff', fontSize: 20, fontFamily: 'Helvetica-Bold', letterSpacing: -0.5 },
  logoSub: { color: 'rgba(255,255,255,0.8)', fontSize: 6.5, letterSpacing: 1.2, marginTop: 2, textTransform: 'uppercase' },
  titleC:  { alignItems: 'center' },
  titleTxt:{ color: '#fff', fontSize: 13, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  titleSub:{ color: 'rgba(255,255,255,0.85)', fontSize: 7, marginTop: 2 },
  gcLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 6.5, letterSpacing: 1, textAlign: 'right', textTransform: 'uppercase' },
  gcValue: { color: '#fff', fontSize: 13, fontFamily: 'Helvetica-Bold', textAlign: 'right', marginTop: 2 },
  gcDate:  { color: 'rgba(255,255,255,0.85)', fontSize: 7, textAlign: 'right', marginTop: 2 },

  // Company strip
  coStrip: { backgroundColor: LIGHT, borderBottomWidth: 1, borderBottomColor: BORDER, padding: '6 24', flexDirection: 'row', justifyContent: 'space-between' },
  coLine:  { fontSize: 6.5, color: '#4b5563' },

  // Grid
  body:    { margin: '0 24' },
  gridWrap:{ borderTopWidth: 1, borderLeftWidth: 1, borderColor: BORDER, marginTop: 10 },
  row:     { flexDirection: 'row' },

  cell:    { borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER, padding: '4 6' },
  cellLbl: { fontSize: 6, color: GREY, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  cellVal: { fontSize: 8, color: DARK, fontFamily: 'Helvetica-Bold' },

  sectionHead: { backgroundColor: DARK, borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER, padding: '3 6' },
  sectionHeadTxt: { color: '#fff', fontSize: 6.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.6 },

  partyBox: { padding: '5 6', borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER },
  partyName:{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 2 },
  partyLine:{ fontSize: 7, color: '#4b5563', marginBottom: 1.5 },

  chargeRow:  { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e5e7eb', padding: '2.5 6' },
  chargeLbl:  { fontSize: 6.5, color: '#4b5563', flex: 1 },
  chargeVal:  { fontSize: 6.5, color: DARK, width: 46, textAlign: 'right' },
  chargeTotalRow: { flexDirection: 'row', padding: '4 6', backgroundColor: LIGHT, borderTopWidth: 1, borderColor: BORDER },
  chargeTotalLbl: { fontSize: 7, color: DARK, fontFamily: 'Helvetica-Bold', flex: 1 },
  chargeTotalVal: { fontSize: 7, color: DARK, fontFamily: 'Helvetica-Bold', width: 46, textAlign: 'right' },
  grandTotalRow:  { flexDirection: 'row', padding: '5 6', backgroundColor: ORANGE },
  grandTotalLbl:  { fontSize: 8, color: '#fff', fontFamily: 'Helvetica-Bold', flex: 1 },
  grandTotalVal:  { fontSize: 8, color: '#fff', fontFamily: 'Helvetica-Bold', width: 46, textAlign: 'right' },

  // Package table
  pkgHead:  { flexDirection: 'row', backgroundColor: DARK, borderRightWidth: 1, borderColor: BORDER },
  pkgHcell: { color: '#fff', fontSize: 6.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', padding: '4 6', borderRightWidth: 1, borderColor: '#374151' },
  pkgRow:   { flexDirection: 'row', borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER },
  pkgCell:  { fontSize: 7.5, color: DARK, padding: '5 6', borderRightWidth: 1, borderColor: BORDER },

  // Footer grid
  footRow:  { flexDirection: 'row' },
  footCell: { flex: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER, padding: '5 6' },
  footLbl:  { fontSize: 6, color: GREY, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  footVal:  { fontSize: 7.5, color: DARK, fontFamily: 'Helvetica-Bold' },

  sigBlock: { margin: '14 24 0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  sigLeft:  { flex: 1 },
  sigCo:    { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 2 },
  sigLine2: { fontSize: 6.5, color: GREY, marginBottom: 1 },
  sigRight: { alignItems: 'center', width: 130 },
  sigBox:   { borderTopWidth: 1, borderColor: DARK, paddingTop: 4, width: 120, textAlign: 'center' },
  sigTxt:   { fontSize: 7, fontFamily: 'Helvetica-Bold', color: DARK },
  sigSub:   { fontSize: 6, color: GREY, marginTop: 2 },

  bottomBar: { margin: '10 24 0', flexDirection: 'row', borderWidth: 1, borderColor: BORDER },
  bbCell:    { flex: 1, padding: '4 6', borderRightWidth: 1, borderColor: BORDER },
  bbCellLast:{ flex: 2, padding: '4 6' },
})

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
}

export default function LRPDF(p: LRPDFProps) {
  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View>
            <Text style={s.logo}>BAGDROP</Text>
            <Text style={s.logoSub}>Aviation Infrastructure &amp; Baggage Logistics</Text>
          </View>
          <View style={s.titleC}>
            <Text style={s.titleTxt}>Consignment Note</Text>
            <Text style={s.titleSub}>At Owner&apos;s Risk</Text>
          </View>
          <View>
            <Text style={s.gcLabel}>GC No.</Text>
            <Text style={s.gcValue}>{p.lrNumber}</Text>
            <Text style={s.gcDate}>Date: {fmtDate(p.lrDate)}</Text>
          </View>
        </View>

        {/* ── Company strip ── */}
        <View style={s.coStrip}>
          <View>
            <Text style={s.coLine}>{LR_COMPANY.name}</Text>
            <Text style={s.coLine}>{LR_COMPANY.addressLine1}, {LR_COMPANY.addressLine2}</Text>
          </View>
          <View>
            <Text style={s.coLine}>Tel: {LR_COMPANY.phone}  ·  {LR_COMPANY.email}</Text>
            <Text style={s.coLine}>{LR_COMPANY.web}</Text>
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
                <Text style={s.cellVal}>{LR_COMPANY.gstin}</Text>
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

            {/* ── Consignor / Consignee + Charges ledger ── */}
            <View style={s.row}>
              <View style={{ flex: 2.4 }}>
                <View style={s.row}>
                  <View style={[s.sectionHead, { flex: 1 }]}><Text style={s.sectionHeadTxt}>Consignor&apos;s Name &amp; Address</Text></View>
                  <View style={[s.sectionHead, { flex: 1, borderRightWidth: 0 }]}><Text style={s.sectionHeadTxt}>Consignee&apos;s Name &amp; Address</Text></View>
                </View>
                <View style={s.row}>
                  <View style={[s.partyBox, { flex: 1 }]}>
                    <Text style={s.partyName}>{p.consignorName ?? '—'}</Text>
                    {p.consignorAddress ? <Text style={s.partyLine}>{p.consignorAddress}</Text> : null}
                    {p.consignorMobile ? <Text style={s.partyLine}>Mobile: {p.consignorMobile}</Text> : null}
                    <Text style={s.partyLine}>GSTIN: {p.consignorGstin ?? '—'}</Text>
                  </View>
                  <View style={[s.partyBox, { flex: 1, borderRightWidth: 0 }]}>
                    <Text style={s.partyName}>{p.consigneeName ?? '—'}</Text>
                    {p.consigneeAddress ? <Text style={s.partyLine}>{p.consigneeAddress}</Text> : null}
                    {p.consigneeMobile ? <Text style={s.partyLine}>Mobile: {p.consigneeMobile}</Text> : null}
                    <Text style={s.partyLine}>GSTIN: {p.consigneeGstin ?? '—'}</Text>
                  </View>
                </View>
              </View>

              {/* Charges ledger */}
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
                  <Text style={s.grandTotalVal}>₹{fmtRs(p.totalAmount)}</Text>
                </View>
              </View>
            </View>

            {/* ── Billed To / Delivery Address ── */}
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
                <Text style={s.partyLine}>{p.deliveryAddress ?? '—'}</Text>
              </View>
            </View>

            {/* ── Invoice / Value / E-way / Mode ── */}
            <View style={s.row}>
              <View style={[s.cell, { flex: 1 }]}>
                <Text style={s.cellLbl}>Invoice No.</Text>
                <Text style={s.cellVal}>{p.invoiceNumber ?? '—'}</Text>
              </View>
              <View style={[s.cell, { flex: 1 }]}>
                <Text style={s.cellLbl}>Value</Text>
                <Text style={s.cellVal}>{p.invoiceValue != null ? '₹' + fmtRs(p.invoiceValue) : '—'}</Text>
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

            {/* ── Packages table ── */}
            <View style={s.pkgHead}>
              <Text style={[s.pkgHcell, { flex: 0.7 }]}>Pkgs</Text>
              <Text style={[s.pkgHcell, { flex: 1.8 }]}>Content</Text>
              <Text style={[s.pkgHcell, { flex: 1 }]}>A Weight</Text>
              <Text style={[s.pkgHcell, { flex: 1 }]}>C Weight</Text>
              <Text style={[s.pkgHcell, { flex: 1.4 }]}>Size (L×W×H)</Text>
              <Text style={[s.pkgHcell, { flex: 1.2, borderRightWidth: 0 }]}>Private Mark</Text>
            </View>
            <View style={s.pkgRow}>
              <Text style={[s.pkgCell, { flex: 0.7 }]}>{p.totalBags ?? 1}</Text>
              <Text style={[s.pkgCell, { flex: 1.8 }]}>{p.contentDescription ?? '—'}</Text>
              <Text style={[s.pkgCell, { flex: 1 }]}>{p.actualWeight != null ? `${p.actualWeight} kg` : '—'}</Text>
              <Text style={[s.pkgCell, { flex: 1 }]}>{p.chargeableWeight != null ? `${p.chargeableWeight} kg` : '—'}</Text>
              <Text style={[s.pkgCell, { flex: 1.4 }]}>
                {p.sizeL != null && p.sizeW != null && p.sizeH != null ? `${p.sizeL} × ${p.sizeW} × ${p.sizeH}` : '—'}
              </Text>
              <Text style={[s.pkgCell, { flex: 1.2, borderRightWidth: 0 }]}>{p.privateMark ?? '—'}</Text>
            </View>

            {/* ── Insurance / GST Payable / Payment Terms / LR Type ── */}
            <View style={s.footRow}>
              <View style={s.footCell}>
                <Text style={s.footLbl}>Material Insured By Customer</Text>
                <Text style={s.footVal}>{p.insuranceByCustomer ? 'Yes' : 'No'}</Text>
              </View>
              <View style={s.footCell}>
                <Text style={s.footLbl}>GST Payable By</Text>
                <Text style={s.footVal}>{p.gstPayableBy ?? '—'}</Text>
              </View>
              <View style={s.footCell}>
                <Text style={s.footLbl}>Payment Terms</Text>
                <Text style={s.footVal}>{p.paymentTerms ?? '—'}</Text>
              </View>
              <View style={[s.footCell, { borderRightWidth: 1 }]}>
                <Text style={s.footLbl}>LR Type</Text>
                <Text style={s.footVal}>{p.lrType ?? '—'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Signature block ── */}
        <View style={s.sigBlock}>
          <View style={s.sigLeft}>
            <Text style={s.sigCo}>For {LR_COMPANY.name}</Text>
            <Text style={s.sigLine2}>Prepared By: {p.preparedBy ?? 'admin'}</Text>
          </View>
          <View style={s.sigRight}>
            <View style={s.sigBox}>
              <Text style={s.sigTxt}>Authorized Signatory</Text>
              <Text style={s.sigSub}>For {LR_COMPANY.shortName}</Text>
            </View>
          </View>
        </View>

        {/* ── Delivery At / Remarks ── */}
        <View style={s.bottomBar}>
          <View style={s.bbCell}>
            <Text style={s.footLbl}>Delivery At</Text>
            <Text style={s.footVal}>{p.deliveryAt ?? '—'}</Text>
          </View>
          <View style={s.bbCellLast}>
            <Text style={s.footLbl}>Remarks</Text>
            <Text style={s.footVal}>{p.remarks ?? '—'}</Text>
          </View>
        </View>

      </Page>
    </Document>
  )
}
