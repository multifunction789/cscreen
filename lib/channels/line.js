// LINE Messaging API — the only file that talks to LINE.
// Server-side only (reads secrets from env). No Next imports so it can be unit tested.
//   LINE_CHANNEL_SECRET        webhook signature (HMAC-SHA256, base64)
//   LINE_CHANNEL_ACCESS_TOKEN  long-lived channel access token
//   LINE_API_BASE / LINE_DATA_API_BASE  (tests only) point at a mock server
import crypto from 'node:crypto'

const api = () => process.env.LINE_API_BASE || 'https://api.line.me'
const dataApi = () => process.env.LINE_DATA_API_BASE || 'https://api-data.line.me'

export function verifySignature(rawBody, signature, secret = process.env.LINE_CHANNEL_SECRET) {
  if (!secret || !signature || typeof rawBody !== 'string') return false
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64'))
  const given = Buffer.from(String(signature))
  return expected.length === given.length && crypto.timingSafeEqual(expected, given)
}

export class LineError extends Error {
  constructor(status, body, path) {
    super(lineErrorText(status, body))
    this.status = status
    this.body = body
    this.path = path
  }
}

// staff-facing Thai text for common LINE errors
function lineErrorText(status, body) {
  const msg = (() => { try { return JSON.parse(body)?.message || body } catch { return body } })()
  if (status === 429 && /quota|monthly limit/i.test(msg)) return 'โควตาข้อความ LINE เดือนนี้หมดแล้ว — ส่งต่อไม่ได้จนกว่าจะเพิ่มแพ็กเกจหรือขึ้นเดือนใหม่'
  if (status === 429) return 'LINE จำกัดการส่งชั่วคราว ลองใหม่อีกครั้งในอีกสักครู่'
  if (status === 401) return 'กุญแจ LINE (Channel access token) ไม่ถูกต้องหรือหมดอายุ'
  if (status === 400 && /not.*friend|blocked|invalid.*to/i.test(msg)) return 'ส่งไม่ได้ — ลูกค้าอาจบล็อกหรือยังไม่ได้เพิ่มเพื่อน LINE OA'
  return `LINE ตอบกลับ ${status}: ${String(msg).slice(0, 200)}`
}

function token() {
  const t = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!t) throw new Error('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN')
  return t
}

async function call(path, { method = 'GET', body, headers = {}, base = api() } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token()}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new LineError(res.status, await res.text(), path)
  return res
}

/** UUID needed by X-Line-Retry-Key; derived from our client key so a retry reuses it */
export function retryKeyFor(clientKey) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientKey)) return clientKey.toLowerCase()
  const h = crypto.createHash('sha1').update('cscreen:' + clientKey).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/**
 * Push (counts against the monthly quota). Same retry key = LINE delivers once;
 * a repeat returns 409, which means "already accepted" → treated as success.
 */
export async function push(to, messages, clientKey) {
  try {
    await call('/v2/bot/message/push', { method: 'POST', body: { to, messages }, headers: { 'X-Line-Retry-Key': retryKeyFor(clientKey) } })
    return { ok: true }
  } catch (e) {
    if (e instanceof LineError && e.status === 409) return { ok: true, duplicate: true }
    throw e
  }
}

export async function reply(replyToken, messages) {
  await call('/v2/bot/message/reply', { method: 'POST', body: { replyToken, messages } })
}

export async function profile(userId) {
  return (await call(`/v2/bot/profile/${encodeURIComponent(userId)}`)).json()
}

export async function botInfo() {
  return (await call('/v2/bot/info')).json()
}

/** customer-sent image/video/audio/file → { bytes, mime } */
export async function content(messageId) {
  const res = await call(`/v2/bot/message/${encodeURIComponent(messageId)}/content`, { base: dataApi() })
  if (res.status === 202) throw new Error('LINE ยังเตรียมไฟล์ไม่เสร็จ')
  return { bytes: Buffer.from(await res.arrayBuffer()), mime: res.headers.get('content-type') || 'application/octet-stream' }
}

/** { limit: number|null (null = unlimited), used: number } */
export async function quota() {
  const [q, c] = await Promise.all([
    call('/v2/bot/message/quota').then(r => r.json()),
    call('/v2/bot/message/quota/consumption').then(r => r.json()),
  ])
  return { limit: q.type === 'limited' ? q.value : null, used: c.totalUsage ?? 0 }
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4', 'audio/x-m4a': 'm4a', 'audio/mp4': 'm4a', 'application/pdf': 'pdf' }
export const extFor = (mime, name) => (name && /\.([a-z0-9]{1,6})$/i.exec(name)?.[1]?.toLowerCase()) || EXT[mime] || 'bin'

/**
 * What the customer receives for one staff message.
 * LINE cannot receive files → anything that is not an image goes out as a download link.
 */
export function buildMessages({ text, attachment, fileUrl }) {
  const out = []
  if (attachment && fileUrl) {
    if (/^image\/(jpeg|png)$/.test(attachment.mime || '')) out.push({ type: 'image', originalContentUrl: fileUrl, previewImageUrl: fileUrl })
    else out.push({ type: 'text', text: `📎 ${attachment.name || 'ไฟล์'}\nดาวน์โหลด (ลิงก์ใช้ได้ 30 วัน): ${fileUrl}` })
  }
  if (text && text.trim()) out.push({ type: 'text', text: text.slice(0, 5000) })
  return out
}
