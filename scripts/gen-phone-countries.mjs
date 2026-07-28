// BAGDROP — scripts/gen-phone-countries.mjs
//
// Regenerates lib/phone-countries.ts (and its duplicates in mobile-app/ and
// admin-app/ — copy the output over both after running this) from
// libphonenumber-js's country metadata + Node's built-in Intl.DisplayNames
// for English country names. Run with: node scripts/gen-phone-countries.mjs
//
// Only needs re-running if libphonenumber-js updates its country list (new
// country, renamed country, etc.) — the data itself is static at runtime,
// not fetched, so this is a dev-time codegen script, not part of the app.

import { getCountries, getCountryCallingCode } from 'libphonenumber-js'
import { writeFileSync } from 'fs'

const PREFERRED_COUNTRIES = ['IN', 'US', 'CA', 'GB', 'AU', 'NZ', 'AE', 'SG']

function flagFor(iso2) {
  return String.fromCodePoint(...[...iso2.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65))
}

const dn = new Intl.DisplayNames(['en'], { type: 'region' })

const countries = getCountries()
  .map(iso2 => {
    let name
    try { name = dn.of(iso2) } catch { name = iso2 }
    return { iso2, name, dialCode: getCountryCallingCode(iso2), flag: flagFor(iso2) }
  })
  .filter(c => c.name && c.name !== c.iso2)
  .sort((a, b) => a.name.localeCompare(b.name))

const out = `// BAGDROP — lib/phone-countries.ts
//
// Static list of all ITU-assigned country calling codes, generated once from
// libphonenumber-js metadata + Intl.DisplayNames (English names) rather than
// looked up at runtime — keeps this dependency-free at render time and portable
// to the React Native apps (mobile-app/, admin-app/), which duplicate this exact
// file (see the header comment there) since the three apps are separate npm
// projects and do not share a node_modules/workspace.
//
// Regenerate with: node scripts/gen-phone-countries.mjs (then copy the output
// over both mobile-app/src/shared/phone-countries.ts and
// admin-app/src/shared/phone-countries.ts to keep all three in sync).

export interface CountryDialCode {
  iso2:      string  // ISO 3166-1 alpha-2, e.g. "IN"
  name:      string  // English display name, e.g. "India"
  dialCode:  string  // Calling code WITHOUT leading +, e.g. "91"
  flag:      string  // Emoji flag, e.g. "🇮🇳"
}

// Countries Bagdrop sees the most inquiries from — pinned to the top of the
// selector, above the alphabetical full list. Order here is the display order.
export const PREFERRED_COUNTRIES = ${JSON.stringify(PREFERRED_COUNTRIES)}

// Full list, alphabetical by name (matches every country tel-number-selector
// UX convention). PhoneInput re-sorts this at render time to float
// PREFERRED_COUNTRIES to the top; this array itself stays pure/alphabetical so
// it is trivially diffable against a future regeneration.
export const ALL_COUNTRIES: CountryDialCode[] = ${JSON.stringify(countries, null, 2)}

export const DEFAULT_COUNTRY_ISO2 = 'IN'

export function findCountry(iso2: string): CountryDialCode | undefined {
  return ALL_COUNTRIES.find(c => c.iso2 === iso2.toUpperCase())
}
`

writeFileSync(new URL('../lib/phone-countries.ts', import.meta.url), out)
console.log(`Wrote ${countries.length} countries to lib/phone-countries.ts`)
