// Sales pipeline helpers (pure — used by the board, the table, "my tasks" and tests).
import { DEAL_STAGES, DEAL_STAGE_TH } from '../inbox/model.js'

export const OPEN_STAGES = DEAL_STAGES.filter(s => !['Completed', 'Cancelled / Lost'].includes(s))
export const WON_STAGES = ['Confirmed', 'Waiting for Deposit', 'Production', 'Ready for Delivery', 'Completed']
export const stageTh = s => DEAL_STAGE_TH[s] || s
// how long a deal may sit in a stage before it is flagged (days)
export const STALE_DAYS = { 'New Lead': 1, 'Waiting for Details': 3, 'Quotation Draft': 2, 'Quotation Sent': 3, 'Follow-up': 3, 'Confirmed': 3, 'Waiting for Deposit': 3 }

const DAY = 86400e3
export const daysSince = (iso, now = Date.now()) => (iso ? Math.floor((now - new Date(iso).getTime()) / DAY) : 0)

/** normalise a deals row (with embeds) for the UI */
export function toDeal(d) {
  const c = d.conversation
  return {
    id: d.id, stage: d.stage, value: d.value == null ? null : Number(d.value), owner: d.owner || null, title: d.title || '',
    followUpAt: d.follow_up_at, nextAction: d.next_action || '', lostReason: d.lost_reason || '',
    stageChangedAt: d.stage_changed_at || d.updated_at || d.created_at, createdAt: d.created_at, updatedAt: d.updated_at, closedAt: d.closed_at,
    customerId: d.customer_id, customer: d.customer?.name || null, customerCode: d.customer?.code || null,
    conversationId: d.conversation_id, platform: c?.platform || null, assignedTo: c?.assigned_to || null,
    contactName: c?.identity?.display_name || null, lastInboundAt: c?.last_inbound_at || null, lastMessageAt: c?.last_message_at || null,
    quotation: d.quotation?.code || null, invoice: d.invoice?.code || null,
  }
}
export const dealName = d => d.title || d.customer || d.contactName || 'ลูกค้าไม่ทราบชื่อ'
export const dealOwner = d => d.owner || d.assignedTo || null

export function flags(d, now = Date.now()) {
  const out = []
  if (d.followUpAt && new Date(d.followUpAt).getTime() <= now && !['Completed', 'Cancelled / Lost'].includes(d.stage)) out.push('overdue')
  const stale = STALE_DAYS[d.stage]
  if (stale && daysSince(d.stageChangedAt, now) >= stale) out.push('stale')
  if (d.lastInboundAt && d.lastMessageAt && d.lastInboundAt >= d.lastMessageAt) out.push('waiting_reply')
  return out
}

/** { stage: deals[] } in board order, newest activity first */
export function groupByStage(deals, { showClosed = false } = {}) {
  const stages = showClosed ? DEAL_STAGES : OPEN_STAGES
  const g = Object.fromEntries(stages.map(s => [s, []]))
  for (const d of deals) if (g[d.stage]) g[d.stage].push(d)
  for (const s of stages) g[s].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
  return g
}
export const stageTotal = list => list.reduce((t, d) => t + (d.value || 0), 0)

export function filterDeals(deals, { q = '', owner = '', stage = '' } = {}) {
  const t = q.trim().toLowerCase()
  return deals.filter(d =>
    (!owner || (owner === 'none' ? !dealOwner(d) : dealOwner(d) === owner)) &&
    (!stage || d.stage === stage) &&
    (!t || [d.title, d.customer, d.customerCode, d.contactName, d.quotation, d.invoice, d.nextAction].some(x => x && String(x).toLowerCase().includes(t))))
}

export function sortDeals(deals, key = 'updatedAt', dir = 'desc') {
  const val = d => key === 'name' ? dealName(d) : key === 'stage' ? DEAL_STAGES.indexOf(d.stage) : d[key] ?? ''
  const s = [...deals].sort((a, b) => { const x = val(a), y = val(b); return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'th') })
  return dir === 'desc' ? s.reverse() : s
}

/**
 * "งานของฉัน": what this person should do now, most urgent first.
 * chats: inbox conversations ({ id, assigned_to, follow_up_at, status, last_inbound_at, last_message_at, name })
 */
export function myTasks({ deals, chats = [], me, now = Date.now() }) {
  const out = []
  const mine = x => x === me
  for (const d of deals) {
    if (!mine(dealOwner(d)) || ['Completed', 'Cancelled / Lost'].includes(d.stage)) continue
    const f = flags(d, now)
    if (d.followUpAt) out.push({ kind: 'deal_follow_up', at: d.followUpAt, due: f.includes('overdue'), deal: d, text: d.nextAction || 'ติดตามลูกค้า' })
    else if (f.includes('stale')) out.push({ kind: 'deal_stale', at: d.stageChangedAt, due: true, deal: d, text: `ค้างที่ "${stageTh(d.stage)}" ${daysSince(d.stageChangedAt, now)} วัน` })
  }
  for (const c of chats) {
    if (!mine(c.assigned_to) || c.status === 'closed') continue
    if (c.follow_up_at) out.push({ kind: 'chat_follow_up', at: c.follow_up_at, due: new Date(c.follow_up_at).getTime() <= now, chat: c, text: 'ตั้งเตือนติดตามแชทนี้' })
    else if (c.last_inbound_at && (!c.last_message_at || c.last_inbound_at >= c.last_message_at)) out.push({ kind: 'chat_reply', at: c.last_inbound_at, due: true, chat: c, text: 'ลูกค้ารอคำตอบ' })
  }
  return out.sort((a, b) => (a.due === b.due ? String(a.at).localeCompare(String(b.at)) : a.due ? -1 : 1))
}

/** minutes → "4 นาที" / "2 ชม. 5 นาที" / "1 วัน 3 ชม." */
export function durationTh(min) {
  if (min == null || !isFinite(min)) return '—'
  const m = Math.round(min)
  if (m < 60) return `${m} นาที`
  if (m < 1440) return `${Math.floor(m / 60)} ชม.${m % 60 ? ` ${m % 60} นาที` : ''}`
  return `${Math.floor(m / 1440)} วัน${Math.floor((m % 1440) / 60) ? ` ${Math.floor((m % 1440) / 60)} ชม.` : ''}`
}

/** date range presets in Bangkok time → { from, to } ISO */
export function rangePreset(id, now = new Date()) {
  const bkk = new Date(now.getTime() + 7 * 3600e3)
  const day = Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), bkk.getUTCDate()) - 7 * 3600e3   // 00:00 Bangkok today, in UTC ms
  const monthStart = (y, m) => Date.UTC(y, m, 1) - 7 * 3600e3
  const y = bkk.getUTCFullYear(), mo = bkk.getUTCMonth()
  const r = {
    today: [day, day + DAY],
    '7d': [day - 6 * DAY, day + DAY],
    '30d': [day - 29 * DAY, day + DAY],
    month: [monthStart(y, mo), day + DAY],
    last_month: [monthStart(mo === 0 ? y - 1 : y, (mo + 11) % 12), monthStart(y, mo)],
  }[id] || [day - 29 * DAY, day + DAY]
  return { from: new Date(r[0]).toISOString(), to: new Date(r[1]).toISOString() }
}
