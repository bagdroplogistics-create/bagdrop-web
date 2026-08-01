// Kept identical to mobile-app/src/shared/format.ts.

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDateTime(iso)
}

// ─── Customer Title ──────────────────────────────────────────
// Kept identical to the website's lib/constants.ts TITLE_OPTIONS /
// formatCustomerName and to mobile-app/src/shared/format.ts.
export const TITLE_OPTIONS = ['Mr.', 'Mrs.', 'Ms.'] as const

export type TitleId = (typeof TITLE_OPTIONS)[number]

export const DEFAULT_TITLE: TitleId = 'Mr.'

export function formatCustomerName(title: string | null | undefined, name: string | null | undefined): string {
  const safeName = (name ?? '').trim()
  if (!safeName) return ''
  const safeTitle = TITLE_OPTIONS.includes(title as TitleId) ? title : DEFAULT_TITLE
  return `${safeTitle} ${safeName}`
}
