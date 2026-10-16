// node lib/bot/engine.test.mjs
import assert from 'node:assert/strict'
import { decide, matchRule, normalize, actionOf, tierLabel } from './engine.js'

const rules = [
  { id: 'r-price', title: 'ขอราคา', kind: 'price', keywords: ['ราคา', 'เท่าไหร่'], in_menu: true, enabled: true, sort: 10 },
  { id: 'r-time', title: 'ระยะเวลาผลิต', kind: 'answer', keywords: ['กี่วัน', 'ได้เมื่อไหร่'], answer: '7–14 วันค่ะ', in_menu: true, enabled: true, sort: 20 },
  { id: 'r-pay', title: 'การชำระเงิน', kind: 'payment', keywords: ['เลขบัญชี', 'โอน'], answer: 'มัดจำ 50%', in_menu: true, enabled: true, sort: 30 },
  { id: 'r-off', title: 'ปิดอยู่', kind: 'answer', keywords: ['ส่ง'], answer: 'x', enabled: false },
]
const prices = [
  { product: 'เสื้อยืด', technique: 'สกรีน', min_qty: 30, price_from: 120 },
  { product: 'เสื้อยืด', technique: 'สกรีน', min_qty: 100, price_from: 99 },
  { product: 'เสื้อยืด', technique: 'DTF', min_qty: 10, price_from: 180, note: 'ไม่จำกัดสี' },
  { product: 'โปโล', technique: 'ปัก', min_qty: 20, price_from: 250 },
]
const settings = { enabled: true, greeting: 'สวัสดีค่ะ', handoff: 'รับเรื่องแล้วค่ะ', payment_text: 'กสิกร 123-4-56789-0 ซีสกรีน', qr_url: 'https://x/qr.png' }
const ctx = (over = {}) => ({ settings, rules, prices, conv: { botActive: true, handoffAt: null }, ...over })
const pressed = (res, label) => res.messages.at(-1).quickReply.items.find(i => i.action.label.startsWith(label)).action.data

assert.equal(normalize('ราคา เท่าไหร่ ครับ?'), 'ราคาเท่าไหร่ครับ')
assert.equal(matchRule('ผลิตกี่วันคะ', rules).id, 'r-time')
assert.equal(matchRule('ขอเลขบัญชีหน่อย', rules).id, 'r-pay')
assert.equal(matchRule('ส่งไปต่างจังหวัด', rules), null, 'disabled rule never answers')
assert.equal(matchRule('สวัสดี', rules), null)

// off / paused → silent
assert.equal(decide({ type: 'message', kind: 'text', text: 'กี่วัน' }, ctx({ settings: { ...settings, enabled: false } })), null)
assert.equal(decide({ type: 'message', kind: 'text', text: 'กี่วัน' }, ctx({ conv: { botActive: false } })), null)

// follow → greeting + menu buttons, no staff alert
let r = decide({ type: 'follow' }, ctx())
assert.equal(r.messages[0].text, 'สวัสดีค่ะ')
assert.deepEqual(r.messages[0].quickReply.items.map(i => i.action.label), ['ขอราคา', 'ระยะเวลาผลิต', 'การชำระเงิน', 'คุยกับพนักงาน'])
assert.equal(r.alert, false)

// Q&A answer
r = decide({ type: 'message', kind: 'text', text: 'สั่งวันนี้ได้เมื่อไหร่คะ' }, ctx())
assert.equal(r.messages[0].text, '7–14 วันค่ะ'); assert.equal(r.ruleId, 'r-time'); assert.equal(r.alert, false)
assert.match(r.record[0], /\[ปุ่ม: ขอราคา · /)

// payment → text + bank + QR image, staff alerted
r = decide({ type: 'message', kind: 'text', text: 'ขอเลขบัญชีโอนมัดจำ' }, ctx())
assert.deepEqual(r.messages.map(m => m.type), ['text', 'text', 'image'])
assert.equal(r.messages[1].text, settings.payment_text)
assert.equal(r.messages[2].originalContentUrl, 'https://x/qr.png')
assert.equal(r.alert, true)

// price flow: product → technique → qty → starting price (never invented)
r = decide({ type: 'message', kind: 'text', text: 'เสื้อยืดราคาเท่าไหร่' }, ctx())
assert.deepEqual(r.messages[0].quickReply.items.map(i => i.action.label), ['เสื้อยืด', 'โปโล'])
r = decide({ type: 'postback', data: pressed(r, 'เสื้อยืด') }, ctx())
assert.deepEqual(r.messages[0].quickReply.items.map(i => i.action.label), ['สกรีน', 'DTF'])
r = decide({ type: 'postback', data: pressed(r, 'สกรีน') }, ctx())
assert.deepEqual(r.messages[0].quickReply.items.map(i => i.action.label), ['30–99 ตัว', '100 ตัวขึ้นไป'])
r = decide({ type: 'postback', data: pressed(r, '30–99') }, ctx())
assert.match(r.messages[0].text, /ราคาเริ่มต้น เสื้อยืด สกรีน \(30–99 ตัว\)\nตัวละ 120 บาท/)
assert.match(r.messages[0].text, /ราคาจริงขึ้นกับแบบ/)
assert.equal(r.alert, true)
// single technique is skipped automatically
r = decide({ type: 'postback', data: 'โปโล|bot:price?p=%E0%B9%82%E0%B8%9B%E0%B9%82%E0%B8%A5' }, ctx())
assert.deepEqual(r.messages[0].quickReply.items.map(i => i.action.label), ['20 ตัวขึ้นไป'])
// no price table → asks for details and alerts staff
r = decide({ type: 'message', kind: 'text', text: 'ราคา' }, ctx({ prices: [] }))
assert.match(r.messages[0].text, /พนักงานจะคิดราคา/); assert.equal(r.alert, true)
assert.equal(tierLabel(10, [10]), '10 ตัวขึ้นไป')

// unknown text → handoff once, then silent for 6 hours
r = decide({ type: 'message', kind: 'text', text: 'อยากได้ลายแบบนี้' }, ctx())
assert.equal(r.messages[0].text, 'รับเรื่องแล้วค่ะ'); assert.equal(r.handoff, true); assert.equal(r.alert, true)
assert.equal(decide({ type: 'message', kind: 'text', text: 'อีกข้อความ' }, ctx({ conv: { botActive: true, handoffAt: new Date().toISOString() } })), null)
assert.ok(decide({ type: 'message', kind: 'text', text: 'อีกข้อความ' }, ctx({ conv: { botActive: true, handoffAt: new Date(Date.now() - 7 * 3600e3).toISOString() } })))
// a photo (maybe a slip) is never answered with a rule
r = decide({ type: 'message', kind: 'image' }, ctx())
assert.equal(r.handoff, true)
// "talk to staff" button always answers
r = decide({ type: 'postback', data: 'คุยกับพนักงาน|bot:staff' }, ctx({ conv: { botActive: true, handoffAt: new Date().toISOString() } }))
assert.equal(r.handoff, true)

// postback data keeps labels short and safe
assert.equal(actionOf('ขอ|ราคา|bot:rule:1'), 'ราคา|bot:rule:1')
const long = decide({ type: 'follow' }, ctx({ rules: [{ id: 'x', title: 'หัวข้อที่ยาวมากเกินยี่สิบตัวอักษรแน่นอน', kind: 'answer', answer: 'a', in_menu: true, enabled: true, keywords: [] }] }))
assert.ok(long.messages[0].quickReply.items[0].action.label.length <= 20)

// knowledge base: customer articles with bot on are answers (with images); internal ones never are
const { kbRules } = await import('./engine.js')
const kb = [
  { id: 'k1', title: 'ไซซ์ชาร์ต', body: 'ไซซ์ S–5XL ค่ะ', images: ['https://x/size.png', 'http://insecure/x.png'], keywords: ['ไซซ์', 'size'], visibility: 'customer', bot_enabled: true, in_menu: true, sort: 5 },
  { id: 'k2', title: 'ต้นทุนผ้า', body: 'ลับ', keywords: ['ผ้า'], visibility: 'internal', bot_enabled: true, in_menu: true },
  { id: 'k3', title: 'ผ้าคอตตอน', body: 'นุ่ม', keywords: ['ผ้า'], visibility: 'customer', bot_enabled: false },
]
assert.deepEqual(kbRules(kb).map(r => r.id), ['k1'])
r = decide({ type: 'message', kind: 'text', text: 'มีไซซ์อะไรบ้าง' }, ctx({ kb }))
assert.deepEqual(r.messages.map(m => m.type), ['text', 'image'], 'text + https image only')
assert.equal(r.messages[1].originalContentUrl, 'https://x/size.png')
assert.equal(r.ruleId, 'k1'); assert.ok(r.messages.at(-1).quickReply, 'menu buttons on the last message')
assert.equal(decide({ type: 'message', kind: 'text', text: 'ผ้าแบบไหนดี' }, ctx({ kb })).handoff, true, 'internal / bot-off articles are never sent')
r = decide({ type: 'follow' }, ctx({ kb }))
assert.ok(r.messages[0].quickReply.items.some(i => i.action.label === 'ไซซ์ชาร์ต'))
assert.ok(!r.messages[0].quickReply.items.some(i => i.action.label === 'ต้นทุนผ้า'))

console.log('bot ok')

// server runner: newest event per chat only, reply API (never push), fully answered → no staff alert
const { runBot, clearBotCache } = await import('./run.js')
const calls = []
const db = {
  from: t => {
    const data = t === 'bot_rules' ? rules : t === 'bot_prices' ? prices : []
    const q = { maybeSingle: async () => ({ data: settings }), eq: () => q, then: (ok, bad) => Promise.resolve({ data }).then(ok, bad) }
    return { select: () => q }
  },
  rpc: async (fn, a) => { calls.push([fn, a]); return {} },
}
const api = { reply: async (token, msgs) => calls.push(['reply', token, msgs.length]), push: () => { throw new Error('bot must never push') } }
clearBotCache()
const conv = { botActive: true, handoffAt: null }
const answered = await runBot(db, [
  { conversationId: 'c1', messageId: 'm1', replyToken: 't1', event: { type: 'message', kind: 'text', text: 'สวัสดี' }, conv },
  { conversationId: 'c1', messageId: 'm2', replyToken: 't2', event: { type: 'message', kind: 'text', text: 'ผลิตกี่วัน' }, conv },
  { conversationId: 'c2', messageId: 'm3', replyToken: 't3', event: { type: 'message', kind: 'text', text: 'ขอเลขบัญชี' }, conv },
], { api })
assert.deepEqual(calls.filter(c => c[0] === 'reply').map(c => c[1]), ['t2', 't3'], 'one reply per chat, newest event')
assert.deepEqual([...answered], ['m2'], 'Q&A answered fully; payment still alerts staff')
const rec = calls.find(c => c[0] === 'record_bot_reply' && c[1].p_conversation_id === 'c1')[1]
assert.equal(rec.p_rule_id, 'r-time'); assert.equal(rec.p_handoff, false)
// reply failure → nothing recorded, staff still alerted
calls.length = 0
const failing = { reply: async () => { throw new Error('Invalid reply token') } }
assert.equal((await runBot(db, [{ conversationId: 'c1', messageId: 'm9', replyToken: 'old', event: { type: 'message', kind: 'text', text: 'กี่วัน' }, conv }], { api: failing })).size, 0)
assert.equal(calls.length, 0)
console.log('bot runner ok')
