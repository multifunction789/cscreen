import { NextResponse } from 'next/server'
import * as line from '@/lib/channels/line'
import { MEDIA_BUCKET } from '@/lib/channels/tasks'
import { requireUser, createSupabaseServer } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'

const SENDERS = ['owner', 'admin', 'sales']
const LINK_DAYS = 30
const fail = (error, status = 400) => NextResponse.json({ error }, { status })

/**
 * POST /api/inbox/send (login, owner/admin/sales)
 * Body: { conversationId, clientKey, text?, attachment?: { bucket:'chat-media', path, name, mime, size } }
 * The message row is reserved first with clientKey; pressing send twice, or a
 * network retry, returns the same message and LINE is asked at most once.
 */
export async function POST(req) {
  const auth = await requireUser()
  if (auth.response) return auth.response
  const me = auth.user.sub

  const userDb = await createSupabaseServer()
  const { data: role } = await userDb.rpc('app_role')
  if (!SENDERS.includes(role)) return fail('บัญชีนี้ไม่มีสิทธิ์ตอบแชทลูกค้า', 403)

  let body
  try { body = await req.json() } catch { return fail('bad json') }
  const { conversationId, clientKey } = body || {}
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  const att = body?.attachment || null
  if (!conversationId || !clientKey || typeof clientKey !== 'string' || clientKey.length > 100) return fail('ข้อมูลไม่ครบ')
  if (!text && !att) return fail('ไม่มีข้อความ')
  if (text.length > 5000) return fail('ข้อความยาวเกิน 5,000 ตัวอักษร (ข้อจำกัดของ LINE)')
  if (att && (att.bucket !== MEDIA_BUCKET || typeof att.path !== 'string' || !att.path.startsWith(`out/${conversationId}/`))) return fail('ไฟล์แนบไม่ถูกต้อง')

  let db
  try { db = supabaseAdmin() } catch (e) { return fail(e.message, 500) }

  const { data: conv } = await db.from('conversations')
    .select('id, platform, identity:contact_identities(external_id)').eq('id', conversationId).maybeSingle()
  if (!conv) return fail('ไม่พบแชท', 404)
  if (conv.platform !== 'line') return fail('ยังไม่ได้เชื่อมต่อช่องทางนี้ — ส่งข้อความได้เฉพาะ LINE ในตอนนี้')

  const kind = att ? (/^image\//.test(att.mime || '') ? 'image' : 'file') : 'text'
  const attachment = att ? { bucket: MEDIA_BUCKET, path: att.path, name: String(att.name || 'ไฟล์').slice(0, 200), mime: att.mime || null, size: att.size || null } : null
  const { data: msg, error: rErr } = await db.rpc('reserve_outgoing_message', {
    p_conversation_id: conversationId, p_client_key: clientKey, p_text: text || null, p_kind: kind, p_attachment: attachment, p_sender: me,
  })
  if (rErr) return fail(rErr.message, 409)
  if (msg.status === 'sent') return NextResponse.json({ message: msg })   // already delivered earlier

  try {
    let fileUrl = null
    if (attachment) {
      const { data: signed, error } = await db.storage.from(MEDIA_BUCKET).createSignedUrl(attachment.path, LINK_DAYS * 86400)
      if (error || !signed?.signedUrl) throw new Error('สร้างลิงก์ไฟล์ไม่สำเร็จ')
      fileUrl = signed.signedUrl
    }
    const messages = line.buildMessages({ text, attachment, fileUrl })
    await line.push(conv.identity.external_id, messages, clientKey)
    const { data: done } = await db.rpc('finish_outgoing_message', { p_message_id: msg.id, p_ok: true })
    return NextResponse.json({ message: done || msg })
  } catch (e) {
    await db.rpc('finish_outgoing_message', { p_message_id: msg.id, p_ok: false, p_error: e.message })
    console.error('[inbox/send]', e.message)
    return fail(e.message, 502)
  }
}
