// Kept in sync with app/(admin)/admin/page.tsx's STATUS_META /
// booking-funnel definitions on the website — same 13-stage lifecycle,
// same labels/colors, so the dashboard reads identically on both surfaces.

export interface StatusMeta {
  key: string
  label: string
  color: string
  bg: string
}

export const BOOKING_FUNNEL: StatusMeta[] = [
  { key: 'inquiry', label: 'New Inquiries', color: '#92400e', bg: '#fef3c7' },
  { key: 'quote_created', label: 'Quotes Created', color: '#4f46e5', bg: '#eef2ff' },
  { key: 'quote_sent', label: 'Quotes Sent', color: '#6d28d9', bg: '#ede9fe' },
  { key: 'accepted', label: 'Quotes Accepted', color: '#059669', bg: '#d1fae5' },
  { key: 'rejected', label: 'Quotes Rejected', color: '#dc2626', bg: '#fee2e2' },
  { key: 'payment_pending', label: 'Payment Pending', color: '#d97706', bg: '#fef3c7' },
  { key: 'payment_received', label: 'Payment Received', color: '#059669', bg: '#d1fae5' },
  // VIP / "Admin Approve — Pay Later" — booking allowed to proceed without
  // an actual payment. Was missing here entirely, so statusLabel() fell
  // back to printing the raw 'payment_approved' string on mobile. Amber,
  // not the same green as Payment Received — matches PAYMENT_STATUS_META's
  // own 'approved_pending' color below and the website Leads tab (founder
  // spec, 2026-08-20): Accounts should see at a glance that this one
  // hasn't actually been paid.
  { key: 'payment_approved', label: 'Admin Approved (VIP)', color: '#d97706', bg: '#fef3c7' },
  { key: 'confirmed', label: 'Booking Confirmed', color: '#2563eb', bg: '#dbeafe' },
  { key: 'in_transit', label: 'In Transit', color: '#0891b2', bg: '#cffafe' },
  { key: 'out_for_delivery', label: 'Out for Delivery', color: '#ea580c', bg: '#ffedd5' },
  { key: 'delivered', label: 'Delivered', color: '#16a34a', bg: '#dcfce7' },
  { key: 'completed', label: 'Completed', color: '#14532d', bg: '#bbf7d0' },
]

export function statusLabel(status: string): string {
  return BOOKING_FUNNEL.find(s => s.key === status)?.label ?? status
}

// Kept in sync with app/(admin)/admin/payments/page.tsx's STATUS_CFG on
// the website. Used by both the Payments list and Payment detail screens.
export const PAYMENT_STATUS_META: Record<string, StatusMeta> = {
  pending:              { key: 'pending', label: 'Pending', color: '#d97706', bg: '#fef3c7' },
  // Added by the Full/Partial/VIP/Verification payment-accounting rework
  // (2026-08-19) — see lib/payment-status.ts on the website. Some amount
  // has been approved but not the full total.
  partially_paid:       { key: 'partially_paid', label: 'Partially Paid', color: '#ea580c', bg: '#ffedd5' },
  pending_verification: { key: 'pending_verification', label: 'Pending Verification', color: '#d97706', bg: '#fef3c7' },
  approved_pending:     { key: 'approved_pending', label: 'Approved (Unpaid)', color: '#d97706', bg: '#fef3c7' },
  paid:                 { key: 'paid', label: 'Paid', color: '#16a34a', bg: '#dcfce7' },
  rejected:             { key: 'rejected', label: 'Rejected', color: '#dc2626', bg: '#fee2e2' },
  failed:               { key: 'failed', label: 'Failed', color: '#dc2626', bg: '#fee2e2' },
  refunded:             { key: 'refunded', label: 'Refunded', color: '#7c3aed', bg: '#ede9fe' },
}

export function paymentStatusMeta(status: string): StatusMeta {
  return PAYMENT_STATUS_META[status] ?? { key: status, label: status, color: '#6b7280', bg: '#f3f4f6' }
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  upi: 'UPI', qr: 'QR Code', bank: 'Bank Transfer', cash: 'Cash', upload: 'Uploaded Proof',
}
