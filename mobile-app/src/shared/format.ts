// Ported from the website's lib/utils.ts formatting helpers.

import { TITLE_OPTIONS, DEFAULT_TITLE, type TitleId } from './constants'

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date))
}

export function formatBookingDate(date: Date | string): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(date))
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

// ─── Customer Title ──────────────────────────────────────────
// TITLE_OPTIONS/DEFAULT_TITLE now live in ./constants (matching the
// website's lib/constants.ts) — re-exported here so existing imports of
// formatCustomerName from './format' keep working unchanged.
export { TITLE_OPTIONS, DEFAULT_TITLE }
export type { TitleId }

export function formatCustomerName(title: string | null | undefined, name: string | null | undefined): string {
  const safeName = (name ?? '').trim()
  if (!safeName) return ''
  const safeTitle = TITLE_OPTIONS.includes(title as TitleId) ? title : DEFAULT_TITLE
  return `${safeTitle} ${safeName}`
}
