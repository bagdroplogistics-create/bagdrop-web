// BAGDROP — Shared local QR code generator
//
// Fix (2026-09-08, founder report: "scan to track this bag - qr code is not
// show...please add"): the Consignment Label and Bag Tag PDFs previously
// generated their QR codes by fetching a PNG from a public third-party
// service (api.qrserver.com) at PDF-render time, INSIDE the serverless
// function. That's an outbound network call to a service Bagdrop doesn't
// control, on the critical path of generating a document — if that call is
// slow, rate-limited, or blocked (confirmed blocked entirely in this
// project's own sandbox environment), the QR silently renders as a blank
// box instead of failing loudly.
//
// Fixed by generating the QR code locally with the `qrcode` npm package —
// pure computation, zero network calls, so it can never fail this way
// again. Also more in keeping with Bagdrop owning its own document/data
// layer rather than depending on a free public API for a customer/ops-
// facing document.
import QRCode from 'qrcode'

const DARK = '#111827'

// Returns a base64 PNG data URI (e.g. "data:image/png;base64,...") — a
// drop-in replacement for the old `qrUrl(...)` remote-URL string, usable
// directly as a react-pdf/HTML <Image>/<img> src with no further fetch.
// `size` is rendered at a higher internal resolution than the on-page
// display size so it stays crisp when scaled down (react-pdf/HTML both
// scale raster images to the style's width/height).
export async function generateQrDataUri(data: string, size = 320): Promise<string> {
  return QRCode.toDataURL(data, {
    width: size,
    margin: 0,
    color: { dark: DARK, light: '#ffffff' },
  })
}
