// Shared (client + server) constants and validation for the #Y2K multi-step
// family booking wizard. No server-only imports here — this file is bundled
// into the browser too. Server re-validates everything with sanitizeFamily().

export const Y2K_BAG_TYPES = [
  { id: 'large',  label: 'Large Bag' },
  { id: 'medium', label: 'Medium Bag' },
  { id: 'small',  label: 'Small Bag' },
] as const
export type Y2KBagType = (typeof Y2K_BAG_TYPES)[number]['id']
export const bagTypeLabel = (id: string) => Y2K_BAG_TYPES.find(t => t.id === id)?.label ?? 'Bag'

export const Y2K_PICKUP_DATES_LIST = [
  { id: '2026-12-10', label: '10 Dec' },
  { id: '2026-12-11', label: '11 Dec' },
  { id: '2026-12-12', label: '12 Dec' },
]
export const Y2K_SLOT_LIST = [
  { id: 'morning',   label: 'Morning · 10 AM–1 PM' },
  { id: 'afternoon', label: 'Midday · 1–3 PM' },
  { id: 'evening',   label: 'Afternoon · 3–6 PM' },
]
export const Y2K_COLOURS: [string, string][] = [
  ['Black', '#1c1c1c'], ['Navy', '#23314f'], ['Grey', '#8b8d90'], ['Silver', '#cfd2d4'], ['Red', '#a3312a'],
  ['Maroon', '#6a1f2a'], ['Green', '#3f5b3a'], ['Blue', '#2f6db0'], ['Brown', '#6b4a2e'], ['Beige', '#d9c6a3'],
  ['Pink', '#d98fa3'], ['White', '#f7f7f4'], ['Multi-colour', 'linear-gradient(135deg,#a3312a,#e0b341 50%,#2f6db0)'],
]
export const Y2K_CONTENTS = ['Family luggage']
export const Y2K_DELIVER: [string, string][] = [['room', "Guest's room"], ['bell', 'Hold at bell desk'], ['host', 'Host family suite'], ['decor', 'Décor team']]
export const Y2K_WEIGHTS = ['Under 10 kg', '10–20 kg', '20–32 kg', 'Over 32 kg']
export const Y2K_RET_DEST: [string, string][] = [['same', 'Same as pickup address'], ['other', 'A different Mumbai address']]
export const Y2K_ACCESS = ['Lift available', 'Stairs only', 'Ground floor / bungalow']
export const Y2K_TRAVEL_MODES = ['Flight', 'Train', 'Road']
export const Y2K_ARR_DATES = ['15 Dec', '16 Dec', '17 Dec', '18 Dec']
export const Y2K_DEP_DATES = ['18 Dec', '19 Dec', '20 Dec', '21 Dec']
export const Y2K_LIMITS = { maxMembers: 12, maxPickups: 4, maxBags: 40 }

export interface FamMember { ref: string; name: string; phone: string; mode: string; arrDate: string; arrTime: string; travelNo: string; depDate: string }
export interface FamPickup { ref: string; label: string; city: 'Mumbai'; address: string; pincode: string; landmark: string; access: string; contact: string; contactPhone: string; date: string; slot: string; memberRefs: string[] }
export interface FamBag {
  ref: string; type: Y2KBagType; owner: string; pickup: string; colour: string; mark: string; weight: string
  contents: string; deliverTo: string; hang: boolean; fragile: boolean
  ret: boolean; retSlot: string; retDest: string; retAddress: string
}
export interface FamilyPayload {
  side: 'bride' | 'groom'
  members: FamMember[]; pickups: FamPickup[]; bags: FamBag[]
  extraReturn: number; retFrom: string; notes: string
  declarations: { terms: boolean; consent: boolean }
}

// Mumbai city pincodes: 400001–400104.
export const isMumbaiPincode = (p: string) => /^\d{6}$/.test(p) && Number(p) >= 400001 && Number(p) <= 400104
export const MUMBAI_PIN_RE = /\b4000\d{2}\b|\b40010[0-4]\b/
const digits10 = (v: unknown) => { const d = typeof v === 'string' ? v.replace(/\D/g, '') : ''; return d.length === 12 && d.startsWith('91') ? d.slice(2) : d }
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const inList = (v: string, list: readonly string[]) => list.includes(v)

export type SanitizeResult = { ok: true; family: FamilyPayload } | { ok: false; error: string }

/** Validates + normalises an untrusted wizard payload. Used by the API route. */
export function sanitizeFamily(raw: unknown): SanitizeResult {
  const r = raw as Record<string, unknown> | null
  const bad = (error: string): SanitizeResult => ({ ok: false, error })
  if (!r || typeof r !== 'object') return bad('Invalid booking details.')
  const side = r.side === 'groom' ? 'groom' : r.side === 'bride' ? 'bride' : null
  if (!side) return bad("Choose bride's side or groom's side.")

  if (!Array.isArray(r.members) || r.members.length < 1 || r.members.length > Y2K_LIMITS.maxMembers) return bad('Add between 1 and 12 travellers.')
  const members: FamMember[] = []
  const memberRefs = new Set<string>()
  for (let i = 0; i < r.members.length; i++) {
    const m = (r.members[i] ?? {}) as Record<string, unknown>
    const ref = str(m.ref, 8) || `G${String(i + 1).padStart(2, '0')}`
    const name = str(m.name, 100)
    if (!name) return bad(`Traveller ${i + 1}: please enter a name.`)
    const phone = digits10(m.phone)
    if (phone && !/^[6-9]\d{9}$/.test(phone)) return bad(`Traveller ${i + 1}: enter a valid 10-digit mobile number or leave it blank.`)
    if (memberRefs.has(ref)) return bad('Duplicate traveller id.')
    memberRefs.add(ref)
    const arrDate = str(m.arrDate, 10), depDate = str(m.depDate, 10)
    if (arrDate && !inList(arrDate, Y2K_ARR_DATES)) return bad(`Traveller ${i + 1}: invalid arrival date.`)
    if (depDate && !inList(depDate, Y2K_DEP_DATES)) return bad(`Traveller ${i + 1}: invalid departure date.`)
    if (arrDate && depDate && parseInt(depDate) < parseInt(arrDate)) return bad(`Traveller ${i + 1}: leaves before arriving.`)
    const mode = str(m.mode, 10)
    members.push({ ref, name, phone, mode: inList(mode, Y2K_TRAVEL_MODES) ? mode : 'Flight', arrDate, arrTime: str(m.arrTime, 5), travelNo: str(m.travelNo, 40), depDate })
  }

  if (!Array.isArray(r.pickups) || r.pickups.length < 1 || r.pickups.length > Y2K_LIMITS.maxPickups) return bad('Add between 1 and 4 pickup addresses.')
  const pickups: FamPickup[] = []
  const pickupRefs = new Set<string>()
  for (let i = 0; i < r.pickups.length; i++) {
    const p = (r.pickups[i] ?? {}) as Record<string, unknown>
    const ref = str(p.ref, 8) || `P${i + 1}`
    // Mumbai is the only accepted pickup city — anything else is rejected, not coerced.
    if (p.city !== undefined && String(p.city).trim().toLowerCase() !== 'mumbai') return bad('Pickups for this service are available from Mumbai only.')
    const address = str(p.address, 300)
    if (address.length < 8) return bad(`Pickup ${i + 1}: add the full address.`)
    const pincode = str(p.pincode, 6)
    if (!isMumbaiPincode(pincode)) return bad(`Pickup ${i + 1}: enter a valid Mumbai pincode (400001–400104).`)
    const date = str(p.date, 10)
    if (!Y2K_PICKUP_DATES_LIST.some(d => d.id === date)) return bad('Pickup date must be 10, 11, or 12 December 2026.')
    const slot = str(p.slot, 12)
    if (!Y2K_SLOT_LIST.some(s => s.id === slot)) return bad('Pickup time must be Morning, Midday, or Afternoon.')
    const refs = Array.isArray(p.memberRefs) ? (p.memberRefs as unknown[]).map(x => str(x, 8)).filter(x => memberRefs.has(x)) : []
    if (!refs.length) return bad(`Pickup ${i + 1}: choose whose bags are collected here.`)
    const contactPhone = digits10(p.contactPhone)
    if (contactPhone && !/^[6-9]\d{9}$/.test(contactPhone)) return bad(`Pickup ${i + 1}: enter a valid 10-digit contact mobile or leave it blank.`)
    pickupRefs.add(ref)
    pickups.push({ ref, label: str(p.label, 60), city: 'Mumbai', address, pincode, landmark: str(p.landmark, 120), access: inList(str(p.access, 40), Y2K_ACCESS) ? str(p.access, 40) : Y2K_ACCESS[0], contact: str(p.contact, 100), contactPhone, date, slot, memberRefs: refs })
  }

  if (!Array.isArray(r.bags) || r.bags.length < 1 || r.bags.length > Y2K_LIMITS.maxBags) return bad('Add at least one bag (maximum 40).')
  const bags: FamBag[] = []
  const bagRefs = new Set<string>()
  for (let i = 0; i < r.bags.length; i++) {
    const b = (r.bags[i] ?? {}) as Record<string, unknown>
    const ref = str(b.ref, 8) || `B${String(i + 1).padStart(2, '0')}`
    if (bagRefs.has(ref)) return bad('Duplicate bag id.')
    bagRefs.add(ref)
    const type = str(b.type, 10)
    if (!Y2K_BAG_TYPES.some(t => t.id === type)) return bad(`Bag ${i + 1}: choose Large, Medium or Small Bag.`)
    const owner = str(b.owner, 8), pickup = str(b.pickup, 8)
    if (!memberRefs.has(owner)) return bad(`Bag ${i + 1}: choose whose bag this is.`)
    if (!pickupRefs.has(pickup)) return bad(`Bag ${i + 1}: choose where it is collected from.`)
    const colour = str(b.colour, 20)
    if (!Y2K_COLOURS.some(c => c[0] === colour)) return bad(`Bag ${i + 1}: pick a colour.`)
    const ret = b.ret === true
    const retSlot = str(b.retSlot, 12), retDest = str(b.retDest, 8), retAddress = str(b.retAddress, 300)
    if (ret) {
      if (!Y2K_SLOT_LIST.some(s => s.id === retSlot)) return bad(`Bag ${i + 1}: choose a return pickup time.`)
      if (!Y2K_RET_DEST.some(d => d[0] === retDest)) return bad(`Bag ${i + 1}: choose where to deliver it back.`)
      if (retDest === 'other' && (retAddress.length < 8 || !MUMBAI_PIN_RE.test(retAddress))) return bad(`Bag ${i + 1}: add the full Mumbai return address with pincode.`)
    }
    const weight = str(b.weight, 20), contents = str(b.contents, 40), deliverTo = str(b.deliverTo, 8)
    bags.push({
      ref, type: type as Y2KBagType, owner, pickup, colour, mark: str(b.mark, 120),
      weight: inList(weight, Y2K_WEIGHTS) ? weight : '10–20 kg',
      contents: inList(contents, Y2K_CONTENTS) ? contents : 'Family luggage',
      deliverTo: Y2K_DELIVER.some(d => d[0] === deliverTo) ? deliverTo : 'room',
      hang: b.hang === true, fragile: b.fragile === true,
      ret, retSlot: ret ? retSlot : '', retDest: ret ? retDest : '', retAddress: ret && retDest === 'other' ? retAddress : '',
    })
  }
  const decl = (r.declarations ?? {}) as Record<string, unknown>
  const extra = Number(r.extraReturn)
  return {
    ok: true,
    family: {
      side, members, pickups, bags,
      extraReturn: Number.isInteger(extra) && extra >= 0 && extra <= 4 ? extra : 0,
      retFrom: r.retFrom === 'bell' ? 'bell' : 'room',
      notes: str(r.notes, 500),
      declarations: { terms: decl.terms === true, consent: decl.consent === true },
    },
  }
}
