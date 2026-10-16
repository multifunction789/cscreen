// node lib/channels/alerts.test.mjs — chat alert payloads + sending without network
import assert from 'node:assert/strict'
import { alertPayload, sendChatAlerts } from './alerts.js'

const p = alertPayload({ conversationId: 'c1', name: 'โรงเรียนสาธิต', kind: 'text', text: 'ขอราคา'.repeat(40) })
assert.equal(p.title, 'LINE · โรงเรียนสาธิต'); assert.equal(p.body.length, 140); assert.equal(p.tag, 'chat-c1'); assert.equal(p.url, '/inbox?c=c1')
assert.equal(alertPayload({ conversationId: 'c1', kind: 'image' }).body, '📷 ส่งรูปภาพ')
assert.equal(alertPayload({ conversationId: 'c1', kind: 'image' }).title, 'LINE · ลูกค้าใหม่')

const log = []
const db = {
  from(t) {
    const q = {
      select: () => q, in: async () => ({ data: [
        { id: 'm1', kind: 'text', text: 'เก่า', conversation_id: 'c1', conversation: { id: 'c1', platform: 'line', customer: null, identity: { display_name: 'สมใจ' } } },
        { id: 'm2', kind: 'image', text: null, conversation_id: 'c1', conversation: { id: 'c1', platform: 'line', customer: { name: 'โรงเรียน' }, identity: { display_name: 'สมใจ' } } },
        { id: 'm3', kind: 'system', text: 'x', conversation_id: 'c2', conversation: { id: 'c2', platform: 'line' } },
      ] }),
      update: v => ({ eq: async (c, id) => { log.push(['update', t, id, v]); return {} } }),
      delete: () => ({ eq: async (c, id) => { log.push(['delete', t, id]); return {} } }),
    }
    return q
  },
  rpc: async (fn, a) => { assert.equal(fn, 'chat_alert_targets'); assert.equal(a.p_conversation_id, 'c1'); return { data: [
    { id: 's-ok', endpoint: 'https://push/ok', p256dh: 'k', auth: 'a' },
    { id: 's-gone', endpoint: 'https://push/gone', p256dh: 'k', auth: 'a' },
    { id: 's-flaky', endpoint: 'https://push/flaky', p256dh: 'k', auth: 'a', fail_count: 2 },
  ] } },
}
const pushed = []
const push = async (sub, payload) => {
  if (sub.endpoint.endsWith('gone')) throw Object.assign(new Error('gone'), { statusCode: 410 })
  if (sub.endpoint.endsWith('flaky')) throw Object.assign(new Error('boom'), { statusCode: 500 })
  pushed.push([sub.endpoint, JSON.parse(payload)])
}
delete process.env.VAPID_PRIVATE_KEY
assert.deepEqual(await sendChatAlerts(db, ['m1'], { push }), { sent: 0, skipped: true })
process.env.VAPID_PRIVATE_KEY = 'test'
const r = await sendChatAlerts(db, ['m1', 'm2', 'm3'], { push })
assert.equal(r.sent, 1)
assert.equal(pushed.length, 1, 'one alert per chat, system lines never alert')
assert.equal(pushed[0][1].title, 'LINE · โรงเรียน'); assert.equal(pushed[0][1].body, '📷 ส่งรูปภาพ')
assert.ok(log.some(l => l[0] === 'delete' && l[2] === 's-gone'), 'expired subscription removed')
assert.ok(log.some(l => l[0] === 'update' && l[2] === 's-flaky' && l[3].fail_count === 3), 'failure counted')
console.log('alerts ok')
