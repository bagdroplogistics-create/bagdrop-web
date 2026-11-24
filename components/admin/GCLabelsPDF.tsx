// BAGDROP — GC Bag Labels (A4, one label per bag)
//
// The label the pickup team prints and sticks on each bag at the customer's
// home: GC number + barcode, route, deliver-to, "Bag 1 / 3", contents and
// delivery details. One A4 page per bag, driven entirely by the LR/GC row
// (lrs table) — so it exists for every GC, which is created automatically
// when an inquiry is confirmed.
//
// Same client-side @react-pdf/renderer pattern as components/admin/LRPDF.tsx
// (called as a function, rendered with pdf(...).toBlob()), so Download and
// Print always produce the identical document.
import React from 'react'
import { Document, Page, View, Text, Image, Svg, Rect, Path, StyleSheet } from '@react-pdf/renderer'
import { GC_LABEL_LOGO_DATA_URI, GC_LABEL_LOGO_RATIO } from '@/lib/gc-label-logo'
import { code128Bars } from '@/lib/code128'

const ORANGE = '#FF6200'
const NAVY   = '#0F172A'
const GREY   = '#6B7280'
const PEACH  = '#FFF1E8'
const LINE   = '#E5E7EB'

export interface GCLabelInput {
  gcNumber: string
  gcDate: string | null
  fromCity: string | null
  toCity: string | null
  deliverToName: string | null
  deliverToAddress: string | null
  totalBags: number
  contents: string | null
  bookedAt: string | null
  deliveryAt: string | null
  consignorName: string | null
  consignorAddress: string | null
  lrType: string | null
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d.includes('T') ? d : d + 'T00:00:00')
  if (isNaN(dt.getTime())) return d
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(dt.getDate())}-${p(dt.getMonth() + 1)}-${dt.getFullYear()}`
}

const up = (s: string | null | undefined, fb = '—') => (s && s.trim() ? s.trim().toUpperCase() : fb)
const val = (s: string | null | undefined, fb = '—') => (s && s.trim() ? s.trim() : fb)

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', backgroundColor: '#fff', padding: 0 },
  inner: { paddingHorizontal: 42, paddingTop: 36 },

  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo: { width: 50 * GC_LABEL_LOGO_RATIO, height: 50 },
  headRight: { alignItems: 'flex-end', marginTop: 8 },
  company: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY },
  tagline: { fontSize: 6.3, fontFamily: 'Helvetica-Bold', color: ORANGE, letterSpacing: 0.6, marginTop: 3 },
  contact: { fontSize: 7.3, color: GREY, marginTop: 4 },
  rule: { height: 1.6, backgroundColor: ORANGE, marginTop: 12 },

  gcRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28 },
  micro: { fontSize: 6.4, fontFamily: 'Helvetica-Bold', color: GREY, letterSpacing: 1.4 },
  gcNo: { fontSize: 28, fontFamily: 'Helvetica-Bold', color: NAVY, marginTop: 4, letterSpacing: 0.4 },
  gcDate: { flexDirection: 'row', marginTop: 8 },
  gcDateVal: { fontSize: 7.6, fontFamily: 'Helvetica-Bold', color: NAVY, marginLeft: 8 },
  barcodeCap: { fontSize: 6.8, color: GREY, letterSpacing: 1.6, marginTop: 5, textAlign: 'center' },

  route: { marginTop: 30, backgroundColor: PEACH, borderRadius: 10, borderWidth: 0.8, borderColor: '#FDDCC6', paddingHorizontal: 22, paddingTop: 12, paddingBottom: 16 },
  routeLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  routeCities: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  city: { fontSize: 29, fontFamily: 'Helvetica-Bold' },

  deliver: { marginTop: 32, flexDirection: 'row' },
  deliverBar: { width: 3.2, backgroundColor: ORANGE, marginRight: 20 },
  deliverLabel: { fontSize: 6.8, fontFamily: 'Helvetica-Bold', color: ORANGE, letterSpacing: 1.4 },
  deliverName: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: NAVY, marginTop: 6 },
  deliverAddr: { fontSize: 13, color: '#374151', marginTop: 8, lineHeight: 1.45, maxWidth: 440 },

  panel: { marginTop: 34, flexDirection: 'row', borderWidth: 0.8, borderColor: LINE, borderRadius: 10, overflow: 'hidden', height: 142 },
  bagBox: { width: 175, backgroundColor: ORANGE, paddingLeft: 18, paddingTop: 16 },
  bagLabel: { fontSize: 6.8, fontFamily: 'Helvetica-Bold', color: '#fff', letterSpacing: 1.4 },
  bagNumRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 },
  bagNum: { fontSize: 66, fontFamily: 'Helvetica-Bold', color: '#fff', lineHeight: 1 },
  bagOf: { fontSize: 19, fontFamily: 'Helvetica-Bold', color: '#FFD9C2', marginBottom: 8, marginLeft: 3 },
  midCol: { flex: 1, paddingLeft: 18, paddingTop: 16, borderRightWidth: 0.8, borderColor: LINE },
  rightCol: { width: 170, paddingLeft: 18, paddingTop: 16 },
  fLabel: { fontSize: 6.2, fontFamily: 'Helvetica-Bold', color: GREY, letterSpacing: 1.2 },
  fVal: { fontSize: 11.5, fontFamily: 'Helvetica-Bold', color: NAVY, marginTop: 3 },
  fGap: { marginTop: 12 },

  consignor: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28 },
  consignorTxt: { fontSize: 8.4, color: '#374151', maxWidth: 360 },
  consignorLabel: { fontSize: 6.4, fontFamily: 'Helvetica-Bold', color: GREY, letterSpacing: 1.2 },
  bold: { fontFamily: 'Helvetica-Bold', color: NAVY },

  care: { marginTop: 30, borderWidth: 0.8, borderColor: '#FDDCC6', borderStyle: 'dashed', borderRadius: 8, paddingVertical: 12 },
  careTxt: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: ORANGE, letterSpacing: 2.4, textAlign: 'center' },

  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 42, backgroundColor: PEACH, borderTopWidth: 2, borderColor: ORANGE, justifyContent: 'center' },
  footerTxt: { fontSize: 7.6, fontFamily: 'Helvetica-Bold', color: ORANGE, letterSpacing: 2.6, textAlign: 'center' },
})

function Barcode({ text, width = 170, height = 52 }: { text: string; width?: number; height?: number }) {
  const { bars, modules } = code128Bars(text)
  const u = width / modules
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {bars.map((b, i) => (
        <Rect key={i} x={b.x * u} y={0} width={b.w * u} height={height} fill={NAVY} />
      ))}
    </Svg>
  )
}

const Field = ({ label, value, gap }: { label: string; value: string; gap?: boolean }) => (
  <View style={gap ? s.fGap : undefined}>
    <Text style={s.fLabel}>{label}</Text>
    <Text style={s.fVal}>{value}</Text>
  </View>
)

export default function GCLabelsPDF(input: GCLabelInput) {
  const total = Math.max(1, Math.floor(Number(input.totalBags) || 1))
  const bagNos = Array.from({ length: total }, (_, i) => i + 1)

  return (
    <Document title={`${input.gcNumber} – Bag Labels`} author="Bagdrop Logistics Solutions Pvt. Ltd.">
      {bagNos.map(n => {
        const code = `${input.gcNumber}-${String(n).padStart(2, '0')}`
        return (
          <Page key={n} size="A4" style={s.page}>
            <View style={s.inner}>
              {/* Header */}
              <View style={s.head}>
                <Image src={GC_LABEL_LOGO_DATA_URI} style={s.logo} />
                <View style={s.headRight}>
                  <Text style={s.company}>BAGDROP LOGISTICS SOLUTIONS PVT. LTD.</Text>
                  <Text style={s.tagline}>EXCESS BAGGAGE & DOOR-TO-DOOR LUGGAGE DELIVERY ACROSS INDIA</Text>
                  <Text style={s.contact}>WhatsApp +91 63 5711 5711 / +91 63 5733 5733</Text>
                  <Text style={s.contact}>info@bagdrop.co · www.bagdrop.co</Text>
                </View>
              </View>
              <View style={s.rule} />

              {/* GC number + barcode */}
              <View style={s.gcRow}>
                <View>
                  <Text style={s.micro}>GC NO.</Text>
                  <Text style={s.gcNo}>{input.gcNumber}</Text>
                  <View style={s.gcDate}>
                    <Text style={s.micro}>GC DATE</Text>
                    <Text style={s.gcDateVal}>{fmtDate(input.gcDate)}</Text>
                  </View>
                </View>
                <View>
                  <Barcode text={code} />
                  <Text style={s.barcodeCap}>{code}</Text>
                </View>
              </View>

              {/* Route */}
              <View style={s.route}>
                <View style={s.routeLabels}>
                  <Text style={s.micro}>FROM</Text>
                  <Text style={s.micro}>TO</Text>
                </View>
                <View style={s.routeCities}>
                  <Text style={[s.city, { color: NAVY }]}>{up(input.fromCity)}</Text>
                  <Svg width={30} height={16} viewBox="0 0 30 16" style={{ marginHorizontal: 14 }}>
                    <Path d="M2 8 H22" stroke={ORANGE} strokeWidth={2.6} />
                    <Path d="M16 2 L24 8 L16 14" stroke={ORANGE} strokeWidth={2.6} fill="none" />
                  </Svg>
                  <Text style={[s.city, { color: ORANGE }]}>{up(input.toCity)}</Text>
                </View>
              </View>

              {/* Deliver to */}
              <View style={s.deliver}>
                <View style={s.deliverBar} />
                <View>
                  <Text style={s.deliverLabel}>DELIVER TO</Text>
                  <Text style={s.deliverName}>{up(input.deliverToName)}</Text>
                  <Text style={s.deliverAddr}>{val(input.deliverToAddress)}</Text>
                </View>
              </View>

              {/* Bag no + details */}
              <View style={s.panel}>
                <View style={s.bagBox}>
                  <Text style={s.bagLabel}>BAG NO.</Text>
                  <View style={s.bagNumRow}>
                    <Text style={s.bagNum}>{n}</Text>
                    <Text style={s.bagOf}>/ {total}</Text>
                  </View>
                </View>
                <View style={s.midCol}>
                  <Field label="CONTENTS" value={val(input.contents)} />
                  <Field label="TOTAL PACKAGES" value={`${total} ${total === 1 ? 'Bag' : 'Bags'}`} gap />
                </View>
                <View style={s.rightCol}>
                  <Field label="BOOKED AT" value={val(input.bookedAt)} />
                  <Field label="DELIVERY AT" value={val(input.deliveryAt)} gap />
                </View>
              </View>

              {/* Consignor + LR type */}
              <View style={s.consignor}>
                <Text style={s.consignorTxt}>
                  <Text style={s.consignorLabel}>CONSIGNOR  </Text>
                  <Text style={s.bold}>{val(input.consignorName)}</Text>
                  {input.consignorAddress ? ` · ${input.consignorAddress}` : ''}
                </Text>
                <Text style={s.consignorTxt}>
                  <Text style={s.consignorLabel}>LR TYPE  </Text>
                  <Text style={s.bold}>{val(input.lrType)}</Text>
                </Text>
              </View>

              <View style={s.care}>
                <Text style={s.careTxt}>HANDLE WITH CARE · KEEP DRY · DO NOT THROW</Text>
              </View>
            </View>

            <View style={s.footer}>
              <Text style={s.footerTxt}>THE BAGGAGE LAYER · SEALED · TRACKED · INSURED</Text>
            </View>
          </Page>
        )
      })}
    </Document>
  )
}
