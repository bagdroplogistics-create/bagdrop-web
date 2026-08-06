// Constants mirrored from app/(admin)/admin/quotes/new/page.tsx so the
// mobile "New Quote" form produces identical quote data to the website.

export const SALESPERSONS = ['Saurabh Muley', 'Vijay Thacker']

export const SAC_CODE = '996511'
export const GST_PCT = 5 // 2.5% CGST + 2.5% SGST

export const DEFAULT_CUSTOMER_NOTES = 'Looking forward for your business.'

export const DEFAULT_TERMS =
  '1. Booking Confirmation : All bookings are confirmed upon receipt of the total amount payable. - A unique CN (Confirmation) number will be provided for your reference.\n' +
  '2. Total Amount Payable: - The total amount payable for the baggage service is as per the policy.\n' +
  '3. Included Services : - Only the services mentioned above in the Estimate shall be included and the company reserves all rights to Cancel at any point.\n' +
  '4. Prohibited Items: - Luggage should not contain any items prohibited by the government or legal system. - Alcohol and Illegal substance is strictly prohibited. All bags are processed through the Govt Screening processes.\n' +
  '5. Assistance and Queries: - For any assistance or queries, clients can contact BAGDROP at 63 5711 5711 / 63 5733 5733 or via email at info@bagdrop.co\n' +
  '6. Payment Confirmation: - Clients are requested to share a screenshot of the payment confirmation for booking verification.\n' +
  '7. Cancellation Policy: - Cancellations must be made at least 96 Hours before the scheduled pick-up time to receive a full refund.\n' +
  '8. Liability: - BAGDROP is not liable for any loss, damage, or theft of items during transportation. - Clients are advised to secure valuable items and carry essential documents with them. No Illegal items and Alcohol shall be kept in the luggage bags given for Shipment.\n' +
  '9. The services are subject to availability at the time of booking. The rates may vary or change at any time without any prior Notice.\n' +
  "10. Terms Acceptance: - Booking with BAGDROP implies acceptance of these terms and conditions. We appreciate your trust in BAGDROP for your baggage transportation needs. If you have any questions or concerns, please don't hesitate to reach out to us."

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
