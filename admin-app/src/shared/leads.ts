// Kept in sync with app/(admin)/admin/leads/page.tsx on the website —
// same status values/labels/colors, same service type options.

export interface LeadStatusMeta {
  key: string
  label: string
  color: string
  bg: string
}

export const LEAD_STATUSES: LeadStatusMeta[] = [
  { key: 'new', label: 'New', color: '#2563eb', bg: '#dbeafe' },
  { key: 'contacted', label: 'Contacted', color: '#d97706', bg: '#fef3c7' },
  { key: 'qualified', label: 'Qualified', color: '#7c3aed', bg: '#ede9fe' },
  { key: 'converted', label: 'Converted', color: '#16a34a', bg: '#dcfce7' },
  { key: 'lost', label: 'Lost', color: '#dc2626', bg: '#fee2e2' },
]

export function leadStatusMeta(status: string): LeadStatusMeta {
  return LEAD_STATUSES.find(s => s.key === status) ?? { key: status, label: status, color: '#6b7280', bg: '#f3f4f6' }
}

export const LEAD_SERVICE_TYPES = [
  { value: 'airport-to-doorstep', label: 'Airport → Doorstep', needsFlight: true },
  { value: 'doorstep-to-airport', label: 'Doorstep → Airport', needsFlight: true },
  { value: 'doorstep-to-doorstep', label: 'Doorstep → Doorstep', needsFlight: false },
  { value: 'airport-to-airport', label: 'Airport → Airport', needsFlight: false },
]

export function leadNeedsFlightInfo(serviceType: string | null | undefined): boolean {
  return LEAD_SERVICE_TYPES.find(s => s.value === serviceType)?.needsFlight ?? false
}
