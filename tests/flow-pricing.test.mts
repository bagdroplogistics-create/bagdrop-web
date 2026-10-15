import assert from 'node:assert/strict'
import { flowQuote, zoneForCityId, FLOW_CITIES, FLOW_AIRPORTS } from '../lib/flow-pricing.ts'

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name) }
const r = (x: number) => Math.round(x)

t('blueprint default: Vadodara → Mumbai Airport, air, 2 bags, 08:00 slot, October', () => {
  const q = flowQuote({ mode: 'air', uc: 'd2a', zoneFrom: 'GUJ', zoneTo: 'MUM', std: 2, odd: 0, slotFrom: '08:00', date: '2026-10-20' })!
  assert.equal(q.rate, 2500); assert.equal(q.base, 5000); assert.equal(q.handling, 500)
  assert.equal(q.peak, 700)          // 20% peak (1000) − 150 × 2 slot saving
  assert.equal(r(q.subtotal), 6200); assert.equal(r(q.gst), 1116); assert.equal(r(q.total), 7316)
})
t('minimum 2 pieces billed even for 1 bag', () => {
  const q = flowQuote({ mode: 'road', uc: 'd2d', zoneFrom: 'GUJ', zoneTo: 'MUM', std: 1, odd: 0, slotFrom: '10:00', date: '2026-06-10' })!
  assert.equal(q.actual, 1); assert.equal(q.billed, 2); assert.equal(q.peak, 0)
})
t('same zone uses the 1,500 captain-run rate', () => {
  const q = flowQuote({ mode: 'road', uc: 'd2d', zoneFrom: 'GUJ', zoneTo: 'GUJ', std: 2, odd: 0, slotFrom: '10:00', date: '2026-06-10' })!
  assert.equal(q.rate, 1500)
})
t('oversize adds 900 each, slab 8% at 5+ and 15% at 10+', () => {
  const a = flowQuote({ mode: 'road', uc: 'd2d', zoneFrom: 'GUJ', zoneTo: 'MUM', std: 4, odd: 1, slotFrom: '10:00', date: '2026-06-10' })!
  assert.equal(a.oversize, 900); assert.equal(a.slab, -2500 * 5 * 0.08)
  const b = flowQuote({ mode: 'road', uc: 'd2d', zoneFrom: 'GUJ', zoneTo: 'MUM', std: 10, odd: 0, slotFrom: '10:00', date: '2026-06-10' })!
  assert.equal(b.slab, -2500 * 10 * 0.15)
})
t('"Others" (no zone) has no estimate', () => {
  assert.equal(flowQuote({ mode: 'air', uc: 'd2a', zoneFrom: null, zoneTo: 'MUM', std: 2, odd: 0, slotFrom: '08:00', date: '2026-10-20' }), null)
})
t('rail 150 and sea 400 handling per billed piece', () => {
  const rail = flowQuote({ mode: 'rail', uc: 'rail', zoneFrom: 'GUJ', zoneTo: 'NOR', std: 2, odd: 0, slotFrom: '10:00', date: '2026-06-10' })!
  const sea = flowQuote({ mode: 'sea', uc: 'cruise', zoneFrom: 'MUM', zoneTo: 'GOA', std: 3, odd: 0, slotFrom: '10:00', date: '2026-06-10' })!
  assert.equal(rail.handling, 300); assert.equal(sea.handling, 1200)
})
t('zone lookup by stored city id', () => {
  assert.equal(zoneForCityId('baroda'), 'GUJ'); assert.equal(zoneForCityId('mumbai-airport-t2'), 'MUM')
  assert.equal(zoneForCityId('delhi-airport-t3'), 'NOR'); assert.equal(zoneForCityId('hyderabad-airport'), 'SOU')
  assert.equal(zoneForCityId('somewhere'), null)
})
t('only the 3 live airports are available', () => {
  assert.deepEqual(FLOW_AIRPORTS.filter(a => a.available).map(a => a.code), ['BOM', 'DEL', 'HYD'])
  assert.equal(FLOW_CITIES.length, 15)
})
console.log(`${n} passed`)
