// BAGDROP — GC Bag Labels (A4, one label per bag)
//
// Pixel-matched to the founder's reference label (Bagdrop_Bag_Labels_
// MUM26CM072.pdf): every font, size, weight, colour and position below was
// measured from that PDF. Typography = Inter (display / body) + DejaVu Sans
// Mono (small caps labels, letter-spaced) — the two families the reference
// uses — served from /public/fonts. Page size is the reference's own
// 595.92 x 842.88 pt (A4).
//
// One page per bag, driven by the LR/GC row. Client-side @react-pdf/renderer
// (called as a function, rendered with pdf(...).toBlob()), same pattern as
// components/admin/LRPDF.tsx, so Download and Print are the identical file.
import React from 'react'
import { Document, Page, View, Text, Image, Svg, Rect, Path, Font, StyleSheet } from '@react-pdf/renderer'
import { GC_LABEL_LOGO_DATA_URI } from '@/lib/gc-label-logo'
import { code128Bars } from '@/lib/code128'

// ── Fonts ───────────────────────────────────────────────────
const FONT_BASE =
  typeof window !== 'undefined' ? '/fonts/' : (process.env.GC_FONT_DIR ? process.env.GC_FONT_DIR + '/' : 'public/fonts/')
let fontsRegistered = false
function registerFonts() {
  if (fontsRegistered) return
  fontsRegistered = true
  Font.register({
    family: 'Inter',
    fonts: [400, 500, 600, 700, 800, 900].map(w => ({ src: `${FONT_BASE}Inter-${w}.woff`, fontWeight: w })),
  })
  Font.register({
    family: 'DejaVuMono',
    fonts: [
      { src: `${FONT_BASE}DejaVuSansMono.ttf`, fontWeight: 400 },
      { src: `${FONT_BASE}DejaVuSansMono-Bold.ttf`, fontWeight: 700 },
    ],
  })
  Font.register({ family: 'DejaVuSans', src: `${FONT_BASE}DejaVuSans.ttf` })
  Font.registerHyphenationCallback(w => [w])
}

// ── Reference palette ───────────────────────────────────────
const ORANGE = '#ff6300'
const NAVY   = '#0b1426'
const GREY   = '#747474'
const SLATE  = '#3a4250'
const PEACH  = '#fff3ec'
const PEACH2 = '#ffd9c2'
const HAIR   = '#eaeaea'

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
const up  = (s: string | null | undefined, fb = '—') => (s && s.trim() ? s.trim().toUpperCase() : fb)
const val = (s: string | null | undefined, fb = '—') => (s && s.trim() ? s.trim() : fb)
// Shrinks a font size so a long string still fits `maxW` points (Inter ≈ 0.62em avg caps).
const fit = (size: number, text: string, maxW: number, perChar = 0.66) =>
  Math.max(size * 0.55, Math.min(size, maxW / Math.max(1, text.length * perChar)))

// Value text for the Contents / Booked-at boxes: one 15 pt line when it fits
// (the reference look); otherwise a smaller two-line wrap that still ends
// above the next label, so long values can never overlap "TOTAL PACKAGES".
function boxVal(text: string, width: number) {
  const upper = text === text.toUpperCase() && /[A-Z]/.test(text)
  const est = text.length * 15 * (upper ? 0.74 : 0.6)
  if (est <= width) return { size: 15, lines: 1, lh: 1.2 }
  if (text.length * 11.5 * (upper ? 0.74 : 0.6) <= width * 2) return { size: 11.5, lines: 2, lh: 1.15 }
  return { size: 9.5, lines: 2, lh: 1.15 }
}

const PAGE_W = 595.92
const PAGE_H = 842.88

// Absolutely-positioned text: `x`/`y` are the reference bbox corners (pt).
const mono = (size: number, color: string, ls: number, bold = true) => ({
  fontFamily: 'DejaVuMono', fontWeight: bold ? 700 : 400, fontSize: size, color, letterSpacing: ls,
}) as const
const inter = (size: number, weight: number, color: string, ls = 0) => ({
  fontFamily: 'Inter', fontWeight: weight, fontSize: size, color, letterSpacing: ls,
}) as const

const s = StyleSheet.create({
  page: { backgroundColor: '#fff' },
  abs: { position: 'absolute' },
})

function Barcode({ text, width, height }: { text: string; width: number; height: number }) {
  const { bars, modules } = code128Bars(text)
  const u = width / modules
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {bars.map((b, i) => <Rect key={i} x={b.x * u} y={0} width={b.w * u} height={height} fill="#000" />)}
    </Svg>
  )
}

export default function GCLabelsPDF(input: GCLabelInput) {
  registerFonts()
  const total = Math.max(1, Math.floor(Number(input.totalBags) || 1))
  const nameTxt = up(input.deliverToName)
  const fromTxt = up(input.fromCity)
  const toTxt   = up(input.toCity)
  // From/To share one size: 38 pt when they fit, shrinking for long names (e.g. MUMBAI AIRPORT (T2)).
  const cityPt = Math.max(16, Math.min(38, (451.9 - 30 - 16 - 24) / (Math.max(1, fromTxt.length + toTxt.length) * 0.76)))
  const cV = boxVal(val(input.contents), 138)
  const bV = boxVal(val(input.bookedAt), 143)
  const dV = boxVal(val(input.deliveryAt), 143)
  // Address: short ones keep the reference look (20 pt, wraps at 400 pt). Longer
  // ones use the full width at a slightly smaller size so they stay on 2 lines.
  const addrTxt = val(input.deliverToAddress)
  const addrSize = addrTxt.length <= 70 ? 20 : addrTxt.length <= 112 ? 18 : 16
  const addrW = addrTxt.length <= 70 ? 400 : 486
  const addrLH = addrSize * 1.35
  const addrLines = Math.min(3, Math.max(2, Math.ceil(addrTxt.length * addrSize * 0.5 / addrW)))
  const addrBar = 440.7 + addrLines * addrLH + 4.1 - 380.2

  return (
    <Document title={`Bagdrop_Bag_Labels_${input.gcNumber}`} author="Bagdrop Logistics Solutions Pvt. Ltd.">
      {Array.from({ length: total }, (_, i) => i + 1).map(n => {
        const code = `${input.gcNumber}-${String(n).padStart(2, '0')}`
        return (
          <Page key={n} size={[PAGE_W, PAGE_H]} style={s.page}>
            {/* ── Header ── */}
            <Image src={GC_LABEL_LOGO_DATA_URI} style={[s.abs, { left: 42.8, top: 40.5, width: 50.2, height: 73.5 }]} />
            <Text style={[s.abs, { right: PAGE_W - 552.5, top: 49.3 }, inter(12, 800, NAVY, 0.24)]}>BAGDROP LOGISTICS SOLUTIONS PVT. LTD.</Text>
            <Text style={[s.abs, { right: PAGE_W - 552.4, top: 66.2 }, mono(7.5, ORANGE, 0.38)]}>EXCESS BAGGAGE & DOOR-TO-DOOR LUGGAGE DELIVERY ACROSS INDIA</Text>
            <Text style={[s.abs, { right: PAGE_W - 552.7, top: 80.3 }, inter(9, 400, GREY)]}>WhatsApp +91 63 5711 5711 / +91 63 5733 5733</Text>
            <Text style={[s.abs, { right: PAGE_W - 552.7, top: 93.8 }, inter(9, 400, GREY)]}>info@bagdrop.co · www.bagdrop.co</Text>
            <View style={[s.abs, { left: 42.8, top: 128.2, width: 510, height: 2.3, backgroundColor: ORANGE }]} />

            {/* ── GC number + barcode ── */}
            <Text style={[s.abs, { left: 42.5, top: 154.2 }, mono(9, GREY, 1.15)]}>GC NO.</Text>
            <Text style={[s.abs, { left: 42.5, top: 163.1 }, inter(fit(29, input.gcNumber, 300, 0.8), 900, NAVY, 0.3)]}>{input.gcNumber}</Text>
            <Text style={[s.abs, { left: 42.5, top: 202.2 }, mono(9, GREY, 1.15)]}>GC DATE</Text>
            <Text style={[s.abs, { left: 101.4, top: 202.2 }, mono(9, NAVY, 0.4)]}>{fmtDate(input.gcDate)}</Text>

            <View style={[s.abs, { left: 366, top: 147.8, width: 187.1, height: 56.6, backgroundColor: '#fff' }]} />
            <View style={[s.abs, { left: 371.7, top: 150.6 }]}>
              <Barcode text={code} width={181.9} height={45.3} />
            </View>
            <Text style={[s.abs, { left: 366, width: 187.1, top: 209.7, textAlign: 'center' }, mono(9, NAVY, 1.52, false)]}>{code}</Text>

            {/* ── Route ── */}
            <View style={[s.abs, { left: 43.1, top: 249.4, width: 509.3, height: 102, backgroundColor: PEACH, borderWidth: 0.75, borderColor: PEACH2, borderRadius: 15 }]} />
            <Text style={[s.abs, { left: 71.6, top: 275 }, mono(9, GREY, 1.15)]}>FROM</Text>
            <Text style={[s.abs, { right: PAGE_W - 522.5, top: 275 }, mono(9, GREY, 1.15)]}>TO</Text>
            {/* From → To: one flex row, so long city names shrink instead of colliding */}
            <View style={[s.abs, { left: 71.6, top: 282.6, width: 451.9, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <Text style={inter(cityPt, 900, NAVY, cityPt * 0.01)}>{fromTxt}</Text>
                <Svg width={30} height={cityPt} viewBox="0 0 30 34" style={{ marginLeft: 16, marginTop: cityPt * 0.04 }}>
                  <Path d="M3 17 H22" stroke={ORANGE} strokeWidth={3.4} />
                  <Path d="M15 7 L25 17 L15 27" stroke={ORANGE} strokeWidth={3.4} fill="none" />
                </Svg>
              </View>
              <Text style={inter(cityPt, 900, ORANGE, cityPt * 0.01)}>{toTxt}</Text>
            </View>

            {/* ── Deliver to ── */}
            <View style={[s.abs, { left: 66.9 - 24.1, top: 380.2, width: 4.4, height: addrBar, backgroundColor: ORANGE }]} />
            <Text style={[s.abs, { left: 66.9, top: 385.2 }, mono(9, ORANGE, 1.15)]}>DELIVER TO</Text>
            <Text style={[s.abs, { left: 66.9, top: 396.6, width: 486 }, inter(fit(31, nameTxt, 486, 0.72), 900, NAVY, 0.31)]}>{nameTxt}</Text>
            <Text style={[s.abs, { left: 66.9, top: 440.7, width: addrW, lineHeight: 1.35, maxLines: 3 }, inter(addrSize, 500, SLATE, -0.3)]}>{addrTxt}</Text>

            {/* ── Bag panel ── */}
            <View style={[s.abs, { left: 43.1, top: 527.6, width: 509.3, height: 146.3, borderWidth: 0.75, borderColor: HAIR, borderRadius: 15, overflow: 'hidden' }]}>
              <View style={[s.abs, { left: -0.4, top: -0.4, width: 180, height: 146.3, backgroundColor: ORANGE }]} />
              <View style={[s.abs, { left: 180.4, top: 0, width: 0.7, height: 146.3, backgroundColor: HAIR }]} />
              <View style={[s.abs, { left: 344.7, top: 0, width: 0.7, height: 146.3, backgroundColor: HAIR }]} />
            </View>
            <Text style={[s.abs, { left: 63.1, top: 553.2 }, mono(9, '#ffe3d1', 1.15)]}>BAG NO.</Text>
            <Text style={[s.abs, { left: 63.1, top: 555.3 }, inter(84, 900, '#fff', -0.84)]}>
              {n}<Text style={inter(28, 700, '#ffe3d1', 1.4)}>{' '}</Text><Text style={inter(28, 700, '#ffe3d1')}>{`/ ${total}`}</Text>
            </Text>

            <Text style={[s.abs, { left: 244.4, top: 553.2 }, mono(9, GREY, 1.15)]}>CONTENTS</Text>
            <Text style={[s.abs, { left: 244.4, top: 566, width: 138, maxLines: cV.lines, lineHeight: cV.lh }, inter(cV.size, 700, NAVY)]}>{val(input.contents)}</Text>
            <Text style={[s.abs, { left: 244.4, top: 595.2 }, mono(9, GREY, 1.15)]}>TOTAL PACKAGES</Text>
            <Text style={[s.abs, { left: 244.4, top: 608.8 }, inter(15, 700, NAVY)]}>{`${total} ${total === 1 ? 'Bag' : 'Bags'}`}</Text>

            <Text style={[s.abs, { left: 408.5, top: 553.2 }, mono(9, GREY, 1.15)]}>BOOKED AT</Text>
            <Text style={[s.abs, { left: 408.5, top: 566, width: 143, maxLines: bV.lines, lineHeight: bV.lh }, inter(bV.size, 700, NAVY)]}>{val(input.bookedAt)}</Text>
            <Text style={[s.abs, { left: 408.5, top: 595.2 }, mono(9, GREY, 1.15)]}>DELIVERY AT</Text>
            <Text style={[s.abs, { left: 408.5, top: 608.8, width: 143, maxLines: dV.lines, lineHeight: dV.lh }, inter(dV.size, 700, NAVY)]}>{val(input.deliveryAt)}</Text>

            {/* ── Consignor / LR type ── */}
            <Text style={[s.abs, { left: 42.5, top: 701.7 }, mono(9, GREY, 1.15)]}>CONSIGNOR</Text>
            <Text style={[s.abs, { left: 104.4, top: 700.3, width: 320, maxLines: 1 }, inter(10.5, 400, SLATE)]}>
              <Text style={inter(10.5, 700, NAVY)}>{val(input.consignorName)}</Text>
              {input.consignorAddress ? ` · ${input.consignorAddress}` : ''}
            </Text>
            <Text style={[s.abs, { left: 434.6, top: 701.7 }, mono(9, GREY, 1.15)]}>LR TYPE</Text>
            <Text style={[s.abs, { left: 483.4, top: 700.3, width: 70 }, inter(10.5, 700, NAVY)]}>{val(input.lrType)}</Text>

            {/* ── Handle with care ── */}
            <View style={[s.abs, { left: 41.9, top: 739.4, width: 511.7, height: 44.4, borderWidth: 1, borderStyle: 'dashed', borderColor: PEACH2, borderRadius: 10 }]} />
            <Text style={[s.abs, { left: 41.9, width: 511.7, top: 755.2, textAlign: 'center' }, mono(10.99, ORANGE, 2.25)]}>HANDLE WITH CARE · KEEP DRY · DO NOT THROW</Text>

            {/* ── Footer band ── */}
            <View style={[s.abs, { left: 0, top: 805.5, width: PAGE_W, height: 37, backgroundColor: PEACH }]} />
            <View style={[s.abs, { left: 0, top: 805.5, width: PAGE_W, height: 2.3, backgroundColor: ORANGE }]} />
            <Text style={[s.abs, { left: 0, width: PAGE_W, top: 819.3, textAlign: 'center' }, mono(10, ORANGE, 2.25)]}>THE BAGGAGE LAYER · SEALED · TRACKED · INSURED</Text>
          </Page>
        )
      })}
    </Document>
  )
}
