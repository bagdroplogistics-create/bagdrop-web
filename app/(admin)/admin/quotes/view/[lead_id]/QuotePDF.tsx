import {
  Document, Page, Text, View, StyleSheet, Image,
} from '@react-pdf/renderer'

const ORANGE = '#f97316'
const DARK   = '#111827'
const GREY   = '#6b7280'
const LIGHT  = '#f9fafb'
const AMBER  = '#fff7ed'

const s = StyleSheet.create({
  page:      { fontFamily: 'Helvetica', backgroundColor: '#fff', paddingBottom: 40 },

  // Header
  header:    { backgroundColor: ORANGE, padding: '20 28', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo:      { color: '#fff', fontSize: 22, fontFamily: 'Helvetica-Bold', letterSpacing: -0.5 },
  logoSub:   { color: 'rgba(255,255,255,0.75)', fontSize: 7, letterSpacing: 1.5, marginTop: 2, textTransform: 'uppercase' },
  qnLabel:   { color: 'rgba(255,255,255,0.75)', fontSize: 7, letterSpacing: 1.5, textAlign: 'right', textTransform: 'uppercase' },
  qnValue:   { color: '#fff', fontSize: 18, fontFamily: 'Helvetica-Bold', textAlign: 'right', marginTop: 2 },
  qnDate:    { color: 'rgba(255,255,255,0.8)', fontSize: 8, textAlign: 'right', marginTop: 2 },

  // Meta strip
  strip:     { backgroundColor: AMBER, borderBottomWidth: 1, borderBottomColor: '#fed7aa', padding: '6 28', flexDirection: 'row', gap: 20 },
  stripKey:  { color: '#9a3412', fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8 },
  stripVal:  { color: DARK, fontSize: 8, fontFamily: 'Helvetica-Bold', marginTop: 1 },

  // Body
  body:      { padding: '16 28 0' },
  row2:      { flexDirection: 'row', gap: 12, marginBottom: 12 },

  // Cards
  card:      { flex: 1, backgroundColor: LIGHT, borderRadius: 6, padding: '10 12', borderLeftWidth: 3, borderLeftColor: ORANGE },
  cardDark:  { flex: 1, backgroundColor: LIGHT, borderRadius: 6, padding: '10 12', borderLeftWidth: 3, borderLeftColor: DARK },
  cardLbl:   { color: GREY, fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 },
  custName:  { color: DARK, fontSize: 14, fontFamily: 'Helvetica-Bold' },
  custSub:   { color: '#4b5563', fontSize: 9, marginTop: 2 },

  // Journey
  jtRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  jtCity:    { color: DARK, fontSize: 12, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', textAlign: 'center' },
  jtLbl:     { color: GREY, fontSize: 7, textAlign: 'center', marginBottom: 2 },
  jtLine:    { flex: 1, borderBottomWidth: 1, borderBottomColor: '#d1d5db', marginHorizontal: 6 },
  jtPlane:   { color: GREY, fontSize: 10 },
  jtGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: '3 12' },
  jtItem:    { fontSize: 8, color: '#4b5563', width: '48%' },
  jtItemKey: { color: GREY },
  jtItemVal: { fontFamily: 'Helvetica-Bold' },

  // Table
  tableHead: { flexDirection: 'row', backgroundColor: DARK, borderRadius: '4 4 0 0', padding: '7 10' },
  tableHcell:{ color: '#fff', fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow:  { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', padding: '8 10', alignItems: 'flex-start' },
  tableCell: { fontSize: 9, color: '#374151' },
  tableDesc: { fontSize: 8, color: GREY, marginTop: 2 },
  cellIdx:   { width: 20 },
  cellDesc:  { flex: 1 },
  cellQty:   { width: 35, textAlign: 'center' },
  cellRate:  { width: 65, textAlign: 'right' },
  cellTax:   { width: 45, textAlign: 'center' },
  cellAmt:   { width: 70, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: DARK },

  // Totals + Payment row
  tpRow:     { flexDirection: 'row', gap: 12, padding: '10 28 16' },
  payBox:    { flex: 1, backgroundColor: LIGHT, borderRadius: 6, padding: '10 12' },
  payLbl:    { color: GREY, fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  payRow:    { flexDirection: 'row', marginBottom: 3 },
  payKey:    { color: GREY, fontSize: 8, width: 60 },
  payVal:    { color: DARK, fontSize: 8, fontFamily: 'Helvetica-Bold', flex: 1 },
  upiBox:    { backgroundColor: AMBER, borderWidth: 1, borderColor: '#fed7aa', borderRadius: 4, padding: '4 8', marginTop: 4 },
  upiText:   { color: DARK, fontSize: 9, fontFamily: 'Helvetica-Bold' },

  totalsBox: { flex: 1 },
  totRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  totKey:    { color: GREY, fontSize: 9 },
  totVal:    { color: DARK, fontSize: 9 },
  totDivider:{ borderTopWidth: 2, borderTopColor: DARK, paddingTop: 6, marginTop: 4 },
  grandKey:  { color: DARK, fontSize: 11, fontFamily: 'Helvetica-Bold' },
  grandVal:  { color: ORANGE, fontSize: 15, fontFamily: 'Helvetica-Bold' },
  amtWords:  { backgroundColor: AMBER, borderWidth: 1, borderColor: '#fed7aa', borderRadius: 4, padding: '5 8', marginTop: 6 },
  amtWLabel: { color: '#9a3412', fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  amtWText:  { color: DARK, fontSize: 8, fontFamily: 'Helvetica-Oblique' },

  // Notes
  notesBox:  { margin: '0 28 10', backgroundColor: LIGHT, borderRadius: 6, padding: '8 12', borderLeftWidth: 3, borderLeftColor: ORANGE },
  notesLbl:  { color: GREY, fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  notesText: { color: '#374151', fontSize: 9 },

  // T&C
  tcSection: { margin: '0 28 10', borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 10 },
  tcTitle:   { color: '#374151', fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  tcGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: '3 12' },
  tcItem:    { flexDirection: 'row', gap: 3, width: '48%' },
  tcNum:     { color: ORANGE, fontSize: 8, fontFamily: 'Helvetica-Bold', width: 10 },
  tcText:    { color: GREY, fontSize: 7.5, flex: 1, lineHeight: 1.4 },

  // Footer
  footer:    { margin: '0 28', borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  ftLeft:    { flex: 1 },
  ftCo:      { color: '#374151', fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  ftLine:    { color: GREY, fontSize: 8, marginBottom: 1 },
  ftRight:   { alignItems: 'center', width: 120 },
  sigLine:   { borderTopWidth: 1, borderTopColor: DARK, paddingTop: 5, width: 110, textAlign: 'center' },
  sigText:   { color: '#374151', fontSize: 8, fontFamily: 'Helvetica-Bold' },
  sigSub:    { color: GREY, fontSize: 7, marginTop: 2 },
})

function fmtRs(n: number | null | undefined) {
  if (n == null) return '—'
  return '₹ ' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  try {
    return new Date(d.includes('T') ? d : d + 'T00:00:00')
      .toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return d }
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

const TC_ITEMS = [
  'All bookings confirmed on receipt of full payment. A CN number will be issued.',
  'Only services mentioned above are included. Company reserves the right to cancel.',
  'Luggage must not contain items prohibited by law. All bags processed through Govt. screening.',
  'Cancellation (Mumbai): ≥5 days full refund. All other: ≥7 days.',
  'Bagdrop is not liable for loss/damage during transit. Carry essential documents personally.',
  'Rates subject to change without prior notice and subject to availability at booking.',
]

export interface QuotePDFProps {
  quoteNumber:   string
  quoteDate:     string | null
  expiryDate:    string | null
  leadNumber:    string
  salesperson:   string | null
  agentName:     string | null
  // Customer
  customerName:  string
  customerPhone: string
  customerEmail: string | null
  // Journey
  fromCity:      string | null
  toCity:        string | null
  bagsCount:     number | null
  pickupDate:    string | null
  pickupTime:    string | null
  deliveryDate:  string | null
  flightNumber:  string | null
  pnr:           string | null
  pickupAddress: string | null
  dropAddress:   string | null
  // Items
  lineItems: { name: string; description: string; quantity: number; rate: number; tax_pct: number; amount: number }[]
  subtotal:  number
  tax:       number
  total:     number
  // Notes / Terms
  notes: string | null
  terms: string | null
}

export default function QuotePDF(p: QuotePDFProps) {
  const meta = [
    { label: 'GSTIN',      value: '24BDMPS7461P1ZM' },
    { label: 'SAC Code',   value: '996511' },
    { label: 'Lead #',     value: p.leadNumber },
    ...(p.salesperson ? [{ label: 'Salesperson', value: p.salesperson }] : []),
    ...(p.agentName   ? [{ label: 'Agent',       value: p.agentName   }] : []),
  ]

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View>
            <Text style={s.logo}>BAGDROP</Text>
            <Text style={s.logoSub}>India&apos;s Digital Baggage Infrastructure</Text>
          </View>
          <View>
            <Text style={s.qnLabel}>Service Estimate</Text>
            <Text style={s.qnValue}>{p.quoteNumber}</Text>
            <Text style={s.qnDate}>
              Date: {fmtDate(p.quoteDate)}
              {p.expiryDate ? `  ·  Valid till: ${fmtDate(p.expiryDate)}` : ''}
            </Text>
          </View>
        </View>

        {/* ── Meta strip ── */}
        <View style={s.strip}>
          {meta.map(m => (
            <View key={m.label}>
              <Text style={s.stripKey}>{m.label}</Text>
              <Text style={s.stripVal}>{m.value}</Text>
            </View>
          ))}
        </View>

        {/* ── Bill To + Journey ── */}
        <View style={[s.body, { marginBottom: 0 }]}>
          <View style={s.row2}>
            {/* Bill To */}
            <View style={s.card}>
              <Text style={s.cardLbl}>Bill To</Text>
              <Text style={s.custName}>{p.customerName}</Text>
              <Text style={s.custSub}>{p.customerPhone}</Text>
              {p.customerEmail ? <Text style={[s.custSub, { fontSize: 8 }]}>{p.customerEmail}</Text> : null}
            </View>

            {/* Journey */}
            <View style={s.cardDark}>
              <Text style={s.cardLbl}>Journey Details</Text>
              <View style={s.jtRow}>
                <View>
                  <Text style={s.jtLbl}>From</Text>
                  <Text style={s.jtCity}>{p.fromCity ?? '—'}</Text>
                </View>
                <View style={s.jtLine} />
                <Text style={s.jtPlane}>✈</Text>
                <View style={s.jtLine} />
                <View>
                  <Text style={s.jtLbl}>To</Text>
                  <Text style={s.jtCity}>{p.toCity ?? '—'}</Text>
                </View>
              </View>
              <View style={s.jtGrid}>
                <Text style={s.jtItem}><Text style={s.jtItemKey}>Pickup: </Text><Text style={s.jtItemVal}>{fmtDate(p.pickupDate)}</Text></Text>
                {p.pickupTime ? <Text style={s.jtItem}><Text style={s.jtItemKey}>Time: </Text><Text style={s.jtItemVal}>{p.pickupTime}</Text></Text> : null}
                <Text style={s.jtItem}><Text style={s.jtItemKey}>Delivery: </Text><Text style={s.jtItemVal}>{fmtDate(p.deliveryDate)}</Text></Text>
                <Text style={s.jtItem}><Text style={s.jtItemKey}>Bags: </Text><Text style={s.jtItemVal}>{p.bagsCount ?? '—'}</Text></Text>
                {(p.flightNumber || p.pnr) ? (
                  <Text style={[s.jtItem, { width: '100%' }]}><Text style={s.jtItemKey}>Flight: </Text><Text style={s.jtItemVal}>{p.flightNumber ?? ''}{p.pnr ? ` / ${p.pnr}` : ''}</Text></Text>
                ) : null}
              </View>
            </View>
          </View>

          {/* Addresses */}
          {(p.pickupAddress || p.dropAddress) ? (
            <View style={[s.row2, { marginBottom: 10 }]}>
              {p.pickupAddress ? (
                <View style={{ flex: 1, backgroundColor: LIGHT, borderRadius: 6, padding: '8 10' }}>
                  <Text style={[s.cardLbl, { marginBottom: 3 }]}>Pickup Address</Text>
                  <Text style={{ fontSize: 8, color: '#374151' }}>{p.pickupAddress}</Text>
                </View>
              ) : <View style={{ flex: 1 }} />}
              {p.dropAddress ? (
                <View style={{ flex: 1, backgroundColor: LIGHT, borderRadius: 6, padding: '8 10' }}>
                  <Text style={[s.cardLbl, { marginBottom: 3 }]}>Delivery Address</Text>
                  <Text style={{ fontSize: 8, color: '#374151' }}>{p.dropAddress}</Text>
                </View>
              ) : <View style={{ flex: 1 }} />}
            </View>
          ) : null}
        </View>

        {/* ── Line Items ── */}
        <View style={{ margin: '0 28 0' }}>
          {/* Table header */}
          <View style={s.tableHead}>
            <Text style={[s.tableHcell, s.cellIdx]}>#</Text>
            <Text style={[s.tableHcell, s.cellDesc]}>Description</Text>
            <Text style={[s.tableHcell, s.cellQty]}>Qty</Text>
            <Text style={[s.tableHcell, s.cellRate]}>Rate</Text>
            <Text style={[s.tableHcell, s.cellTax]}>Tax</Text>
            <Text style={[s.tableHcell, s.cellAmt, { color: '#fff' }]}>Amount</Text>
          </View>
          {p.lineItems.map((li, idx) => (
            <View key={idx} style={s.tableRow}>
              <Text style={[s.tableCell, s.cellIdx, { color: GREY }]}>{idx + 1}</Text>
              <View style={s.cellDesc}>
                <Text style={[s.tableCell, { fontFamily: 'Helvetica-Bold' }]}>{li.name}</Text>
                {li.description ? <Text style={s.tableDesc}>{li.description}</Text> : null}
              </View>
              <Text style={[s.tableCell, s.cellQty]}>{li.quantity}</Text>
              <Text style={[s.tableCell, s.cellRate]}>{fmtRs(li.rate)}</Text>
              <Text style={[s.tableCell, s.cellTax, { fontSize: 8 }]}>GST {li.tax_pct ?? 5}%</Text>
              <Text style={[s.tableCell, s.cellAmt]}>{fmtRs(li.amount)}</Text>
            </View>
          ))}
        </View>

        {/* ── Payment + Totals ── */}
        <View style={s.tpRow}>
          {/* Payment */}
          <View style={s.payBox}>
            <Text style={s.payLbl}>Payment Details</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <View style={s.payRow}><Text style={s.payKey}>Bank:</Text><Text style={s.payVal}>Indian Overseas Bank</Text></View>
                <View style={s.payRow}><Text style={s.payKey}>A/C No:</Text><Text style={s.payVal}>171702000001297</Text></View>
                <View style={s.payRow}><Text style={s.payKey}>IFSC:</Text><Text style={s.payVal}>IOBA0001717</Text></View>
                <View style={s.payRow}><Text style={s.payKey}>Branch:</Text><Text style={s.payVal}>Gotri Road, Vadodara</Text></View>
                <View style={s.upiBox}>
                  <Text style={s.upiText}>UPI: BAGDROP1717@IOB</Text>
                </View>
              </View>
              <View style={{ alignItems: 'center', justifyContent: 'flex-end' }}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image
                  src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=upi%3A%2F%2Fpay%3Fpa%3DBAGDROP1717%40IOB%26pn%3DBagdrop%26cu%3DINR"
                  style={{ width: 78, height: 78, borderRadius: 4 }}
                />
                <Text style={{ fontSize: 7, color: GREY, marginTop: 3, textAlign: 'center' }}>Scan to Pay</Text>
              </View>
            </View>
          </View>

          {/* Totals */}
          <View style={s.totalsBox}>
            <View style={s.totRow}><Text style={s.totKey}>Sub Total</Text><Text style={s.totVal}>{fmtRs(p.subtotal)}</Text></View>
            <View style={s.totRow}><Text style={s.totKey}>CGST @ 2.5%</Text><Text style={s.totVal}>{fmtRs(p.tax / 2)}</Text></View>
            <View style={s.totRow}><Text style={s.totKey}>SGST @ 2.5%</Text><Text style={s.totVal}>{fmtRs(p.tax / 2)}</Text></View>
            <View style={[s.totRow, s.totDivider]}>
              <Text style={s.grandKey}>Total Amount</Text>
              <Text style={s.grandVal}>{fmtRs(p.total)}</Text>
            </View>
            {p.total > 0 && (
              <View style={s.amtWords}>
                <Text style={s.amtWLabel}>Amount in Words</Text>
                <Text style={s.amtWText}>{toWords(p.total)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Notes ── */}
        {p.notes ? (
          <View style={s.notesBox}>
            <Text style={s.notesLbl}>Notes</Text>
            <Text style={s.notesText}>{p.notes}</Text>
          </View>
        ) : null}

        {/* ── T&C ── */}
        <View style={s.tcSection}>
          <Text style={s.tcTitle}>Terms &amp; Conditions</Text>
          <View style={s.tcGrid}>
            {(p.terms
              ? p.terms.split('\n').filter(Boolean).map((t, i) => ({ num: i + 1, text: t }))
              : TC_ITEMS.map((t, i) => ({ num: i + 1, text: t }))
            ).map(tc => (
              <View key={tc.num} style={s.tcItem}>
                <Text style={s.tcNum}>{tc.num}.</Text>
                <Text style={s.tcText}>{tc.text}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={s.footer}>
          <View style={s.ftLeft}>
            <Text style={s.ftCo}>BAGDROP LOGISTICS SOLUTIONS PVT. LTD.</Text>
            <Text style={s.ftLine}>TF-302, Ananta Stallion, Gotri Sevasi Road, Vadodara – 391101</Text>
            <Text style={s.ftLine}>GSTIN: 24BDMPS7461P1ZM  ·  CIN: U63090GJ2023PTC142601</Text>
            <Text style={s.ftLine}>📞 63 5711 5711  ·  info@bagdrop.co  ·  bagdrop.co</Text>
          </View>
          <View style={s.ftRight}>
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
