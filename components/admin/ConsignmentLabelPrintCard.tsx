'use client'

import { LOGO_FULL_COLOR_DATA_URI, LOGO_ICON_COLOR_DATA_URI } from '@/lib/bag-tag-logo'

// BAGDROP — Consignor / Consignee Consignment Label (on-screen preview)
//
// Founder request (2026-09-08): "need consignment label show option also
// in this screen" — the Bag Tags admin page already shows an on-screen
// preview card for every bag's airport-style Bag Tag (BagTagPrintCard.tsx)
// before printing/downloading; the new Consignment Label only had a
// blind "Download PDF" button with no equivalent on-screen preview. This
// component is that preview — same visual design as the PDF (see
// lib/consignment-label-pdf.tsx's module comment for the full design
// rationale: Consignor/Consignee panels + tear-off Handover Receipt stub),
// just HTML/CSS instead of react-pdf primitives, mirroring exactly how
// BagTagPrintCard.tsx mirrors lib/bag-tags-pdf.tsx.
//
// QR is fetched from api.qrserver.com via a plain <img> here — that's a
// browser-side request from the admin's own machine, not a serverless
// function's outbound call, so it doesn't have the reliability problem
// that made the PDF's QR switch to local generation (lib/qr-code.ts).
// Same pattern BagTagPrintCard.tsx already uses for its own on-screen QR.

export interface ConsignmentLabelCardData {
  trackingId:       string
  bagLabel:         string | null
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

function fmtDate(d: string | null): string {
  if (!d) return '—'
  try { return new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return d }
}

function qrUrl(data: string, size: number) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&data=${encodeURIComponent(data)}`
}

// Founder request (2026-09-09): QR now points at the plain Bagdrop website
// rather than the per-bag tracking page — kept in sync with
// lib/consignment-label-pdf.tsx's labelQrUrl().
function labelQrUrl() {
  return 'https://www.bagdrop.co'
}

function MiniBrand() {
  return (
    <span className="cl-minibrand">
      <img src={LOGO_ICON_COLOR_DATA_URI} alt="" />
      <b>BAGDROP</b>
    </span>
  )
}

export function ConsignmentLabelCard({ label, selected, onToggle }: { label: ConsignmentLabelCardData; selected?: boolean; onToggle?: () => void }) {
  const qrSeed = label.bagLabel || label.trackingId

  return (
    <div className={`cl-label${selected === false ? ' cl-label-unselected' : ''}`}>
      {onToggle && (
        <label className="cl-check no-print">
          <input type="checkbox" checked={selected !== false} onChange={onToggle} />
        </label>
      )}

      <div className="cl-head">
        <img className="cl-logo" src={LOGO_FULL_COLOR_DATA_URI} alt="BAGDROP" />
        <div className="cl-head-right">
          <span className="cl-head-title">CONSIGNMENT LABEL</span>
          <span className="cl-head-trackid">{label.trackingId}</span>
        </div>
      </div>
      <div className="cl-head-divider" />

      <div className="cl-meta">
        <div className="cl-meta-cell"><span>SERVICE</span><b>{label.serviceLabel || '—'}</b></div>
        <div className="cl-meta-cell"><span>PICKUP DATE</span><b>{fmtDate(label.pickupDate)}</b></div>
        <div className="cl-meta-cell cl-meta-cell-last"><span>BAG</span><b>{String(label.bagNumber).padStart(2, '0')} of {label.bagTotal}</b></div>
      </div>

      <div className="cl-cc-row">
        <div className="cl-cc-box cl-consignor">
          <span className="cl-chip cl-chip-consignor">CONSIGNOR · FROM</span>
          <div className="cl-cc-name">{label.consignorName}</div>
          <span className="cl-cc-flabel">ADDRESS</span>
          <div className="cl-cc-fvalue">{label.consignorAddress || '—'}</div>
        </div>

        <div className="cl-arrow" aria-hidden>→</div>

        <div className="cl-cc-box cl-consignee">
          <span className="cl-chip cl-chip-consignee">CONSIGNEE · TO</span>
          <div className="cl-cc-name">{label.consigneeName}</div>
          <span className="cl-cc-flabel">ADDRESS</span>
          <div className="cl-cc-fvalue">{label.consigneeAddress || '—'}</div>
        </div>
      </div>

      <div className="cl-qr-row">
        <div className="cl-qr-cap">SCAN TO VISIT<br /><span>www.bagdrop.co</span></div>
        <img className="cl-qr" src={qrUrl(labelQrUrl(), 160)} alt="www.bagdrop.co" />
      </div>

      <div className="cl-care"><span>HANDLE WITH CARE  ·  FRAGILE CONTENTS POSSIBLE</span></div>

      <div className="cl-cut">
        <span className="cl-cut-line" />
        <span className="cl-cut-label">✂ CUT HERE — RETAIN STUB BELOW</span>
        <span className="cl-cut-line" />
      </div>

      <div className="cl-stub">
        <div className="cl-stub-head">
          <MiniBrand />
          <span className="cl-stub-title">HANDOVER RECEIPT — CHAIN OF CUSTODY</span>
        </div>
        <div className="cl-stub-grid">
          <div className="cl-stub-cell"><span>TRACKING ID</span><b>{qrSeed}</b></div>
          <div className="cl-stub-cell"><span>BAG</span><b>{String(label.bagNumber).padStart(2, '0')} of {label.bagTotal}</b></div>
          <div className="cl-stub-cell"><span>DATE</span><b>{fmtDate(label.pickupDate)}</b></div>
        </div>
        <div className="cl-sign-row">
          <div className="cl-sign-cell"><div className="cl-sign-line" /><span>RECEIVED BY (NAME &amp; SIGNATURE)</span></div>
          <div className="cl-sign-cell"><div className="cl-sign-line" /><span>DATE / TIME</span></div>
        </div>
      </div>
    </div>
  )
}

// Shared CSS — same "one exported string, spliced into the page's own
// <style>" convention as BAG_TAG_CARD_STYLES above.
export const CONSIGNMENT_LABEL_CARD_STYLES = `
  .cl-label {
    position: relative; max-width: 640px; margin: 0 auto;
    border: 1.5px solid #e7e2da; border-radius: 12px; background: #fff;
    padding: 22px 24px; box-shadow: 0 1px 3px rgba(17,24,39,0.06);
    break-inside: avoid; page-break-inside: avoid;
  }
  .cl-label-unselected { opacity: 0.35; }
  .cl-check { position: absolute; top: 10px; right: 10px; z-index: 3; }
  .cl-check input { width: 16px; height: 16px; cursor: pointer; }

  .cl-minibrand { display: inline-flex; align-items: center; gap: 5px; line-height: 1; }
  .cl-minibrand img { height: 14px; width: auto; display: block; }
  .cl-minibrand b { font-size: 9px; font-weight: 800; letter-spacing: 0.3px; color: #111827; }

  .cl-head { display: flex; align-items: flex-start; justify-content: space-between; }
  .cl-logo { height: 34px; width: auto; display: block; }
  .cl-head-right { display: flex; flex-direction: column; align-items: flex-end; }
  .cl-head-title { font-size: 9px; font-weight: 800; letter-spacing: 1.4px; color: #918b81; }
  .cl-head-trackid { font-size: 19px; font-weight: 800; color: #111827; margin-top: 2px; }
  .cl-head-divider { height: 2px; background: #111827; margin: 12px 0; }

  .cl-meta { display: flex; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 0; }
  .cl-meta-cell { flex: 1; text-align: center; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; gap: 3px; }
  .cl-meta-cell-last { border-right: none; }
  .cl-meta-cell span { font-size: 6.8px; font-weight: 700; letter-spacing: 0.5px; color: #918b81; }
  .cl-meta-cell b { font-size: 12px; font-weight: 800; color: #111827; }

  .cl-cc-row { display: flex; align-items: stretch; gap: 10px; margin-top: 14px; }
  .cl-cc-box { flex: 1; border-radius: 8px; border: 1.4px solid #e5e0d8; padding: 12px; min-width: 0; }
  .cl-consignor { background: #fff7ed; }
  .cl-consignee { background: #f0f9ff; }
  .cl-chip { display: inline-block; border-radius: 999px; padding: 3px 9px; font-size: 7.5px; font-weight: 800; letter-spacing: 0.6px; background: #fff; margin-bottom: 8px; }
  .cl-chip-consignor { border: 1px solid #f97316; color: #c74f0f; }
  .cl-chip-consignee { border: 1px solid #0ea5e9; color: #0369a1; }
  .cl-cc-name { font-size: 13px; font-weight: 800; color: #111827; word-break: break-word; }
  .cl-cc-flabel { display: block; font-size: 6.5px; font-weight: 700; letter-spacing: 0.5px; color: #918b81; margin-top: 8px; }
  .cl-cc-fvalue { font-size: 9.5px; color: #111827; margin-top: 2px; line-height: 1.35; word-break: break-word; }
  .cl-arrow { flex: 0 0 22px; display: flex; align-items: center; justify-content: center; color: #f97316; font-size: 16px; font-weight: 800; }

  .cl-qr-row { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 12px; }
  .cl-qr-cap { font-size: 6.8px; font-weight: 700; color: #111827; text-align: right; line-height: 1.35; }
  .cl-qr-cap span { display: block; font-weight: 400; color: #918b81; font-size: 5.8px; margin-top: 1px; }
  .cl-qr { width: 44px; height: 44px; border: 1px solid #e5e0d8; border-radius: 3px; }

  .cl-care { background: #111827; border-radius: 5px; padding: 6px 8px; margin-top: 14px; }
  .cl-care span { display: block; font-size: 7.5px; font-weight: 800; color: #fff; letter-spacing: 1.2px; text-align: center; }

  .cl-cut { display: flex; align-items: center; gap: 8px; margin: 18px 0 10px; }
  .cl-cut-line { flex: 1; height: 0; border-bottom: 1.4px dashed #c9c3b8; }
  .cl-cut-label { font-size: 7px; font-weight: 800; letter-spacing: 0.8px; color: #918b81; white-space: nowrap; }

  .cl-stub { border: 1.4px solid #e5e0d8; border-radius: 8px; padding: 12px; }
  .cl-stub-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px; }
  .cl-stub-title { font-size: 6.8px; font-weight: 800; letter-spacing: 0.6px; color: #918b81; }
  .cl-stub-grid { display: flex; margin-top: 9px; gap: 8px; }
  .cl-stub-cell { flex: 1; min-width: 0; }
  .cl-stub-cell span { display: block; font-size: 6.2px; font-weight: 700; letter-spacing: 0.4px; color: #918b81; }
  .cl-stub-cell b { display: block; font-size: 9.5px; font-weight: 800; color: #111827; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cl-sign-row { display: flex; gap: 16px; margin-top: 16px; }
  .cl-sign-cell { flex: 1; }
  .cl-sign-line { border-bottom: 1px solid #c9c3b8; margin-top: 16px; }
  .cl-sign-cell span { display: block; font-size: 6.5px; font-weight: 700; letter-spacing: 0.4px; color: #918b81; margin-top: 4px; }

  @media print {
    .cl-label { break-after: page; page-break-after: always; box-shadow: none; }
  }
`
