// BAGDROP — shared prohibited-items policy content.
//
// Used by the Y2K booking form (app/y2k/page.tsx) AND its API route
// (app/api/y2k/inquiry/route.ts) so the wording the customer accepted is the
// exact wording recorded against the inquiry. If this text changes, bump
// PROHIBITED_ITEMS_VERSION — the version is stored with every acknowledgement.

export const PROHIBITED_ITEMS_VERSION = 'prohibited-items-v1-2026-10'

export const PROHIBITED_ITEMS_HEADING = 'IMPORTANT: ITEMS STRICTLY PROHIBITED WITH BAGDROP'

export const PROHIBITED_ITEMS: ReadonlyArray<{ id: string; label: string; icon: string }> = [
  { id: 'lighters',     label: 'Lighters and matchsticks',  icon: '🔥' },
  { id: 'flam-liquid',  label: 'Flammable liquids',         icon: '🛢️' },
  { id: 'toxic',        label: 'Toxic substances',          icon: '☠️' },
  { id: 'corrosive',    label: 'Corrosive substances',      icon: '🧪' },
  { id: 'alcohol',      label: 'Alcohol',                   icon: '🍾' },
  { id: 'lithium',      label: 'Lithium batteries',         icon: '🔋' },
  { id: 'flam-gas',     label: 'Flammable gas',             icon: '💨' },
  { id: 'e-cigarettes', label: 'E-cigarettes',              icon: '🚬' },
  { id: 'infectious',   label: 'Infectious substances',     icon: '🦠' },
  { id: 'radioactive',  label: 'Radioactive materials',     icon: '☢️' },
  { id: 'explosives',   label: 'Explosives and ammunition', icon: '💣' },
  { id: 'power-banks',  label: 'Power banks',               icon: '🔌' },
]

export const PROHIBITED_DISCLAIMER_TITLE = 'Prohibited Items & Customer Responsibility'

export const PROHIBITED_DISCLAIMER_TEXT =
  'BagDrop strictly prohibits the items listed above. Customers must not include these items in baggage handed over to BagDrop. If a customer includes any prohibited or undeclared item, they do so entirely at their own risk and responsibility. BagDrop shall not be responsible for any loss, damage, seizure, penalty, delay, or other issue arising from such items, subject to applicable law and the terms of service.'

export const PROHIBITED_ACK_TEXT =
  'I have read and understood the prohibited-items list and confirm that I will not hand over any prohibited items to BagDrop. I understand that I am responsible for the contents of my baggage.'
