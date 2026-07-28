// Constants mirrored from app/(admin)/admin/quotes/new/page.tsx so the
// mobile "New Quote" form produces identical quote data to the website.

export const SALESPERSONS = ['Saurabh Muley', 'Lata Parmar', 'Vijay Thacker', 'Ankit Patel']

export const SAC_CODE = '996511'
export const GST_PCT = 5 // 2.5% CGST + 2.5% SGST

export const DEFAULT_CUSTOMER_NOTES = 'Looking forward for your business.'

export const DEFAULT_TERMS =
  '1. Booking Confirmation : All bookings are confirmed upon receipt of the total amount payable. - A unique CN (Confirmation) number will be provided for your reference.\n' +
  '2. Total Amount Payable: - The total amount payable for the baggage service is as per the policy.\n' +
  '3. Included Services: - Only the services mentioned above in the Estimate shall be included and the rest shall be charged additionally.\n' +
  "4. Cancellation Policy: - Cancellations must be made 24 hours prior to the scheduled pickup time to receive a full refund.\n" +
  "5. Liability: - Bagdrop's liability is limited to the declared value of the baggage as per our standard policy."

export const PAYMENT_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'received', label: 'Received' },
]

export const DISCOUNT_TYPES = [
  { value: 'pct', label: '%' },
  { value: 'fixed', label: '₹' },
]

export function rupees(n: number) {
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

export function rupeesDecimal(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
