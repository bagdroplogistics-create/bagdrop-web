// BAGDROP — lib/company-info.ts
//
// Single shared source for BagDrop's own company + bank details on the
// Invoice PDF, instead of yet another hardcoded copy. Re-exports the
// already-confirmed-correct LR_COMPANY block (lib/lr-constants.ts — GSTIN
// 24AAACC9320N2ZL was explicitly confirmed by the founder there) and adds
// the bank details block, using the IFSC the founder confirmed as correct
// (IOBA0002587 — the one already used in lib/email.ts's invoice email,
// NOT the older IOBA0001717 still hardcoded in QuotePDF.tsx/quote print
// views, which is now known to be stale but is out of scope to fix here).
//
// Note: the `settings` table (app/api/admin/settings/route.ts) has
// company_gst/payment_bank_name/payment_ifsc/etc. fields too, but they're
// currently unpopulated everywhere in the app — nothing today actually
// reads bank/company info from there for a customer-facing PDF. This file
// is deliberately just constants, matching the pattern already used by
// every other PDF/print surface (LR, Quote). If BagDrop wants these
// editable from the Settings screen later, wiring this file to read from
// `settings` (with these constants as the fallback) is a small follow-up.

import { LR_COMPANY } from './lr-constants'

export const INVOICE_COMPANY = {
  name:         LR_COMPANY.name,
  addressLine1: LR_COMPANY.addressLine1,
  addressLine2: LR_COMPANY.addressLine2,
  gstin:        LR_COMPANY.gstin,
  cin:          LR_COMPANY.cin,
  phone:        LR_COMPANY.phone,
  email:        LR_COMPANY.email,
  web:          LR_COMPANY.web,
} as const

export const INVOICE_BANK = {
  bankName:    'Indian Overseas Bank (IOB)',
  accountName: 'Bagdrop Logistics Solutions Pvt. Ltd.',
  accountNo:   '258702000000058',
  ifsc:        'IOBA0002587',
  upi:         'BAGDROP1717@IOB',
} as const
