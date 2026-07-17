# Bagdrop Mobile

React Native (Expo + Expo Router) app for Bagdrop, built to reuse the exact same backend as [bagdrop.co](https://bagdrop.co) — no separate API, no separate database. Same booking IDs, same pricing engine, same admin dashboard, same Supabase project.

## What's built (MVP core)

- **Auth** — phone or email OTP, matching the website's passwordless flow exactly (no separate password/signup system exists on the backend, so the app doesn't invent one)
- **Home** — all 6 real services from the website
- **Booking flow** — service & route → bags (incl. wedding-specific fields) → schedule & addresses → review & customer details, using the *exact same pricing engine* as the website (ported line-for-line from `lib/pricing.ts`)
- **Payment** — Razorpay checkout, reusing the website's `/api/orders` endpoint and Razorpay's own hosted Checkout.js (same integration the site uses, just opened in an in-app browser view instead of a web page)
- **Booking confirmation + tracking** — reuses `/api/track`
- **My Bookings** — uses one new endpoint, `/api/my-bookings` (see below — nothing like it existed before)
- **Profile** — session info, Face ID/Fingerprint login toggle, WhatsApp/FAQ/email/phone support links, sign out

## What's stubbed / not yet built

- **Saved addresses & saved payment methods** — shown in Profile as "coming soon." No backend table exists for these yet; needs a small schema + endpoint addition before they can be real.
- **Push notifications** — the app can register a device for notifications, but nothing on the backend sends them yet (booking-status-change → push is a follow-up piece of work, separate from this app).
- **Social login (Google/Apple)** — not wired up. This can be added via Supabase Auth's built-in OAuth providers (configured in the Supabase dashboard, no new backend code needed) — a config task, not a code task.
- **Dark mode / multi-language** — not implemented in this pass.
- **App icon / splash screen** — `app.json` currently has no custom icon/splash image references (so Expo uses its generic default) since I couldn't generate binary image assets in this pass. Before a real store submission, add `assets/icon.png` (1024×1024), `assets/adaptive-icon.png` (1024×1024, transparent bg), and `assets/splash.png`, then re-add the corresponding `icon` / `splash` / `android.adaptiveIcon.foregroundImage` fields to `app.json` pointing at them. Your existing logo files under the website's `public/` folder are a good starting point.

None of the above block real usage — signup, booking, payment, and tracking all work end-to-end against your live backend.

## One new backend file

`app/api/my-bookings/route.ts` was added to `bagdrop-web-clean` (the website repo) because no endpoint existed to list "all bookings for the currently logged-in customer" — only single-booking lookup by tracking ID (`/api/track`, no auth) and booking creation (`/api/bookings`) existed. This new endpoint verifies the customer's Supabase session token and returns their own bookings only.

## Setup

### 1. Install dependencies

```bash
cd mobile-app
npm install
npx expo install --fix   # auto-corrects any package version drift
```

### 2. Configure API keys

Open `app.json` and fill in `expo.extra`:

```json
"extra": {
  "apiBaseUrl": "https://bagdrop.co",
  "supabaseUrl": "<same as NEXT_PUBLIC_SUPABASE_URL in ../.env.local>",
  "supabaseAnonKey": "<same as NEXT_PUBLIC_SUPABASE_ANON_KEY in ../.env.local>",
  "razorpayKeyId": "<same as NEXT_PUBLIC_RAZORPAY_KEY_ID in ../.env.local>"
}
```

These are the same **public** keys already used in the website's browser code — safe to ship in the app. Never put `SUPABASE_SERVICE_ROLE_KEY` or `RAZORPAY_KEY_SECRET` here.

To test against your local dev server instead of production, set `apiBaseUrl` to your machine's local IP (not `localhost` — your phone can't reach your computer's localhost), e.g. `"http://192.168.1.42:3000"`, and make sure `npm run dev` is running in `bagdrop-web-clean`.

### 3. Preview it in a browser (fastest way to see the layout)

```bash
npm run web
```

Opens at `http://localhost:8081` (or similar) in your default browser — no phone, no QR code, no install. Every screen works the same as on a phone **except the in-app payment step**, which uses a native WebView not supported on web; it shows a friendly explanation instead of crashing. Everything before it — login, home, the full booking flow, tracking, My Bookings, profile — renders and works identically.

### 4. Run it on your actual phone (no Mac, no App Store needed yet)

```bash
npx expo start
```

Install the **Expo Go** app from the App Store / Play Store on your phone, then scan the QR code shown in your terminal. The app opens live on your phone in seconds, and reloads automatically every time you save a file.

If a specific screen doesn't load inside Expo Go (some native modules like `react-native-webview` occasionally need a custom dev build depending on Expo Go's current SDK support), run:

```bash
npx expo run:android   # requires Android Studio, builds a real dev app
```

or use `eas build --profile development` (needs a free Expo account) for a cloud-built dev client — no Mac required for Android; iOS dev builds via EAS need an Apple Developer account but still no physical Mac.

### 5. Deploying to the App Store / Play Store (later)

When you're ready:

```bash
npm install -g eas-cli
eas build --platform android
eas build --platform ios      # needs an Apple Developer account ($99/yr)
eas submit
```

EAS builds in the cloud — you don't need to own a Mac even for the iOS build, only for the Apple Developer account to submit it.

## Project structure

```
mobile-app/
  app/                    Expo Router screens (file-based routing)
    (auth)/               login, OTP verify
    (tabs)/               home, bookings, track, profile
    booking/              4-step booking flow + payment + confirmation
  src/
    shared/                constants, pricing, types — ported verbatim from
                            ../lib/{constants,pricing,booking-types}.ts.
                            If you change pricing/services/routes on the
                            website, copy the same change here.
    theme/                 colors + typography, matching tailwind.config.ts
    lib/                   supabase client, api client, config
    context/                AuthContext, BookingContext
    components/             shared UI (Button, Card, TextField, etc.)
```

## Keeping the app in sync with the website

Anything in `src/shared/` is a manual copy of the equivalent website file. There's no automated sync — if you add a new service, city, route, or bag type on the website, make the same edit in `src/shared/constants.ts` here, or bookings created in the app may reference IDs the backend doesn't recognize.
