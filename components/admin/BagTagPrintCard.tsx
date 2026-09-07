'use client'

import { LOGO_FULL_COLOR_DATA_URI } from '@/lib/bag-tag-logo'
import { cityCode, barcodeStripes } from '@/lib/bag-tags'

// BAGDROP — Operational Baggage Tag System (Phase 1)
//
// Shared browser-print tag card — used by BOTH the Individual booking
// tags page and the Group booking tags page, so the visual design (and
// the required field list from the founder spec) only lives in one
// place. Mirrors lib/bag-tags-pdf.tsx's layout for the "Download PDF"
// path, just as HTML/CSS instead of react-pdf primitives.
//
// Redesigned 2026-09-07 (founder spec: "airport type tag design") from a
// single vertical digital-card layout into a 4-part airline-style claim
// tag — barcode spine, main coupon, FROM/TO flight panel, tear-off claim
// stub — using the real horizontal BagDrop logo lock-up (lib/bag-tag-
// logo.ts) everywhere, including a small white chip on the dark flight
// panel (the existing LOGO_FULL_WHITE_DATA_URI asset turned out to be a
// tall STACKED lock-up, not a horizontal one — unsuited to a short wide
// header bar, so the chip approach reuses the one horizontal asset
// instead), rather than a redrawn circular mark.
//
// IMPORTANT: this is still BagDrop's own OPERATIONAL tracking tag — never
// represented as an airline-issued baggage tag. The FROM/TO codes are a
// decorative styling touch (see lib/bag-tags.ts's cityCode) and the QR
// encodes only the bag's own tracking URL, never customer name/phone/
// address.

export interface BagTagCardData {
  id:               string
  bagLabel:         string
  customerName:     string
  bookingId:        string
  route:            string
  fromCity:         string | null
  toCity:           string | null
  serviceLabel:     string
  bagNumber:        number
  bagTotal:         number
  pickupDate:       string | null
  deliveryLocation: string | null
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  try { return new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return d }
}

function qrUrl(data: string, size: number) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&data=${encodeURIComponent(data)}`
}

export function bagTrackingUrl(bagLabel: string) {
  return `https://www.bagdrop.co/track-bag/${encodeURIComponent(bagLabel)}`
}

function Barcode({ seed, vertical }: { seed: string; vertical?: boolean }) {
  const stripes = barcodeStripes(seed, vertical ? 56 : 34)
  return (
    <div className={`bag-tag-barcode${vertical ? ' vertical' : ''}`}>
      {stripes.map((s, i) => (
        <span key={i} style={{ [vertical ? 'height' : 'width']: `${s.pct}%`, background: s.bar ? '#111827' : 'transparent' }} />
      ))}
    </div>
  )
}

export function BagTagPrintCard({ tag, selected, onToggle }: { tag: BagTagCardData; selected?: boolean; onToggle?: () => void }) {
  const fromCode = cityCode(tag.fromCity)
  const toCode   = cityCode(tag.toCity)

  return (
    <div className={`bag-tag${selected === false ? ' bag-tag-unselected' : ''}`}>
      {onToggle && (
        <label className="bag-tag-check no-print">
          <input type="checkbox" checked={selected !== false} onChange={onToggle} />
        </label>
      )}

      {/* ── Spine — decorative vertical barcode ─────────────────────── */}
      <div className="bag-tag-col bag-tag-spine">
        <Barcode seed={tag.bagLabel} vertical />
      </div>

      {/* ── Main coupon ──────────────────────────────────────────────── */}
      <div className="bag-tag-col bag-tag-main">
        <div className="bag-tag-main-head">
          <img className="bag-tag-logo-color" src={LOGO_FULL_COLOR_DATA_URI} alt="BAGDROP" />
          <span className="bag-tag-pill">{tag.serviceLabel || 'Operational Tag'}</span>
        </div>
        <div className="bag-tag-divider" />
        <div className="bag-tag-fields">
          <div className="bag-tag-field"><span>BOOKING ID</span><b>{tag.bookingId}</b></div>
          <div className="bag-tag-field"><span>CUSTOMER</span><b>{tag.customerName}</b></div>
          <div className="bag-tag-field"><span>ROUTE</span><b>{tag.route || '—'}</b></div>
          <div className="bag-tag-field"><span>SERVICE</span><b>{tag.serviceLabel || '—'}</b></div>
          <div className="bag-tag-field"><span>PICKUP DATE</span><b>{fmtDate(tag.pickupDate)}</b></div>
          <div className="bag-tag-field"><span>DELIVER TO</span><b>{tag.deliveryLocation || '—'}</b></div>
          <div className="bag-tag-field"><span>BAG COUNT</span><b>Bag {tag.bagNumber} of {tag.bagTotal}</b></div>
          <div className="bag-tag-field"><span>TRACKING ID</span><b className="bag-tag-mono">{tag.bagLabel}</b></div>
        </div>
        <div className="bag-tag-qr-wrap">
          <div className="bag-tag-qr-cap">SCAN TO<br />TRACK BAG<br /><span>{tag.bagLabel}</span></div>
          <img src={qrUrl(bagTrackingUrl(tag.bagLabel), 160)} alt={tag.bagLabel} />
        </div>
      </div>

      {/* ── Flight-style FROM / TO panel ─────────────────────────────── */}
      <div className="bag-tag-col bag-tag-flight">
        <div className="bag-tag-flight-head">
          <span className="bag-tag-flight-chip"><img src={LOGO_FULL_COLOR_DATA_URI} alt="BAGDROP" /></span>
          <span>BAG TAG</span>
        </div>
        <div className="bag-tag-flight-body">
          <div className="bag-tag-fromto">
            <span className="bag-tag-fromto-label">FROM</span>
            <span className="bag-tag-fromto-code">{fromCode}</span>
            <span className="bag-tag-fromto-city">{tag.fromCity || '—'}</span>
          </div>
          <div className="bag-tag-fromto">
            <span className="bag-tag-fromto-label">TO</span>
            <span className="bag-tag-fromto-code bag-tag-fromto-code-orange">{toCode}</span>
            <span className="bag-tag-fromto-city">{tag.toCity || '—'}</span>
          </div>
          <div className="bag-tag-flight-divider" />
          <div className="bag-tag-bagno"><span>BAG NO.</span><b>{String(tag.bagNumber).padStart(2, '0')} / {tag.bagTotal}</b></div>
        </div>
        <div className="bag-tag-care">
          <span>HANDLE WITH CARE</span>
        </div>
      </div>

      {/* ── Tear-off claim stub ──────────────────────────────────────── */}
      <div className="bag-tag-col bag-tag-stub">
        <img className="bag-tag-logo-color bag-tag-logo-small" src={LOGO_FULL_COLOR_DATA_URI} alt="BAGDROP" />
        <span className="bag-tag-stub-label">CLAIM STUB</span>
        <Barcode seed={tag.bagLabel} />
        <div className="bag-tag-stub-fields">
          <div className="bag-tag-field"><span>ROUTE</span><b>{fromCode} → {toCode}</b></div>
          <div className="bag-tag-field"><span>CUSTOMER</span><b>{tag.customerName}</b></div>
          <div className="bag-tag-field"><span>BAG</span><b>{String(tag.bagNumber).padStart(2, '0')} / {tag.bagTotal}</b></div>
        </div>
        <img className="bag-tag-stub-qr" src={qrUrl(bagTrackingUrl(tag.bagLabel), 96)} alt={tag.bagLabel} />
      </div>
    </div>
  )
}

// Shared CSS — injected once via a <style> tag by each page. Kept as one
// exported string (rather than a CSS module) so both pages can splice it
// into their own print stylesheet block alongside their toolbar/layout
// styles, matching this codebase's existing print-page convention
// (inline <style> in the page component, no CSS module imports).
export const BAG_TAG_CARD_STYLES = `
  .bag-tag {
    position: relative; display: flex; flex-direction: row;
    border: 1.5px solid #e7e2da; border-radius: 10px;
    background: #fff; overflow: hidden; aspect-ratio: 3.05 / 1;
    break-inside: avoid; page-break-inside: avoid;
    box-shadow: 0 1px 3px rgba(17,24,39,0.06);
  }
  .bag-tag-unselected { opacity: 0.35; }
  .bag-tag-check { position: absolute; top: 6px; right: 6px; z-index: 3; }
  .bag-tag-check input { width: 16px; height: 16px; cursor: pointer; }

  .bag-tag-col { position: relative; display: flex; flex-direction: column; height: 100%; }

  /* Spine */
  .bag-tag-spine { flex: 0 0 8%; padding: 6% 10%; border-right: 1.5px dashed #d4cfc6; background: #fff; }
  .bag-tag-barcode { display: flex; width: 100%; height: 100%; }
  .bag-tag-barcode.vertical { flex-direction: column; }
  .bag-tag-barcode:not(.vertical) { flex-direction: row; }
  .bag-tag-barcode span { flex: 0 0 auto; }

  /* Main coupon */
  .bag-tag-main { flex: 0 0 41%; padding: 4% 3%; border-right: 1.5px dashed #d4cfc6; }
  .bag-tag-main-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .bag-tag-logo-color { height: 22px; width: auto; display: block; }
  .bag-tag-logo-small { height: 15px; }
  .bag-tag-pill { border: 1.5px solid #f97316; color: #c74f0f; border-radius: 999px; padding: 2px 8px; font-size: 6.2px; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase; white-space: nowrap; max-width: 46%; overflow: hidden; text-overflow: ellipsis; }
  .bag-tag-divider { height: 1px; background: #e5e0d8; margin: 5% 0 4%; }
  .bag-tag-fields { display: grid; grid-template-columns: 1fr 1fr; row-gap: 5%; column-gap: 8px; flex: 1; }
  .bag-tag-field { display: flex; flex-direction: column; min-width: 0; }
  .bag-tag-field span { font-size: 6px; font-weight: 700; letter-spacing: 0.5px; color: #918b81; }
  .bag-tag-field b { font-size: 9px; font-weight: 800; color: #111827; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bag-tag-mono { font-family: monospace; font-size: 8px !important; }
  .bag-tag-qr-wrap { position: absolute; right: 3%; bottom: 4%; display: flex; align-items: flex-end; gap: 6px; }
  .bag-tag-qr-cap { font-size: 5.5px; font-weight: 700; color: #111827; text-align: right; line-height: 1.35; }
  .bag-tag-qr-cap span { display: block; font-weight: 400; color: #918b81; font-size: 5px; margin-top: 1px; }
  .bag-tag-qr-wrap img { width: 15%; min-width: 34px; max-width: 46px; height: auto; display: block; border: 1px solid #e5e0d8; border-radius: 3px; }

  /* Flight panel */
  .bag-tag-flight { flex: 0 0 24%; border-right: 1.5px dashed #d4cfc6; background: #fff; }
  .bag-tag-flight-head { background: #111827; color: #fff; display: flex; align-items: center; justify-content: space-between; padding: 4% 6%; }
  .bag-tag-flight-chip { background: #fff; border-radius: 4px; padding: 2px 6px; display: flex; align-items: center; }
  .bag-tag-flight-chip img { height: 11px; width: auto; display: block; }
  .bag-tag-flight-head > span:last-child { font-size: 6.5px; font-weight: 800; letter-spacing: 1.2px; color: #f97316; }
  .bag-tag-flight-body { flex: 1; padding: 5% 8%; display: flex; flex-direction: column; justify-content: center; gap: 4%; }
  .bag-tag-fromto { display: flex; flex-direction: column; line-height: 1; }
  .bag-tag-fromto-label { font-size: 5.5px; font-weight: 800; letter-spacing: 1px; color: #918b81; }
  .bag-tag-fromto-code { font-size: 17px; font-weight: 800; color: #111827; margin-top: 1px; }
  .bag-tag-fromto-code-orange { color: #c74f0f; }
  .bag-tag-fromto-city { font-size: 6px; font-weight: 600; letter-spacing: 0.4px; color: #918b81; text-transform: uppercase; margin-top: 1px; }
  .bag-tag-flight-divider { height: 1px; background: #e5e0d8; margin: 2% 0; }
  .bag-tag-bagno { display: flex; align-items: baseline; gap: 6px; }
  .bag-tag-bagno span { font-size: 5.5px; font-weight: 800; letter-spacing: 1px; color: #918b81; }
  .bag-tag-bagno b { font-size: 10px; font-weight: 800; color: #111827; }
  .bag-tag-care { background: #111827; color: #fff; padding: 4% 8%; font-size: 6.5px; font-weight: 800; letter-spacing: 0.8px; text-align: center; }

  /* Claim stub */
  .bag-tag-stub { flex: 0 0 27%; padding: 4% 4%; gap: 4%; }
  .bag-tag-stub-label { font-size: 5.5px; font-weight: 700; letter-spacing: 0.8px; color: #918b81; margin-top: -2%; }
  .bag-tag-stub .bag-tag-barcode { height: 20%; }
  .bag-tag-stub-fields { display: flex; flex-direction: column; gap: 3%; flex: 1; }
  .bag-tag-stub-fields .bag-tag-field b { font-size: 8px; }
  .bag-tag-stub-qr { position: absolute; right: 4%; bottom: 4%; width: 20%; min-width: 32px; max-width: 42px; height: auto; border: 1px solid #e5e0d8; border-radius: 3px; }
`
