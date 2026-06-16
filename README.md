# Bagdrop Web

Premium luggage delivery — Next.js 15 website.

## Quick Start

```bash
cd bagdrop-web
npm install
cp .env.example .env.local   # fill in your keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Stack

- **Next.js 15** (App Router, Turbopack in dev)
- **React 19** + **TypeScript**
- **Tailwind CSS v3** + custom design tokens
- **Framer Motion** — animation system in `lib/animations.ts`
- **Shadcn UI** (via Radix UI primitives)
- **Supabase** — database, auth, realtime, storage
- **Razorpay** — payments (India)
- **Stripe** — payments (NRI / international)
- **Geist** font (headings) + **Inter** (body)

## Folder Structure

```
app/
├── (marketing)/        # Public pages — SSG, served via Navbar + Footer
│   ├── page.tsx        # Homepage
│   ├── services/
│   ├── airport-delivery/
│   ├── door-to-door/
│   ├── destination-weddings/
│   ├── student-relocation/
│   ├── corporate-travel/
│   ├── excess-baggage/
│   ├── about/
│   ├── contact/
│   └── faq/
├── (booking)/          # Transactional pages — CSR
│   ├── book/           # Booking engine (Phase 5)
│   └── track/          # Order tracking (Phase 5/7)
├── (admin)/            # Protected dashboard (Phase 8)
│   └── dashboard/
└── api/                # API routes (Phase 7)

components/
├── ui/                 # Primitives: Button, Badge, Input, etc.
├── layout/             # Navbar, Footer
└── sections/           # Homepage sections

lib/
├── utils.ts            # cn(), formatCurrency(), etc.
├── constants.ts        # Routes, services, bag types, cities
└── animations.ts       # Framer Motion variants

public/
└── icons/bags/         # 6 SVG bag illustrations
```

## Design Tokens

All design tokens live in `tailwind.config.ts`. Key values:

| Token | Value | Use |
|-------|-------|-----|
| `brand` | `#FF6300` | Primary CTA, active states, icons |
| `midnight` | `#080F1E` | Hero bg, dark sections |
| `cream` | `#FAFAF8` | Page background |
| `gold` | `#C8A96E` | Price displays, premium badges |
| `neutral-dark` | `#545454` | Secondary text |
| `border` | `#EAEAEA` | All borders |

## Phase Status

- [x] Phase 1 — Audit
- [x] Phase 2 — Sitemap + IA
- [x] Phase 3 — Design System + Scaffold
- [ ] Phase 4 — Homepage (full implementation)
- [ ] Phase 5 — Booking Engine
- [ ] Phase 6 — Service pages + FAQ + About
- [ ] Phase 7 — Backend (Supabase + payments)
- [ ] Phase 8 — Admin dashboard
- [ ] Phase 9 — QA + launch
