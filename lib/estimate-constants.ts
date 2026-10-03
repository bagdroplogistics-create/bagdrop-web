// BAGDROP — lib/estimate-constants.ts
//
// Shared, client-safe constants for the Automatic Estimate Quote feature.
// Split out from lib/estimate-quote.ts (which imports supabaseAdmin and
// is server-only) specifically so app/(admin)/admin/quotes/new/page.tsx
// (a client component) can reuse the EXACT SAME unknown-route fallback
// figure when pre-filling the quote editor, instead of a second hardcoded
// copy that could drift out of sync.

// Founder-specified fallback (2026-10-03 spec, section 6): "Use the
// existing fallback rule: ₹10,000 estimate for 2 bags."
export const UNKNOWN_ROUTE_DEFAULT_BASE = 10000
