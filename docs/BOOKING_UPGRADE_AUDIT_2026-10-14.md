# Bagdrop Booking Upgrade — Phase 0 Audit (2026-10-14)

Source of truth: this repository (`bagdrop-web-clean`). Nothing below is taken from the Blueprint HTML unless stated. No code was changed for the upgrade yet.

## 0. Backup taken before any work
- Git tag and branch: `backup/booking-form-pre-upgrade-2026-10-14` (points at `94b93fa`).
- Tarball: `backups/booking-form-backup-2026-10-14.tar.gz` (booking route group, `/api/bookings`, `lib/`). Do not commit it.
- Restore: `git checkout backup/booking-form-pre-upgrade-2026-10-14 -- "app/(booking)" components/booking app/api/bookings`.
- Note: `components/booking/*` (the live /book UI) is covered by the git tag, not by the tarball.

## 1. Current architecture
- Next.js app router + Supabase (service-role `supabaseAdmin`), deployed on Vercel (`vercel.json` has cron entries). Admin auth = shared `ADMIN_SECRET_KEY` / `STAFF_SECRET_KEY` (+ per-branch keys).
- Public `/book`: `app/(booking)/book/page.tsx` renders `components/booking/booking-engine.tsx` (steps: route, bags, schedule, review) behind `booking-gate.tsx` / `booking-auth.tsx` (Supabase Auth + custom OTP modal). It POSTs to `/api/bookings`.
- `/book` review step literally says "Mobile verification required · No payment now". It creates an INQUIRY (status `inquiry`), not a paid booking.
- Other booking entry points: `/y2k` wizard (`/api/y2k/inquiry`), Skybird partner engine, admin "New Quote".
- Pricing: `route_pricing` table (base_price, per_bag_rate) + `app/api/admin/zoho/generate-quote` (server-side, authoritative at quote time). Unknown routes get a flagged ₹10,000 placeholder ("Review Price").
- Documents: LR/GC (`lib/lr-auto-create.ts`), indemnity bond (public token page + OTP), trip sheets, invoices (`app/api/admin/invoices`), bag tags (`lib/bag-tags.ts`).

## 2. Existing booking status map (`lib/lifecycle-notifications.ts` STATUS_ORDER)
inquiry → quote_created → quote_sent → accepted → payment_pending → payment_received → payment_approved → confirmed → … (operational statuses) → completed. `cancelled` / `rejected` are outside the ordered list.
Mapping to the blueprint lifecycle is possible without data loss (Intent=inquiry, Quoted=quote_sent, Paid=payment_approved, Scheduled/PickedUp/InTransit/… = existing operational statuses, Delivered/Closed=completed). Not applied; no status rewrite is proposed until you approve it.

## 3. Setu integration map — FINDING: no Setu integration exists in this repository
Searched all of `app/`, `lib/`, SQL migrations, JSON and markdown for `setu`, `SETU_*`, `aadhaar`, `digilocker`. Results:
- **Mobile OTP is not Setu.** It is a custom OTP: `app/api/auth/send-otp` and `verify-otp` generate a 6-digit code, store it in the `auth_otps` table and deliver it by **Fast2SMS** SMS (`FAST2SMS_API_KEY`). The indemnity page reuses the same table with an `indemnity:` key prefix (`lib/indemnity-otp.ts`).
- **Aadhaar is not verified anywhere.** The only Aadhaar references are on the indemnity bond: the customer types/uploads an Aadhaar number or document, stored on the bond (`aadhaar_number`, `aadhaar_doc_path`) and shown to admins. There is no provider call, no callback, no webhook, no verification status, no Setu env vars.
- Therefore there is no Setu redirect URL, callback/webhook handler or provider reference to reuse. I will not guess Setu endpoints or payloads.
- Possible explanations: Setu lives in another repo / the mobile app / a different branch, or it is planned but not built. Please tell me which.
- Privacy note: the current indemnity flow already stores raw Aadhaar numbers and document images, which conflicts with the "avoid storing raw Aadhaar" principle in your spec. Flagging for your legal/compliance review.

## 4. Payments
- No payment gateway is wired into `/book`. Customers pay by UPI/bank (details on the quote PDF) and an admin verifies the proof (`/payment-verification`, Payments page). Status moves payment_pending → payment_received → payment_approved by admin action.
- `app/api/orders/route.ts` creates a Razorpay order via REST and returns a mock order when `RAZORPAY_KEY_ID/SECRET` are missing. Nothing in `components/booking` calls it, and there is no Razorpay webhook/signature handler in the repo. So: Razorpay code exists as a stub, but it is not an operating integration. Stripe: none.

## 5. Notifications
- Fast2SMS WhatsApp templates + Meta Cloud API (`lib/notifications.ts`). Meta delivery currently fails with 131042 (billing / shared credit line) for API sends.
- **`ops_pickup_reminder` already exists and is already automated, but it is an INTERNAL template** ("Dear Bagdrop Team…", Status / Driver / Special Instructions). `lib/ops-reminders.ts` already schedules `two_days_before`, `day_before` and `day_of` for confirmed-onward bookings, with `UNIQUE(booking_id, reminder_type)`, atomic claim (no double-send), reschedule on pickup-date change, cancel on cancellation, cron at `/api/cron/send-ops-reminders`. It sends only to `settings.ops_reminder_whatsapp`, never to the customer.
- Your spec asks to send this template to the **customer's** WhatsApp 2 days before pickup. That would send an internal "Dear Bagdrop Team" message to customers. Not implemented — needs your decision (see section 9).

## 6. Reports — requirement is already met
- "Upcoming Confirmed Bookings" already exists: Admin dashboard (`app/(admin)/admin/page.tsx`, heading "Upcoming Confirmed Bookings") and the Operations report (`/admin/reports/operations`, backed by `app/api/admin/reports/operations/route.ts`).
- Backend-filtered to statuses from `confirmed` up to (excluding) `completed`, so inquiries, quote stages, payment-pending/received-but-unconfirmed, cancelled and rejected are excluded by construction. Filters: all, today, tomorrow, next 3 days, next 7 days, custom range; fields include customer, tracking ID, service, route, status, driver.
- Only cosmetic gap: the operations report subheading reads "Confirmed & Upcoming Bookings". Optional rename.

## 7. Reusable components / APIs
`components/booking/*` (steps, indicator, price summary), `/api/bookings`, `route_pricing` + `generate-quote`, `auth_otps` OTP helpers, `lib/ops-reminders.ts`, `lib/lr-auto-create.ts`, `lib/bag-tags.ts`, `lib/y2k-family.ts` (validation pattern), admin reports API, `bookings`/`leads`/`group_guests`/`group_bags` tables, `family_details` jsonb (added for Y2K).

## 8. Gaps vs. the blueprint (honest list)
| Blueprint item | State in repo |
|---|---|
| Setu mobile OTP | Not present (Fast2SMS custom OTP instead) |
| Setu Aadhaar verification | Not present (manual upload on indemnity bond only) |
| Name-match scoring | No data source; cannot be computed without a verified identity |
| Payment gateway + signed quotes + webhooks | Not wired; manual UPI verification; Razorpay route is a stub |
| 24h quote expiry / re-validation before payment | Quote has an `expiry_date`, no enforced pre-payment recheck |
| Slot / capacity engine | Not present |
| Use-case config engine (hotel, rail, cruise, store-and-forward, etc.) | Service types exist as strings; no configuration tables |
| Hub / custody / scanning | Bag tags + `bag_tracking_events` exist; no hub/manifest model |
| Upcoming Confirmed Bookings | Already done |
| Pickup reminder 2 days before | Already done, but to the internal ops number |

## 9. Decisions needed before building the blocked parts
1. **Setu**: where is the existing Setu integration (repo/branch/app)? If it does not exist yet, do you want to build it new (needs Setu credentials + docs from you) instead of the existing Fast2SMS OTP?
2. **Reminder**: send `ops_pickup_reminder` to the customer (unsuitable text) or create a new customer-facing template, or keep the existing internal reminder only?
3. **Payments**: keep manual UPI verification, or approve Razorpay (credentials + webhook) for `/book`?
4. **Aadhaar storage**: confirm legal position on the current raw-Aadhaar storage on the indemnity bond.

## 10. Proposed plan once unblocked
1. Phase 1 (safe, no new provider): feature-flagged use-case configuration table + conditional fields on `/book`; server-side quote record with expiry; eligibility check endpoint (OTP via existing system, quote valid, route serviceable).
2. Phase 1b (needs Setu answers): provider adapter boundary `lib/identity/*` + session-bound verification table (provider ref, status, timestamps, minimal attributes, consent) + callback route with replay/state checks.
3. Phase 2: pricing service extraction from `generate-quote`; missing-route flagging; quote versioning.
4. Phase 3: reports rename only; reminders per decision above.
5. Phase 4+: hotel/group/corporate/rail/cruise/store-and-forward flows behind flags once routes, partners and prices are supplied.
Rollback for every phase: additive migrations only (new tables/columns), feature flags default off, backup branch above.
