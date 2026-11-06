# Bagdrop — WhatsApp (Fast2SMS) Re-integration Audit
Date: 2026-11-06 · Status: Phase 1–3 done, Phase 4+ pending your approval

## 1. Existing integration (what is already in the code)
The WhatsApp system was NOT removed. It is fully built; only configuration/env and one gap (OTP) needed attention.

| Piece | File |
|---|---|
| Fast2SMS senders (Simple GET, Meta-format v2, direct-Meta fallback), provider dispatcher | `lib/notifications.ts` (`sendWhatsAppTemplate` picks fast2sms → meta fallback via `WHATSAPP_PROVIDER`) |
| Customer lifecycle (status → template) | `lib/lifecycle-notifications.ts` (`TEMPLATE_BY_STATUS`), fired from booking PATCH |
| Inquiry acknowledgment | `lib/lead-acknowledgment.ts` (+ admin resend route) |
| Driver details | `lib/driver-details.ts` |
| Indemnity bond / documents | `lib/indemnity-notifications.ts` |
| Payment verification (internal) / receipt (customer) | `lib/payment-verification-notification.ts`, `lib/payment-receipt-notification.ts` |
| Internal ops: new inquiry, pickup reminders (2d/1d/hours), quote-pending, sales follow-up, confirmed/ongoing report | `lib/new-inquiry-notification.ts`, `lib/ops-reminders.ts`, `lib/sales-followup-reminders.ts`, `lib/confirmed-ongoing-summary.ts` (+ cron routes) |
| Meta webhook | `app/api/whatsapp/webhook/route.ts` |
| Safeguards already present | Test-mode bookings never send; `notified_statuses` prevents repeat sends; failures logged to `status_history`; 10s timeouts; API key server-side only |

## 2. Fast2SMS / Meta connection
- Sender: +91 63571 15711, phone number ID `995935626929789` (env `FAST2SMS_WHATSAPP_PHONE_NUMBER_ID`), same WABA as Meta Business Manager.
- I cannot call your Fast2SMS account from here (no API key in this session), so approval status below comes from your WhatsApp Manager screenshot + the repo docs. **Please verify `FAST2SMS_API_KEY` and the phone number ID are set in Vercel** — a reconnect can invalidate them.

## 3. OTP (booking form) — finding and change
**Finding:** `/api/auth/send-otp` sent OTP by **SMS (Quick route)** only, and when SMS failed it **returned the OTP in the API response** (shown on screen). `bagdrop_otp` was not used anywhere.
**Change made (committed locally, off by default):**
- New `sendWhatsAppOtpFast2SMS()` — uses Meta-format endpoint with the authentication template (OTP in body **and** button param, per Fast2SMS docs).
- `send-otp` route: if `OTP_CHANNEL=whatsapp` → WhatsApp first, SMS fallback. Unset = unchanged behaviour.
- 30-second resend throttle per contact (HTTP 429).
- OTP generation/verification stays in our own `auth_otps` flow, so a "send OK" never marks anyone verified. (This is the standard authentication-template pattern; Fast2SMS's Smart-OTP endpoints `/dev/otp/send|verify` are for DLT SMS OTP and were deliberately not mixed in.)
- Env: `OTP_CHANNEL`, `FAST2SMS_OTP_TEMPLATE_NAME` (default `bagdrop_otp`), `FAST2SMS_OTP_LANGUAGE` (default `en` — **confirm the template's language code in WhatsApp Manager**, e.g. `en` vs `en_US`).
- Typecheck of changed files: clean. Not yet tested live.

**Security issue for your decision:** the on-screen OTP fallback lets anyone verify any number if SMS/WhatsApp is down. Recommend removing it once WhatsApp OTP is proven.

## 4. Trigger points vs. templates (from screenshot, page 1 of 4; 29 templates total)
| Event | Status today | Template (ID) |
|---|---|---|
| Inquiry received (customer) | Wired | `inquiry_acknowledgment` |
| New inquiry (internal) | Wired | `new_inquiry_notification` (28341) |
| Quote sent / accepted / rejected | Wired | `quote_sent_v2`, `quote_accepted`, `quote_rejected` |
| Payment request (QR) | Wired | `payment_request` |
| Payment verification (internal) | Wired | `payment_verification` (28739) |
| Payment received | Wired | `payment_received` (26628) |
| Booking confirmed | Wired | `booking_confirmed_v2` (26645) |
| **Pickup scheduled** | **Template approved (42328) but not switched on** | set `WHATSAPP_TEMPLATE_PICKUP_SCHEDULED=pickup_scheduled` in Vercel |
| Driver assigned | Wired | `driver_details_shared` |
| Picked up / in transit / out for delivery | Wired | `bags_picked_up` (26630), `bags_in_transit`, `out_for_delivery` |
| Delivered + review | Wired | `bags_delivered_review` (27992) |
| Documents submitted / approved | Wired | `documents_submitted` (26876), `documents_approved` |
| Pickup reminder 2d/1d | **Internal ops only** — no customer reminder | needs new template |
| Cancelled / pickup-date changed | **No customer message found** | needs new templates |
| OTP | Code ready, off | `bagdrop_otp` — not visible on page 1; check page 2–4 for its ID/language |

I have not seen pages 2–4 of your template list, so the full inventory/IDs table is incomplete. Please send screenshots of pages 2–4.

## 5. Gaps / proposals (no templates created or submitted)
1. Customer pickup reminder (2 days before, confirmed bookings only, once per booking, recalculated on date change) — new Utility template + extend `lib/ops-reminders.ts` cron.
2. Booking cancelled; Pickup/delivery date changed — new templates.
3. Notification history screen with sent/delivered/read/failed — today only `status_history` + Meta webhook; delivery-status storage needs a small table (migration, needs your review).
4. Admin safe-retry of failed sends.

## 6. Database changes
None so far.

## 7. Production activation / rollback
1. Deploy. Nothing changes (OTP_CHANNEL unset).
2. In Vercel set `WHATSAPP_TEMPLATE_PICKUP_SCHEDULED=pickup_scheduled`.
3. Test OTP: set `OTP_CHANNEL=whatsapp` on a **Preview** deployment, request OTP to a Bagdrop number on /book, verify, test wrong/expired/resend.
4. If OK, set `OTP_CHANNEL=whatsapp` in Production.
**Rollback:** clear `OTP_CHANNEL` (instant, no redeploy of code needed beyond env redeploy), or `git revert` the commit.

## 8. Awaiting your approval
Which of items 5.1–5.4 to build, plus screenshots of template pages 2–4.
