// Server-only helpers for LINE Messaging API + LIFF token verification.
// Env:
//   LINE_CHANNEL_SECRET        — Messaging API channel secret (webhook signature)
//   LINE_CHANNEL_ACCESS_TOKEN  — Messaging API long-lived channel access token
//   LINE_LOGIN_CHANNEL_ID      — LINE Login channel ID that owns the LIFF app
import crypto from 'node:crypto'

const API = 'https://api.line.me/v2/bot'

function token() {
  const t = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!t) throw new Error('LINE_CHANNEL_ACCESS_TOKEN not set')
  return t
}

export function verifySignature(rawBody, signature) {
  const secret = process.env.LINE_CHANNEL_SECRET
  if (!secret || !signature) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

async function call(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`LINE ${path} ${res.status}: ${await res.text()}`)
}

export const pushMessage  = (to, messages) => call('/message/push',  { to, messages })
export const replyMessage = (replyToken, messages) => call('/message/reply', { replyToken, messages })

// Verify a LIFF ID token → { sub (userId), name }
export async function verifyIdToken(idToken) {
  const clientId = process.env.LINE_LOGIN_CHANNEL_ID
  if (!clientId) throw new Error('LINE_LOGIN_CHANNEL_ID not set')
  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: clientId }),
  })
  if (!res.ok) throw new Error('invalid LINE id token')
  return res.json()
}

// ── Message builders ─────────────────────────────────────────
const RED = '#B80F0B'

const STATUS_TEXT = {
  'รอมัดจำ'      : 'รอชำระมัดจำ 50% เพื่อเริ่มงาน',
  'รอออกแบบ'     : 'ทีมกำลังออกแบบลายให้ค่ะ',
  'รอทำไฟล์'     : 'กำลังเตรียมไฟล์สำหรับผลิต',
  'สั่งของ'       : 'กำลังสั่งเสื้อ/วัตถุดิบ',
  'กำลังสกรีน'   : 'งานเข้าไลน์ผลิตแล้ว 🖨️',
  'แพ็คพร้อมส่ง' : 'ผลิตเสร็จ กำลังแพ็คเตรียมส่ง 📦',
  'ส่งงานแล้ว'   : 'จัดส่งเรียบร้อยแล้ว ขอบคุณที่ใช้บริการค่ะ 🙏',
}
// สถานะที่แจ้งลูกค้าอัตโนมัติ
export const NOTIFY_STATUSES = ['รอออกแบบ', 'กำลังสกรีน', 'แพ็คพร้อมส่ง', 'ส่งงานแล้ว']

function row(label, value) {
  return {
    type: 'box', layout: 'baseline', spacing: 'sm',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#888888', flex: 2 },
      { type: 'text', text: String(value || '-'), size: 'sm', color: '#222222', flex: 5, wrap: true },
    ],
  }
}

export function jobStatusFlex(job) {
  const due = job.due_date ? new Date(job.due_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '-'
  return {
    type: 'flex',
    altText: `อัปเดตงาน ${job.code}: ${job.status}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: RED, paddingAll: '16px',
        contents: [
          { type: 'text', text: 'อัปเดตสถานะงาน', color: '#FFFFFF', size: 'xs' },
          { type: 'text', text: job.status, color: '#FFFFFF', size: 'xl', weight: 'bold' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          { type: 'text', text: STATUS_TEXT[job.status] || '', wrap: true, size: 'sm' },
          { type: 'separator' },
          row('เลขงาน', job.code),
          row('รายการ', job.item_desc),
          row('กำหนดส่ง', due),
        ],
      },
      footer: {
        type: 'box', layout: 'vertical',
        contents: [{ type: 'text', text: 'สอบถามเพิ่มเติม พิมพ์ "แอดมิน" ได้เลยค่ะ', size: 'xs', color: '#888888', align: 'center' }],
      },
    },
  }
}

export function leadConfirmText(lead) {
  return {
    type: 'text',
    text:
      `ได้รับคำขอใบเสนอราคาแล้วค่ะ 🙏\n\n` +
      `• ${lead.product || '-'} ${lead.qty ? lead.qty + ' ตัว' : ''}\n` +
      `• ${lead.method || '-'}${lead.positions ? ' ' + lead.positions : ''}\n` +
      (lead.color ? `• สี ${lead.color}\n` : '') +
      (lead.need_date ? `• ต้องการรับ ${lead.need_date}\n` : '') +
      `\nแอดมินจะส่งราคาให้ในแชทนี้ภายในเวลาทำการ (09:00–21:00) ค่ะ\nมีไฟล์โลโก้ ส่งในแชทนี้ได้เลยนะคะ`,
  }
}
