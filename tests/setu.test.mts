import assert from 'node:assert/strict'
import {
  setuConfigFromEnv, createDigilockerRequest, fetchVerifiedIdentity, maskNumber, normalizeStatus,
  type FetchLike, type SetuConfig,
} from '../lib/identity/setu-digilocker.ts'

let n = 0
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); n++; console.log('ok -', name) }
const cfg: SetuConfig = { baseUrl: 'https://x.test', clientId: 'cid', clientSecret: 'sec', productInstanceId: 'pid' }
const resp = (status: number, body: any) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

await t('config null when env incomplete', () => assert.equal(setuConfigFromEnv({ SETU_CLIENT_ID: 'a' }), null))
await t('config from env strips trailing slash', () => {
  const c = setuConfigFromEnv({ SETU_DG_BASE_URL: 'https://a.b/', SETU_CLIENT_ID: '1', SETU_CLIENT_SECRET: '2', SETU_PRODUCT_INSTANCE_ID: '3' })
  assert.equal(c?.baseUrl, 'https://a.b')
})
await t('maskNumber keeps only last 4', () => {
  assert.equal(maskNumber('123412341234'), 'XXXX-XXXX-1234')
  assert.equal(maskNumber('xxxx xxxx 9876'), 'XXXX-XXXX-9876')
  assert.equal(maskNumber('12'), '')
})
await t('normalizeStatus', () => {
  assert.equal(normalizeStatus('AUTHENTICATED'), 'authenticated')
  assert.equal(normalizeStatus('expired'), 'expired')
  assert.equal(normalizeStatus('revoked'), 'failed')
  assert.equal(normalizeStatus('created'), 'pending')
})
await t('create request sends auth headers + redirect', async () => {
  let seen: any
  const f: FetchLike = async (url, init) => { seen = { url, init }; return resp(200, { id: 'r1', url: 'https://dl/auth', validUpto: 'z' }) }
  const r = await createDigilockerRequest(cfg, 'https://bagdrop.co/book/identity-return', f)
  assert.equal(r.requestId, 'r1')
  assert.equal(seen.url, 'https://x.test/api/digilocker')
  assert.equal(seen.init.headers['x-client-id'], 'cid')
  assert.equal(JSON.parse(seen.init.body).redirectUrl, 'https://bagdrop.co/book/identity-return')
})
await t('create request failure throws', async () => {
  await assert.rejects(() => createDigilockerRequest(cfg, 'u', async () => resp(500, {})), /setu_create_failed:500/)
})
await t('verified identity: minimal data only', async () => {
  const f: FetchLike = async (url) => url.endsWith('/status')
    ? resp(200, { status: 'authenticated' })
    : resp(200, { aadhaar: { name: 'Mihir Amin', uid: '123456781234', dateOfBirth: '1990-01-01', address: { x: 1 }, photo: 'b64' } })
  const r = await fetchVerifiedIdentity(cfg, 'r1', f)
  assert.deepEqual(r, { status: 'authenticated', identity: { name: 'Mihir Amin', maskedNumber: 'XXXX-XXXX-1234' } })
  assert.ok(!JSON.stringify(r).includes('123456781234'))
})
await t('unauthenticated status never fetches aadhaar', async () => {
  let calls = 0
  const f: FetchLike = async () => { calls++; return resp(200, { status: 'pending' }) }
  const r = await fetchVerifiedIdentity(cfg, 'r1', f)
  assert.equal(r.identity, null); assert.equal(r.status, 'pending'); assert.equal(calls, 1)
})
await t('missing name → failed', async () => {
  const f: FetchLike = async (u) => u.endsWith('/status') ? resp(200, { status: 'authenticated' }) : resp(200, { aadhaar: {} })
  assert.equal((await fetchVerifiedIdentity(cfg, 'r1', f)).status, 'failed')
})
await t('provider error throws', async () => {
  await assert.rejects(() => fetchVerifiedIdentity(cfg, 'r1', async () => resp(502, {})), /setu_status_failed:502/)
})
console.log(`${n} passed`)
