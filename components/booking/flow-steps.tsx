'use client'

import { useState } from 'react'
import { ArrowLeftRight, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCaseById } from '@/lib/use-cases'
import {
  FLOW_CITIES, FLOW_AIRPORTS, FLOW_SLOTS, MODE_COPY, MIN_PIECES, slotLabel, zoneForCityId,
} from '@/lib/flow-pricing'
import type { BookingState, CityId } from '@/lib/booking-types'

// Where / When / Bags screens, field-for-field from "Bagdrop Platform.html".
// Which fields appear depends on the use case, exactly as in the blueprint:
//   Airport → Home      : "Arriving at" airport + delivery city/address
//   Home/Hotel → Airport: pickup city/address + "Flying from" airport
//   Hotel → Hotel, Door → Door, Railway, Cruise: city/address on both ends
//   Reference field     : Flight number (air) · Train number (rail) · Cruise and sailing (sea) · none (road)

const OTHERS = '__others__'
const cityId = (v: string | null) => (v ?? '') as CityId

export type LegKind = 'airport-pickup' | 'airport-drop' | 'cities'
export function legKind(uc: string | undefined, mode: string): LegKind {
  const air = mode === 'air'
  if (air && uc === 'a2d') return 'airport-pickup'
  if (air && (uc === 'd2a' || uc === 'h2a')) return 'airport-drop'
  return 'cities'
}

/** Blueprint defaults: Vadodara → Mumbai, BOM airport where an airport leg exists. */
export function defaultsFor(uc: string): Partial<BookingState> {
  const def = useCaseById(uc)
  const kind = legKind(uc, def?.mode ?? 'road')
  if (kind === 'airport-pickup') return { fromCity: 'mumbai-airport-t2', toCity: 'mumbai', pickupAddress: 'Mumbai Airport T2', dropAddress: '' }
  if (kind === 'airport-drop') return { fromCity: 'baroda', toCity: 'mumbai-airport-t2', pickupAddress: '', dropAddress: 'Mumbai Airport T2' }
  return { fromCity: 'baroda', toCity: 'mumbai', pickupAddress: '', dropAddress: '' }
}

const slide = 'space-y-5'
const nav = 'flex justify-between pt-2'

// ───────────────────────── WHERE ─────────────────────────
export function FlowWhere({ state, onChange }: { state: BookingState; onChange: (p: Partial<BookingState>) => void }) {
  const def = useCaseById(state.useCaseId)
  const uc = def?.id
  const kind = legKind(uc, def?.mode ?? 'road')
  const known = FLOW_CITIES.map(c => c.id as string)
  const [fromOthers, setFromOthers] = useState(false)
  const [toOthers, setToOthers] = useState(false)

  const pickAirport = kind === 'airport-pickup'
  const dropAirport = kind === 'airport-drop'
  const title = pickAirport ? 'Which airport, and where to after?' : dropAirport ? 'Where from, and which airport?' : 'Where from, where to?'
  const pickPh = uc === 'h2a' || uc === 'h2h' ? 'Hotel name and room' : fromOthers ? 'City and address' : 'Flat, building, area, city or pincode'
  const dropPh = uc === 'h2h' ? 'Hotel name' : uc === 'rail' ? 'Station and train' : uc === 'cruise' ? 'Cruise terminal' : toOthers ? 'City and address' : 'Hotel, home, station or terminal'

  function setCity(side: 'from' | 'to', v: string) {
    const others = v === OTHERS
    if (side === 'from') { setFromOthers(others); onChange({ fromCity: others ? null : cityId(v) }) }
    else { setToOthers(others); onChange({ toCity: others ? null : cityId(v) }) }
  }
  function setAirport(side: 'from' | 'to', code: string) {
    const a = FLOW_AIRPORTS.find(x => x.code === code)
    if (!a?.id) return
    if (side === 'from') onChange({ fromCity: cityId(a.id), pickupAddress: a.label })
    else onChange({ toCity: cityId(a.id), dropAddress: a.label })
  }
  function swap() {
    if (kind !== 'cities') return
    const a = fromOthers, b = toOthers
    setFromOthers(b); setToOthers(a)
    onChange({ fromCity: state.toCity, toCity: state.fromCity, pickupAddress: state.dropAddress, dropAddress: state.pickupAddress })
  }

  const cityVal = (id: string | null, others: boolean) => (others ? OTHERS : known.includes(id ?? '') ? (id ?? '') : '')
  const airportCode = (id: string | null) => FLOW_AIRPORTS.find(a => a.id === id)?.code ?? 'BOM'

  const zf = zoneForCityId(state.fromCity), zt = zoneForCityId(state.toCity)
  const from = pickAirport ? (FLOW_AIRPORTS.find(a => a.id === state.fromCity)?.label ?? '') : (FLOW_CITIES.find(c => c.id === state.fromCity)?.label ?? state.fromCity ?? '')
  const to = dropAirport ? (FLOW_AIRPORTS.find(a => a.id === state.toCity)?.label ?? '') : (FLOW_CITIES.find(c => c.id === state.toCity)?.label ?? state.toCity ?? '')
  const other = (kind !== 'airport-pickup' && fromOthers) || (kind !== 'airport-drop' && toOthers)
  const route = other ? 'we confirm the route and price for this city within the hour'
    : !zf || !zt ? '—'
    : zf === zt ? `${from} → ${to} · same region, captain run, same day`
    : `${from} → ${to} · ${zf} hub to ${zt} hub, daily line haul, next day${def?.mode === 'air' ? ', counter 4 h before departure' : ''}`

  return (
    <div className={slide}>
      <div>
        <h2 className="font-display text-xl font-semibold text-text-primary">{title}</h2>
        <p className="mt-1 text-sm text-text-muted">We check the pincode and show you the route we will run.</p>
      </div>

      {/* Pickup */}
      {pickAirport ? (
        <Field label="Arriving at">
          <AirportSelect value={airportCode(state.fromCity)} onChange={c => setAirport('from', c)} />
        </Field>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pickup city">
            <CitySelect value={cityVal(state.fromCity, fromOthers)} exclude={null} onChange={v => setCity('from', v)} />
            {fromOthers && <input className="input-base mt-2" placeholder="Enter your city" value={state.fromCity ?? ''} onChange={e => onChange({ fromCity: cityId(e.target.value) || null })} />}
          </Field>
          <Field label="Pickup address">
            <input className="input-base" placeholder={pickPh} autoComplete="street-address" value={state.pickupAddress} onChange={e => onChange({ pickupAddress: e.target.value })} />
          </Field>
        </div>
      )}

      {kind === 'cities' && (
        <div className="flex justify-center">
          <button type="button" onClick={swap} aria-label="Swap pickup and delivery"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-text-muted hover:border-brand/40 hover:text-brand">
            <ArrowLeftRight className="h-4 w-4 rotate-90" />
          </button>
        </div>
      )}

      {/* Delivery */}
      {dropAirport ? (
        <Field label="Flying from">
          <AirportSelect value={airportCode(state.toCity)} onChange={c => setAirport('to', c)} />
        </Field>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Delivery city">
            <CitySelect value={cityVal(state.toCity, toOthers)} exclude={null} onChange={v => setCity('to', v)} />
            {toOthers && <input className="input-base mt-2" placeholder="Enter your city" value={state.toCity ?? ''} onChange={e => onChange({ toCity: cityId(e.target.value) || null })} />}
          </Field>
          <Field label="Delivery address">
            <input className="input-base" placeholder={dropPh} autoComplete="street-address" value={state.dropAddress} onChange={e => onChange({ dropAddress: e.target.value })} />
          </Field>
        </div>
      )}

      {(fromOthers || toOthers) && (
        <p className="text-xs text-text-muted">Not in the list yet? Choose Others and tell us the city. We confirm within the hour whether we can serve it.</p>
      )}

      <div>
        <p className="text-xs text-text-muted">Cities we serve today</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {[...FLOW_CITIES.map(c => c.label), 'Delhi Airport', 'Hyderabad Airport', 'Mumbai Airport T2'].map(l => (
            <span key={l} className="rounded-full bg-cream px-2.5 py-1 text-xs text-text-secondary">{l}</span>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900"><b>Route</b> · {route}</div>
    </div>
  )
}

export function whereValid(state: BookingState): boolean {
  const def = useCaseById(state.useCaseId)
  const kind = legKind(def?.id, def?.mode ?? 'road')
  if (!state.fromCity || !state.toCity) return false
  if (kind !== 'airport-pickup' && !state.pickupAddress.trim()) return false
  if (kind !== 'airport-drop' && !state.dropAddress.trim()) return false
  return true
}

function CitySelect({ value, onChange }: { value: string; exclude: string | null; onChange: (v: string) => void }) {
  return (
    <select className="input-base" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Select city</option>
      {FLOW_CITIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
      <option value={OTHERS}>Others</option>
    </select>
  )
}

function AirportSelect({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  return (
    <select className="input-base" value={value} onChange={e => onChange(e.target.value)}>
      <optgroup label="Available now">
        {FLOW_AIRPORTS.filter(a => a.available).map(a => <option key={a.code} value={a.code}>{a.code.replace(/\d/, '')} · {a.label}</option>)}
      </optgroup>
      <optgroup label="Planned">
        {FLOW_AIRPORTS.filter(a => !a.available).map(a => <option key={a.code} value={a.code} disabled>{a.code.replace(/\d/, '')} · {a.label} · soon</option>)}
      </optgroup>
    </select>
  )
}

// ───────────────────────── WHEN ─────────────────────────
export function FlowWhen({ state, onChange }: { state: BookingState; onChange: (p: Partial<BookingState>) => void }) {
  const def = useCaseById(state.useCaseId)
  const mode = def?.mode ?? 'road'
  const copy = MODE_COPY[mode]
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const slot = state.flowSlot ?? '08:00'

  function setRef(v: string) { onChange({ travelReference: v, flightNumber: mode === 'air' ? v : state.flightNumber }) }

  return (
    <div className={slide}>
      <div>
        <h2 className="font-display text-xl font-semibold text-text-primary">When are you travelling?</h2>
        <p className="mt-1 text-sm text-text-muted">{copy.whenLede}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {copy.refLabel && (
          <Field label={copy.refLabel}>
            <input className="input-base" placeholder={copy.refPlaceholder} autoCapitalize="characters" value={state.travelReference ?? ''} onChange={e => setRef(e.target.value)} />
          </Field>
        )}
        <Field label="Travel date">
          <input type="date" className="input-base" min={tomorrow} value={state.date} onChange={e => onChange({ date: e.target.value })} />
        </Field>
      </div>
      <div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900"><b>{copy.check}</b> · {copy.checkBody}</div>
      <div>
        <p className="mb-2 text-sm font-medium text-text-primary">Pickup window</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {FLOW_SLOTS.map(s => {
            const sel = s.from === slot
            return (
              <button key={s.from} type="button" aria-pressed={sel}
                onClick={() => onChange({ flowSlot: s.from, timeSlotId: slotLabel(s) })}
                className={cn('rounded-xl border-2 px-3 py-2.5 text-center transition-all', sel ? 'border-brand bg-brand-light' : 'border-border bg-white hover:border-brand/40')}>
                <b className="block text-sm text-text-primary">{slotLabel(s)}</b>
                <small className="text-[11px] text-text-muted">{s.adj < 0 ? `save ₹${-s.adj}` : s.adj > 0 ? `+₹${s.adj}` : ' '}</small>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function whenValid(state: BookingState): boolean {
  return !!state.date && !!state.flowSlot
}

// ───────────────────────── BAGS ─────────────────────────
export function FlowBags({ state, onChange }: { state: BookingState; onChange: (p: Partial<BookingState>) => void }) {
  const std = state.flowStd ?? MIN_PIECES
  const odd = state.flowOdd ?? 0

  function set(nextStd: number, nextOdd: number) {
    let s = Math.max(0, Math.min(40, nextStd)); const o = Math.max(0, Math.min(40, nextOdd))
    if (s + o < 1) s = 1
    onChange({
      flowStd: s, flowOdd: o,
      bags: [
        ...(s > 0 ? [{ type: 'travel' as const, quantity: s }] : []),
        ...(o > 0 ? [{ type: 'oversized' as const, quantity: o }] : []),
      ],
    })
  }

  return (
    <div className={slide}>
      <div>
        <h2 className="font-display text-xl font-semibold text-text-primary">How many pieces?</h2>
        <p className="mt-1 text-sm text-text-muted">One rate per bag up to 32 kg. Oversize is priced separately. Minimum two pieces.</p>
      </div>
      <Stepper title="Bags" sub="Suitcase, duffel, backpack · up to 32 kg each" value={std} onMinus={() => set(std - 1, odd)} onPlus={() => set(std + 1, odd)} />
      <Stepper title="Oversize" sub="Golf, surfboard, cycle, boxes, anything over 32 kg" value={odd} onMinus={() => set(std, odd - 1)} onPlus={() => set(std, odd + 1)} />
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <b>Please do not pack</b> · cash, jewellery, passports, medicines you need in transit, electronics with lithium batteries loose, liquids over 100 ml for airport cases, anything on the airline&apos;s prohibited list. Our captain checks and seals each bag with you at pickup.
      </div>
    </div>
  )
}

export function bagsValid(state: BookingState): boolean {
  return (state.flowStd ?? MIN_PIECES) + (state.flowOdd ?? 0) >= 1
}

function Stepper({ title, sub, value, onMinus, onPlus }: { title: string; sub: string; value: number; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-border bg-white p-3">
      <div><b className="text-text-primary">{title}</b><p className="text-xs text-text-muted">{sub}</p></div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={onMinus} aria-label={`Fewer ${title.toLowerCase()}`} className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-border bg-white text-text-primary"><Minus className="h-4 w-4" /></button>
        <span className="min-w-[28px] text-center font-display text-2xl font-bold">{value}</span>
        <button type="button" onClick={onPlus} aria-label={`More ${title.toLowerCase()}`} className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-border bg-white text-text-primary"><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><label className="block text-sm font-medium text-text-primary">{label}</label>{children}</div>
}
