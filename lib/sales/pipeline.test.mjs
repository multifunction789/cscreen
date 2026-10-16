// node lib/sales/pipeline.test.mjs
import assert from 'node:assert/strict'
import { toDeal, flags, groupByStage, filterDeals, myTasks, durationTh, rangePreset, sortDeals, stageTotal, OPEN_STAGES } from './pipeline.js'

const now = Date.parse('2026-10-17T05:00:00Z') // 12:00 Bangkok
const iso = h => new Date(now - h * 3600e3).toISOString()
const raw = [
  { id: 'a', stage: 'Quotation Sent', value: '6420', owner: 'u1', follow_up_at: iso(1), stage_changed_at: iso(10), updated_at: iso(1), customer: { name: 'โรงเรียน', code: 'C-1' }, quotation: { code: 'QT-1017' } },
  { id: 'b', stage: 'New Lead', value: null, owner: null, stage_changed_at: iso(30), updated_at: iso(2), conversation: { platform: 'line', assigned_to: 'u1', identity: { display_name: 'สมใจ' }, last_inbound_at: iso(2), last_message_at: iso(2) } },
  { id: 'c', stage: 'Completed', value: 1000, owner: 'u1', stage_changed_at: iso(5), updated_at: iso(5) },
  { id: 'd', stage: 'Quotation Sent', value: 500, owner: 'u2', stage_changed_at: iso(1), updated_at: iso(3), follow_up_at: iso(-24) },
]
const deals = raw.map(toDeal)
assert.equal(deals[0].value, 6420); assert.equal(deals[1].contactName, 'สมใจ'); assert.equal(deals[0].quotation, 'QT-1017')
assert.deepEqual(flags(deals[0], now), ['overdue'])
assert.deepEqual(flags(deals[1], now), ['stale', 'waiting_reply'])
assert.deepEqual(flags(deals[3], now), [])
const g = groupByStage(deals)
assert.equal(Object.keys(g).length, OPEN_STAGES.length); assert.equal(g['Quotation Sent'].length, 2); assert.equal(g['Quotation Sent'][0].id, 'a'); assert.ok(!g.Completed)
assert.equal(stageTotal(g['Quotation Sent']), 6920)
assert.equal(groupByStage(deals, { showClosed: true }).Completed.length, 1)
assert.deepEqual(filterDeals(deals, { owner: 'u1' }).map(d => d.id), ['a', 'b', 'c'])      // b: owner from chat assignee
assert.deepEqual(filterDeals(deals, { owner: 'none' }).map(d => d.id), [])
assert.deepEqual(filterDeals(deals, { q: 'qt-1017' }).map(d => d.id), ['a'])
assert.deepEqual(sortDeals(deals, 'value', 'desc').map(d => d.id).slice(0, 2), ['a', 'c'])
const tasks = myTasks({ deals, me: 'u1', now, chats: [
  { id: 'x', assigned_to: 'u1', status: 'open', last_inbound_at: iso(0.5), last_message_at: iso(0.5), name: 'ลูกค้า X' },
  { id: 'y', assigned_to: 'u1', status: 'open', follow_up_at: iso(-5) },
  { id: 'z', assigned_to: 'u2', status: 'open', last_inbound_at: iso(1), last_message_at: iso(1) },
] })
assert.deepEqual(tasks.map(t => t.kind), ['deal_stale', 'deal_follow_up', 'chat_reply', 'chat_follow_up'])
assert.ok(tasks.every((t, i) => i === 0 || !(t.due && !tasks[i - 1].due)), 'due first')
assert.equal(durationTh(4.4), '4 นาที'); assert.equal(durationTh(125), '2 ชม. 5 นาที'); assert.equal(durationTh(60 * 27), '1 วัน 3 ชม.'); assert.equal(durationTh(null), '—')
const r = rangePreset('today', new Date(now))
assert.equal(r.from, '2026-10-16T17:00:00.000Z'); assert.equal(r.to, '2026-10-17T17:00:00.000Z')
assert.equal(rangePreset('last_month', new Date(now)).from, '2026-08-31T17:00:00.000Z')
assert.equal(rangePreset('month', new Date(now)).from, '2026-09-30T17:00:00.000Z')
console.log('pipeline ok')
