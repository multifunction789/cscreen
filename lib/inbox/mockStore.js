// Phase 2 mock store — in-memory, fake data only (names marked ตัวอย่าง).
// Same interface as the real store will have (see model.js).
import { newClientKey } from './model'

export const STAFF = [
  { id: 'u-me',    name: 'ฉัน',  role: 'owner' },
  { id: 'u-mook',  name: 'มุก',  role: 'sales' },
  { id: 'u-bam',   name: 'แบม',  role: 'sales' },
  { id: 'u-fai',   name: 'ฝ้าย', role: 'designer' },
]
export const staffName = id => STAFF.find(s => s.id === id)?.name || '—'

const ago = (min) => new Date(Date.now() - min * 60e3).toISOString()

function seed() {
  const customers = {
    c1: { id: 'c1', name: 'โรงเรียนสาธิตตัวอย่าง', kind: 'company', phone: '081-234-5678', email: 'school@example.com', taxId: '0994000000001', address: '123 ถ.ตัวอย่าง จ.เชียงใหม่', outstanding: 12500, notes: 'ต้องการใบกำกับภาษีเต็มรูป · ส่งของก่อน 08:00', linked: ['line', 'facebook'] },
    c2: { id: 'c2', name: 'ทีมฟุตบอลตัวอย่าง FC', kind: 'company', phone: '089-111-2222', email: '', taxId: '', address: 'กรุงเทพฯ', outstanding: 0, notes: 'ชอบผ้าไมโคร สีกรม', linked: ['facebook'] },
  }
  const conversations = [
    { id: 'v1', platform: 'line', contact: { id: 'L-1', displayName: 'ครูสมใจ (ตัวอย่าง)', avatar: '#06C755' }, customerId: 'c1',
      status: 'open', assignedTo: 'u-mook', unread: 2, lastInboundAt: ago(2), lastMessageAt: ago(2), lastMessageText: 'โอนมัดจำแล้วค่ะ [รูป]',
      deal: { stage: 'Waiting for Deposit', value: 48749.2, quotation: 'QT-6910-0045 v2', invoice: 'INV-6910-0123', job: null }, followUpAt: null, botActive: false },
    { id: 'v2', platform: 'facebook', contact: { id: 'F-1', displayName: 'คุณเอ (ตัวอย่าง)', avatar: '#0866FF' }, customerId: null,
      status: 'new', assignedTo: null, unread: 1, lastInboundAt: ago(21 * 60), lastMessageAt: ago(21 * 60), lastMessageText: 'โปโล 50 ตัว ปักอกซ้าย ราคาเท่าไหร่ครับ',
      deal: { stage: 'New Lead', value: null }, followUpAt: null, botActive: true },
    { id: 'v3', platform: 'facebook', contact: { id: 'F-2', displayName: 'โค้ชบอล (ตัวอย่าง)', avatar: '#7C3AED' }, customerId: 'c2',
      status: 'followup', assignedTo: 'u-bam', unread: 0, lastInboundAt: ago(30 * 60), lastMessageAt: ago(28 * 60), lastMessageText: 'ขอคิดดูก่อนนะครับ',
      deal: { stage: 'Quotation Sent', value: 32500, quotation: 'QT-6910-0041 v1' }, followUpAt: ago(-24 * 60), botActive: false },
    { id: 'v4', platform: 'tiktok', contact: { id: 'T-1', displayName: 'tiktok_user_88 (ตัวอย่าง)', avatar: '#111111' }, customerId: null,
      status: 'new', assignedTo: null, unread: 3, lastInboundAt: ago(50), lastMessageAt: ago(50), lastMessageText: 'สกรีนเสื้อ 1 ตัวได้ไหมคะ',
      deal: { stage: 'New Lead', value: null }, followUpAt: null, botActive: false },
    { id: 'v5', platform: 'line', contact: { id: 'L-2', displayName: 'บริษัท ตัวอย่าง จำกัด', avatar: '#F59E0B' }, customerId: null,
      status: 'waiting', assignedTo: 'u-me', unread: 0, lastInboundAt: ago(3 * 60), lastMessageAt: ago(2.5 * 60), lastMessageText: 'ส่งไซส์ชาร์ตให้แล้วนะคะ',
      deal: { stage: 'Waiting for Details', value: null }, followUpAt: null, botActive: false },
  ]
  const m = (conversationId, minAgo, direction, text, extra = {}) => ({
    id: newClientKey(), conversationId, direction, kind: 'text', text, createdAt: ago(minAgo), status: 'sent', sentBy: null, ...extra,
  })
  const messages = [
    m('v1', 60, 'in', 'สวัสดีค่ะ ขอใบเสนอราคาเสื้อกีฬา 120 ตัวค่ะ'),
    m('v1', 58, 'out', 'สวัสดีค่ะ ยินดีค่ะ ขอทราบไซส์และสีที่ต้องการค่ะ', { sentBy: 'u-mook' }),
    m('v1', 40, 'in', '', { kind: 'image', attachment: { name: 'size-chart.jpg', mime: 'image/jpeg' } }),
    m('v1', 30, 'out', 'ส่งใบเสนอราคา QT-6910-0045 v2 แล้วค่ะ', { sentBy: 'u-mook', kind: 'document', document: { type: 'quotation', code: 'QT-6910-0045', version: 2 } }),
    m('v1', 3, 'in', 'โอนมัดจำแล้วค่ะ', {}),
    m('v1', 2, 'in', '', { kind: 'image', attachment: { name: 'slip.jpg', mime: 'image/jpeg' }, slipCandidate: true }),
    m('v2', 21 * 60 + 1, 'in', 'สวัสดีครับ'),
    m('v2', 21 * 60 + 1, 'out', 'สวัสดีค่ะ ซีสกรีนยินดีให้บริการค่ะ เวลาผลิต 7–14 วันหลังอนุมัติแบบ แอดมินจะรีบตอบนะคะ', { sentBy: 'bot' }),
    m('v2', 21 * 60, 'in', 'โปโล 50 ตัว ปักอกซ้าย ราคาเท่าไหร่ครับ'),
    m('v3', 33 * 60, 'out', 'ส่งใบเสนอราคา QT-6910-0041 แล้วครับ', { sentBy: 'u-bam', kind: 'document', document: { type: 'quotation', code: 'QT-6910-0041', version: 1 } }),
    m('v3', 30 * 60, 'in', 'ขอคิดดูก่อนนะครับ'),
    m('v3', 28 * 60, 'out', 'ได้เลยครับ ถ้ามีคำถามทักมาได้ตลอดครับ', { sentBy: 'u-bam' }),
    m('v4', 52, 'in', 'สวัสดีค่ะ'),
    m('v4', 51, 'in', 'ร้านรับสกรีนเสื้อไหมคะ'),
    m('v4', 50, 'in', 'สกรีนเสื้อ 1 ตัวได้ไหมคะ'),
    m('v5', 3 * 60, 'in', '', { kind: 'file', attachment: { name: 'size-chart.xlsx', mime: 'application/vnd.ms-excel' } }),
    m('v5', 3 * 60, 'in', 'ส่งไซส์ชาร์ตให้แล้วนะคะ'),
    m('v5', 2.5 * 60, 'out', 'ได้รับแล้วค่ะ จะทำใบเสนอราคาให้ภายในวันนี้ค่ะ', { sentBy: 'u-me' }),
  ]
  const notes = [
    { id: 'n1', conversationId: 'v1', author: 'u-mook', text: 'ลูกค้าขอใบกำกับภาษีเต็มรูป ใช้ที่อยู่โรงเรียน', createdAt: ago(25) },
  ]
  return { customers, conversations, messages, notes }
}

export function createMockStore() {
  const db = seed()
  const listeners = new Set()
  const sent = new Map() // clientKey → message (never send twice)
  const emit = (e) => listeners.forEach(fn => fn(e))
  const conv = id => db.conversations.find(c => c.id === id)
  const withCustomer = c => ({ ...c, customer: c.customerId ? db.customers[c.customerId] : null })

  return {
    connected: false, // phase 2: no real channel yet
    staff: STAFF,
    me: 'u-me',
    lineQuota: { used: 120, limit: 300 }, // mock — real number comes from LINE API in phase 4
    listConversations: () => db.conversations.map(withCustomer).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
    listMessages: id => db.messages.filter(m => m.conversationId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    listNotes: id => db.notes.filter(n => n.conversationId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    async send(id, { text, clientKey, attachment }) {
      if (sent.has(clientKey)) return sent.get(clientKey)
      const c = conv(id)
      const msg = { id: newClientKey(), clientKey, conversationId: id, direction: 'out', kind: attachment ? 'file' : 'text', text: text || '', attachment,
        createdAt: new Date().toISOString(), status: 'sending', sentBy: 'u-me' }
      sent.set(clientKey, msg)
      db.messages.push(msg)
      Object.assign(c, { lastMessageAt: msg.createdAt, lastMessageText: text || attachment?.name, status: c.status === 'new' ? 'open' : c.status, assignedTo: c.assignedTo || 'u-me', botActive: false })
      emit({ type: 'message', conversationId: id })
      await new Promise(r => setTimeout(r, 400)) // pretend network
      msg.status = 'sent'
      emit({ type: 'message', conversationId: id })
      return msg
    },
    async addNote(id, text) {
      const n = { id: newClientKey(), conversationId: id, author: 'u-me', text, createdAt: new Date().toISOString() }
      db.notes.push(n); emit({ type: 'note', conversationId: id }); return n
    },
    async update(id, patch) { Object.assign(conv(id), patch); emit({ type: 'conversation', conversationId: id }) },
    async createCustomer(id, data) {
      const cid = 'c' + (Object.keys(db.customers).length + 1) + '-' + Date.now()
      db.customers[cid] = { id: cid, outstanding: 0, linked: [conv(id).platform], ...data }
      conv(id).customerId = cid
      emit({ type: 'conversation', conversationId: id })
    },
    async updateCustomer(id, data) {
      Object.assign(db.customers[conv(id).customerId], data)
      emit({ type: 'conversation', conversationId: id })
    },
    markRead(id) { const c = conv(id); if (c?.unread) { c.unread = 0; emit({ type: 'conversation', conversationId: id }) } },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    // demo helpers (only in the mock): show realtime + collision warning without real channels
    demoIncoming(id, text) {
      const c = conv(id); const at = new Date().toISOString()
      db.messages.push({ id: newClientKey(), conversationId: id, direction: 'in', kind: 'text', text, createdAt: at, status: 'sent', sentBy: null })
      Object.assign(c, { lastInboundAt: at, lastMessageAt: at, lastMessageText: text, unread: c.unread + 1, status: c.status === 'closed' ? 'open' : c.status })
      emit({ type: 'message', conversationId: id })
    },
    demoColleagueReply(id, staffId, text) {
      const c = conv(id); const at = new Date().toISOString()
      db.messages.push({ id: newClientKey(), conversationId: id, direction: 'out', kind: 'text', text, createdAt: at, status: 'sent', sentBy: staffId })
      Object.assign(c, { lastMessageAt: at, lastMessageText: text })
      emit({ type: 'message', conversationId: id })
    },
  }
}
