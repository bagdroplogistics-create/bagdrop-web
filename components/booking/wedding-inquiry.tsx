'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PhoneInput } from '@/components/ui/phone-input'
import { cn } from '@/lib/utils'
import { BOOKING_LOCATIONS } from '@/lib/constants'

// "Weddings and events" inquiry — same fields and wording as the Bagdrop Platform blueprint.
// Venue, dates and pickup cities only. No rate is shown. Saved as an inquiry + lead.

const ROLES = [
  { id: 'host', label: 'Host family' },
  { id: 'planner', label: 'Wedding or event planner' },
  { id: 'hotel', label: 'Hotel or venue' },
  { id: 'other', label: 'Other' },
]

export function WeddingInquiry({ onBack }: { onBack: () => void }) {
  const udaipur = BOOKING_LOCATIONS.find(c => c.label.toLowerCase() === 'udaipur')?.id ?? ''
  const [f, setF] = useState({
    name: '', role: 'host', phone: '', countryIso2: 'IN', email: '',
    venueCity: udaipur as string, venue: '', arrive: '', leave: '',
    fromCities: [] as string[], families: '', bags: '', note: '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ref, setRef] = useState('')
  const set = (p: Partial<typeof f>) => setF(s => ({ ...s, ...p }))
  const toggle = (id: string) =>
    set({ fromCities: f.fromCities.includes(id) ? f.fromCities.filter(c => c !== id) : [...f.fromCities, id] })

  async function send() {
    setErr(''); setBusy(true)
    try {
      const res = await fetch('/api/wedding-inquiry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(f),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Could not send. Please try again.')
      setRef(j.trackingId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send. Please try again.')
    }
    setBusy(false)
  }

  if (ref) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-border bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-green-700"><Check className="h-8 w-8" /></div>
        <h2 className="font-display text-2xl font-bold text-text-primary">Received. Our events desk has it.</h2>
        <p className="mt-3 text-sm text-text-secondary">
          Reference <b className="font-mono">{ref}</b>. We come back on WhatsApp and email within the working day with the plan for the hosts.
          Guests get their own page once the wedding is open.
        </p>
        <a href="/" className="mt-6 inline-block text-sm font-semibold text-brand underline">Back to Bagdrop</a>
      </div>
    )
  }

  const ok = f.name.trim() && f.phone.replace(/\D/g, '').length >= 6 && f.venueCity && f.arrive && f.fromCities.length > 0

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_320px]">
      <section className="rounded-3xl border border-border bg-white p-6 shadow-sm sm:p-8">
        <h1 className="font-display text-2xl font-bold text-text-primary">Weddings and events</h1>
        <p className="mt-2 text-sm text-text-secondary">
          We move every guest&apos;s bags from their door to their room at the venue, and home again after. Tell us where and from
          which cities, and our events desk comes back within the working day with a plan for the hosts. Guests never pay and never
          see a rate: once the wedding is open they book on a page made for it.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Your name"><input className="input-base" placeholder="Name" value={f.name} onChange={e => set({ name: e.target.value })} /></Field>
          <Field label="You are the">
            <select className="input-base" value={f.role} onChange={e => set({ role: e.target.value })}>
              {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </Field>
          <Field label="Mobile">
            <PhoneInput id="wi-phone" variant="public" countryIso2={f.countryIso2} nationalNumber={f.phone}
              onCountryChange={iso2 => set({ countryIso2: iso2 })} onNumberChange={d => set({ phone: d })} placeholder="98765 43210" required />
          </Field>
          <Field label="Email"><input type="email" className="input-base" placeholder="name@mail.com" value={f.email} onChange={e => set({ email: e.target.value })} /></Field>
          <Field label="Venue city">
            <select className="input-base" value={f.venueCity} onChange={e => set({ venueCity: e.target.value })}>
              <option value="">Select venue city</option>
              {BOOKING_LOCATIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Venue or hotel"><input className="input-base" placeholder="Taj Aravali, Udaipur" value={f.venue} onChange={e => set({ venue: e.target.value })} /></Field>
          <Field label="Guests arrive"><input type="date" className="input-base" value={f.arrive} onChange={e => set({ arrive: e.target.value })} /></Field>
          <Field label="Guests leave"><input type="date" className="input-base" min={f.arrive || undefined} value={f.leave} onChange={e => set({ leave: e.target.value })} /></Field>
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium text-text-primary">Cities the guests travel from <span className="font-normal text-text-muted">· choose all that apply</span></p>
          <div className="mt-2 flex flex-wrap gap-2">
            {BOOKING_LOCATIONS.map(c => {
              const on = f.fromCities.includes(c.id)
              return (
                <button key={c.id} type="button" onClick={() => toggle(c.id)} aria-pressed={on}
                  className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    on ? 'border-brand bg-brand-light text-brand' : 'border-border bg-cream text-text-secondary hover:border-brand/40')}>
                  <span className={cn('flex h-3.5 w-3.5 items-center justify-center rounded-sm border', on ? 'border-brand bg-brand text-white' : 'border-border bg-white')}>
                    {on && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                  </span>
                  {c.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Families, roughly"><input className="input-base" inputMode="numeric" placeholder="40" value={f.families} onChange={e => set({ families: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="Bags, roughly"><input className="input-base" inputMode="numeric" placeholder="100" value={f.bags} onChange={e => set({ bags: e.target.value.replace(/\D/g, '') })} /></Field>
        </div>
        <div className="mt-4">
          <Field label="Anything we should know">
            <input className="input-base" placeholder="Sangeet outfits to hang on arrival · two hotels · planner will send the guest list" value={f.note} onChange={e => set({ note: e.target.value })} />
          </Field>
        </div>

        {err && <p className="mt-4 text-sm text-red-600">{err}</p>}
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" size="lg" onClick={onBack}>Back</Button>
          <Button variant="primary" size="lg" className="flex-1" disabled={!ok || busy} onClick={send}>{busy ? 'Sending…' : 'Send the inquiry'}</Button>
        </div>
      </section>

      <aside className="h-fit rounded-3xl border border-border bg-white p-6 shadow-sm">
        <h3 className="font-display text-sm font-semibold text-text-primary">How it works for a wedding</h3>
        <ol className="mt-3 space-y-3 text-sm text-text-secondary">
          <li className="flex gap-3"><b className="font-mono text-xs text-text-muted">1</b><span>The hosts or the planner open the wedding with us. The planner can send the guest list as a sheet.</span></li>
          <li className="flex gap-3"><b className="font-mono text-xs text-text-muted">2</b><span>Every family gets a link to a page made for the wedding. About three minutes to book, no code, no payment.</span></li>
          <li className="flex gap-3"><b className="font-mono text-xs text-text-muted">3</b><span>Bags are tagged and sealed at the door, delivered to the room, and brought home after.</span></li>
          <li className="flex gap-3"><b className="font-mono text-xs text-text-muted">4</b><span>The hosts receive one statement. Guests never see a rate.</span></li>
        </ol>
      </aside>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><label className="block text-sm font-medium text-text-primary">{label}</label>{children}</div>
}
