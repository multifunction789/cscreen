// node lib/channels/line.test.mjs — LINE helpers + task runner without network
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import * as line from './line.js'
import { runTasks } from './tasks.js'

// signature: valid, tampered body, wrong length, missing secret
const body = JSON.stringify({ destination: 'U1', events: [] })
const sig = crypto.createHmac('sha256', 's3cret').update(body).digest('base64')
assert.equal(line.verifySignature(body, sig, 's3cret'), true)
assert.equal(line.verifySignature(body + ' ', sig, 's3cret'), false)
assert.equal(line.verifySignature(body, 'short', 's3cret'), false)
assert.equal(line.verifySignature(body, sig, ''), false)
assert.equal(line.verifySignature(body, null, 's3cret'), false)
// Thai text must be signed as UTF-8 bytes
const thai = JSON.stringify({ destination: 'U1', events: [{ message: { text: 'สวัสดีค่ะ' } }] })
assert.equal(line.verifySignature(thai, crypto.createHmac('sha256', 'k').update(Buffer.from(thai, 'utf8')).digest('base64'), 'k'), true)

// retry key: UUIDs pass through, anything else becomes a stable UUID
const u = '3f2b8c1e-1d2a-4b3c-9d8e-0a1b2c3d4e5f'
assert.equal(line.retryKeyFor(u), u)
const k1 = line.retryKeyFor('k1760000000abc')
assert.match(k1, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
assert.equal(line.retryKeyFor('k1760000000abc'), k1)
assert.notEqual(line.retryKeyFor('other'), k1)

// outgoing message shapes
assert.deepEqual(line.buildMessages({ text: 'สวัสดี' }), [{ type: 'text', text: 'สวัสดี' }])
const img = line.buildMessages({ text: '', attachment: { mime: 'image/jpeg', name: 'a.jpg' }, fileUrl: 'https://x/a' })
assert.equal(img.length, 1); assert.equal(img[0].type, 'image')
const pdf = line.buildMessages({ text: 'ใบเสนอราคาค่ะ', attachment: { mime: 'application/pdf', name: 'QT.pdf' }, fileUrl: 'https://x/q' })
assert.equal(pdf.length, 2); assert.equal(pdf[0].type, 'text'); assert.match(pdf[0].text, /QT\.pdf[\s\S]*https:\/\/x\/q/)
assert.equal(line.buildMessages({ text: 'x'.repeat(6000) })[0].text.length, 5000)
assert.equal(line.extFor('image/jpeg'), 'jpg')
assert.equal(line.extFor('application/octet-stream', 'งาน.AI'), 'ai')

// push: 409 with the same retry key = already accepted
process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token'
const calls = []
globalThis.fetch = async (url, init) => {
  calls.push({ url, init })
  if (url.endsWith('/push')) return new Response('{"message":"The retry key is already accepted"}', { status: 409 })
  if (url.includes('/quota/consumption')) return Response.json({ totalUsage: 42 })
  if (url.endsWith('/quota')) return Response.json({ type: 'limited', value: 300 })
  return new Response('{"message":"Not found"}', { status: 404 })
}
assert.deepEqual(await line.push('U1', [{ type: 'text', text: 'hi' }], u), { ok: true, duplicate: true })
assert.equal(calls[0].init.headers['X-Line-Retry-Key'], u)
assert.equal(calls[0].init.headers.Authorization, 'Bearer test-token')
assert.deepEqual(await line.quota(), { limit: 300, used: 42 })
globalThis.fetch = async () => new Response('{"message":"You have reached your monthly limit."}', { status: 429 })
await assert.rejects(line.push('U1', [], u), /โควตา/)

// task runner: success, retry, profile 404 is not an error
const done = []
const fakeDb = {
  rpc: async (fn, args) => {
    if (fn === 'claim_channel_tasks') return { data: [
      { id: 1, kind: 'line.profile', payload: { identity_id: 'i1', user_id: 'U1' } },
      { id: 2, kind: 'line.profile', payload: { identity_id: 'i2', user_id: 'Ugone' } },
      { id: 3, kind: 'line.content', payload: { message_id: 'm1', line_message_id: '99', conversation_id: 'c1', kind: 'image' } },
      { id: 4, kind: 'nope', payload: {} },
    ] }
    if (fn === 'complete_channel_task') { done.push(args); return { data: { status: args.p_ok ? 'done' : 'queued' } } }
  },
  updates: [],
  from(t) { return { update: v => ({ eq: async (c, id) => { fakeDb.updates.push([t, id, v]); return { error: null } } }) } },
  storage: { from: () => ({ upload: async (path, bytes, opt) => { fakeDb.uploaded = { path, size: bytes.length, opt }; return { error: null } } }) },
}
const api = {
  profile: async id => { if (id === 'Ugone') throw new line.LineError(404, '{}', '/profile'); return { displayName: 'ครูสมใจ', pictureUrl: 'https://p' } },
  content: async () => ({ bytes: Buffer.from('jpegdata'), mime: 'image/jpeg' }),
}
const res = await runTasks(fakeDb, { api })
assert.deepEqual(res, { done: 3, retry: 1, dead: 0 })
assert.deepEqual(fakeDb.updates[0], ['contact_identities', 'i1', { display_name: 'ครูสมใจ', picture_url: 'https://p' }])
assert.equal(fakeDb.uploaded.path, 'line/c1/m1.jpg')
assert.deepEqual(fakeDb.updates.at(-1), ['messages', 'm1', { attachment: { bucket: 'chat-media', path: 'line/c1/m1.jpg', name: 'image.jpg', mime: 'image/jpeg', size: 8 } }])
assert.equal(done.find(d => d.p_id === 4).p_ok, false)
assert.match(done.find(d => d.p_id === 4).p_error, /unknown task/)

console.log('line ok')
