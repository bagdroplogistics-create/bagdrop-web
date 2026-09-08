// BAGDROP — Operational Baggage Tag System (Phase 1)
//
// Server-side "Download PDF" generator for printable bag tags — same
// @react-pdf/renderer approach as lib/quote-pdf.ts, so it works for
// arbitrarily large batches (150+ bags for a group booking) across
// multiple A4 pages without any browser rendering involved.
//
// Redesigned 2026-09-07 (founder spec: "airport type tag design") to
// mirror components/admin/BagTagPrintCard.tsx's 4-part airline-claim-tag
// layout (barcode spine, main coupon, FROM/TO flight panel, tear-off
// stub) instead of the old single vertical card — keep both in sync.
//
// IMPORTANT: this is BagDrop's own OPERATIONAL tracking tag — never
// represented as an airline-issued baggage tag. The QR encodes only the
// bag's own BagDrop tracking URL (see lib/bag-tags.ts's bagTrackingUrl)
// — no customer name/phone/address is ever put inside the QR payload.
// The FROM/TO codes are a decorative styling touch (lib/bag-tags.ts's
// cityCode) — never a real transport routing code.
import { pdf, Document, Page, Text, View, StyleSheet, Image, Svg, Line, Polygon } from '@react-pdf/renderer'
import React from 'react'
import { bagTrackingUrl, cityCode, barcodeStripes } from '@/lib/bag-tags'
import { LOGO_FULL_COLOR_DATA_URI, LOGO_ICON_COLOR_DATA_URI } from '@/lib/bag-tag-logo'

const ORANGE = '#f97316'
const ORANGE_DK = '#c74f0f'
const DARK   = '#111827'
const GREY   = '#918b81'

// Tag geometry — A4 usable width (595.28 - 2*14 page padding) = 567.28pt,
// split into the same proportions as the HTML card's flex-basis %s.
const TAG_W = 567
const TAG_H = 190
const GAP   = 8
const COL_SPINE  = 48
const COL_MAIN   = 227
const COL_FLIGHT = 136
const COL_STUB   = TAG_W - COL_SPINE - COL_MAIN - COL_FLIGHT // 156

const s = StyleSheet.create({
  page:  { fontFamily: 'Helvetica', backgroundColor: '#fff', padding: 14 },
  stack: { flexDirection: 'column' },

  tag: { width: TAG_W, height: TAG_H, flexDirection: 'row', borderWidth: 1.2, borderColor: '#e7e2da', borderRadius: 8, overflow: 'hidden' },

  spine: { width: COL_SPINE, height: '100%', borderRightWidth: 1, borderColor: '#d4cfc6', borderStyle: 'dashed', padding: '10 6', justifyContent: 'center' },
  barcodeCol: { flexDirection: 'column', width: '100%', height: '100%' },
  barcodeRow: { flexDirection: 'row', width: '100%' },

  main: { width: COL_MAIN, height: '100%', borderRightWidth: 1, borderColor: '#d4cfc6', borderStyle: 'dashed', padding: '8 10' },
  mainHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logoColor: { width: 78, height: 19 },
  pill: { borderWidth: 1, borderColor: ORANGE, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, maxWidth: 100 },
  pillTxt: { fontSize: 5.5, fontFamily: 'Helvetica-Bold', color: ORANGE_DK, letterSpacing: 0.3 },
  divider: { height: 1, backgroundColor: '#e5e0d8', marginVertical: 6 },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', flex: 1 },
  field: { width: '50%', marginBottom: 7, paddingRight: 6 },
  fieldLabel: { fontSize: 5.3, fontFamily: 'Helvetica-Bold', color: GREY, letterSpacing: 0.4 },
  fieldValue: { fontSize: 7.8, fontFamily: 'Helvetica-Bold', color: DARK, marginTop: 1 },
  qrRow: { position: 'absolute', right: 10, bottom: 8, flexDirection: 'row', alignItems: 'flex-end' },
  qrCap: { fontSize: 4.8, fontFamily: 'Helvetica-Bold', color: DARK, textAlign: 'right', marginRight: 5, lineHeight: 1.35 },
  qrCapSub: { fontSize: 4.3, fontFamily: 'Helvetica', color: GREY },
  qr: { width: 38, height: 38, borderWidth: 1, borderColor: '#e5e0d8', borderRadius: 3 },

  flight: { width: COL_FLIGHT, height: '100%', borderRightWidth: 1, borderColor: '#d4cfc6', borderStyle: 'dashed' },
  flightHead: { backgroundColor: DARK, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '5 8' },
  flightHeadTxt: { fontSize: 5.3, fontFamily: 'Helvetica-Bold', color: ORANGE, letterSpacing: 1 },
  flightBody: { flex: 1, padding: '6 9', justifyContent: 'center' },
  // Bumped 2026-09-08 (founder: "increase font...bcoz you have enough
  // space...FROM BDQ Vadodara TO UDR Udaipur font increase as per airline
  // bagtag sticker bigger font") — the flight panel's fixed 190pt height
  // had plenty of unused vertical room below the FROM/TO block (verified
  // by rendering: flightBody's actual content was well under half the
  // available height), so every size in this panel scales up ~35-40%
  // rather than only the two explicitly-named lines, for a consistent look.
  ftLabel: { fontSize: 6.2, fontFamily: 'Helvetica-Bold', color: GREY, letterSpacing: 0.8 },
  ftCode:  { fontSize: 21, fontFamily: 'Helvetica-Bold', color: DARK, marginTop: 2 },
  ftCodeOrange: { color: ORANGE_DK },
  ftCity:  { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: GREY, textTransform: 'uppercase', marginTop: 1 },
  ftDivider: { height: 1, backgroundColor: '#e5e0d8', marginVertical: 6 },
  bagNoRow: { flexDirection: 'row', alignItems: 'baseline' },
  bagNoLbl: { fontSize: 6.2, fontFamily: 'Helvetica-Bold', color: GREY, letterSpacing: 0.8, marginRight: 5 },
  bagNoVal: { fontSize: 11.5, fontFamily: 'Helvetica-Bold', color: DARK },
  care: { backgroundColor: DARK, padding: '4 8' },
  careTxt: { fontSize: 5.8, fontFamily: 'Helvetica-Bold', color: '#fff', letterSpacing: 0.6, textAlign: 'center' },

  stub: { width: COL_STUB, height: '100%', padding: '8 8' },
  stubHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stubLabel: { fontSize: 4.6, fontFamily: 'Helvetica-Bold', color: GREY, letterSpacing: 0.5 },

  // Small lock-up for the flight header + claim stub: plain icon (no
  // baked-in wordmark, so it never turns to mush when this small) plus a
  // real, crisp Text label. See this file's module comment for why the
  // full LOGO_FULL_COLOR_DATA_URI lock-up doesn't work at this size.
  miniBrand: { flexDirection: 'row', alignItems: 'center' },
  miniBrandIcon: { width: 7, height: 12, marginRight: 4 },
  miniBrandTxt: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: DARK, letterSpacing: 0.3 },
  miniBrandTxtDark: { color: '#fff' },
  stubBarcodeWrap: { height: 20, marginTop: 6, marginBottom: 6 },
  stubRouteRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  stubRouteTxt: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: DARK },
  stubField: { marginBottom: 6 },
  stubQr: { position: 'absolute', right: 8, bottom: 8, width: 32, height: 32, borderWidth: 1, borderColor: '#e5e0d8', borderRadius: 3 },
})

function fmtDate(d: string | null): string {
  if (!d) return '—'
  try { return new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return d }
}

function qrUrl(data: string, size: number) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&data=${encodeURIComponent(data)}`
}

function Barcode({ seed, size, vertical }: { seed: string; size: number; vertical?: boolean }) {
  const stripes = barcodeStripes(seed, vertical ? 40 : 26)
  return (
    <View style={vertical ? s.barcodeCol : s.barcodeRow}>
      {stripes.map((st, i) => {
        const px = (st.pct / 100) * size
        return (
          <View key={i} style={vertical
            ? { width: '100%', height: px, backgroundColor: st.bar ? DARK : 'transparent' }
            : { height: '100%', width: px, backgroundColor: st.bar ? DARK : 'transparent' }}
          />
        )
      })}
    </View>
  )
}

// Small lock-up for the flight header + claim stub — plain icon (no
// baked-in wordmark, so it never turns to mush when shrunk this far)
// plus a real, crisp Text label. See this file's module comment for why
// the full LOGO_FULL_COLOR_DATA_URI lock-up doesn't work at this size.
function MiniBrand({ dark }: { dark?: boolean }) {
  return (
    <View style={s.miniBrand}>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image style={s.miniBrandIcon} src={LOGO_ICON_COLOR_DATA_URI} />
      <Text style={[s.miniBrandTxt, ...(dark ? [s.miniBrandTxtDark] : [])]}>BAGDROP</Text>
    </View>
  )
}

// Small vector arrow (react-pdf's base Helvetica has no arrow glyph —
// same reason the plain-text `route` field below uses "-to-" instead).
function Arrow({ w, y }: { w: number; y: number }) {
  return (
    <Svg width={w} height={10} style={{ marginHorizontal: 4 }}>
      <Line x1={0} y1={y} x2={w - 6} y2={y} stroke={ORANGE} strokeWidth={1.6} />
      <Polygon points={`${w - 8},${y - 3.2} ${w - 8},${y + 3.2} ${w},${y}`} fill={ORANGE} />
    </Svg>
  )
}

export interface BagTagInput {
  bagLabel:        string
  customerName:    string
  bookingId:       string
  route:           string
  fromCity:        string | null
  toCity:          string | null
  serviceLabel:    string
  bagNumber:       number
  bagTotal:        number
  pickupDate:      string | null
  deliveryLocation: string | null
}

function BagTagCard({ b }: { b: BagTagInput }) {
  const fromCode = cityCode(b.fromCity)
  const toCode   = cityCode(b.toCity)

  return (
    <View style={s.tag} wrap={false}>
      {/* Spine */}
      <View style={s.spine}>
        <Barcode seed={b.bagLabel} size={TAG_H - 20} vertical />
      </View>

      {/* Main coupon */}
      <View style={s.main}>
        <View style={s.mainHead}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image style={s.logoColor} src={LOGO_FULL_COLOR_DATA_URI} />
          <View style={s.pill}><Text style={s.pillTxt}>{(b.serviceLabel || 'OPERATIONAL TAG').toUpperCase()}</Text></View>
        </View>
        <View style={s.divider} />
        <View style={s.fieldGrid}>
          <View style={s.field}><Text style={s.fieldLabel}>BOOKING ID</Text><Text style={s.fieldValue}>{b.bookingId}</Text></View>
          <View style={s.field}><Text style={s.fieldLabel}>CUSTOMER</Text><Text style={s.fieldValue}>{b.customerName}</Text></View>
          <View style={s.field}><Text style={s.fieldLabel}>ROUTE</Text><Text style={s.fieldValue}>{b.route || '—'}</Text></View>
          <View style={s.field}><Text style={s.fieldLabel}>SERVICE</Text><Text style={s.fieldValue}>{b.serviceLabel || '—'}</Text></View>
          <View style={s.field}><Text style={s.fieldLabel}>PICKUP DATE</Text><Text style={s.fieldValue}>{fmtDate(b.pickupDate)}</Text></View>
          <View style={s.field}><Text style={s.fieldLabel}>DELIVER TO</Text><Text style={s.fieldValue}>{b.deliveryLocation || '—'}</Text></View>
          <View style={s.field}><Text style={s.fieldLabel}>BAG COUNT</Text><Text style={s.fieldValue}>Bag {b.bagNumber} of {b.bagTotal}</Text></View>
          <View style={s.field}><Text style={s.fieldLabel}>TRACKING ID</Text><Text style={s.fieldValue}>{b.bagLabel}</Text></View>
        </View>
        <View style={s.qrRow}>
          <Text style={s.qrCap}>SCAN TO{'\n'}TRACK BAG{'\n'}<Text style={s.qrCapSub}>{b.bagLabel}</Text></Text>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image style={s.qr} src={qrUrl(bagTrackingUrl(b.bagLabel), 140)} />
        </View>
      </View>

      {/* Flight-style FROM / TO panel */}
      <View style={s.flight}>
        <View style={s.flightHead}>
          <MiniBrand dark />
          <Text style={s.flightHeadTxt}>BAG TAG</Text>
        </View>
        <View style={s.flightBody}>
          <Text style={s.ftLabel}>FROM</Text>
          <Text style={s.ftCode}>{fromCode}</Text>
          <Text style={s.ftCity}>{b.fromCity || '—'}</Text>
          <View style={{ height: 7 }} />
          <Text style={s.ftLabel}>TO</Text>
          <Text style={[s.ftCode, s.ftCodeOrange]}>{toCode}</Text>
          <Text style={s.ftCity}>{b.toCity || '—'}</Text>
          <View style={s.ftDivider} />
          <View style={s.bagNoRow}>
            <Text style={s.bagNoLbl}>BAG NO.</Text>
            <Text style={s.bagNoVal}>{String(b.bagNumber).padStart(2, '0')} / {b.bagTotal}</Text>
          </View>
        </View>
        <View style={s.care}><Text style={s.careTxt}>HANDLE WITH CARE</Text></View>
      </View>

      {/* Tear-off claim stub */}
      <View style={s.stub}>
        <View style={s.stubHead}>
          <MiniBrand />
          <Text style={s.stubLabel}>CLAIM STUB</Text>
        </View>
        <View style={s.stubBarcodeWrap}>
          <Barcode seed={b.bagLabel} size={COL_STUB - 16} />
        </View>
        <View style={s.stubRouteRow}>
          <Text style={s.stubRouteTxt}>{fromCode}</Text>
          <Arrow w={22} y={5} />
          <Text style={s.stubRouteTxt}>{toCode}</Text>
        </View>
        <View style={s.stubField}><Text style={s.fieldLabel}>CUSTOMER</Text><Text style={s.fieldValue}>{b.customerName}</Text></View>
        <View style={s.stubField}><Text style={s.fieldLabel}>BAG</Text><Text style={s.fieldValue}>{String(b.bagNumber).padStart(2, '0')} / {b.bagTotal}</Text></View>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image style={s.stubQr} src={qrUrl(bagTrackingUrl(b.bagLabel), 100)} />
      </View>
    </View>
  )
}

function BagTagsDocument({ bags }: { bags: BagTagInput[] }) {
  // 4 landscape tags stacked per A4 portrait page — same width as the
  // page's usable area (TAG_W), so bags.length can be arbitrarily large
  // (150+ for a big group booking) across as many pages as needed.
  const PER_PAGE = 4
  const pages: BagTagInput[][] = []
  for (let i = 0; i < bags.length; i += PER_PAGE) pages.push(bags.slice(i, i + PER_PAGE))

  return (
    <Document>
      {pages.map((pageBags, pi) => (
        <Page key={pi} size="A4" style={s.page}>
          <View style={s.stack}>
            {pageBags.map((b, i) => (
              <View key={b.bagLabel} style={{ marginBottom: i === pageBags.length - 1 ? 0 : GAP }}>
                <BagTagCard b={b} />
              </View>
            ))}
          </View>
        </Page>
      ))}
    </Document>
  )
}

export async function buildBagTagsPdfBuffer(bags: BagTagInput[]): Promise<Buffer> {
  const element = React.createElement(BagTagsDocument, { bags })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await pdf(element as any).toBlob()
  const arr  = await blob.arrayBuffer()
  return Buffer.from(arr)
}
