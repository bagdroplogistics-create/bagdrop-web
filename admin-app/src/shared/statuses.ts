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
  { key: 'confirmed', label: 'Booking Confirmed', color: '#2563eb', bg: '#dbeafe' },
  { key: 'in_transit', label: 'In Transit', color: '#0891b2', bg: '#cffafe' },
  { key: 'out_for_delivery', label: 'Out for Delivery', color: '#ea580c', bg: '#ffedd5' },
  { key: 'delivered', label: 'Delivered', color: '#16a34a', bg: '#dcfce7' },
  { key: 'completed', label: 'Completed', color: '#14532d', bg: '#bbf7d0' },
]

export function statusLabel(status: string): string {
  return BOOKING_FUNNEL.find(s => s.key === status)?.label ?? status
}
