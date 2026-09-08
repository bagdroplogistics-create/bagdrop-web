// BAGDROP — Consignor / Consignee Consignment Label (standalone document)
//
// Founder request (2026-09-08): the plain hand-typed "Consignor / Consignee"
// paper note currently taped onto wrapped bags (photo reference) needed to
// become a proper branded Bagdrop document, with "something unique" beyond
// just copying the plain note. This is deliberately a SEPARATE document
// from the existing airport-style Bag Tag (lib/bag-tags-pdf.tsx) — that one
// is the small barcode/QR operational tracking tag; this one is a full-A4
// sender/receiver label meant to be printed, folded, and taped over the
// bag's plastic wrap exactly like the reference photo, one copy per bag.
//
// The "unique idea": rather than a flat static note, this is a two-part
// document —
//   1) the label itself (Consignor + Consignee blocks, route/service
//      summary, QR code) for anyone handling the bag in transit, and
//   2) a tear-off "Handover Receipt" stub at the bottom that ground staff
//      sign and retain as proof-of-custody when the bag changes hands
//      (pickup rider -> hub -> airport staff -> delivery rider) — turning a
//      one-way paper note into a document with a built-in chain-of-custody
//      audit trail, on brand with the aviation-infrastructure positioning.
//
// Same @react-pdf/renderer server-side approach as lib/bag-tags-pdf.tsx —
// colors/fonts/QR pattern intentionally kept identical for visual
// consistency across BagDrop's printed documents.
import { pdf, Document, Page, Text, View, StyleSheet, Image, Svg, Line, Polygon } from '@react-pdf/renderer'
import React from 'react'
import { LOGO_FULL_COLOR_DATA_URI, LOGO_ICON_COLOR_DATA_URI } from '@/lib/bag-tag-logo'
import { INVOICE_COMPANY } from '@/lib/company-info'
import { generateQrDataUri } from '@/lib/qr-code'

const ORANGE    = '#f97316'
const ORANGE_DK = '#c74f0f'
const DARK      = '#111827'
const GREY      = '#918b81'
const CONSIGNOR_BG = '#fff7ed' // orange-50 — "FROM / sender" tint
const CONSIGNEE_BG = '#f0f9ff' // sky-50   — "TO / receiver" tint, deliberately a different hue so the two blocks are tellable apart at a glance across a stack of bags

const PAGE_W = 595.28
const PAGE_H = 841.89
const PAD    = 26
const COL_W  = PAGE_W - PAD * 2 // 543.28

// Same non-negotiable rule as the Bag Tag QR (lib/bag-tags.ts's
// bagTrackingUrl comment): only ever encode the bag/booking's own tracking
// id — never customer name/phone/address inside the QR payload itself.
function labelTrackingUrl(id: string): string {
  return `https://www.bagdrop.co/track-bag/${encodeURIComponent(id)}`
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  try { return new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return d }
}

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', backgroundColor: '#fff', padding: PAD },

  // ── Header ──
  headRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  logo: { width: 118, height: 56.9 }, // 942:454 ratio preserved, see lib/bag-tags-pdf.tsx's logoColor comment on why this matters for react-pdf
  headRight: { alignItems: 'flex-end' },
  headTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: GREY, letterSpacing: 1.6 },
  headTrackId: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: DARK, marginTop: 3 },
  headDivider: { height: 2.5, backgroundColor: DARK, marginTop: 12, marginBottom: 12 },

  // ── Meta strip (service / pickup date / bag count) ──
  metaStrip: { flexDirection: 'row', backgroundColor: '#f9fafb', borderRadius: 6, borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 9 },
  metaCell: { flex: 1, alignItems: 'center', borderRightWidth: 1, borderColor: '#e5e7eb' },
  metaCellLast: { flex: 1, alignItems: 'center' },
  metaLabel: { fontSize: 6.8, fontFamily: 'Helvetica-Bold', color: GREY, letterSpacing: 0.6 },
  metaValue: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: DARK, marginTop: 3 },

  // ── Consignor / Consignee panels ──
  ccRow: { flexDirection: 'row', alignItems: 'stretch', marginTop: 16 },
  ccBox: { width: (COL_W - 34) / 2, borderRadius: 8, borderWidth: 1.4, borderColor: '#e5e0d8', padding: 14 },
  ccChip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginBottom: 10 },
  ccChipTxt: { fontSize: 8, fontFamily: 'Helvetica-Bold', letterSpacing: 0.8 },
  ccName: { fontSize: 14.5, fontFamily: 'Helvetica-Bold', color: DARK },
  ccFieldLabel: { fontSize: 6.8, fontFamily: 'Helvetica-Bold', color: GREY, letterSpacing: 0.6, marginTop: 9 },
  ccFieldValue: { fontSize: 10.5, fontFamily: 'Helvetica', color: DARK, marginTop: 2, lineHeight: 1.35 },
  ccArrowWrap: { width: 34, alignItems: 'center', justifyContent: 'center' },

  // ── QR row ──
  qrRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 14 },
  qrCap: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: DARK, textAlign: 'right', marginRight: 8, lineHeight: 1.4 },
  qrCapSub: { fontSize: 6, fontFamily: 'Helvetica', color: GREY },
  qr: { width: 46, height: 46, borderWidth: 1, borderColor: '#e5e0d8', borderRadius: 3 },

  // ── Handle with care strip ──
  care: { backgroundColor: DARK, borderRadius: 5, paddingVertical: 7, marginTop: 16 },
  careTxt: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#fff', letterSpacing: 1.4, textAlign: 'center' },

  // ── Cut line ──
  cutRow: { flexDirection: 'row', alignItems: 'center', marginTop: 22, marginBottom: 10 },
  cutLine: { flex: 1, height: 0, borderBottomWidth: 1.4, borderStyle: 'dashed', borderColor: '#c9c3b8' },
  cutLabel: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: GREY, letterSpacing: 1, marginHorizontal: 8 },

  // ── Handover receipt stub (the "unique idea" — chain-of-custody tear-off) ──
  stub: { borderWidth: 1.4, borderColor: '#e5e0d8', borderRadius: 8, padding: 14 },
  stubHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  miniBrand: { flexDirection: 'row', alignItems: 'center' },
  miniBrandIcon: { width: 8, height: 13.7, marginRight: 5 },
  miniBrandTxt: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK, letterSpacing: 0.3 },
  stubTitle: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: GREY, letterSpacing: 0.8 },
  stubGrid: { flexDirection: 'row', marginTop: 10 },
  stubCell: { flex: 1 },
  stubCellLabel: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: GREY, letterSpacing: 0.5 },
  stubCellValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: DARK, marginTop: 2 },
  signRow: { flexDirection: 'row', marginTop: 16 },
  signCell: { flex: 1, marginRight: 16 },
  signLine: { borderBottomWidth: 1, borderColor: '#c9c3b8', marginTop: 18 },
  signLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GREY, letterSpacing: 0.5, marginTop: 4 },

  footer: { marginTop: 14, textAlign: 'center' },
  footerTxt: { fontSize: 7, fontFamily: 'Helvetica', color: GREY, textAlign: 'center' },
})

function MiniBrand() {
  return (
    <View style={s.miniBrand}>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image style={s.miniBrandIcon} src={LOGO_ICON_COLOR_DATA_URI} />
      <Text style={s.miniBrandTxt}>BAGDROP</Text>
    </View>
  )
}

// Small vector arrow between the Consignor/Consignee boxes — react-pdf's
// base Helvetica has no arrow glyph (same reason lib/bag-tags-pdf.tsx's
// Arrow helper exists for its own claim-stub route line).
function Arrow() {
  return (
    <Svg width={26} height={14}>
      <Line x1={0} y1={7} x2={18} y2={7} stroke={ORANGE} strokeWidth={2} />
      <Polygon points="16,3 16,11 26,7" fill={ORANGE} />
    </Svg>
  )
}

export interface ConsignmentLabelInput {
  trackingId:       string       // booking tracking_id, e.g. BDL-2026-0160 (or GBL-... for group)
  bagLabel:         string | null // per-bag tag label if bags already generated (lib/bag-tags.ts) — falls back to trackingId when bags haven't been generated yet
  bagNumber:        number
  bagTotal:         number
  serviceLabel:     string
  pickupDate:       string | null
  consignorName:    string
  consignorPhone:   string | null
  consignorAddress: string | null
  consigneeName:    string
  consigneePhone:   string | null
  consigneeAddress: string | null
}

// Internal-only shape — the public ConsignmentLabelInput never carries a
// rendered QR image; buildConsignmentLabelPdfBuffer computes it once per
// label (see generateQrDataUri) before handing off to react-pdf, since QR
// generation is async and component rendering below is not.
type ConsignmentLabelWithQr = ConsignmentLabelInput & { qrDataUri: string }

function ConsignmentLabelPage({ l }: { l: ConsignmentLabelWithQr }) {
  const qrSeed = l.bagLabel || l.trackingId

  return (
    <Page size="A4" style={s.page}>
      {/* Header */}
      <View style={s.headRow}>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image style={s.logo} src={LOGO_FULL_COLOR_DATA_URI} />
        <View style={s.headRight}>
          <Text style={s.headTitle}>CONSIGNMENT LABEL</Text>
          <Text style={s.headTrackId}>{l.trackingId}</Text>
        </View>
      </View>
      <View style={s.headDivider} />

      {/* Meta strip */}
      <View style={s.metaStrip}>
        <View style={s.metaCell}>
          <Text style={s.metaLabel}>SERVICE</Text>
          <Text style={s.metaValue}>{l.serviceLabel || '—'}</Text>
        </View>
        <View style={s.metaCell}>
          <Text style={s.metaLabel}>PICKUP DATE</Text>
          <Text style={s.metaValue}>{fmtDate(l.pickupDate)}</Text>
        </View>
        <View style={s.metaCellLast}>
          <Text style={s.metaLabel}>BAG</Text>
          <Text style={s.metaValue}>{String(l.bagNumber).padStart(2, '0')} of {l.bagTotal}</Text>
        </View>
      </View>

      {/* Consignor / Consignee */}
      <View style={s.ccRow}>
        <View style={[s.ccBox, { backgroundColor: CONSIGNOR_BG }]}>
          <View style={[s.ccChip, { backgroundColor: '#fff', borderWidth: 1, borderColor: ORANGE }]}>
            <Text style={[s.ccChipTxt, { color: ORANGE_DK }]}>CONSIGNOR · FROM</Text>
          </View>
          <Text style={s.ccName}>{l.consignorName}</Text>
          <Text style={s.ccFieldLabel}>PHONE</Text>
          <Text style={s.ccFieldValue}>{l.consignorPhone || '—'}</Text>
          <Text style={s.ccFieldLabel}>ADDRESS</Text>
          <Text style={s.ccFieldValue}>{l.consignorAddress || '—'}</Text>
        </View>

        <View style={s.ccArrowWrap}><Arrow /></View>

        <View style={[s.ccBox, { backgroundColor: CONSIGNEE_BG }]}>
          <View style={[s.ccChip, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#0ea5e9' }]}>
            <Text style={[s.ccChipTxt, { color: '#0369a1' }]}>CONSIGNEE · TO</Text>
          </View>
          <Text style={s.ccName}>{l.consigneeName}</Text>
          <Text style={s.ccFieldLabel}>PHONE</Text>
          <Text style={s.ccFieldValue}>{l.consigneePhone || '—'}</Text>
          <Text style={s.ccFieldLabel}>ADDRESS</Text>
          <Text style={s.ccFieldValue}>{l.consigneeAddress || '—'}</Text>
        </View>
      </View>

      {/* QR */}
      <View style={s.qrRow}>
        <Text style={s.qrCap}>SCAN TO{'\n'}TRACK THIS BAG{'\n'}<Text style={s.qrCapSub}>{qrSeed}</Text></Text>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image style={s.qr} src={l.qrDataUri} />
      </View>

      {/* Handle with care */}
      <View style={s.care}><Text style={s.careTxt}>HANDLE WITH CARE  ·  FRAGILE CONTENTS POSSIBLE</Text></View>

      {/* Cut line */}
      <View style={s.cutRow}>
        <View style={s.cutLine} />
        <Text style={s.cutLabel}>✂  CUT HERE — RETAIN STUB BELOW</Text>
        <View style={s.cutLine} />
      </View>

      {/* Handover receipt stub — tear off, sign, and keep at each handover point */}
      <View style={s.stub}>
        <View style={s.stubHead}>
          <MiniBrand />
          <Text style={s.stubTitle}>HANDOVER RECEIPT — CHAIN OF CUSTODY</Text>
        </View>
        <View style={s.stubGrid}>
          <View style={s.stubCell}>
            <Text style={s.stubCellLabel}>TRACKING ID</Text>
            <Text style={s.stubCellValue}>{qrSeed}</Text>
          </View>
          <View style={s.stubCell}>
            <Text style={s.stubCellLabel}>BAG</Text>
            <Text style={s.stubCellValue}>{String(l.bagNumber).padStart(2, '0')} of {l.bagTotal}</Text>
          </View>
          <View style={s.stubCell}>
            <Text style={s.stubCellLabel}>DATE</Text>
            <Text style={s.stubCellValue}>{fmtDate(l.pickupDate)}</Text>
          </View>
        </View>
        <View style={s.signRow}>
          <View style={s.signCell}>
            <View style={s.signLine} />
            <Text style={s.signLabel}>RECEIVED BY (NAME &amp; SIGNATURE)</Text>
          </View>
          <View style={s.signCell}>
            <View style={s.signLine} />
            <Text style={s.signLabel}>DATE / TIME</Text>
          </View>
        </View>
      </View>

      <View style={s.footer}>
        <Text style={s.footerTxt}>{INVOICE_COMPANY.name}  ·  {INVOICE_COMPANY.phone}  ·  {INVOICE_COMPANY.web}</Text>
      </View>
    </Page>
  )
}

function ConsignmentLabelDocument({ labels }: { labels: ConsignmentLabelWithQr[] }) {
  // One full A4 page per bag — matches the reference photo's scale (a
  // full printer-paper sheet taped over each bag's plastic wrap), unlike
  // the compact multi-per-page airport Bag Tag.
  return (
    <Document>
      {labels.map((l, i) => (
        <ConsignmentLabelPage key={`${l.trackingId}-${i}`} l={l} />
      ))}
    </Document>
  )
}

export async function buildConsignmentLabelPdfBuffer(labels: ConsignmentLabelInput[]): Promise<Buffer> {
  // QR codes are generated locally (lib/qr-code.ts) — no network call, so
  // this can no longer silently render a blank QR box the way the old
  // remote-fetched-at-render-time api.qrserver.com URL could.
  const withQr: ConsignmentLabelWithQr[] = await Promise.all(
    labels.map(async l => {
      const qrSeed = l.bagLabel || l.trackingId
      return { ...l, qrDataUri: await generateQrDataUri(labelTrackingUrl(qrSeed)) }
    })
  )
  const element = React.createElement(ConsignmentLabelDocument, { labels: withQr })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await pdf(element as any).toBlob()
  const arr  = await blob.arrayBuffer()
  return Buffer.from(arr)
}
