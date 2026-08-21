// BAGDROP — lib/company-info.ts
//
// Single shared source for BagDrop's own company + bank details on the
// Invoice PDF, instead of yet another hardcoded copy. Re-exports the
// already-confirmed-correct LR_COMPANY block (lib/lr-constants.ts — GSTIN
// 24AAACC9320N2ZL was explicitly confirmed by the founder there) and adds
// the bank details block.
//
// Bank details — CORRECTED 2026-08-17: the founder confirmed via a
// screenshot of the real "Payment Details" panel that the correct account
// is Indian Overseas Bank, A/C 171702000001297, IFSC IOBA0001717, Gotri
// Road, Vadodara branch. This REPLACES the previously "confirmed" IOBA0002587
// / 258702000000058 pairing, which was flagged and found to resolve to an
// Indian Overseas Bank branch in Patancheru, Telangana — not Vadodara —
// i.e. that earlier value was wrong. lib/email.ts's invoice email still
// hardcodes the old (also wrong) IOBA0002587 — same fix needed there.
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
  bankName:    'Indian Overseas Bank',
  accountName: 'Bagdrop Logistics Solutions Pvt. Ltd.',
  accountNo:   '171702000001297',
  ifsc:        'IOBA0001717',
  branch:      'Gotri Road, Vadodara',
  upi:         'BAGDROP1717@IOB',
} as const

// The one approved company payment QR (same static asset already used by
// lib/lifecycle-notifications.ts's WhatsApp payment-reminder template).
// Deliberately a single shared, fixed image — NOT regenerated per booking
// or per reminder — per the Payment Follow Up feature spec ("Do not create
// a new QR code for every reminder"). Encodes INVOICE_BANK.upi with no
// amount, so it's valid to reuse across every outstanding-payment amount.
export const PAYMENT_QR_IMAGE_URL = 'https://www.bagdrop.co/bagdrop_upi_qr.png'
