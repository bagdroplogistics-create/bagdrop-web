// BAGDROP — lib/number-to-words.ts
//
// Shared "amount in words" helper (Indian numbering: Crore/Lakh/Thousand),
// e.g. 315000 -> "Three Lakh Fifteen Thousand Rupees Only". This exact
// logic was already duplicated inline in InvoicePDF.tsx, QuotePDF.tsx, and
// a couple of print pages — not refactoring those existing working copies
// here (out of scope / unnecessary churn), but new call sites (starting
// with the Payment Receipt panel) should import this instead of adding a
// 6th copy.

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function b100(x: number): string { return x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : '') }
function b1000(x: number): string { return x < 100 ? b100(x) : ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + b100(x % 100) : '') }

export function amountInWords(n: number): string {
  if (!n || n <= 0) return 'Zero Rupees Only'
  const r = Math.floor(n); let result = ''
  if (r >= 10000000) result += b1000(Math.floor(r / 10000000)) + ' Crore '
  if (r % 10000000 >= 100000) result += b1000(Math.floor((r % 10000000) / 100000)) + ' Lakh '
  if (r % 100000 >= 1000) result += b1000(Math.floor((r % 100000) / 1000)) + ' Thousand '
  if (r % 1000 >= 100) result += ones[Math.floor((r % 1000) / 100)] + ' Hundred '
  if (r % 100 > 0) result += b100(r % 100) + ' '
  return result.trim() + ' Rupees Only'
}
