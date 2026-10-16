import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import * as line from '@/lib/channels/line'
import { renderQuotationPdf } from '@/lib/pdf/quotationPdf'
import { DEFAULT_TERMS, money, thaiDate } from '@/lib/docs/quotation'
import { SHOP } from '@/lib/shop'
import { requireUser, createSupabaseServer } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { documentImageMessages } from '@/lib/server/documentImages'

export const maxDuration = 60
const SENDERS = ['owner', 'admin', 'sales']
const fail = (error, status = 400) => NextResponse.json({ error }, { status })

/**
 * POST /api/inbox/send-quotation (login, owner/admin/sales)
 * Body: { conversationId, quotationId, clientKey }
 * Snapshot → PDF (once per version, stored in private documents) → LINE: the pages as pictures + a short caption.
 * Same clientKey = same message; LINE is asked at most once.
 */
export async function POST(req) {
  const auth = await requireUser()
  if (auth.response) return auth.response
  const me = auth.user.sub
  const { data: role } = await (await createSupabaseServer()).rpc('app_role')
  if (!SENDERS.includes(role)) return fail('บัญชีนี้ไม่มีสิทธิ์ส่งใบเสนอราคา', 403)

  let body
  try { body = await req.json() } catch { return fail('bad json') }
  const { conversationId, quotationId, clientKey } = body || {}
  if (!conversationId || !quotationId || typeof clientKey !== 'string' || !clientKey || clientKey.length > 100) return fail('ข้อมูลไม่ครบ')

  let db
  try { db = supabaseAdmin() } catch (e) { return fail(e.message, 500) }
  const [{ data: conv }, { data: q }, { data: prof }] = await Promise.all([
    db.from('conversations').select('id, platform, customer_id, identity:contact_identities(external_id)').eq('id', conversationId).maybeSingle(),
    db.from('quotations').select('id, code, customer_id, total, valid_until, customer:customers(name)').eq('id', quotationId).maybeSingle(),
    db.from('profiles').select('full_name').eq('id', me).maybeSingle(),
  ])
  if (!conv) return fail('ไม่พบแชท', 404)
  if (!q) return fail('ไม่พบใบเสนอราคา', 404)
  if (conv.platform !== 'line') return fail('ส่งเอกสารได้เฉพาะ LINE ในตอนนี้')
  if (!conv.customer_id || conv.customer_id !== q.customer_id) return fail('ใบเสนอราคานี้เป็นของลูกค้าคนอื่น — ส่งได้เฉพาะลูกค้าที่ผูกกับแชทนี้')

  // 1) immutable snapshot (same content → same version)
  const { data: v, error: vErr } = await db.rpc('snapshot_quotation_version', {
    p_quotation_id: q.id, p_shop: SHOP, p_prepared_by: prof?.full_name || null, p_terms: DEFAULT_TERMS, p_actor: me,
  })
  if (vErr) return fail(vErr.message, 409)

  // 2) PDF once per version
  let pdfPath = v.pdf_path, pdf = null
  if (!pdfPath) {
    try {
      pdf = await renderQuotationPdf(v.snapshot)
      pdfPath = `quotations/${q.code}-v${v.version}.pdf`
      const up = await db.storage.from('documents').upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: true })
      if (up.error) throw new Error(up.error.message)
      const sha = crypto.createHash('sha256').update(pdf).digest('hex')
      await db.from('quotation_versions').update({ pdf_path: pdfPath, pdf_sha256: sha }).eq('id', v.id)
    } catch (e) {
      console.error('[send-quotation] pdf', e.message)
      return fail('สร้าง PDF ไม่สำเร็จ: ' + e.message, 500)
    }
  }

  // 3) reserve the chat message (idempotent), then send
  const caption = `ใบเสนอราคา ${q.code}${v.version > 1 ? ` (ฉบับที่ ${v.version})` : ''} · ยอด ${money(v.total)} บาท`
  const { data: msg, error: rErr } = await db.rpc('reserve_outgoing_message', {
    p_conversation_id: conversationId, p_client_key: clientKey, p_text: caption, p_kind: 'document',
    p_attachment: { bucket: 'documents', path: pdfPath, name: `${q.code}-v${v.version}.pdf`, mime: 'application/pdf' }, p_sender: me,
  })
  if (rErr) return fail(rErr.message, 409)
  await db.from('messages').update({ document: { type: 'quotation', id: q.id, code: q.code, version: v.version, total: v.total } }).eq('id', msg.id)
  if (msg.status === 'sent') return NextResponse.json({ message: msg, version: v.version })

  try {
    const { messages: pictures } = await documentImageMessages(db, pdfPath, pdf)
    const text = [
      `ใบเสนอราคา ${q.code}${v.version > 1 ? ` (ฉบับที่ ${v.version})` : ''}`,
      `ลูกค้า: ${q.customer?.name || '—'}`,
      `ยอดสุทธิ ${money(v.total)} บาท`,
      ...(q.valid_until ? [`ราคานี้ใช้ได้ถึง ${thaiDate(q.valid_until)}`] : []),
    ].join('\n')
    await line.push(conv.identity.external_id, [...pictures, { type: 'text', text }], clientKey)
    await db.rpc('finish_outgoing_message', { p_message_id: msg.id, p_ok: true })
    await db.rpc('mark_quotation_sent', { p_version_id: v.id, p_message_id: msg.id })
    return NextResponse.json({ message: { ...msg, status: 'sent' }, version: v.version })
  } catch (e) {
    await db.rpc('finish_outgoing_message', { p_message_id: msg.id, p_ok: false, p_error: e.message })
    console.error('[send-quotation]', e.message)
    return fail(e.message, 502)
  }
}
