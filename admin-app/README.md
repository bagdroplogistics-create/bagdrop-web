# Bagdrop Admin (mobile)

Mobile extension of the website admin dashboard. Same backend, same
`/api/admin/*` endpoints, same auth model (`ADMIN_SECRET_KEY` /
`STAFF_SECRET_KEY`) — no separate backend, no new APIs beyond what the
website already uses.

## Status

First slice shipped: admin key login, session persistence, and a
dashboard screen (stat cards, CRM quick stats, the same 12-stage booking
funnel the website shows, and a recent-activity feed) — all sourced from
existing endpoints (`/api/admin/stats`, `/api/admin/crm-stats`,
`/api/admin/bookings`).

Still placeholders, coming in follow-up passes: Inquiries, Quotes (create/
edit/duplicate + send via WhatsApp/Email), Bookings detail + dispatch,
Payments (QR/UPI share, mark-as-received), and push notifications.

## Setup

```
cd admin-app
npm install
npx expo start
```

Points at `https://www.bagdrop.co` by default (see `app.json` → `expo.extra.apiBaseUrl`).

## Auth model — please read

The website's admin login is **not** per-admin email/password — it's a
single shared secret key per role (`ADMIN_SECRET_KEY` → full access,
`STAFF_SECRET_KEY` → limited access), checked in `lib/admin-auth.ts` and
entered via `x-admin-key` header or `?key=` query param. This app's login
screen mirrors that exactly. If you want individual admin accounts with
their own email/password instead, that's a backend change (new user
table + auth flow) — let me know and I'll scope it separately, since it's
a bigger change than "reuse the existing APIs."
