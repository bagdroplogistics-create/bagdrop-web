// BAGDROP — lib/workflow-whatsapp.ts  (client-safe: no server imports)
//
// Manual "send on WhatsApp" for Booking Workflow steps. This is the SAME
// mechanism the Quote Sent action has always used (and the one that
// demonstrably reaches customers): the admin's own WhatsApp Web chat is opened
// with the message pre-filled and the admin presses Send. It does not depend on
// the Meta Cloud API payment/credit-line state (error 131042) at all.
//
// Message wording mirrors the approved templates in FAST2SMS_TEMPLATES.md.
// Opening WhatsApp does NOT change the booking status — status changes remain a
// separate, explicit action.

import { parseStoredPhone } from './phone-format'
import { formatCustomerName } from './constants'

export type WorkflowWhatsAppStep =
  | 'payment_received' | 'confirmed' | 'picked_up'
  | 'in_transit' | 'out_for_delivery' | 'delivered'
  | 'pickup_scheduled' | 'indemnity_bond_signed'

export interface WorkflowBookingLike {
  tracking_id:     string
  title?:          string | null
  customer_name:   string | null
  customer_phone:  string | null
  from_city?:      string | null
  to_city?:        string | null
  total_bags?:     number | null
  total_amount?:   number | null
  pickup_date?:    string | null
  pickup_address?: string | null
  pickup_time?:    string | null
  delivery_date?:  string | null
  service_label?:  string | null
  service_type?:   string | null
}

/** Digits-only international number for wa.me / WhatsApp Web, preserving the
 *  customer's real country code (never forces +91 onto a foreign number). */
export function waDigits(stored: string | null | undefined): string {
  return parseStoredPhone(stored).e164.replace(/\D/g, '')
}

const fmtRs = (n: number | null | undefined) => '₹' + Math.round(Number(n ?? 0)).toLocaleString('en-IN')
const fmtDate = (iso?: string | null) =>
  new Date(iso || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

export const WORKFLOW_WHATSAPP_LABEL: Record<WorkflowWhatsAppStep, string> = {
  payment_received: 'Payment received',
  confirmed:        'Booking confirmed',
  picked_up:        'Bags picked up',
  in_transit:       'Bags in transit',
  out_for_delivery: 'Out for delivery',
  delivered:        'Bags delivered',
  pickup_scheduled: 'Pickup scheduled',
  indemnity_bond_signed: 'Documents approved',
}

export function isWorkflowWhatsAppStep(s: string): s is WorkflowWhatsAppStep {
  return s in WORKFLOW_WHATSAPP_LABEL
}

export function buildWorkflowWhatsAppText(step: WorkflowWhatsAppStep, b: WorkflowBookingLike): string {
  const name  = formatCustomerName(b.title, b.customer_name) || b.customer_name?.trim() || 'Customer'
  const route = [b.from_city, b.to_city].filter(Boolean).join(' → ')
  const id    = b.tracking_id

  switch (step) {
    case 'payment_received':
      return [`Dear ${name},`, '', 'We have received your payment successfully.', '',
        `Booking ID: ${id}`, `Amount Received: ${fmtRs(b.total_amount)}`, `Payment Date: ${fmtDate()}`, '',
        'Your booking is confirmed and our operations team will begin preparing your shipment.', '',
        'Thank you for choosing Bagdrop.'].join('\n')
    case 'confirmed':
      return [`Dear ${name},`, '', 'Your Bagdrop booking has been confirmed.', '',
        `Booking ID: ${id}`, `Service: ${b.service_label || b.service_type || 'Baggage Delivery'}`,
        `Pickup Date: ${b.pickup_date ? fmtDate(b.pickup_date) : 'To be confirmed'}`,
        ...(route ? [`Route: ${route}`] : []), '',
        'Our team will contact you before pickup.', '', 'Thank you for choosing Bagdrop.'].join('\n')
    case 'picked_up':
      return [`Dear ${name},`, '', 'Your bags have been collected successfully.', '',
        `Booking ID: ${id}`, `Collection Time: ${fmtDate()}`, `Number of Bags: ${b.total_bags ?? 1}`, '',
        "We'll update you again once your shipment is in transit.", '', 'Thank you for trusting Bagdrop.'].join('\n')
    case 'pickup_scheduled':
      return [`Dear ${name},`, '', 'Your bag pickup has been scheduled.', '',
        `Booking ID: ${id}`,
        `Pickup: ${b.pickup_date ? fmtDate(b.pickup_date) + (b.pickup_time ? ` at ${String(b.pickup_time).slice(0, 5)}` : '') : 'To be confirmed'}`,
        `Pickup Address: ${(b.pickup_address || '').trim() || 'As shared with us'}`,
        `Route: ${route || 'As per your booking'}`, '',
        'Our executive will call you before arriving. Please keep your bags ready and your phone reachable.', '',
        'Thank you for choosing Bagdrop.'].join('\n')
    case 'indemnity_bond_signed':
      // Exactly the approved documents_approved template.
      return [`Hi ${name},`, '', 'Great news!', '',
        `Your submitted documents for Booking ID: ${id} have been verified and approved.`, '',
        'Your booking is now ready for the next stage of processing.', '',
        "We'll keep you updated throughout your shipment.", '',
        'Thank you for choosing BagDrop.', '', '– Team BagDrop'].join('\n')
    case 'in_transit':
      return [`Dear ${name},`, '', 'Your baggage is now in transit to its destination.', '',
        `Booking ID: ${id}`, '', "We'll notify you again once your bags are out for delivery.", '', 'Thank you.'].join('\n')
    case 'out_for_delivery':
      return [`Dear ${name},`, '', 'Good news! Your baggage is out for delivery and will reach you shortly.', '',
        `Booking ID: ${id}`, '', 'Please keep your phone reachable.', '', 'Thank you.'].join('\n')
    case 'delivered':
      // Exactly the approved bags_delivered_review template.
      return [`Dear ${name},`, '', 'Your baggage has been delivered successfully.', '',
        `Booking ID: ${id}`, `Route: ${route || '—'}`, `Delivered On: ${fmtDate(b.delivery_date)}`, '',
        'Thank you for choosing BagDrop.', '',
        'We hope you enjoyed our Excess baggage delivery service.', '',
        "⭐ We'd love to hear about your experience.", '',
        'Please leave us a Google review:', '',
        'https://g.page/r/CbN8qgu-fMB-EBM/review', '',
        'Your feedback helps us improve and assists other travellers in choosing BagDrop.', '',
        'Thank you and we look forward to serving you again.', '',
        '– Team BagDrop'].join('\n')
  }
}

/** Quote Sent message — wording of the approved `quote_sent_v2` template
 *  (WhatsApp Manager). The template carries the PDF as a document header; a
 *  manual WhatsApp Web message can't, so the PDF link is added as a last line. */
export function buildQuoteSentText(q: {
  name: string; quoteNo: string; from?: string | null; to?: string | null
  bags: number | string; total: number | string; pdfUrl?: string | null
}): string {
  const route = q.from && q.to ? `${q.from} → ${q.to}` : 'As per your quote'
  return [`Dear ${q.name},`, '', 'Your Bagdrop quote is ready.', '',
    `Customer Name: ${q.name}`, `Quote No: ${q.quoteNo}`, `Route: ${route}`, `Bags: ${q.bags}`,
    `Total Amount: ${fmtRs(Number(q.total))}`, '',
    'Please review and confirm. For any questions, call us at +91 63571 15711 or +91 63573 35733.',
    ...(q.pdfUrl ? ['', `Quote PDF: ${q.pdfUrl}`] : []), '',
    'Thank you for choosing Bagdrop.'].join('\n')
}

/** Opens WhatsApp Web with the message pre-filled. Returns false if no usable number. */
export function openWorkflowWhatsApp(phone: string | null | undefined, text: string): boolean {
  const digits = waDigits(phone)
  if (!digits) return false
  window.open(`https://web.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(text)}`, '_blank')
  return true
}
