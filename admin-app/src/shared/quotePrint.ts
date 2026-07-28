// Builds a printable HTML invoice matching the website admin dashboard's
// quote layout (app/(admin)/admin/quotes/view/[lead_id]/QuotePDF.tsx and
// the plain-HTML printable version in that same folder's page.tsx) —
// same section order, wording, colors, bank/GSTIN details, and terms —
// then opens the browser's print dialog (same "Download PDF via print"
// pattern the website itself uses). This keeps quote-PDF generation fully
// self-contained in the admin app: no new backend routes, no heavy
// PDF-rendering dependency to bundle.

export interface QuotePrintItem {
  name: string
  description?: string
  quantity: number
  rate: number
  taxPct?: number
  amount: number
}

export interface QuotePrintData {
  quoteNumber: string
  leadNumber?: string
  quoteDate?: string
  expiryDate?: string
  salesperson?: string
  agentName?: string
  customerName: string
  customerPhone?: string
  customerEmail?: string
  fromCity: string
  toCity: string
  bagsCount: number
  pickupDate?: string
  pickupTime?: string
  deliveryDate?: string
  flightNumber?: string
  pnr?: string
  pickupAddress?: string
  dropAddress?: string
  items: QuotePrintItem[]
  subtotal: number
  discountAmt: number
  discountPct?: number
  tax: number // total GST (split evenly into CGST/SGST for display)
  total: number
  notes?: string
  terms?: string
}

// ── Bagdrop's fixed legal/bank details, verbatim from the website's
// quote document (QuotePDF.tsx / page.tsx) ─────────────────────────────
const GSTIN = '24BDMPS7461P1ZM'
const SAC_CODE = '996511'
const BANK_NAME = 'Indian Overseas Bank'
const BANK_ACCOUNT = '171702000001297'
const BANK_IFSC = 'IOBA0001717'
const BANK_BRANCH = 'Gotri Road, Vadodara'
const UPI_ID = 'BAGDROP1717@IOB'
const QR_URL = 'https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=upi%3A%2F%2Fpay%3Fpa%3DBAGDROP1717%40IOB%26pn%3DBagdrop%26cu%3DINR'
const DEFAULT_TERMS_LIST = [
  'All bookings confirmed on receipt of full payment. A CN number will be issued for reference.',
  'Only services mentioned above are included. Company reserves the right to cancel at any point.',
  'Luggage must not contain items prohibited by law. All bags processed through Govt screening.',
  'Cancellation (Mumbai): ≥5 days for full refund. All other destinations: ≥7 days.',
  'Bagdrop is not liable for loss/damage during transit. Carry essential documents personally.',
  'Rates subject to change without prior notice and subject to availability at time of booking.',
]

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function rupees(n: number): string {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Indian-numbering amount-in-words (Crore / Lakh / Thousand) ────────
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigitWords(n: number): string {
  if (n < 20) return ONES[n]
  const t = Math.floor(n / 10), o = n % 10
  return TENS[t] + (o ? ' ' + ONES[o] : '')
}
function threeDigitWords(n: number): string {
  const h = Math.floor(n / 100), r = n % 100
  return (h ? ONES[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? twoDigitWords(r) : '')
}
export function numberToWordsIndian(amount: number): string {
  let num = Math.round(amount)
  if (num === 0) return 'Zero'
  const crore = Math.floor(num / 10000000); num %= 10000000
  const lakh = Math.floor(num / 100000); num %= 100000
  const thousand = Math.floor(num / 1000); num %= 1000
  const rest = num
  const parts: string[] = []
  if (crore) parts.push(twoDigitWords(crore) + ' Crore')
  if (lakh) parts.push(twoDigitWords(lakh) + ' Lakh')
  if (thousand) parts.push(twoDigitWords(thousand) + ' Thousand')
  if (rest) parts.push(threeDigitWords(rest))
  return parts.join(' ')
}

export function buildQuoteHtml(d: QuotePrintData): string {
  const cgst = d.tax / 2
  const sgst = d.tax / 2

  const itemsRows = d.items.map((it, idx) => `
    <tr>
      <td class="num muted">${idx + 1}</td>
      <td>${escapeHtml(it.name)}${it.description ? `<div class="desc">${escapeHtml(it.description)}</div>` : ''}</td>
      <td class="num">${it.quantity}</td>
      <td class="num">${rupees(it.rate)}</td>
      <td class="num muted">GST ${it.taxPct ?? 5}%</td>
      <td class="num">${rupees(it.amount)}</td>
    </tr>`).join('')

  const termsList = d.terms && d.terms.trim()
    ? d.terms.split('\n').map(t => t.trim()).filter(Boolean)
    : DEFAULT_TERMS_LIST
  const termsHtml = termsList.map((t, i) => `<div class="termItem"><span class="termNo">${i + 1}.</span> ${escapeHtml(t)}</div>`).join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Quote ${escapeHtml(d.quoteNumber)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #111; padding: 0; max-width: 820px; margin: 0 auto 40px; background: #fff; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; background: #f97316; color: #fff; padding: 24px 28px; }
  .wordmark { font-size: 26px; font-weight: 900; letter-spacing: 0.5px; }
  .tagline { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.9; margin-top: 2px; }
  .headerRight { text-align: right; }
  .estLabel { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.9; }
  .quoteNo { font-size: 20px; font-weight: 800; margin-top: 2px; }
  .quoteMeta { font-size: 11px; opacity: 0.95; margin-top: 4px; }

  .metaStrip { display: flex; flex-wrap: wrap; gap: 20px; background: #fff7ed; border-bottom: 1px solid #fed7aa; padding: 10px 28px; font-size: 11px; color: #9a3412; }
  .metaLabel { font-weight: 700; margin-right: 4px; text-transform: uppercase; font-size: 9px; }

  .body { padding: 24px 28px; }
  .grid2 { display: flex; gap: 16px; margin-bottom: 16px; }
  .infoCard { flex: 1; background: #f9fafb; border-left: 3px solid #f97316; border-radius: 4px; padding: 12px 14px; }
  .infoTitle { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; font-weight: 700; margin-bottom: 6px; }
  .infoLine { font-size: 12px; color: #111827; margin-bottom: 2px; }
  .infoLine b { font-weight: 700; }
  .infoMuted { color: #6b7280; }
  .routeLine { font-size: 13px; font-weight: 700; margin-bottom: 6px; }
  .journeyGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; font-size: 11px; color: #374151; }

  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; color: #fff; background: #111827; padding: 8px 8px; }
  th.num, td.num { text-align: right; }
  td { font-size: 12px; padding: 9px 8px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  td.muted { color: #9ca3af; font-size: 10px; }
  .desc { font-size: 10px; color: #6b7280; margin-top: 2px; }

  .bottomGrid { display: flex; gap: 16px; margin-top: 18px; align-items: flex-start; }
  .paymentBox { flex: 1; background: #f9fafb; border-radius: 4px; padding: 14px; font-size: 11px; color: #374151; }
  .paymentBox .infoTitle { margin-bottom: 8px; }
  .paymentRow { margin-bottom: 3px; }
  .upiPill { display: inline-flex; align-items: center; gap: 8px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 4px; padding: 6px 10px; margin-top: 8px; color: #9a3412; font-weight: 700; }
  .upiPill img { display: block; }
  .qrCaption { font-size: 9px; color: #9a3412; font-weight: 500; margin-top: 2px; text-align: center; }

  .totalsBox { flex: 1; }
  .totRow { display: flex; justify-content: space-between; font-size: 12px; padding: 4px 0; }
  .totRow.discount { color: #dc2626; }
  .totRow.grand { border-top: 2px solid #111827; margin-top: 6px; padding-top: 8px; font-weight: 800; font-size: 17px; color: #f97316; }
  .wordsBox { margin-top: 10px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 4px; padding: 10px 12px; }
  .wordsLabel { font-size: 9px; text-transform: uppercase; font-weight: 700; color: #9a3412; margin-bottom: 3px; }
  .wordsValue { font-size: 11px; color: #7c2d12; }

  .notesBox { margin-top: 16px; background: #f9fafb; border-radius: 4px; padding: 12px 14px; font-size: 11px; color: #374151; }

  .termsTitle { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; font-weight: 700; margin: 18px 0 8px; }
  .termsGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; }
  .termItem { font-size: 9.5px; color: #4b5563; line-height: 1.5; }
  .termNo { color: #f97316; font-weight: 700; }

  .footer { display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #e5e7eb; margin-top: 20px; padding-top: 14px; }
  .footerCompany { font-size: 10px; color: #4b5563; line-height: 1.6; }
  .footerCompany b { color: #111827; font-size: 11px; }
  .signature { text-align: center; font-size: 10px; color: #4b5563; }
  .signatureLine { border-top: 1px solid #9ca3af; width: 160px; margin-bottom: 4px; padding-top: 4px; }

  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="wordmark">BAGDROP</div>
      <div class="tagline">India's Digital Baggage Infrastructure</div>
    </div>
    <div class="headerRight">
      <div class="estLabel">Service Estimate</div>
      <div class="quoteNo">${escapeHtml(d.quoteNumber)}</div>
      <div class="quoteMeta">${d.quoteDate ? `Date: ${escapeHtml(d.quoteDate)}` : ''}${d.expiryDate ? `  ·  Valid till: ${escapeHtml(d.expiryDate)}` : ''}</div>
    </div>
  </div>

  <div class="metaStrip">
    <div><span class="metaLabel">GSTIN</span>${GSTIN}</div>
    <div><span class="metaLabel">SAC Code</span>${SAC_CODE}</div>
    ${d.leadNumber ? `<div><span class="metaLabel">Lead #</span>${escapeHtml(d.leadNumber)}</div>` : ''}
    ${d.salesperson ? `<div><span class="metaLabel">Salesperson</span>${escapeHtml(d.salesperson)}</div>` : ''}
    ${d.agentName ? `<div><span class="metaLabel">Agent</span>${escapeHtml(d.agentName)}</div>` : ''}
  </div>

  <div class="body">
    <div class="grid2">
      <div class="infoCard">
        <div class="infoTitle">Bill To</div>
        <div class="infoLine"><b>${escapeHtml(d.customerName)}</b></div>
        ${d.customerPhone ? `<div class="infoLine infoMuted">${escapeHtml(d.customerPhone)}</div>` : ''}
        ${d.customerEmail ? `<div class="infoLine infoMuted">${escapeHtml(d.customerEmail)}</div>` : ''}
      </div>
      <div class="infoCard">
        <div class="infoTitle">Journey Details</div>
        <div class="routeLine">${escapeHtml(d.fromCity)} &#9992; ${escapeHtml(d.toCity)}</div>
        <div class="journeyGrid">
          ${d.pickupDate ? `<div>Pickup: ${escapeHtml(d.pickupDate)}</div>` : '<div></div>'}
          ${d.pickupTime ? `<div>Time: ${escapeHtml(d.pickupTime)}</div>` : '<div></div>'}
          ${d.deliveryDate ? `<div>Delivery: ${escapeHtml(d.deliveryDate)}</div>` : '<div></div>'}
          <div>Bags: ${d.bagsCount}</div>
          ${d.flightNumber || d.pnr ? `<div>Flight: ${escapeHtml([d.flightNumber, d.pnr].filter(Boolean).join(' / '))}</div>` : ''}
        </div>
      </div>
    </div>

    ${d.pickupAddress || d.dropAddress ? `
    <div class="grid2">
      ${d.pickupAddress ? `<div class="infoCard"><div class="infoTitle">Pickup Address</div><div class="infoLine">${escapeHtml(d.pickupAddress)}</div></div>` : ''}
      ${d.dropAddress ? `<div class="infoCard"><div class="infoTitle">Delivery Address</div><div class="infoLine">${escapeHtml(d.dropAddress)}</div></div>` : ''}
    </div>` : ''}

    <table>
      <thead><tr><th>#</th><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Tax</th><th class="num">Amount</th></tr></thead>
      <tbody>${itemsRows}</tbody>
    </table>

    <div class="bottomGrid">
      <div class="paymentBox">
        <div class="infoTitle">Payment Details</div>
        <div class="paymentRow">Bank: ${BANK_NAME}</div>
        <div class="paymentRow">A/C No: ${BANK_ACCOUNT}</div>
        <div class="paymentRow">IFSC: ${BANK_IFSC}</div>
        <div class="paymentRow">Branch: ${BANK_BRANCH}</div>
        <div class="upiPill">
          <img src="${QR_URL}" width="60" height="60" alt="UPI QR" />
          <div>UPI: ${UPI_ID}<div class="qrCaption">Scan to Pay</div></div>
        </div>
      </div>
      <div class="totalsBox">
        <div class="totRow"><span>Sub Total</span><span>${rupees(d.subtotal)}</span></div>
        ${d.discountAmt > 0 ? `<div class="totRow discount"><span>Discount${d.discountPct ? ` (${d.discountPct}%)` : ''}</span><span>&minus; ${rupees(d.discountAmt)}</span></div>` : ''}
        <div class="totRow"><span>CGST @ 2.5%</span><span>${rupees(cgst)}</span></div>
        <div class="totRow"><span>SGST @ 2.5%</span><span>${rupees(sgst)}</span></div>
        <div class="totRow grand"><span>Total Amount</span><span>${rupees(d.total)}</span></div>
        <div class="wordsBox">
          <div class="wordsLabel">Amount in Words</div>
          <div class="wordsValue">${numberToWordsIndian(d.total)} Rupees Only</div>
        </div>
      </div>
    </div>

    ${d.notes ? `<div class="notesBox"><div class="infoTitle">Notes</div><div class="infoLine">${escapeHtml(d.notes)}</div></div>` : ''}

    <div class="termsTitle">Terms &amp; Conditions</div>
    <div class="termsGrid">${termsHtml}</div>

    <div class="footer">
      <div class="footerCompany">
        <b>BAGDROP LOGISTICS SOLUTIONS PVT. LTD.</b><br/>
        TF-302, Ananta Stallion, Gotri Sevasi Road, Vadodara &ndash; 391101<br/>
        GSTIN: ${GSTIN} &middot; CIN: U63090GJ2023PTC142601<br/>
        📞 63 5711 5711 &middot; ✉ info@bagdrop.co &middot; 🌐 bagdrop.co
      </div>
      <div class="signature">
        <div class="signatureLine"></div>
        Authorized Signatory<br/>
        For Bagdrop Logistics Solutions Pvt. Ltd.
      </div>
    </div>
  </div>
</body>
</html>`
}

// Opens a new tab with the invoice HTML and triggers the browser's print
// dialog (from which the admin can "Save as PDF"). Returns false if not
// running in a browser (e.g. native iOS/Android build), so callers can
// show a fallback message.
export function openQuotePrint(html: string): boolean {
  if (typeof window === 'undefined' || typeof window.open !== 'function') return false
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => { try { w.print() } catch { /* ignore */ } }, 300)
  return true
}
