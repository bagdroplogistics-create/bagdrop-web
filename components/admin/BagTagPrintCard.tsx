'use client'

// BAGDROP — Operational Baggage Tag System (Phase 1)
//
// Shared browser-print tag card — used by BOTH the Individual booking
// tags page and the Group booking tags page, so the visual design (and
// the required field list from the founder spec) only lives in one
// place. Mirrors lib/bag-tags-pdf.tsx's layout for the "Download PDF"
// path, just as HTML/CSS instead of react-pdf primitives.
//
// IMPORTANT: this is BagDrop's own OPERATIONAL tracking tag — never
// represented as an airline-issued baggage tag. QR encodes only the
// bag's own tracking URL, never customer name/phone/address.

export interface BagTagCardData {
  id:               string
  bagLabel:         string
  customerName:     string
  bookingId:        string
  route:            string
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

function qrUrl(data: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&data=${encodeURIComponent(data)}`
}

export function bagTrackingUrl(bagLabel: string) {
  return `https://www.bagdrop.co/track-bag/${encodeURIComponent(bagLabel)}`
}

export function BagTagPrintCard({ tag, selected, onToggle }: { tag: BagTagCardData; selected?: boolean; onToggle?: () => void }) {
  return (
    <div className={`bag-tag${selected === false ? ' bag-tag-unselected' : ''}`}>
      {onToggle && (
        <label className="bag-tag-check no-print">
          <input type="checkbox" checked={selected !== false} onChange={onToggle} />
        </label>
      )}
      <div className="bag-tag-head">
        <svg className="bag-tag-mark" viewBox="0 0 24 24" width="15" height="15">
          <rect x="5" y="8" width="14" height="13" rx="2" stroke="#fff" strokeWidth="2" fill="none" />
          <rect x="9.5" y="4" width="5" height="4.5" rx="1" stroke="#fff" strokeWidth="2" fill="none" />
          <line x1="9.5" y1="8" x2="9.5" y2="21" stroke="#fff" strokeWidth="1.3" />
          <line x1="14.5" y1="8" x2="14.5" y2="21" stroke="#fff" strokeWidth="1.3" />
          <line x1="8" y1="23" x2="8" y2="24" stroke="#fff" strokeWidth="2" />
          <line x1="16" y1="23" x2="16" y2="24" stroke="#fff" strokeWidth="2" />
        </svg>
        <span className="bag-tag-brand">BAGDROP</span>
        <span className="bag-tag-sub">Operational Tag</span>
      </div>
      <div className="bag-tag-body">
        <div className="bag-tag-info">
          <div className="bag-tag-id">{tag.bagLabel}</div>
          <div className="bag-tag-num">Bag {tag.bagNumber} / {tag.bagTotal}</div>
          <div className="bag-tag-row"><b>Customer:</b> {tag.customerName}</div>
          <div className="bag-tag-row"><b>Booking:</b> {tag.bookingId}</div>
          <div className="bag-tag-row"><b>Route:</b> {tag.route || '—'}</div>
          <div className="bag-tag-row"><b>Service:</b> {tag.serviceLabel || '—'}</div>
          <div className="bag-tag-row"><b>Pickup:</b> {fmtDate(tag.pickupDate)}</div>
          <div className="bag-tag-row"><b>Deliver to:</b> {tag.deliveryLocation || '—'}</div>
        </div>
        <div className="bag-tag-qr">
          <img src={qrUrl(bagTrackingUrl(tag.bagLabel))} alt={tag.bagLabel} />
          <div className="bag-tag-qr-caption">Scan to Track Bag</div>
        </div>
      </div>
      <div className="bag-tag-care">
        <span>HANDLE WITH CARE</span>
        <span className="bag-tag-url">bagdrop.co</span>
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
    position: relative; border: 1.5px dashed #9ca3af; border-radius: 8px;
    background: #fff; overflow: hidden; break-inside: avoid; page-break-inside: avoid;
  }
  .bag-tag-unselected { opacity: 0.35; }
  .bag-tag-check { position: absolute; top: 6px; right: 6px; z-index: 2; }
  .bag-tag-check input { width: 16px; height: 16px; cursor: pointer; }
  .bag-tag-head {
    background: #f97316; color: #fff; padding: 5px 10px; display: flex;
    align-items: center; justify-content: space-between;
  }
  .bag-tag-mark { flex-shrink: 0; }
  .bag-tag-brand { font-size: 12px; font-weight: 900; letter-spacing: 0.5px; }
  .bag-tag-sub { font-size: 8.5px; opacity: 0.9; }
  .bag-tag-body { display: flex; padding: 8px 10px; gap: 8px; }
  .bag-tag-info { flex: 1; min-width: 0; }
  .bag-tag-id { font-size: 16px; font-weight: 800; color: #111827; font-family: monospace; }
  .bag-tag-num { font-size: 10px; font-weight: 800; color: #f97316; margin-top: 2px; }
  .bag-tag-row { font-size: 9px; color: #4b5563; margin-top: 3px; line-height: 1.35; }
  .bag-tag-row b { color: #111827; }
  .bag-tag-qr { flex-shrink: 0; width: 68px; text-align: center; }
  .bag-tag-qr img { width: 68px; height: 68px; display: block; }
  .bag-tag-qr-caption { font-size: 6.5px; color: #6b7280; margin-top: 2px; line-height: 1.2; }
  .bag-tag-care {
    background: #111827; color: #fff; padding: 3px 10px; display: flex;
    justify-content: space-between; align-items: center;
    font-size: 8px; font-weight: 800; letter-spacing: 0.6px;
  }
  .bag-tag-url { color: #f97316; font-weight: 700; }
`
