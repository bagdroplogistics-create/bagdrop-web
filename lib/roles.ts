/**
 * Role-based permission constants for Bagdrop Admin Panel.
 *
 * Admin  : full access to everything
 * Staff  : operational access — can view/update bookings, leads, quotes
 *          but cannot approve without payment, delete quotes, or access settings
 */

import type { AdminRole } from './admin-auth'

export const PERMISSIONS = {
  /** Can approve a booking without requiring payment */
  APPROVE_WITHOUT_PAYMENT: (role: AdminRole) => role === 'admin',

  /** Can delete a quote */
  DELETE_QUOTE: (role: AdminRole) => role === 'admin',

  /** Can access the Settings module */
  ACCESS_SETTINGS: (role: AdminRole) => role === 'admin',

  /** Can issue a refund */
  ISSUE_REFUND: (role: AdminRole) => role === 'admin',

  /** Can view and manage payments */
  VIEW_PAYMENTS: (role: AdminRole) => role !== null,

  /** Can verify a payment (mark as paid) */
  VERIFY_PAYMENT: (role: AdminRole) => role !== null,

  /** Can create / edit leads */
  MANAGE_LEADS: (role: AdminRole) => role !== null,

  /** Can create / edit quotes */
  MANAGE_QUOTES: (role: AdminRole) => role !== null,

  /** Can update booking status */
  UPDATE_BOOKING_STATUS: (role: AdminRole) => role !== null,

  /** Can send invoice via email or WhatsApp */
  SEND_INVOICE: (role: AdminRole) => role !== null,
} as const

export type Permission = keyof typeof PERMISSIONS

/** Convenience — check a permission client-side using the stored role string */
export function can(permission: Permission, role: AdminRole): boolean {
  return PERMISSIONS[permission](role)
}

/**
 * Reads the current role from sessionStorage (client-side only).
 * Returns 'admin' | 'staff' | null.
 */
export function getRoleFromSession(): AdminRole {
  if (typeof window === 'undefined') return null
  return (sessionStorage.getItem('bagdrop_admin_role') as AdminRole) ?? null
}
