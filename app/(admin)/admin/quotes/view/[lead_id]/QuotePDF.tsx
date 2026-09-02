import {
  Document, Page, Text, View, StyleSheet, Image, Svg, Rect, Line,
} from '@react-pdf/renderer'
import { fmtTimeLabel } from '@/lib/time-options'
import { LOGO_FULL_WHITE_DATA_URI, SIGNATURE_STAMP_DATA_URI } from '@/lib/quote-pdf-images'

const ORANGE = '#f97316'
const DARK   = '#111827'
// Darkened from the previous #6b7280 (Tailwind gray-500) — that read too
// light/washed-out against the white card backgrounds. #4b5563 (gray-600)
// keeps the same "muted label" role throughout the doc (card labels,
// journey sub-labels, table descriptions, payment/total keys, T&C body,
// footer lines) while meeting a noticeably better contrast ratio on white.
const GREY   = '#4b5563'
const LIGHT  = '#f9fafb'
const AMBER  = '#fff7ed'

const s = StyleSheet.create({
  // paddingBottom removed (was 40) so the new full-bleed dark footer band
  // sits flush against the true bottom edge of the page, mirroring how the
  // orange header already sits flush against the top edge.
  page:      { fontFamily: 'Helvetica', backgroundColor: '#fff' },

  // Header
  // Padding tightened 20->14 (top/bottom) as part of a document-wide spacing
  // pass to fit the whole quote on a single A4 page in the actual react-pdf
  // renderer (the browser preview has no fixed page height so it always
  // looked like one page there; the downloaded PDF was silently overflowing
  // to a second page). See matching comments throughout this stylesheet for
  // the rest of the pass.
  // Padding trimmed 14->8->6 (top/bottom) — the orange band was still
  // pushing the quote to a second page, so this went through two rounds
  // of tightening. Combined with the smaller logo below, this is now
  // meaningfully shorter than the original header.
  header:    { backgroundColor: ORANGE, padding: '6 28', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  // Logo shrunk 57x84 -> 40x59 (same ~0.677 native aspect ratio) — the
  // full-size lockup was the single biggest driver of header height and
  // was still causing the PDF to overflow onto a second page. Still the
  // full logo (icon + wordmark + tagline), just smaller, not cropped back
  // to icon-only.
  logoFull:  { width: 40, height: 59, marginBottom: 3 },
  // marginTop trimmed 5->3 to match the smaller logo above it.
  logoSub:   { color: 'rgba(255,255,255,0.92)', fontSize: 8, fontFamily: 'Helvetica-Bold', letterSpacing: 1, marginTop: 3, textTransform: 'uppercase' },
  // Label above the quote number — was "Service Estimate", now just
  // "Estimate" ("Service" removed, "Estimate" kept per founder feedback).
  qnLabel:   { color: 'rgba(255,255,255,0.8)', fontSize: 7.5, letterSpacing: 1.5, textAlign: 'right', textTransform: 'uppercase' },
  // Quotation Number — now the SMALLER of the two top-right lines (was
  // the large 18px headline).
  qnValue:   { color: 'rgba(255,255,255,0.9)', fontSize: 9.5, fontFamily: 'Helvetica-Bold', textAlign: 'right', letterSpacing: 0.4, marginTop: 2 },
  // Date — now the PROMINENT top-right line (was the small 8px line).
  qnDate:    { color: '#fff', fontSize: 18, fontFamily: 'Helvetica-Bold', textAlign: 'right', marginTop: 3 },
  qnValidTill: { color: 'rgba(255,255,255,0.85)', fontSize: 8, textAlign: 'right', marginTop: 2 },

  // Meta strip
  strip:     { backgroundColor: AMBER, borderBottomWidth: 1, borderBottomColor: '#fed7aa', padding: '5 28', flexDirection: 'row', gap: 20 },
  stripKey:  { color: '#9a3412', fontSize: 7.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8 },
  stripVal:  { color: DARK, fontSize: 8.5, fontFamily: 'Helvetica-Bold', marginTop: 1 },

  // Body
  body:      { padding: '12 28 0' },
  row2:      { flexDirection: 'row', gap: 12, marginBottom: 8 },

  // Cards
  card:      { flex: 1, backgroundColor: LIGHT, borderRadius: 6, padding: '8 12', borderLeftWidth: 3, borderLeftColor: ORANGE },
  cardDark:  { flex: 1, backgroundColor: LIGHT, borderRadius: 6, padding: '8 12', borderLeftWidth: 3, borderLeftColor: DARK },
  cardLbl:   { color: GREY, fontSize: 7.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  custName:  { color: DARK, fontSize: 14, fontFamily: 'Helvetica-Bold' },
  custSub:   { color: '#4b5563', fontSize: 9.5, marginTop: 1 },
  // Pickup/Delivery address values — bumped from 8px/regular to 11px/Bold/
  // dark per founder feedback ("these should be much more prominent");
  // the "Pickup Address"/"Delivery Address" label above is unchanged
  // (cardLbl, shared with Bill To / Journey Details labels).
  addressVal:{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: DARK },

  // Journey
  jtRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  jtCity:    { color: DARK, fontSize: 12, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', textAlign: 'center' },
  jtLbl:     { color: GREY, fontSize: 7.5, textAlign: 'center', marginBottom: 1 },
  jtLine:    { flex: 1, borderBottomWidth: 1, borderBottomColor: '#d1d5db', marginHorizontal: 6 },
  jtGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: '3 12' },
  // Pickup/Delivery are set to width:'100%' at their instance below (like
  // Flight already was) so long month names (September/November/December)
  // never wrap onto a second line within the old 48% column — Time/Bags
  // keep the original 48% two-up layout.
  jtItem:    { fontSize: 8.5, color: '#4b5563', width: '48%' },
  jtItemKey: { color: GREY },
  jtItemVal: { fontFamily: 'Helvetica-Bold' },

  // Table
  tableHead: { flexDirection: 'row', backgroundColor: DARK, borderRadius: '4 4 0 0', padding: '6 10' },
  tableHcell:{ color: '#fff', fontSize: 8.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow:  { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', padding: '6 10', alignItems: 'flex-start' },
  tableCell: { fontSize: 9.5, color: '#374151' },
  tableDesc: { fontSize: 8.5, color: GREY, marginTop: 2 },
  cellIdx:   { width: 20 },
  cellDesc:  { flex: 1 },
  cellQty:   { width: 35, textAlign: 'center' },
  cellRate:  { width: 65, textAlign: 'right' },
  cellTax:   { width: 45, textAlign: 'center' },
  cellAmt:   { width: 70, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: DARK },

  // Totals + Payment row
  tpRow:     { flexDirection: 'row', gap: 12, padding: '8 28 12' },
  payBox:    { flex: 1, backgroundColor: LIGHT, borderRadius: 6, padding: '8 12' },
  payLbl:    { color: GREY, fontSize: 7.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 },
  payRow:    { flexDirection: 'row', marginBottom: 2 },
  payKey:    { color: GREY, fontSize: 8.5, width: 60 },
  payVal:    { color: DARK, fontSize: 8.5, fontFamily: 'Helvetica-Bold', flex: 1 },
  upiBox:    { backgroundColor: AMBER, borderWidth: 1, borderColor: '#fed7aa', borderRadius: 4, padding: '3 8', marginTop: 3 },
  upiText:   { color: DARK, fontSize: 9.5, fontFamily: 'Helvetica-Bold' },

  totalsBox: { flex: 1 },
  totRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  totKey:    { color: GREY, fontSize: 9.5 },
  totVal:    { color: DARK, fontSize: 9.5 },
  totDivider:{ borderTopWidth: 2, borderTopColor: DARK, paddingTop: 5, marginTop: 3 },
  grandKey:  { color: DARK, fontSize: 11, fontFamily: 'Helvetica-Bold' },
  grandVal:  { color: ORANGE, fontSize: 15, fontFamily: 'Helvetica-Bold' },
  amtWords:  { backgroundColor: AMBER, borderWidth: 1, borderColor: '#fed7aa', borderRadius: 4, padding: '4 8', marginTop: 4 },
  amtWLabel: { color: '#9a3412', fontSize: 7.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  amtWText:  { color: DARK, fontSize: 8.5, fontFamily: 'Helvetica-Oblique' },

  // Notes
  notesBox:  { margin: '0 28 6', backgroundColor: LIGHT, borderRadius: 6, padding: '5 12', borderLeftWidth: 3, borderLeftColor: ORANGE },
  notesLbl:  { color: GREY, fontSize: 7.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  notesText: { color: '#374151', fontSize: 9.5 },

  // Pick Up Date/Time — sits directly below Pickup/Delivery Address,
  // styled like every other info card in the doc (LIGHT bg, orange left
  // border, DARK/GREY text) — no blue, matches the existing palette.
  pickupBox:    { margin: '0 28 6', backgroundColor: LIGHT, borderRadius: 6, padding: '6 12', borderLeftWidth: 3, borderLeftColor: ORANGE, flexDirection: 'row', flexWrap: 'wrap', gap: '2 16' },
  pickupItem:   { fontSize: 9, color: GREY },
  pickupItemVal:{ fontFamily: 'Helvetica-Bold', color: DARK },

  // T&C
  tcSection: { margin: '0 28 6', borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 6 },
  tcTitle:   { color: '#374151', fontSize: 8.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  tcGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: '2 12' },
  tcItem:    { flexDirection: 'row', gap: 3, width: '48%' },
  // width widened from 10 → 16 so two-digit numbers ("10.") don't wrap/hyphenate
  // onto a second line the way "1." through "9." fit fine at the old width.
  tcNum:     { color: ORANGE, fontSize: 8, fontFamily: 'Helvetica-Bold', width: 16 },
  tcText:    { color: GREY, fontSize: 7.5, flex: 1, lineHeight: 1.3 },

  // Return Trip — Journey 1 / Journey 2 labels + combined summary. Only
  // rendered when returnLineItems is passed (Trip Type = Return Trip);
  // one-way quotes never touch these styles.
  journeyLabel: { color: '#7c3aed', fontSize: 8.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  tripSummary:  { margin: '10 28 0', backgroundColor: LIGHT, borderRadius: 6, padding: '10 14' },

  // Footer
  // Was a full-bleed dark navy band (#0A1628) — reverted to a plain white
  // footer with just a light top border for separation, because the
  // signature-stamp.png (dark navy ink on a transparent background) was
  // nearly invisible against that dark band. Text/border colors below were
  // dark-on-dark (white/rgba-white) for that old background and are now
  // swapped to the same DARK/GREY tones used on every other white surface
  // in this doc, so the footer still reads clearly on white.
  footer:    { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb', padding: '12 28', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  ftLeft:    { flex: 1 },
  ftCo:      { color: DARK, fontSize: 9.5, fontFamily: 'Helvetica-Bold', marginBottom: 1 },
  ftLine:    { color: GREY, fontSize: 7.5, marginBottom: 0.5, lineHeight: 1.2 },
  // Widened 120->170 — narrower than this clipped "For Bagdrop Logistics
  // Solutions Pvt. Ltd." (sigSub, below) onto two lines / made it overflow
  // sigLine's width. alignItems:'center' centers every child (image, the
  // bordered line, both text lines) on the same vertical axis regardless of
  // each child's own width, so widening this is enough on its own to keep
  // everything centered together — no per-child margin math needed.
  ftRight:   { alignItems: 'center', width: 170 },
  // Signature/stamp image sits above the sigLine's border-top rule, same
  // spot a wet-ink signature would go on a printed copy. Square source
  // (1024x1024) scaled down to fit the signature block without overflowing
  // the dark footer band's fixed height — object-fit-style 'contain' isn't
  // a react-pdf Image prop, so width+height are set explicitly and the
  // aspect ratio (1:1) is preserved by construction.
  sigImage:  { width: 46, height: 46, marginBottom: 2 },
  // Widened 110->150 to actually span the width of "For Bagdrop Logistics
  // Solutions Pvt. Ltd." (sigSub) beneath it, instead of reading narrower
  // than the text it's meant to underline.
  sigLine:   { borderTopWidth: 1, borderTopColor: '#d1d5db', paddingTop: 4, width: 150, textAlign: 'center' },
  sigText:   { color: DARK, fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  sigSub:    { color: GREY, fontSize: 7, marginTop: 1 },
})

function fmtRs(n: number | null | undefined) {
  if (n == null) return '—'
  // 'Rs. ' not '₹' — react-pdf's default Helvetica font has no glyph for
  // the Rupee sign (U+20B9), so it renders as a garbled character (looked
  // like a stray "1") in the actual downloaded PDF even though it displays
  // fine in the browser preview/HTML print page (real Unicode font
  // fallback there). Matches the fix already applied in the server-side
  // quote generator, app/api/admin/quotes/[id]/upload-pdf/route.ts.
  return 'Rs. ' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
  // Subject line — from the New Quote form's Subject field (quote_subject).
  subject?:      string | null
  // Customer
  customerName:  string
  customerPhone: string
  customerEmail: string | null
  // Business Customer — when Payment By: Business/Company is set, the
  // company name takes the prominent slot in Bill To and the individual
  // contact name moves to a sub-line, matching Invoice/LR treatment.
  businessName?: string | null
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
  lineItems:   { name: string; description: string; quantity: number; rate: number; tax_pct: number; amount: number }[]
  subtotal:    number
  discountAmt?: number | null
  discountPct?: number | null
  tax:         number
  total:       number
  // Notes / Terms
  notes: string | null
  terms: string | null

  // ── Return Trip (optional) ──────────────────────────────────────────
  // Populated only when this lead has a Return Trip quote (Trip Type =
  // Return Trip on New Quote). When present, Line Items + Totals render
  // as "Journey 1 (Onward)" / "Journey 2 (Return)" with a combined
  // Onward/Return/Grand Total summary at the bottom. A plain one-way
  // quote (the default — these fields left undefined) renders exactly
  // as before this was added.
  returnFromCity?:    string | null
  returnToCity?:      string | null
  returnBagsCount?:   number | null
  returnPickupDate?:  string | null
  returnLineItems?:   { name: string; description: string; quantity: number; rate: number; tax_pct: number; amount: number }[]
  returnSubtotal?:    number
  returnTax?:         number
  returnTotal?:       number
}

export default function QuotePDF(p: QuotePDFProps) {
  const hasReturn = !!(p.returnLineItems && p.returnLineItems.length > 0)
  const meta = [
    { label: 'GSTIN',      value: '24AAACC9320N2ZL' },
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
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image style={s.logoFull} src={LOGO_FULL_WHITE_DATA_URI} />
            <Text style={s.logoSub}>India&apos;s First Digital Baggage Infrastructure</Text>
          </View>
          <View>
            <Text style={s.qnLabel}>Estimate</Text>
            <Text style={s.qnValue}>{p.quoteNumber}</Text>
            {/* Header date — Pickup Date, not the quote's own created/issue
                date (founder spec, 2026-08-20): every inquiry's PDF should
                show when the bags actually get picked up, not when the
                quote happened to be generated. p.quoteDate is still a real
                field (used nowhere else in this doc) — left as-is rather
                than removed, in case a future "Quoted on" line needs it. */}
            <Text style={s.qnDate}>{fmtDate(p.pickupDate)}</Text>
            {p.expiryDate ? <Text style={s.qnValidTill}>Valid till {fmtDate(p.expiryDate)}</Text> : null}
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
            {/* Bill To — Business/Company name (when set) takes the
                prominent slot, with the individual contact underneath;
                otherwise unchanged from before. */}
            <View style={s.card}>
              <Text style={s.cardLbl}>Bill To</Text>
              <Text style={s.custName}>{p.businessName || p.customerName}</Text>
              {p.businessName ? <Text style={s.custSub}>{p.customerName}</Text> : null}
              <Text style={s.custSub}>{p.customerPhone}</Text>
              {p.customerEmail ? <Text style={[s.custSub, { fontSize: 8.5 }]}>{p.customerEmail}</Text> : null}
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
                {/* Luggage/trolley-bag icon — replaces the previous
                    airplane glyph, drawn as a small vector via react-pdf's
                    Svg primitives (no icon font/emoji glyph is reliably
                    available in a Helvetica-only PDF) so it renders
                    consistently everywhere the PDF is opened. */}
                <Svg width={14} height={14} viewBox="0 0 24 24" style={{ marginHorizontal: 4 }}>
                  <Rect x={5} y={8} width={14} height={13} rx={2} stroke={GREY} strokeWidth={1.6} fill="none" />
                  <Rect x={9.5} y={4} width={5} height={4.5} rx={1} stroke={GREY} strokeWidth={1.6} fill="none" />
                  <Line x1={9.5} y1={8} x2={9.5} y2={21} stroke={GREY} strokeWidth={1} />
                  <Line x1={14.5} y1={8} x2={14.5} y2={21} stroke={GREY} strokeWidth={1} />
                  <Line x1={8} y1={23} x2={8} y2={24} stroke={GREY} strokeWidth={1.6} />
                  <Line x1={16} y1={23} x2={16} y2={24} stroke={GREY} strokeWidth={1.6} />
                </Svg>
                <View style={s.jtLine} />
                <View>
                  <Text style={s.jtLbl}>To</Text>
                  <Text style={s.jtCity}>{p.toCity ?? '—'}</Text>
                </View>
              </View>
              <View style={s.jtGrid}>
                {/* Pickup/Delivery set to width:'100%' (like Flight below)
                    so long month names never wrap; extra spaces after the
                    label give the date value more breathing room, per
                    founder feedback. */}
                <Text style={[s.jtItem, { width: '100%' }]}><Text style={s.jtItemKey}>Pickup:   </Text><Text style={s.jtItemVal}>{fmtDate(p.pickupDate)}</Text></Text>
                {p.pickupTime ? <Text style={s.jtItem}><Text style={s.jtItemKey}>Time: </Text><Text style={s.jtItemVal}>{p.pickupTime}</Text></Text> : null}
                <Text style={[s.jtItem, { width: '100%' }]}><Text style={s.jtItemKey}>Delivery:   </Text><Text style={s.jtItemVal}>{fmtDate(p.deliveryDate)}</Text></Text>
                <Text style={s.jtItem}><Text style={s.jtItemKey}>Bags: </Text><Text style={s.jtItemVal}>{p.bagsCount ?? '—'}</Text></Text>
                {(p.flightNumber || p.pnr) ? (
                  <Text style={[s.jtItem, { width: '100%' }]}><Text style={s.jtItemKey}>Flight: </Text><Text style={s.jtItemVal}>{p.flightNumber ?? ''}{p.pnr ? ` / ${p.pnr}` : ''}</Text></Text>
                ) : null}
              </View>
            </View>
          </View>

          {/* Addresses */}
          {(p.pickupAddress || p.dropAddress) ? (
            <View style={[s.row2, { marginBottom: 6 }]}>
              {p.pickupAddress ? (
                <View style={{ flex: 1, backgroundColor: LIGHT, borderRadius: 6, padding: '6 10' }}>
                  <Text style={[s.cardLbl, { marginBottom: 2 }]}>Pickup Address</Text>
                  <Text style={s.addressVal}>{p.pickupAddress}</Text>
                </View>
              ) : <View style={{ flex: 1 }} />}
              {p.dropAddress ? (
                <View style={{ flex: 1, backgroundColor: LIGHT, borderRadius: 6, padding: '6 10' }}>
                  <Text style={[s.cardLbl, { marginBottom: 2 }]}>Delivery Address</Text>
                  <Text style={s.addressVal}>{p.dropAddress}</Text>
                </View>
              ) : <View style={{ flex: 1 }} />}
            </View>
          ) : null}
        </View>

        {/* ── Pick Up Date/Time — directly below Pickup/Delivery Address.
              Dynamic from the actual booking (p.pickupDate/p.pickupTime),
              never hardcoded. Time run through fmtTimeLabel since it's
              stored as a 24-hour "HH:MM" value and needs converting to a
              readable 12-hour label. Default doc palette — no blue. ── */}
        {p.pickupDate ? (
          <View style={s.pickupBox}>
            <Text style={s.pickupItem}>PICK UP DATE: <Text style={s.pickupItemVal}>{fmtDate(p.pickupDate)}</Text></Text>
            {p.pickupTime ? (
              <Text style={s.pickupItem}>TIME: <Text style={s.pickupItemVal}>{fmtTimeLabel(p.pickupTime)}</Text></Text>
            ) : null}
          </View>
        ) : null}

        {/* ── Journey 1 label (only shown alongside a Return Trip) ── */}
        {hasReturn && (
          <View style={{ margin: '0 28 4' }}>
            <Text style={s.journeyLabel}>
              Journey 1 — Onward  ·  {p.fromCity ?? '—'} → {p.toCity ?? '—'}{p.pickupDate ? `  ·  ${fmtDate(p.pickupDate)}` : ''}
            </Text>
          </View>
        )}

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
              <Text style={[s.tableCell, s.cellTax, { fontSize: 8.5 }]}>GST {li.tax_pct ?? 5}%</Text>
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
                <Text style={{ fontSize: 7.5, color: GREY, marginTop: 3, textAlign: 'center' }}>Scan to Pay</Text>
              </View>
            </View>
          </View>

          {/* Totals */}
          <View style={s.totalsBox}>
            <View style={s.totRow}><Text style={s.totKey}>Sub Total</Text><Text style={s.totVal}>{fmtRs(p.subtotal)}</Text></View>
            {(p.discountAmt ?? 0) > 0 && (
              <View style={s.totRow}>
                <Text style={[s.totKey, { color: '#dc2626' }]}>
                  {p.discountPct ? `Discount (${p.discountPct}%)` : 'Discount'}
                </Text>
                <Text style={[s.totVal, { color: '#dc2626' }]}>− {fmtRs(p.discountAmt!)}</Text>
              </View>
            )}
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

        {/* ── Journey 2 (Return) — only rendered for a Return Trip quote ── */}
        {hasReturn && (
          <>
            <View style={{ margin: '4 28 4' }}>
              <Text style={s.journeyLabel}>
                Journey 2 — Return  ·  {p.returnFromCity ?? '—'} → {p.returnToCity ?? '—'}{p.returnPickupDate ? `  ·  ${fmtDate(p.returnPickupDate)}` : ''}{p.returnBagsCount ? `  ·  ${p.returnBagsCount} bag${p.returnBagsCount !== 1 ? 's' : ''}` : ''}
              </Text>
            </View>

            <View style={{ margin: '0 28 0' }}>
              <View style={s.tableHead}>
                <Text style={[s.tableHcell, s.cellIdx]}>#</Text>
                <Text style={[s.tableHcell, s.cellDesc]}>Description</Text>
                <Text style={[s.tableHcell, s.cellQty]}>Qty</Text>
                <Text style={[s.tableHcell, s.cellRate]}>Rate</Text>
                <Text style={[s.tableHcell, s.cellTax]}>Tax</Text>
                <Text style={[s.tableHcell, s.cellAmt, { color: '#fff' }]}>Amount</Text>
              </View>
              {(p.returnLineItems ?? []).map((li, idx) => (
                <View key={idx} style={s.tableRow}>
                  <Text style={[s.tableCell, s.cellIdx, { color: GREY }]}>{idx + 1}</Text>
                  <View style={s.cellDesc}>
                    <Text style={[s.tableCell, { fontFamily: 'Helvetica-Bold' }]}>{li.name}</Text>
                    {li.description ? <Text style={s.tableDesc}>{li.description}</Text> : null}
                  </View>
                  <Text style={[s.tableCell, s.cellQty]}>{li.quantity}</Text>
                  <Text style={[s.tableCell, s.cellRate]}>{fmtRs(li.rate)}</Text>
                  <Text style={[s.tableCell, s.cellTax, { fontSize: 8.5 }]}>GST {li.tax_pct ?? 5}%</Text>
                  <Text style={[s.tableCell, s.cellAmt]}>{fmtRs(li.amount)}</Text>
                </View>
              ))}
            </View>

            <View style={{ margin: '8 28 0', flexDirection: 'row', justifyContent: 'flex-end' }}>
              <View style={{ width: 220 }}>
                <View style={s.totRow}><Text style={s.totKey}>Return Sub Total</Text><Text style={s.totVal}>{fmtRs(p.returnSubtotal)}</Text></View>
                <View style={s.totRow}><Text style={s.totKey}>GST @ 5%</Text><Text style={s.totVal}>{fmtRs(p.returnTax)}</Text></View>
                <View style={[s.totRow, s.totDivider]}>
                  <Text style={s.grandKey}>Return Total</Text>
                  <Text style={[s.grandVal, { color: '#7c3aed' }]}>{fmtRs(p.returnTotal)}</Text>
                </View>
              </View>
            </View>

            {/* ── Trip Summary — Onward + Return + Grand Total ── */}
            <View style={s.tripSummary}>
              <View style={s.totRow}><Text style={s.totKey}>Onward Total</Text><Text style={s.totVal}>{fmtRs(p.total)}</Text></View>
              <View style={s.totRow}><Text style={s.totKey}>Return Total</Text><Text style={s.totVal}>{fmtRs(p.returnTotal)}</Text></View>
              <View style={[s.totRow, s.totDivider]}>
                <Text style={s.grandKey}>Grand Total</Text>
                <Text style={s.grandVal}>{fmtRs((p.total ?? 0) + (p.returnTotal ?? 0))}</Text>
              </View>
            </View>
          </>
        )}

        {/* ── Subject Text — shows the quote's actual Subject field
              (quote_subject from the New Quote form), unchanged
              functionality; only the label was renamed from "Notes". ── */}
        {p.subject ? (
          <View style={s.notesBox}>
            <Text style={s.notesLbl}>Subject Text</Text>
            <Text style={s.notesText}>{p.subject}</Text>
          </View>
        ) : null}

        {/* ── T&C ── */}
        <View style={s.tcSection}>
          <Text style={s.tcTitle}>Terms &amp; Conditions</Text>
          <View style={s.tcGrid}>
            {(p.terms
              // Saved terms text often already comes pre-numbered ("1.
              // Booking Confirmation : ...", "2. Total Amount Payable: ...")
              // — strip any leading "1." / "1)" so it doesn't double up with
              // the tcNum badge rendered below.
              ? p.terms.split('\n').filter(Boolean).map((t, i) => ({ num: i + 1, text: t.replace(/^\s*\d+[.)]\s*/, '') }))
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
            <Text style={s.ftLine}>GSTIN: 24AAACC9320N2ZL  ·  CIN: U63090GJ2023PTC142601</Text>
            {/* 'Tel:' not the 📞 emoji — react-pdf's default Helvetica font
                has no emoji glyphs either, so it rendered as a garbled
                character in the downloaded PDF (same root cause as the
                ₹ symbol bug fixed elsewhere in this file's fmtRs()). */}
            <Text style={s.ftLine}>Tel: 63 5711 5711 / 63 5733 5733  ·  info@bagdrop.co  ·  www.bagdrop.co</Text>
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
