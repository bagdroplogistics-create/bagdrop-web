'use client'

// #Y2K multi-step family booking wizard — ported from the approved booking
// form reference and wired to the existing /api/y2k/inquiry route.
// Submitting creates an INQUIRY (never a confirmed booking). Guests, bags and
// pickups all hang off ONE main inquiry; an optional second inquiry is created
// for the return leg exactly as before (separate tracking ID, linked back).
//
// Deliberately NOT in this form: pickup window, declared value, extra bag
// types, any city other than Mumbai, and the (hidden) hotel room number.

import { memo, useEffect, useRef, useState } from 'react'
import {
  PROHIBITED_ITEMS_VERSION, PROHIBITED_ITEMS_HEADING, PROHIBITED_ITEMS,
  PROHIBITED_DISCLAIMER_TITLE, PROHIBITED_DISCLAIMER_TEXT, PROHIBITED_ACK_TEXT,
} from '@/lib/prohibited-items'
import ProhibitedIcon from './ProhibitedIcons'
import { WIZARD_CSS } from './wizard.css'
import {
  Y2K_BAG_TYPES, bagTypeLabel, Y2K_PICKUP_DATES_LIST, Y2K_SLOT_LIST, Y2K_COLOURS, Y2K_CONTENTS, Y2K_DELIVER,
  Y2K_WEIGHTS, Y2K_RET_DEST, Y2K_ACCESS, Y2K_TRAVEL_MODES, Y2K_ARR_DATES, Y2K_DEP_DATES, Y2K_LIMITS,
  isMumbaiPincode, MUMBAI_PIN_RE,
  type FamMember, type FamPickup, type FamBag, type Y2KBagType,
} from '@/lib/y2k-family'

const WEDDING_VENUE = 'Taj Aravali, Udaipur'
const Y2K_RETURN_PICKUP_DATE = '2026-12-19'
const STEP_NAMES = ['Family', 'Travellers', 'Pickups', 'Bags', 'Return', 'Review']
const DRAFT_KEY = 'y2k-wizard-draft-v1'

interface WState {
  family: { phone: string; lead: string; email: string; side: '' | 'bride' | 'groom' }
  members: FamMember[]
  pickups: FamPickup[]
  bags: FamBag[]
  extraReturn: string
  retFrom: string
  notes: string
  ackProhibited: boolean
  terms: boolean
  consent: boolean
  seq: { g: number; p: number; b: number }
}

const pad = (n: number) => String(n).padStart(2, '0')
const blankMember = (n: number): FamMember => ({ ref: 'G' + pad(n), name: '', phone: '', mode: 'Flight', arrDate: '16 Dec', arrTime: '', travelNo: '', depDate: '19 Dec' })
const blankPickup = (n: number): FamPickup => ({ ref: 'P' + n, label: n === 1 ? 'Home' : '', city: 'Mumbai', address: '', pincode: '', landmark: '', access: Y2K_ACCESS[0], contact: '', contactPhone: '', date: '', slot: '', memberRefs: [] })
const fresh = (): WState => ({
  family: { phone: '', lead: '', email: '', side: '' },
  members: [blankMember(1)], pickups: [blankPickup(1)], bags: [],
  extraReturn: '0', retFrom: 'room', notes: '', ackProhibited: false, terms: false, consent: false, seq: { g: 1, p: 1, b: 0 },
})
const phoneOk = (p: string) => /^[6-9]\d{9}$/.test(p.replace(/\D/g, ''))
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const slotLabel = (id: string) => Y2K_SLOT_LIST.find(s => s.id === id)?.label ?? id
const dateLabel = (id: string) => Y2K_PICKUP_DATES_LIST.find(d => d.id === id)?.label ?? id
const weightFor = (t: Y2KBagType) => (t === 'large' ? '20–32 kg' : t === 'small' ? 'Under 10 kg' : '10–20 kg')

type Errs = Record<string, string>

function errsFor(S: WState, step: number): Errs {
  const e: Errs = {}
  if (step === 0) {
    if (!phoneOk(S.family.phone)) e['family.phone'] = 'Enter a 10-digit Indian mobile number.'
    if (!S.family.lead.trim()) e['family.lead'] = 'Enter the lead guest name.'
    if (!S.family.side) e['family.side'] = "Choose bride's side or groom's side."
    if (S.family.email && !/^\S+@\S+\.\S+$/.test(S.family.email)) e['family.email'] = 'Check the email address.'
  }
  if (step === 1) S.members.forEach((m, i) => {
    if (i > 0 && !m.name.trim()) e[`members.${i}.name`] = 'Add a name.'
    if (i > 0 && m.phone && !phoneOk(m.phone)) e[`members.${i}.phone`] = '10-digit mobile, or leave blank.'
    if (parseInt(m.depDate) < parseInt(m.arrDate)) e[`members.${i}.depDate`] = 'Leaves before arriving. Check the dates.'
  })
  if (step === 2) S.pickups.forEach((p, i) => {
    if (p.address.trim().length < 8) e[`pickups.${i}.address`] = 'Add the full address.'
    if (!isMumbaiPincode(p.pincode)) e[`pickups.${i}.pincode`] = 'Enter a Mumbai pincode (400001–400104).'
    if (!p.date) e[`pickups.${i}.date`] = 'Select a pickup date.'
    else if (!Y2K_PICKUP_DATES_LIST.some(d => d.id === p.date)) e[`pickups.${i}.date`] = 'Pickup is only available on 10, 11 or 12 December 2026.'
    if (!p.slot) e[`pickups.${i}.slot`] = 'Choose a time slot.'
    if (!p.memberRefs.length) e[`pickups.${i}.members`] = 'Tick whose bags are collected here.'
    if (p.contactPhone && !phoneOk(p.contactPhone)) e[`pickups.${i}.contactPhone`] = '10-digit mobile.'
  })
  if (step === 3) {
    if (!S.bags.length) e.bags = 'Add at least one bag.'
    S.bags.forEach((b, i) => {
      if (!b.owner) e[`bags.${i}.owner`] = 'Whose bag is this?'
      if (!b.pickup) e[`bags.${i}.pickup`] = 'Where do we collect it?'
      if (!b.colour) e[`bags.${i}.colour`] = 'Pick the closest colour.'
    })
  }
  if (step === 4) S.bags.forEach((b, i) => {
    if (!b.ret) return
    if (!b.retSlot) e[`bags.${i}.retSlot`] = 'Time'
    if (b.retDest === 'other' && (b.retAddress.trim().length < 8 || !MUMBAI_PIN_RE.test(b.retAddress))) e[`bags.${i}.retAddress`] = 'Add the full Mumbai address with pincode.'
  })
  if (step === 5) {
    if (!S.ackProhibited) e.ackProhibited = 'Please confirm you have read the prohibited-items list before submitting.'
    if (!S.terms) e.terms = 'Required'
    if (!S.consent) e.consent = 'Required'
  }
  return e
}

function getPath(o: unknown, p: string): string {
  const v = p.split('.').reduce<unknown>((a, k) => (a == null ? a : (a as Record<string, unknown>)[k]), o)
  return v == null ? '' : String(v)
}
function setPath(o: unknown, p: string, v: unknown) {
  const ks = p.split('.')
  let a = o as Record<string, unknown>
  for (let i = 0; i < ks.length - 1; i++) a = a[ks[i]] as Record<string, unknown>
  a[ks[ks.length - 1]] = v
}

// Static (never changes) — memoised so toggling a checkbox doesn't re-render 12 SVG icons.
const ProhibitedBlock = memo(function ProhibitedBlock() {
  return (
    <>
        <p style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.08em', color: '#B03A2E', margin: '0 0 12px', lineHeight: 1.4 }}>{PROHIBITED_ITEMS_HEADING}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))', gap: '14px 8px' }}>
        {PROHIBITED_ITEMS.map(it => (
          <div key={it.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0, textAlign: 'center' }}>
            <ProhibitedIcon id={it.id} size={52} />
            <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, color: '#4B5563', overflowWrap: 'anywhere' }}>{it.label}</span>
          </div>
        ))}
      </div>
      <div role="note" style={{ marginTop: 14, padding: '12px 14px', background: '#FDF1EF', borderLeft: '4px solid #B03A2E', borderRadius: 8 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#7A241B', margin: '0 0 6px' }}>{PROHIBITED_DISCLAIMER_TITLE}</p>
        <p style={{ fontSize: 12.5, lineHeight: 1.65, color: '#5A5145', margin: 0 }}>{PROHIBITED_DISCLAIMER_TEXT}</p>
      </div>
    </>
  )
})

export default function BookingWizard({ isTestMode }: { isTestMode: boolean }) {
  const [S, setS] = useState<WState>(fresh)
  const [step, setStep] = useState(0)
  const [maxStep, setMaxStep] = useState(0)
  const [showErrors, setShowErrors] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [done, setDone] = useState<null | { code: string; returnCode: string; returnFailed: boolean; snap: WState }>(null)
  const submissionIdRef = useRef('')
  const rootRef = useRef<HTMLDivElement>(null)

  if (!submissionIdRef.current) {
    submissionIdRef.current = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `y2k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }

  // Restore an unfinished draft (client-only, after hydration).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const d = JSON.parse(raw)
      if (d?.S?.family && Array.isArray(d.S.members) && Array.isArray(d.S.pickups) && Array.isArray(d.S.bags)) {
        const s0: WState = { ...fresh(), ...d.S, ackProhibited: false, terms: false, consent: false }
        // Drop anything that is no longer a valid option (old bag types / non-Mumbai city).
        s0.bags = s0.bags.filter(b => Y2K_BAG_TYPES.some(t => t.id === b.type))
        s0.pickups = s0.pickups.map(p => ({ ...p, city: 'Mumbai' as const }))
        setS(s0); setStep(Math.min(d.step ?? 0, 5)); setMaxStep(Math.min(d.maxStep ?? 0, 5))
      }
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    if (done) return
    const t = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ S: { ...S, ackProhibited: false, terms: false, consent: false }, step, maxStep })) } catch { /* ignore */ }
    }, 500)
    return () => clearTimeout(t)
  }, [S, step, maxStep, done])

  const mut = (fn: (n: WState) => void) => setS(prev => { const n = clone(prev); fn(n); return n })
  const E = showErrors ? errsFor(S, step) : {}
  const err = (k: string) => (E[k] ? <span className="msg">{E[k]}</span> : null)
  const bad = (k: string) => (E[k] ? ' bad' : '')
  const scrollTop = () => rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // Flat top-level fields (checkboxes, notes, selects): cheap shallow update, no deep clone.
  const setFlat = (k: 'ackProhibited' | 'terms' | 'consent' | 'notes' | 'extraReturn' | 'retFrom', v: boolean | string) =>
    setS(prev => ({ ...prev, [k]: v }))

  function onFieldChange(path: string, v: unknown) {
    if (path === 'ackProhibited' || path === 'terms' || path === 'consent' || path === 'notes' || path === 'extraReturn' || path === 'retFrom') {
      setFlat(path, v as boolean | string)
      return
    }
    mut(n => {
      setPath(n, path, v)
      let m = path.match(/^bags\.(\d+)\.contents$/)
      if (m) {
        const b = n.bags[+m[1]]
        if (v === 'Bridal / groom outfits') b.hang = true
        if (v === 'Wedding gifts & hampers' || v === 'Return gift boxes') b.deliverTo = 'host'
        if (v === 'Décor material') b.deliverTo = 'decor'
      }
      m = path.match(/^bags\.(\d+)\.owner$/)
      if (m) {
        const b = n.bags[+m[1]]
        const p = n.pickups.find(pk => pk.memberRefs.includes(String(v)))
        if (p) b.pickup = p.ref
      }
    })
  }

  // ── field builders ──────────────────────────────────────────────
  type InpOpts = { type?: string; opt?: boolean; ph?: string; im?: 'numeric' | 'tel' | 'text'; max?: number; full?: boolean; ro?: boolean; hint?: string; ac?: string; tel?: boolean; min?: string; max2?: string }
  const inp = (k: string, label: string, o: InpOpts = {}) => (
    <label className={`f${bad(k)}${o.full ? ' full' : ''}`} key={k}>
      <span>{label}{o.opt ? <> <em>(optional)</em></> : null}</span>
      <input type={o.type ?? 'text'} value={getPath(S, k)} placeholder={o.ph ?? ''} readOnly={o.ro} inputMode={o.im} maxLength={o.max} min={o.min} {...(o.max2 ? { max: o.max2 } : {})} autoComplete={o.ac ?? 'off'}
        onChange={e => onFieldChange(k, o.tel ? e.target.value.replace(/\D/g, '').slice(0, 10) : e.target.value)} />
      {o.hint ? <span className="hint">{o.hint}</span> : null}{err(k)}
    </label>
  )
  const sel = (k: string, label: string, opts: (string | [string, string])[], o: { ph?: string; opt?: boolean; full?: boolean; hint?: string } = {}) => {
    const list = opts.map(x => (Array.isArray(x) ? x : [x, x] as [string, string]))
    return (
      <label className={`f${bad(k)}${o.full ? ' full' : ''}`} key={k}>
        <span>{label}{o.opt ? <> <em>(optional)</em></> : null}</span>
        <select value={getPath(S, k)} onChange={e => onFieldChange(k, e.target.value)}>
          {o.ph ? <option value="">{o.ph}</option> : null}
          {list.map(([val, t]) => <option key={val} value={val}>{t}</option>)}
        </select>
        {o.hint ? <span className="hint">{o.hint}</span> : null}{err(k)}
      </label>
    )
  }

  const ownerName = (st: WState, ref: string) => (ref === st.members[0]?.ref ? st.family.lead : st.members.find(m => m.ref === ref)?.name) || '—'

  // ── steps ───────────────────────────────────────────────────────
  const step0 = (
    <>
      <h3 className="ph">Who&apos;s booking?</h3>
      <p className="psub">Start with the lead guest. You can add family members, pickups and bags in the next steps.</p>
      <div className="grid">
        {inp('family.lead', 'Lead guest name', { ph: 'Full name', ac: 'name' })}
        {inp('family.phone', 'Mobile / WhatsApp', { type: 'tel', im: 'numeric', max: 10, ph: '10-digit number', ac: 'tel', tel: true })}
        {inp('family.email', 'Email', { type: 'email', opt: true, ph: 'your@email.com', ac: 'email' })}
        <div className={`full${bad('family.side')}`}>
          <span className="lab">You&apos;re a guest of</span>
          <div className="seg" style={{ marginTop: 7 }}>
            <label><input type="radio" name="ywz-side" checked={S.family.side === 'bride'} onChange={() => onFieldChange('family.side', 'bride')} /><span>Bride&apos;s side · Yashna</span></label>
            <label><input type="radio" name="ywz-side" checked={S.family.side === 'groom'} onChange={() => onFieldChange('family.side', 'groom')} /><span>Groom&apos;s side · Yash</span></label>
          </div>
          {err('family.side')}
        </div>
      </div>
    </>
  )

  const step1 = (
    <>
      <h3 className="ph">Who&apos;s travelling?</h3>
      <p className="psub">Add everyone in your family who has bags. Travel details help us plan bag arrival at the venue.</p>
      {S.members.map((m, i) => (
        <div className="item" key={m.ref}>
          <div className="top">
            <h4>{i === 0 ? `${S.family.lead || 'Lead Guest'} (Lead Guest)` : (m.name || `Traveller ${i + 1}`)}</h4>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="idchip">{m.ref}</span>
              {i > 0 && <button className="x" type="button" onClick={() => mut(n => {
                const ref = n.members[i].ref
                n.members.splice(i, 1)
                n.pickups.forEach(p => { p.memberRefs = p.memberRefs.filter(x => x !== ref) })
                n.bags.forEach(b => { if (b.owner === ref) b.owner = '' })
              })}>Remove</button>}
            </div>
          </div>
          <div className="grid">
            {i === 0
              ? <label className="f" key="lead"><span>Full name</span><input type="text" value={S.family.lead} readOnly /><span className="hint">Taken from the lead guest on the first step.</span></label>
              : inp(`members.${i}.name`, 'Full name', { ph: 'As on ID' })}
            {i > 0 && inp(`members.${i}.phone`, 'Mobile', { type: 'tel', im: 'numeric', max: 10, opt: true, ph: 'For their own bag updates', tel: true })}
            {sel(`members.${i}.mode`, 'Travelling by', Y2K_TRAVEL_MODES)}
            {sel(`members.${i}.arrDate`, 'Arrives Udaipur', Y2K_ARR_DATES)}
            {inp(`members.${i}.arrTime`, 'Arrival time', { type: 'time', opt: true })}
            {inp(`members.${i}.travelNo`, m.mode === 'Flight' ? 'Flight number' : m.mode === 'Train' ? 'Train number' : 'Vehicle / notes', { opt: true, ph: m.mode === 'Flight' ? 'e.g. 6E 5203' : '' })}
            {sel(`members.${i}.depDate`, 'Leaves Udaipur', Y2K_DEP_DATES)}
          </div>
          {err(`members.${i}.depDate`)}
        </div>
      ))}
      {S.members.length < Y2K_LIMITS.maxMembers
        ? <div className="adders" style={{ marginTop: 14 }}><button type="button" onClick={() => mut(n => { n.seq.g++; n.members.push(blankMember(n.seq.g)) })}>+ Add family member</button></div>
        : <p className="hint">For more than {Y2K_LIMITS.maxMembers} travellers, make a second booking.</p>}
    </>
  )

  const step2 = (
    <>
      <h3 className="ph">Where do we collect?</h3>
      <p className="psub">Pickups are from Mumbai only. One pickup point per address — family members living apart can each have their own.</p>
      {S.pickups.map((p, i) => (
        <div className="item" key={p.ref}>
          <div className="top">
            <h4>{p.label || `Pickup ${i + 1}`}</h4>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="idchip">{p.ref}</span>
              {S.pickups.length > 1 && <button className="x" type="button" onClick={() => mut(n => { const ref = n.pickups[i].ref; n.pickups.splice(i, 1); n.bags.forEach(b => { if (b.pickup === ref) b.pickup = '' }) })}>Remove</button>}
            </div>
          </div>
          <div className="grid">
            {inp(`pickups.${i}.label`, 'Name this address', { opt: true, ph: "Home, Office, Nani's house" })}
            <label className="f" key={`city${i}`}><span>City</span><select value="Mumbai" disabled aria-readonly="true"><option value="Mumbai">Mumbai</option></select><span className="hint">Pickups are available from Mumbai only.</span></label>
            {inp(`pickups.${i}.address`, 'Full address', { full: true, ph: 'Flat / house no., building, street, area', ac: 'street-address' })}
            {inp(`pickups.${i}.pincode`, 'Pincode', { im: 'numeric', max: 6, ph: '400050', ac: 'postal-code', tel: true })}
            {inp(`pickups.${i}.landmark`, 'Landmark', { opt: true, ph: 'Near…' })}
            {sel(`pickups.${i}.access`, 'Access', Y2K_ACCESS)}
            {inp(`pickups.${i}.contact`, 'Person handing over', { opt: true, ph: 'Defaults to you' })}
            {inp(`pickups.${i}.contactPhone`, 'Their mobile', { type: 'tel', im: 'numeric', max: 10, opt: true, tel: true })}
            {inp(`pickups.${i}.date`, 'Pickup date', { type: 'date', min: '2026-12-10', max2: '2026-12-12', hint: 'Pickups run 10–12 December 2026 only.' })}
            {sel(`pickups.${i}.slot`, 'Time slot', Y2K_SLOT_LIST.map(s => [s.id, s.label] as [string, string]), { ph: 'Select a slot' })}
            <div className={`full${bad(`pickups.${i}.members`)}`}>
              <span className="lab">Whose bags are collected here</span>
              <div className="seg" style={{ marginTop: 7 }}>
                {S.members.map(m => (
                  <label key={m.ref}>
                    <input type="checkbox" checked={p.memberRefs.includes(m.ref)} onChange={ev => mut(n => {
                      const arr = n.pickups[i].memberRefs
                      const at = arr.indexOf(m.ref)
                      if (ev.target.checked && at < 0) arr.push(m.ref)
                      if (!ev.target.checked && at >= 0) arr.splice(at, 1)
                    })} />
                    <span>{ownerName(S, m.ref) === '—' ? m.ref : ownerName(S, m.ref)}</span>
                  </label>
                ))}
              </div>
              {err(`pickups.${i}.members`)}
            </div>
          </div>
        </div>
      ))}
      {S.pickups.length < Y2K_LIMITS.maxPickups && <div className="adders" style={{ marginTop: 14 }}><button type="button" onClick={() => mut(n => { n.seq.p++; n.pickups.push(blankPickup(n.seq.p)) })}>+ Add another address</button></div>}
    </>
  )

  const addBag = (t: Y2KBagType) => mut(n => {
    if (n.bags.length >= Y2K_LIMITS.maxBags) return
    n.seq.b++
    const owner = n.members.length === 1 ? n.members[0].ref : ''
    const pk = n.pickups.length === 1 ? n.pickups[0].ref : (owner ? (n.pickups.find(p => p.memberRefs.includes(owner))?.ref ?? '') : '')
    n.bags.push({
      ref: 'B' + pad(n.seq.b), type: t, owner, pickup: pk, colour: '', mark: '', weight: weightFor(t),
      contents: 'Family luggage', deliverTo: 'room', hang: false, fragile: false,
      ret: true, retSlot: 'morning', retDest: 'same', retAddress: '',
    })
  })

  const step3 = (
    <>
      <h3 className="ph">Your bags</h3>
      <p className="psub">Add each bag once. Its type and colour are printed on the tag, so our team can spot it among hundreds of others.</p>
      {S.bags.length < Y2K_LIMITS.maxBags
        ? <div className="adders">{Y2K_BAG_TYPES.map(t => <button type="button" key={t.id} onClick={() => addBag(t.id)}>+ {t.label}</button>)}</div>
        : <p className="hint">That&apos;s the most bags one booking can hold. Message us on WhatsApp for more.</p>}
      {E.bags ? <p className="msg">{E.bags}</p> : null}
      {!S.bags.length && <div className="callout">No bags yet. Tap a bag type above to add your first one.</div>}
      {S.bags.map((b, i) => (
        <div className="item" key={b.ref}>
          <div className="top">
            <h4>{bagTypeLabel(b.type)}</h4>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="idchip">{b.ref}</span>
              <button className="x" type="button" onClick={() => mut(n => {
                if (n.bags.length >= Y2K_LIMITS.maxBags) return
                n.seq.b++
                const c = clone(n.bags[i]); c.ref = 'B' + pad(n.seq.b); c.mark = ''
                n.bags.splice(i + 1, 0, c)
              })}>Add another like this</button>
              <button className="x" type="button" onClick={() => mut(n => { n.bags.splice(i, 1) })}>Remove</button>
            </div>
          </div>
          <div className="grid">
            {sel(`bags.${i}.owner`, 'Belongs to', S.members.map(m => [m.ref, ownerName(S, m.ref)] as [string, string]), { ph: 'Choose person' })}
            {sel(`bags.${i}.pickup`, 'Collected from', S.pickups.map(p => [p.ref, (p.label || p.ref) + (p.address ? ' · ' + p.address.slice(0, 26) : '')] as [string, string]), { ph: 'Choose pickup' })}
            <div className={`full${bad(`bags.${i}.colour`)}`}>
              <span className="lab">Colour{b.colour ? <em> · {b.colour}</em> : null}</span>
              <div className="swatches" style={{ marginTop: 7 }}>
                {Y2K_COLOURS.map(([nm, c]) => (
                  <label key={nm} title={nm}>
                    <input type="radio" name={`ywz-col-${b.ref}`} checked={b.colour === nm} onChange={() => onFieldChange(`bags.${i}.colour`, nm)} />
                    <i style={{ background: c }} /><span className="sr">{nm}</span>
                  </label>
                ))}
              </div>
              {err(`bags.${i}.colour`)}
            </div>
            {inp(`bags.${i}.mark`, 'Brand or identifying mark', { opt: true, ph: 'e.g. American Tourister, red ribbon on handle' })}
            {sel(`bags.${i}.weight`, 'Approx. weight', Y2K_WEIGHTS, { hint: b.weight === 'Over 32 kg' ? "Bags over 32 kg need two handlers. We'll confirm on WhatsApp." : undefined })}
            {sel(`bags.${i}.contents`, "What's inside", Y2K_CONTENTS)}
            {sel(`bags.${i}.deliverTo`, 'Deliver to', Y2K_DELIVER)}
            <div>
              <span className="lab">Handling</span>
              <label className="tick" style={{ marginTop: 8 }}><input type="checkbox" checked={b.hang} onChange={e => onFieldChange(`bags.${i}.hang`, e.target.checked)} /> Keep hanging (no folding)</label>
              <label className="tick" style={{ marginTop: 6 }}><input type="checkbox" checked={b.fragile} onChange={e => onFieldChange(`bags.${i}.fragile`, e.target.checked)} /> Fragile</label>
            </div>
          </div>
        </div>
      ))}
    </>
  )

  const step4 = !S.bags.length ? (
    <><h3 className="ph">Bringing bags home</h3><div className="callout">Add bags first.</div></>
  ) : (
    <>
      <h3 className="ph">Bringing bags home</h3>
      <p className="psub">Return pickups are from {WEDDING_VENUE} on 19 December 2026. Untick any bag you&apos;ll carry back yourself.</p>
      <div className="adders">
        <button type="button" onClick={() => mut(n => n.bags.forEach(b => { b.ret = true; b.retDest = 'same'; b.retSlot = b.retSlot || 'morning' }))}>Return every bag to its pickup address</button>
        <button type="button" onClick={() => mut(n => n.bags.forEach(b => { b.ret = false }))}>I&apos;ll carry everything back</button>
      </div>
      <div>
        {S.bags.map((b, i) => (
          <div className="retrow" key={b.ref}>
            <div>
              <label className="tick">
                <input type="checkbox" checked={b.ret} onChange={e => onFieldChange(`bags.${i}.ret`, e.target.checked)} />
                <span><b>{ownerName(S, b.owner)}</b> · {bagTypeLabel(b.type)}<br /><span className="hint">{b.colour} · {b.ref}</span></span>
              </label>
            </div>
            {b.ret ? (
              <>
                <select className={bad(`bags.${i}.retSlot`).trim()} value={b.retSlot} onChange={e => onFieldChange(`bags.${i}.retSlot`, e.target.value)} aria-label="Return pickup time">
                  {Y2K_SLOT_LIST.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <select value={b.retDest} onChange={e => onFieldChange(`bags.${i}.retDest`, e.target.value)} aria-label="Deliver back to">
                  {Y2K_RET_DEST.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                </select>
                {b.retDest === 'other' && <div style={{ gridColumn: '1/-1' }}>{inp(`bags.${i}.retAddress`, 'Return address', { ph: 'Full Mumbai address with pincode' })}</div>}
              </>
            ) : <div className="hint" style={{ gridColumn: 'span 2' }}>Travelling back with the guest</div>}
          </div>
        ))}
      </div>
      <div className="grid" style={{ marginTop: 20 }}>
        {sel('extraReturn', 'Extra bags expected on return', [['0', 'None'], ['1', '1 more'], ['2', '2 more'], ['3', '3 more'], ['4', '4 or more']], { hint: 'Gifts and shopping. Our team will plan extra tags.' })}
        {sel('retFrom', 'Collect return bags from', [['room', "Each guest's room"], ['bell', 'Bell desk']])}
      </div>
    </>
  )

  const bagsOf = (st: WState, ref: string) => st.bags.filter(b => b.owner === ref).length
  const step5 = (
    <>
      <h3 className="ph">Check and send</h3>
      <p className="psub">This sends your pickup request. We&apos;ll review it and confirm on WhatsApp — nothing is confirmed until then.</p>
      <div className="lab" style={{ marginBottom: 8 }}>Travellers</div>
      <div className="tbl-wrap"><table><thead><tr><th>Guest</th><th>Arrives</th><th>Leaves</th><th>Bags</th></tr></thead><tbody>
        {S.members.map((m, i) => (
          <tr key={m.ref}><td>{i === 0 ? `${S.family.lead} (Lead)` : m.name}</td><td>{m.arrDate} {m.arrTime}{m.travelNo ? ' · ' + m.travelNo : ''}</td><td>{m.depDate}</td><td className="num">{bagsOf(S, m.ref)}</td></tr>
        ))}
      </tbody></table></div>
      <div className="lab" style={{ margin: '20px 0 8px' }}>Pickups (Mumbai)</div>
      <div className="tbl-wrap"><table><thead><tr><th>Address</th><th>When</th><th>Bags</th></tr></thead><tbody>
        {S.pickups.map(p => (
          <tr key={p.ref}><td><b>{p.label || p.ref}</b><br />{p.address}, Mumbai {p.pincode}</td><td>{dateLabel(p.date)}<br /><span className="hint">{slotLabel(p.slot)}</span></td><td className="num">{S.bags.filter(b => b.pickup === p.ref).length}</td></tr>
        ))}
      </tbody></table></div>
      <div className="lab" style={{ margin: '20px 0 8px' }}>Bags ({S.bags.length})</div>
      <div className="tbl-wrap"><table><thead><tr><th>Bag</th><th>Owner</th><th>Deliver to</th><th>Return</th></tr></thead><tbody>
        {S.bags.map(b => (
          <tr key={b.ref}>
            <td>{b.colour} {bagTypeLabel(b.type)}{b.hang ? ' · hang' : ''}{b.fragile ? ' · fragile' : ''}<br /><span className="hint">{b.ref} · {b.weight} · {b.contents}</span></td>
            <td>{ownerName(S, b.owner)}</td>
            <td>{Y2K_DELIVER.find(d => d[0] === b.deliverTo)?.[1]}</td>
            <td>{b.ret ? `19 Dec · ${slotLabel(b.retSlot)}` : 'Carrying back'}</td>
          </tr>
        ))}
      </tbody></table></div>
      <div style={{ marginTop: 18 }}>
        <label className="f"><span>Anything else we should know <em>(optional)</em></span><textarea value={S.notes} placeholder="Gate codes, building rules, elderly guests…" onChange={e => onFieldChange('notes', e.target.value)} /></label>
      </div>
      <div className="callout" style={{ marginTop: 20 }}>
        <b>Important:</b> We provide delivery services only for Bridal &amp; Groom Outfits, Wedding Gifts &amp; Hampers, Décor Materials, Return Gift Boxes, and Family Luggage. We do not accept jewellery or other valuable items for delivery.
      </div>
      <div style={{ marginTop: 20, border: '1px solid rgba(176,58,46,0.35)', borderRadius: 16, background: '#FFFBF9', padding: 'clamp(14px,3vw,20px)' }}>
        <ProhibitedBlock />
        <label className="tick" style={{ marginTop: 14 }}>
          <input type="checkbox" checked={S.ackProhibited} aria-required="true" onChange={e => onFieldChange('ackProhibited', e.target.checked)} />
          <span style={{ fontSize: 13, lineHeight: 1.6 }}>{PROHIBITED_ACK_TEXT}</span>
        </label>
        {E.ackProhibited ? <span className="msg" style={{ display: 'block', marginTop: 8 }}>{E.ackProhibited}</span> : null}
      </div>
      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        <label className="tick"><input type="checkbox" checked={S.terms} onChange={e => onFieldChange('terms', e.target.checked)} /> I agree to Bagdrop&apos;s terms of carriage.</label>
        <label className="tick"><input type="checkbox" checked={S.consent} onChange={e => onFieldChange('consent', e.target.checked)} /> Bagdrop may use these addresses and travel details only to handle these bags.</label>
        {(E.terms || E.consent) ? <span className="msg">Tick both to send your request.</span> : null}
      </div>
      {formErr ? <div className="callout err" style={{ marginTop: 16 }}>{formErr}</div> : null}
    </>
  )

  // ── submit ──────────────────────────────────────────────────────
  async function post(body: Record<string, unknown>) {
    const res = await fetch('/api/y2k/inquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json().catch(() => ({}))
    return { ok: res.ok, d }
  }
  async function submitAll() {
    if (busy) return
    setBusy(true); setFormErr('')
    const f = S
    const digits = f.family.phone.replace(/\D/g, '')
    const members = f.members.map((m, i) => ({ ...m, name: i === 0 ? f.family.lead.trim() : m.name.trim() }))
    const p1 = f.pickups[0]
    const ack = { accepted: true, version: PROHIBITED_ITEMS_VERSION }
    const leadBags = f.bags.filter(b => b.owner === members[0].ref).length
    try {
      const onward = await post({
        name: f.family.lead.trim(), phone: digits, email: f.family.email,
        guests: String(members.length), bags: String(leadBags),
        pickupAddress: `${p1.address}, Mumbai ${p1.pincode}`, pickupCity: 'Mumbai', pickupTime: p1.slot,
        deliveryAddress: WEDDING_VENUE, arrivalDate: p1.date, requests: f.notes,
        testMode: isTestMode, prohibitedAck: ack, submissionId: submissionIdRef.current,
        family: {
          side: f.family.side, members, pickups: f.pickups.map(p => ({ ...p, city: 'Mumbai' })), bags: f.bags,
          extraReturn: Number(f.extraReturn) || 0, retFrom: f.retFrom, notes: f.notes,
          declarations: { terms: f.terms, consent: f.consent },
        },
      })
      if (!onward.ok) throw new Error(onward.d?.error ?? 'Submission failed')
      const code: string = onward.d.trackingId ?? ''

      // Return leg — separate linked inquiry, same as before. Never blocks the onward confirmation.
      let returnCode = '', returnFailed = false
      const returned = f.bags.filter(b => b.ret)
      if (returned.length) {
        try {
          const destOf = (b: FamBag) => b.retDest === 'other' ? b.retAddress : (() => { const pk = f.pickups.find(p => p.ref === b.pickup) ?? p1; return `${pk.address}, Mumbai ${pk.pincode}` })()
          const first = returned[0]
          const lines = returned.map(b => `${ownerName(f, b.owner)}: ${bagTypeLabel(b.type)} (${b.colour}, ${b.ref}) → ${destOf(b)} [${slotLabel(b.retSlot)}]`).join(' ; ')
          const rr = await post({
            name: f.family.lead.trim(), phone: digits, email: f.family.email, guests: '1', bags: String(returned.length),
            submissionId: submissionIdRef.current + ':r',
            pickupAddress: WEDDING_VENUE, pickupCity: 'Udaipur', pickupTime: first.retSlot,
            deliveryAddress: destOf(first), deliveryCity: 'Mumbai', arrivalDate: Y2K_RETURN_PICKUP_DATE,
            requests: ['[Return Pickup]', lines, Number(f.extraReturn) ? `+${f.extraReturn} extra bag(s) expected` : '', f.retFrom === 'bell' ? 'Collect from bell desk' : "Collect from each guest's room", f.notes].filter(Boolean).join(' — '),
            returnPickup: true, originalTrackingId: code, testMode: isTestMode, prohibitedAck: ack,
          })
          if (rr.ok) returnCode = rr.d.trackingId ?? ''; else returnFailed = true
        } catch { returnFailed = true }
      }
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
      setDone({ code, returnCode, returnFailed, snap: clone({ ...S, members }) })
      scrollTop()
    } catch (ex) {
      setFormErr(ex instanceof Error ? ex.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const er = errsFor(S, step)
    if (Object.keys(er).length) {
      setShowErrors(true)
      setTimeout(() => rootRef.current?.querySelector('.bad, .msg')?.scrollIntoView({ block: 'center' }), 0)
      return
    }
    setShowErrors(false)
    if (step === 5) {
      // Re-validate every earlier step before sending (guards against jumping back and editing).
      for (let k = 0; k < 5; k++) {
        if (Object.keys(errsFor(S, k)).length) { setStep(k); setShowErrors(true); setFormErr(`Please fix step ${k + 1} (${STEP_NAMES[k]}) before sending.`); return }
      }
    }
    if (step < 5) {
      if (step === 0) mut(n => { n.members[0].name = n.family.lead.trim() })
      setStep(step + 1); setMaxStep(m => Math.max(m, step + 1)); scrollTop()
    } else submitAll()
  }

  function resetAll() {
    setDone(null); setS(fresh()); setStep(0); setMaxStep(0); setShowErrors(false); setFormErr('')
    submissionIdRef.current = ''
    scrollTop()
  }

  // ── summary sidebar ─────────────────────────────────────────────
  const st = done ? done.snap : S
  const types: Record<string, number> = {}
  st.bags.forEach(b => { const t = bagTypeLabel(b.type); types[t] = (types[t] || 0) + 1 })
  const flags: [string, string][] = []
  const heavy = st.bags.filter(b => b.weight === 'Over 32 kg').length
  if (heavy) flags.push(['w', `${heavy} bag${heavy > 1 ? 's' : ''} over 32 kg`])
  const hangN = st.bags.filter(b => b.hang).length
  if (hangN) flags.push(['', `${hangN} bag${hangN > 1 ? 's' : ''} kept hanging`])
  const summary = (
    <aside className="sum" aria-label="Booking summary">
      <div className="eyebrow">{done ? 'Request received' : 'Your booking'}</div>
      <h4>{st.family.lead.trim() ? `${st.family.lead.trim().split(' ').slice(-1)[0]} family` : 'New family booking'}</h4>
      {st.family.side ? <div><span className={`pillside${st.family.side === 'groom' ? ' groom' : ''}`}>{st.family.side === 'groom' ? "Groom's side" : "Bride's side"}</span></div> : null}
      <dl>
        <dt>Travellers</dt><dd>{st.members.filter((m, i) => (i === 0 ? st.family.lead.trim() : m.name.trim())).length}</dd>
        <dt>Pickup points</dt><dd>{st.pickups.length}</dd>
        <dt>Total bags</dt><dd>{st.bags.length}</dd>
        <dt>Bags back</dt><dd>{st.bags.filter(b => b.ret).length}{Number(st.extraReturn) ? ` + ${st.extraReturn} extra` : ''}</dd>
      </dl>
      {st.bags.length ? (
        <>
          <hr className="more" />
          <dl className="more">
            {Object.entries(types).flatMap(([t, n]) => [<dt key={t + 'k'}>{t}</dt>, <dd key={t + 'v'}>{n}</dd>])}
          </dl>
        </>
      ) : null}
      {flags.length ? <><hr /><div className="flags">{flags.map(([c, t]) => <div className={`flag ${c}`} key={t}><i />{t}</div>)}</div></> : null}
      <hr className="more" /><div className="hint more" style={{ color: 'rgba(244,238,228,.6)' }}>Charges are confirmed on WhatsApp before pickup.</div>
    </aside>
  )

  const stepBody = [step0, step1, step2, step3, step4, step5][step]
  return (
    <div className="ywz" ref={rootRef}>
      <style>{WIZARD_CSS}</style>
      <div className="desk">
        <div className="panel" aria-live="polite">
          {done ? (
            <>
              <div className="conf-head">
                <div>
                  <div className="eyebrow2">Request received</div>
                  <h3 className="ph" style={{ marginTop: 6 }}>Thank you, {S.family.lead.trim().split(' ')[0]}.</h3>
                  <p className="psub" style={{ margin: '6px 0 12px' }}>We&apos;ve saved your pickup request. It is not confirmed yet — we&apos;ll review it and confirm on WhatsApp shortly.</p>
                  <div className="lab">Tracking code</div>
                  <div className="bid">{done.code}</div>
                  {done.returnCode ? <><div className="lab" style={{ marginTop: 12 }}>Return pickup tracking code</div><div className="bid">{done.returnCode}</div></> : null}
                </div>
                <button className="btn ghost sm" type="button" onClick={resetAll}>Book for another family</button>
              </div>
              {done.returnFailed ? <div className="callout err" style={{ marginBottom: 16 }}>Your return pickup could not be saved automatically — please WhatsApp us to arrange it.</div> : null}
              <div className="lab" style={{ marginBottom: 8 }}>Guests and bags</div>
              <div className="tbl-wrap"><table><thead><tr><th>Guest</th><th>Bags</th><th>Bag types</th></tr></thead><tbody>
                {done.snap.members.map((m, i) => {
                  const mine = done.snap.bags.filter(b => b.owner === m.ref)
                  return <tr key={m.ref}><td>{i === 0 ? `${m.name} (Lead)` : m.name}</td><td className="num">{mine.length}</td><td>{mine.map(b => `${bagTypeLabel(b.type)} · ${b.colour}`).join(', ') || '—'}</td></tr>
                })}
              </tbody></table></div>
            </>
          ) : (
            <>
              <ol className="stepper">
                {STEP_NAMES.map((n, i) => (
                  <li key={n} className={i < step ? 'done' : i === step ? 'cur' : ''}>
                    <button type="button" disabled={i > maxStep} onClick={() => { setStep(i); setShowErrors(false); scrollTop() }}><span>{i + 1}</span>{n}</button>
                  </li>
                ))}
              </ol>
              <form onSubmit={onSubmit} noValidate>
                {stepBody}
                <div className="navrow">
                  {step > 0 ? <button className="btn ghost" type="button" onClick={() => { setStep(step - 1); setShowErrors(false); setFormErr(''); scrollTop() }}>Back</button> : <span />}
                  <button className="btn" type="submit" disabled={busy}>{busy ? 'Sending…' : step < 5 ? 'Continue' : 'Send pickup request'}</button>
                </div>
              </form>
            </>
          )}
        </div>
        {summary}
      </div>
    </div>
  )
}
