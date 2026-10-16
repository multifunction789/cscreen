// Unified Inbox — shared model (phase 2).
// The UI talks only to a "store" with the interface below. Phase 2 uses
// createMockStore(); phase 3/4 swap in a Supabase store with the same methods,
// so the screens do not change when real channels are connected.
//
// store.listConversations() → Conversation[]
// store.listMessages(conversationId) → Message[]
// store.listNotes(conversationId) → Note[]
// store.send(conversationId, { text, clientKey, attachment? }) → Message   (same clientKey = same message, never sent twice)
// store.addNote(conversationId, text) → Note
// store.update(conversationId, patch)      assign / status / customer link / follow-up
// store.createCustomer(conversationId, data) / store.updateCustomer(conversationId, data)
// store.markRead(conversationId)
// store.subscribe(fn) → unsubscribe        fn({ type, conversationId }) on any change (realtime later)

export const PLATFORMS = {
  line:     { id: 'line',     label: 'LINE',      short: 'LINE', color: '#06C755', sendFile: false, windowHours: null, note: 'ส่งไฟล์ PDF ไม่ได้ — ส่งเป็นลิงก์' },
  facebook: { id: 'facebook', label: 'Facebook',  short: 'FB',   color: '#0866FF', sendFile: true,  windowHours: 24, humanAgentDays: 7 },
  tiktok:   { id: 'tiktok',   label: 'TikTok',    short: 'TT',   color: '#111111', sendFile: false, windowHours: 48, maxConsecutive: 10, note: 'ส่งได้เฉพาะข้อความและรูป' },
}

export const STATUSES = [
  { id: 'new',      label: 'ใหม่' },
  { id: 'open',     label: 'กำลังคุย' },
  { id: 'waiting',  label: 'รอลูกค้าตอบ' },
  { id: 'followup', label: 'ต้องติดตาม' },
  { id: 'closed',   label: 'ปิดแล้ว' },
]
export const statusLabel = id => STATUSES.find(s => s.id === id)?.label || id

// Sales pipeline (phase 9 shows these on the board; phase 2 shows the stage per chat)
export const DEAL_STAGES = [
  'New Lead', 'Waiting for Details', 'Quotation Draft', 'Quotation Sent', 'Follow-up',
  'Confirmed', 'Waiting for Deposit', 'Production', 'Ready for Delivery', 'Completed', 'Cancelled / Lost',
]
export const DEAL_STAGE_TH = {
  'New Lead': 'ลูกค้าใหม่', 'Waiting for Details': 'รอข้อมูล', 'Quotation Draft': 'กำลังทำใบเสนอราคา',
  'Quotation Sent': 'ส่งใบเสนอราคาแล้ว', 'Follow-up': 'รอลูกค้าตอบ', 'Confirmed': 'ลูกค้ายืนยัน',
  'Waiting for Deposit': 'รอมัดจำ', 'Production': 'อยู่ระหว่างผลิต', 'Ready for Delivery': 'พร้อมส่ง',
  'Completed': 'ปิดงาน', 'Cancelled / Lost': 'ยกเลิก / ปิดการขายไม่ได้',
}

/** หน้าต่างเวลาตอบ (Messenger 24 ชม. + Human Agent 7 วัน, TikTok 48 ชม.) */
export function replyWindow(conv, now = Date.now()) {
  const p = PLATFORMS[conv.platform]
  if (!p?.windowHours || !conv.lastInboundAt) return { kind: 'open' }
  const since = now - new Date(conv.lastInboundAt).getTime()
  const left = p.windowHours * 3600e3 - since
  if (left > 0) return { kind: 'open', hoursLeft: Math.max(0, Math.floor(left / 3600e3)), minutesLeft: Math.floor(left / 60e3) }
  if (p.humanAgentDays && since < p.humanAgentDays * 86400e3) return { kind: 'human_agent', daysLeft: Math.ceil((p.humanAgentDays * 86400e3 - since) / 86400e3) }
  return { kind: 'closed' }
}

export function newClientKey() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`
}

/** ค้นหา: ชื่อแชท ชื่อลูกค้า เบอร์ หรือข้อความ */
export function matchesSearch(conv, messages, q) {
  const t = q.trim().toLowerCase()
  if (!t) return true
  const digits = t.replace(/\D/g, '')
  const hay = [conv.contact?.displayName, conv.customer?.name, conv.customer?.phone, conv.lastMessageText].filter(Boolean).join(' ').toLowerCase()
  if (hay.includes(t)) return true
  if (digits.length >= 4 && (conv.customer?.phone || '').replace(/\D/g, '').includes(digits)) return true
  return (messages || []).some(m => (m.text || '').toLowerCase().includes(t))
}

export function timeAgo(iso, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'เมื่อสักครู่'
  if (s < 3600) return `${Math.floor(s / 60)} นาที`
  if (s < 86400) return `${Math.floor(s / 3600)} ชม.`
  return `${Math.floor(s / 86400)} วัน`
}

export function clockTime(iso) {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })
}
