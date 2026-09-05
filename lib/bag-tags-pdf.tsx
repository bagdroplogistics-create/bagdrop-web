// BAGDROP — Operational Baggage Tag System (Phase 1)
//
// Server-side "Download PDF" generator for printable bag tags — same
// @react-pdf/renderer approach as lib/quote-pdf.ts, so it works for
// arbitrarily large batches (150+ bags for a group booking) across
// multiple A4 pages without any browser rendering involved.
//
// IMPORTANT: this is BagDrop's own OPERATIONAL tracking tag — never
// represented as an airline-issued baggage tag. The QR encodes only the
// bag's own BagDrop tracking URL (see lib/bag-tags.ts's bagTrackingUrl)
// — no customer name/phone/address is ever put inside the QR payload.
import { pdf, Document, Page, Text, View, StyleSheet, Image, Svg, Rect, Line } from '@react-pdf/renderer'
import React from 'react'
import { bagTrackingUrl } from '@/lib/bag-tags'

const ORANGE = '#f97316'
const DARK   = '#111827'
const GREY   = '#4b5563'

export interface BagTagInput {
  bagLabel:        string
  customerName:    string
  bookingId:       string
  route:           string
  serviceLabel:    string
  bagNumber:       number
  bagTotal:        number
  pickupDate:      string | null
  deliveryLocation: string | null
}

const s = StyleSheet.create({
  page:  { fontFamily: 'Helvetica', backgroundColor: '#fff', padding: 14 },
  grid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // 2 columns x 4 rows per A4 portrait page — ~264pt wide each (A4 usable
  // width ~567pt minus gaps), tall enough to fit every required field at
  // small-but-legible sizes.
  tag:   { width: '48.5%', height: 168, borderWidth: 1.2, borderStyle: 'dashed', borderColor: '#9ca3af', borderRadius: 6, overflow: 'hidden' },
  head:  { backgroundColor: ORANGE, flexDirection: 'row', alignItems: 'center', padding: '4 8', gap: 5 },
  headText: { color: '#fff', fontSize: 8.5, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5 },
  headSub:  { color: 'rgba(255,255,255,0.9)', fontSize: 6.5, marginLeft: 'auto' },

  body:  { flexDirection: 'row', flex: 1, padding: '6 8' },
  info:  { flex: 1, paddingRight: 6 },
  bagId: { color: DARK, fontSize: 13, fontFamily: 'Helvetica-Bold', letterSpacing: 0.3 },
  row:   { fontSize: 7, color: GREY, marginTop: 2.5, lineHeight: 1.25 },
  rowB:  { fontFamily: 'Helvetica-Bold', color: DARK },
  bagNum: { fontSize: 7.5, color: ORANGE, fontFamily: 'Helvetica-Bold', marginTop: 3 },

  qrCol: { alignItems: 'center', justifyContent: 'flex-start', width: 62 },
  qr:    { width: 56, height: 56 },
  qrCaption: { fontSize: 5.5, color: GREY, marginTop: 2, textAlign: 'center' },

  careBar: { backgroundColor: '#111827', padding: '3 8', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  careText: { color: '#fff', fontSize: 6.5, fontFamily: 'Helvetica-Bold', letterSpacing: 0.8 },
  careIcon: { color: ORANGE, fontSize: 6.5, fontFamily: 'Helvetica-Bold' },
})

function fmtDate(d: string | null): string {
  if (!d) return '—'
  try { return new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return d }
}

function qrUrl(data: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=0&data=${encodeURIComponent(data)}`
}

function BagTagCard({ b }: { b: BagTagInput }) {
  return (
    <View style={s.tag} wrap={false}>
      <View style={s.head}>
        {/* Hand-drawn white luggage icon (same shape as the Journey
            section's trolley-bag icon in QuotePDF.tsx, just white) —
            replaces both the old orange LOGO_ICON_DATA_URI asset (which
            was invisible on this orange header) and the earlier "B in a
            circle" monogram. Founder feedback 2026-09-05: "Need only Bag
            icon in white instead of B in the circle." */}
        <Svg width={13} height={13} viewBox="0 0 24 24">
          <Rect x={5} y={8} width={14} height={13} rx={2} stroke="#fff" strokeWidth={2} fill="none" />
          <Rect x={9.5} y={4} width={5} height={4.5} rx={1} stroke="#fff" strokeWidth={2} fill="none" />
          <Line x1={9.5} y1={8} x2={9.5} y2={21} stroke="#fff" strokeWidth={1.3} />
          <Line x1={14.5} y1={8} x2={14.5} y2={21} stroke="#fff" strokeWidth={1.3} />
          <Line x1={8} y1={23} x2={8} y2={24} stroke="#fff" strokeWidth={2} />
          <Line x1={16} y1={23} x2={16} y2={24} stroke="#fff" strokeWidth={2} />
        </Svg>
        <Text style={s.headText}>BAGDROP</Text>
        <Text style={s.headSub}>Operational Tag</Text>
      </View>
      <View style={s.body}>
        <View style={s.info}>
          <Text style={s.bagId}>{b.bagLabel}</Text>
          <Text style={s.bagNum}>Bag {b.bagNumber} / {b.bagTotal}</Text>
          <Text style={s.row}><Text style={s.rowB}>Customer: </Text>{b.customerName}</Text>
          <Text style={s.row}><Text style={s.rowB}>Booking: </Text>{b.bookingId}</Text>
          <Text style={s.row}><Text style={s.rowB}>Route: </Text>{b.route || '—'}</Text>
          <Text style={s.row}><Text style={s.rowB}>Service: </Text>{b.serviceLabel || '—'}</Text>
          <Text style={s.row}><Text style={s.rowB}>Pickup: </Text>{fmtDate(b.pickupDate)}</Text>
          <Text style={s.row}><Text style={s.rowB}>Deliver to: </Text>{b.deliveryLocation || '—'}</Text>
        </View>
        <View style={s.qrCol}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image style={s.qr} src={qrUrl(bagTrackingUrl(b.bagLabel))} />
          <Text style={s.qrCaption}>Scan to{'\n'}Track Bag</Text>
        </View>
      </View>
      <View style={s.careBar}>
        <Text style={s.careText}>HANDLE WITH CARE</Text>
        <Text style={s.careIcon}>BAGDROP.CO</Text>
      </View>
    </View>
  )
}

function BagTagsDocument({ bags }: { bags: BagTagInput[] }) {
  const PER_PAGE = 8
  const pages: BagTagInput[][] = []
  for (let i = 0; i < bags.length; i += PER_PAGE) pages.push(bags.slice(i, i + PER_PAGE))

  return (
    <Document>
      {pages.map((pageBags, pi) => (
        <Page key={pi} size="A4" style={s.page}>
          <View style={s.grid}>
            {pageBags.map(b => <BagTagCard key={b.bagLabel} b={b} />)}
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
