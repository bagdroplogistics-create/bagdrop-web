import {
  Document, Page, Text, View, StyleSheet,
} from '@react-pdf/renderer'

const ORANGE = '#f97316'
const DARK   = '#111827'
const GREY   = '#6b7280'
const LIGHT  = '#f9fafb'
const AMBER  = '#fff7ed'
const GREEN  = '#16a34a'
const RED    = '#dc2626'

const s = StyleSheet.create({
  page:      { fontFamily: 'Helvetica', backgroundColor: '#fff', paddingBottom: 40, fontSize: 9 },

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
  custName:  { color: DARK, fontSize: 13, fontFamily: 'Helvetica-Bold' },
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

  // Section title
  secTitle:  { color: DARK, fontSize: 9, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.6, margin: '0 28 6' },

  // Ops grid
  opsGrid:   { margin: '0 28 12', backgroundColor: LIGHT, borderRadius: 6, padding: '10 12', flexDirection: 'row', flexWrap: 'wrap', gap: '6 14' },
  opsItem:   { fontSize: 8, color: '#4b5563', width: '31%' },
  opsKey:    { color: GREY, fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.4 },
  opsVal:    { fontFamily: 'Helvetica-Bold', color: DARK, fontSize: 9, marginTop: 1 },

  // Status badge
  badge:     { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, fontSize: 8, fontFamily: 'Helvetica-Bold' },

  // Table
  tableHead: { flexDirection: 'row', backgroundColor: DARK, borderRadius: '4 4 0 0', padding: '7 10' },
  tableHcell:{ color: '#fff', fontSize: 7.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow:  { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', padding: '7 10', alignItems: 'flex-start' },
  tableCell: { fontSize: 8, color: '#374151' },
  cellType:  { flex: 1.2 },
  cellRoute: { flex: 1.4 },
  cellVendor:{ flex: 1 },
  cellStat:  { width: 55, textAlign: 'center' },
  cellEst:   { width: 55, textAlign: 'right' },
  cellAct:   { width: 60, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: DARK },

  // Totals + Payment row
  tpRow:     { flexDirection: 'row', gap: 12, padding: '10 28 16' },
  payBox:    { flex: 1, backgroundColor: LIGHT, borderRadius: 6, padding: '10 12' },
  payLbl:    { color: GREY, fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  payRow:    { flexDirection: 'row', marginBottom: 3 },
  payKey:    { color: GREY, fontSize: 8, width: 90 },
  payVal:    { color: DARK, fontSize: 8, fontFamily: 'Helvetica-Bold', flex: 1 },

  totalsBox: { flex: 1 },
  totRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  totKey:    { color: GREY, fontSize: 9 },
  totVal:    { color: DARK, fontSize: 9 },
  totDivider:{ borderTopWidth: 2, borderTopColor: DARK, paddingTop: 6, marginTop: 4 },
  grandKey:  { color: DARK, fontSize: 11, fontFamily: 'Helvetica-Bold' },
  grandVal:  { fontSize: 15, fontFamily: 'Helvetica-Bold' },

  // Notes
  notesBox:  { margin: '0 28 10', backgroundColor: LIGHT, borderRadius: 6, padding: '8 12', borderLeftWidth: 3, borderLeftColor: ORANGE },
  notesLbl:  { color: GREY, fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  notesText: { color: '#374151', fontSize: 9 },

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

const TRIP_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  created:          { label: 'Confirmed',         color: '#2563eb', bg: '#dbeafe' },
  pickup_assigned:  { label: 'Pickup Assigned',   color: '#d97706', bg: '#fef3c7' },
  picked_up:        { label: 'Picked Up',         color: '#7c3aed', bg: '#ede9fe' },
  in_transit:       { label: 'In Transit',        color: '#2563eb', bg: '#dbeafe' },
  at_airport:       { label: 'At Airport',        color: '#0891b2', bg: '#cffafe' },
  out_for_delivery: { label: 'Out for Delivery',  color: '#ea580c', bg: '#ffedd5' },
  delivered:        { label: 'Delivered',         color: '#16a34a', bg: '#dcfce7' },
  completed:        { label: 'Completed',         color: '#15803d', bg: '#bbf7d0' },
  cancelled:        { label: 'Cancelled',         color: '#dc2626', bg: '#fee2e2' },
}

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

export interface TripExpenseItem {
  expense_type:   string
  mode:           string | null
  from_location:  string | null
  to_location:    string | null
  vendor:         string | null
  description:    string | null
  estimated_cost: number
  actual_cost:    number
  payment_status: string
}

export interface TripSheetPDFProps {
  tripNumber:        string
  createdAt:         string | null
  status:            string
  bookingId:         string | null
  // Customer
  customerName:      string | null
  customerPhone:     string | null
  customerEmail:     string | null
  // Route
  fromCity:          string | null
  toCity:            string | null
  pickupAddress:     string | null
  dropAddress:       string | null
  pickupDate:        string | null
  deliveryDate:      string | null
  totalBags:         number | null
  serviceLabel:      string | null
  // Operations
  vendor:            string | null
  driverName:        string | null
  vehicleNumber:     string | null
  consignmentNumber: string | null
  luggageCode:       string | null
  cloakRoomNumber:   string | null
  pickupPerson:      string | null
  pickupContact:     string | null
  deliveryPerson:    string | null
  deliveryContact:   string | null
  // Expenses
  expenses:          TripExpenseItem[]
  // P&L
  quoteAmount:       number
  additionalCharges: number
  discount:          number
  taxAmount:         number
  totalIncome:       number
  totalExpense:      number
  netProfit:         number
  paymentStatus:     string | null
  // Notes
  notes:             string | null
  remarks:           string | null
}

export default function TripSheetPDF(p: TripSheetPDFProps) {
  const st = TRIP_STATUS[p.status] ?? { label: p.status, color: '#6b7280', bg: '#f3f4f6' }
  const profitPositive = p.netProfit >= 0

  const opsFields: { key: string; val: string }[] = [
    { key: 'Vendor',              val: p.vendor ?? '—' },
    { key: 'Driver',               val: p.driverName ?? '—' },
    { key: 'Vehicle Number',       val: p.vehicleNumber ?? '—' },
    { key: 'Consignment No.',      val: p.consignmentNumber ?? '—' },
    { key: 'Luggage Code',         val: p.luggageCode ?? '—' },
    { key: 'Cloak Room No.',       val: p.cloakRoomNumber ?? '—' },
    { key: 'Pickup Person',        val: p.pickupPerson ? `${p.pickupPerson}${p.pickupContact ? ' · ' + p.pickupContact : ''}` : '—' },
    { key: 'Delivery Person',      val: p.deliveryPerson ? `${p.deliveryPerson}${p.deliveryContact ? ' · ' + p.deliveryContact : ''}` : '—' },
    { key: 'Payment Status',       val: p.paymentStatus ?? '—' },
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
            <Text style={s.qnLabel}>Trip Sheet</Text>
            <Text style={s.qnValue}>{p.tripNumber}</Text>
            <Text style={s.qnDate}>Created: {fmtDate(p.createdAt)}</Text>
          </View>
        </View>

        {/* ── Meta strip ── */}
        <View style={s.strip}>
          <View>
            <Text style={s.stripKey}>Status</Text>
            <Text style={[s.stripVal, { color: st.color }]}>{st.label}</Text>
          </View>
          <View>
            <Text style={s.stripKey}>Service</Text>
            <Text style={s.stripVal}>{p.serviceLabel ?? '—'}</Text>
          </View>
          <View>
            <Text style={s.stripKey}>Total Bags</Text>
            <Text style={s.stripVal}>{p.totalBags ?? '—'}</Text>
          </View>
          {p.bookingId ? (
            <View>
              <Text style={s.stripKey}>Booking Ref</Text>
              <Text style={s.stripVal}>{p.bookingId.slice(0, 8).toUpperCase()}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Customer + Journey ── */}
        <View style={[s.body, { marginBottom: 0 }]}>
          <View style={s.row2}>
            <View style={s.card}>
              <Text style={s.cardLbl}>Customer</Text>
              <Text style={s.custName}>{p.customerName ?? '—'}</Text>
              <Text style={s.custSub}>{p.customerPhone ?? ''}</Text>
              {p.customerEmail ? <Text style={[s.custSub, { fontSize: 8 }]}>{p.customerEmail}</Text> : null}
            </View>

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
                <Text style={s.jtItem}><Text style={s.jtItemKey}>Delivery: </Text><Text style={s.jtItemVal}>{fmtDate(p.deliveryDate)}</Text></Text>
              </View>
            </View>
          </View>

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

        {/* ── Operations ── */}
        <Text style={s.secTitle}>Operations</Text>
        <View style={s.opsGrid}>
          {opsFields.map(f => (
            <View key={f.key} style={s.opsItem}>
              <Text style={s.opsKey}>{f.key}</Text>
              <Text style={s.opsVal}>{f.val}</Text>
            </View>
          ))}
        </View>

        {/* ── Expenses ── */}
        {p.expenses.length > 0 ? (
          <>
            <Text style={s.secTitle}>Trip Expenses</Text>
            <View style={{ margin: '0 28 12' }}>
              <View style={s.tableHead}>
                <Text style={[s.tableHcell, s.cellType]}>Type</Text>
                <Text style={[s.tableHcell, s.cellRoute]}>Route / Description</Text>
                <Text style={[s.tableHcell, s.cellVendor]}>Vendor</Text>
                <Text style={[s.tableHcell, s.cellStat]}>Payment</Text>
                <Text style={[s.tableHcell, s.cellEst]}>Est.</Text>
                <Text style={[s.tableHcell, s.cellAct, { color: '#fff' }]}>Actual</Text>
              </View>
              {p.expenses.map((e, idx) => (
                <View key={idx} style={s.tableRow}>
                  <Text style={[s.tableCell, s.cellType]}>{e.expense_type}{e.mode ? ` (${e.mode})` : ''}</Text>
                  <View style={s.cellRoute}>
                    {(e.from_location || e.to_location) ? (
                      <Text style={s.tableCell}>{e.from_location ?? '—'} → {e.to_location ?? '—'}</Text>
                    ) : null}
                    {e.description ? <Text style={[s.tableCell, { fontSize: 7.5, color: GREY }]}>{e.description}</Text> : null}
                  </View>
                  <Text style={[s.tableCell, s.cellVendor]}>{e.vendor ?? '—'}</Text>
                  <Text style={[s.tableCell, s.cellStat]}>{e.payment_status}</Text>
                  <Text style={[s.tableCell, s.cellEst]}>{fmtRs(e.estimated_cost)}</Text>
                  <Text style={[s.tableCell, s.cellAct]}>{fmtRs(e.actual_cost)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* ── P&L Summary ── */}
        <View style={s.tpRow}>
          <View style={s.payBox}>
            <Text style={s.payLbl}>Income Breakdown</Text>
            <View style={s.payRow}><Text style={s.payKey}>Quote Amount:</Text><Text style={s.payVal}>{fmtRs(p.quoteAmount)}</Text></View>
            <View style={s.payRow}><Text style={s.payKey}>Additional Charges:</Text><Text style={s.payVal}>{fmtRs(p.additionalCharges)}</Text></View>
            <View style={s.payRow}><Text style={s.payKey}>Discount:</Text><Text style={[s.payVal, { color: RED }]}>− {fmtRs(p.discount)}</Text></View>
            <View style={s.payRow}><Text style={s.payKey}>Tax:</Text><Text style={s.payVal}>{fmtRs(p.taxAmount)}</Text></View>
          </View>

          <View style={s.totalsBox}>
            <View style={s.totRow}><Text style={s.totKey}>Total Income</Text><Text style={[s.totVal, { color: GREEN }]}>{fmtRs(p.totalIncome)}</Text></View>
            <View style={s.totRow}><Text style={s.totKey}>Total Expense</Text><Text style={[s.totVal, { color: RED }]}>{fmtRs(p.totalExpense)}</Text></View>
            <View style={[s.totRow, s.totDivider]}>
              <Text style={s.grandKey}>Net Profit</Text>
              <Text style={[s.grandVal, { color: profitPositive ? GREEN : RED }]}>
                {profitPositive ? '+' : ''}{fmtRs(p.netProfit)}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Notes / Remarks ── */}
        {p.notes ? (
          <View style={s.notesBox}>
            <Text style={s.notesLbl}>Notes</Text>
            <Text style={s.notesText}>{p.notes}</Text>
          </View>
        ) : null}
        {p.remarks ? (
          <View style={[s.notesBox, { borderLeftColor: DARK }]}>
            <Text style={s.notesLbl}>Remarks</Text>
            <Text style={s.notesText}>{p.remarks}</Text>
          </View>
        ) : null}

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
