'use client'

import { LOGO_FULL_COLOR_DATA_URI, LOGO_ICON_COLOR_DATA_URI } from '@/lib/bag-tag-logo'
// Deliberately from lib/bag-tag-display.ts, NOT lib/bag-tags.ts — this is
// a 'use client' component, and lib/bag-tags.ts imports supabaseAdmin
// (the server-only, service-role Supabase client) at module scope. See
// lib/bag-tag-display.ts's module comment for the production incident
// that importing these two functions from lib/bag-tags.ts caused.
import { cityCode, barcodeStripes } from '@/lib/bag-tag-display'

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
// stub — using the real BagDrop logo lock-up (lib/bag-tag-logo.ts).
//
// Two follow-up fixes the same day, both from founder screenshots:
// 1. The vertical spine barcode was invisible in the browser (though it
//    rendered fine in the PDF) — CSS `padding: 6% 10%` on `.bag-tag-
//    spine` resolves BOTH the vertical and horizontal percentages
//    against the FLEX CONTAINER'S WIDTH (a real CSS quirk — percentage
//    padding is always relative to the containing block's width, never
//    its own height, and browsers apply that even for a narrow flex
//    child). The spine is only 8% of the card's width, but the padding
//    asked for 20% of that same full card width just on its left+right
//    — more than the column had room for, squeezing its content to
//    nothing. Every percentage padding/margin/gap in this file's CSS is
//    now a fixed px value instead, which doesn't have this failure mode.
// 2. The flight-panel header and claim-stub logo looked "stretched"/
//    smeared at ~11-15px tall — that's the full lock-up's two lines of
//    text (wordmark + tagline) collapsing into mush once shrunk that
//    far, not an actual aspect-ratio stretch. Both spots now use
//    LOGO_ICON_COLOR_DATA_URI (icon only, no baked-in text) paired with
//    a separately-set crisp "BAGDROP" text label — the exact lesson this
//    component's pre-2026-09-07 history already documents once before.
//
// IMPORTANT: this is still BagDrop's own OPERATIONAL tracking tag — never
// represented as an airline-issued baggage tag. The FROM/TO codes are a
// decorative styling touch (see lib/bag-tag-display.ts's cityCode) and
// the QR encodes only the bag's own tracking URL, never customer name/
// phone/address.

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

// Small lock-up for tight spaces: the plain icon (no baked-in text, so it
// never loses legibility when shrunk) plus a real, crisp text label.
function MiniBrand({ dark }: { dark?: boolean }) {
  return (
    <span className={`bag-tag-minibrand${dark ? ' on-dark' : ''}`}>
      <img src={LOGO_ICON_COLOR_DATA_URI} alt="" />
      <b>BAGDROP</b>
    </span>
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
          <MiniBrand dark />
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
        <div className="bag-tag-stub-head">
          <MiniBrand />
          <span className="bag-tag-stub-label">CLAIM STUB</span>
        </div>
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
//
// Every spacing value (padding/margin/gap) below is a FIXED px number —
// see the module comment above for why percentages broke the spine.
// Column widths use percentage flex-basis, which is fine (that resolves
// against the flex container's main-axis size, exactly as expected).
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

  .bag-tag-minibrand { display: inline-flex; align-items: center; gap: 4px; line-height: 1; }
  .bag-tag-minibrand img { height: 12px; width: auto; display: block; }
  .bag-tag-minibrand b { font-size: 8.5px; font-weight: 800; letter-spacing: 0.3px; color: #111827; }
  .bag-tag-minibrand.on-dark b { color: #fff; }

  /* Spine */
  .bag-tag-spine { flex: 0 0 8%; padding: 10px 8px; border-right: 1.5px dashed #d4cfc6; background: #fff; }
  .bag-tag-barcode { display: flex; width: 100%; height: 100%; }
  .bag-tag-barcode.vertical { flex-direction: column; }
  .bag-tag-barcode:not(.vertical) { flex-direction: row; }
  .bag-tag-barcode span { flex: 0 0 auto; }

  /* Main coupon */
  .bag-tag-main { flex: 0 0 41%; padding: 8px 10px; border-right: 1.5px dashed #d4cfc6; }
  .bag-tag-main-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .bag-tag-logo-color { height: 22px; width: auto; display: block; }
  .bag-tag-pill { border: 1.5px solid #f97316; color: #c74f0f; border-radius: 999px; padding: 2px 8px; font-size: 6.2px; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase; white-space: nowrap; max-width: 46%; overflow: hidden; text-overflow: ellipsis; }
  .bag-tag-divider { height: 1px; background: #e5e0d8; margin: 8px 0 6px; }
  .bag-tag-fields { display: grid; grid-template-columns: 1fr 1fr; row-gap: 7px; column-gap: 8px; flex: 1; }
  .bag-tag-field { display: flex; flex-direction: column; min-width: 0; }
  .bag-tag-field span { font-size: 6px; font-weight: 700; letter-spacing: 0.5px; color: #918b81; }
  .bag-tag-field b { font-size: 9px; font-weight: 800; color: #111827; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bag-tag-mono { font-family: monospace; font-size: 8px !important; }
  .bag-tag-qr-wrap { position: absolute; right: 10px; bottom: 8px; display: flex; align-items: flex-end; gap: 6px; }
  .bag-tag-qr-cap { font-size: 5.5px; font-weight: 700; color: #111827; text-align: right; line-height: 1.35; }
  .bag-tag-qr-cap span { display: block; font-weight: 400; color: #918b81; font-size: 5px; margin-top: 1px; }
  .bag-tag-qr-wrap img { width: 15%; min-width: 34px; max-width: 46px; height: auto; display: block; border: 1px solid #e5e0d8; border-radius: 3px; }

  /* Flight panel */
  .bag-tag-flight { flex: 0 0 24%; border-right: 1.5px dashed #d4cfc6; background: #fff; }
  .bag-tag-flight-head { background: #111827; color: #fff; display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; }
  .bag-tag-flight-head > span:last-child { font-size: 6.5px; font-weight: 800; letter-spacing: 1.2px; color: #f97316; }
  .bag-tag-flight-body { flex: 1; padding: 8px 10px; display: flex; flex-direction: column; justify-content: center; gap: 7px; }
  .bag-tag-fromto { display: flex; flex-direction: column; line-height: 1; }
  /* Bumped 2026-09-08 (founder: "increase font...bcoz you have enough
     space...FROM BDQ Vadodara TO UDR Udaipur font increase as per airline
     bagtag sticker bigger font") — kept in sync with the same-purpose
     ftLabel/ftCode/ftCity/bagNoLbl/bagNoVal sizes in lib/bag-tags-pdf.tsx. */
  .bag-tag-fromto-label { font-size: 6.5px; font-weight: 800; letter-spacing: 1px; color: #918b81; }
  .bag-tag-fromto-code { font-size: 23px; font-weight: 800; color: #111827; margin-top: 2px; }
  .bag-tag-fromto-code-orange { color: #c74f0f; }
  .bag-tag-fromto-city { font-size: 8.5px; font-weight: 600; letter-spacing: 0.4px; color: #918b81; text-transform: uppercase; margin-top: 1px; }
  .bag-tag-flight-divider { height: 1px; background: #e5e0d8; margin: 4px 0; }
  .bag-tag-bagno { display: flex; align-items: baseline; gap: 6px; }
  .bag-tag-bagno span { font-size: 6.5px; font-weight: 800; letter-spacing: 1px; color: #918b81; }
  .bag-tag-bagno b { font-size: 13px; font-weight: 800; color: #111827; }
  .bag-tag-care { background: #111827; color: #fff; padding: 5px 8px; font-size: 6.5px; font-weight: 800; letter-spacing: 0.8px; text-align: center; }

  /* Claim stub */
  .bag-tag-stub { flex: 0 0 27%; padding: 8px 8px; gap: 6px; }
  .bag-tag-stub-head { display: flex; align-items: center; justify-content: space-between; }
  .bag-tag-stub-label { font-size: 5.2px; font-weight: 700; letter-spacing: 0.6px; color: #918b81; }
  .bag-tag-stub .bag-tag-barcode { height: 18px; }
  .bag-tag-stub-fields { display: flex; flex-direction: column; gap: 5px; flex: 1; }
  .bag-tag-stub-fields .bag-tag-field b { font-size: 8px; }
  .bag-tag-stub-qr { position: absolute; right: 8px; bottom: 8px; width: 20%; min-width: 32px; max-width: 42px; height: auto; border: 1px solid #e5e0d8; border-radius: 3px; }
`
