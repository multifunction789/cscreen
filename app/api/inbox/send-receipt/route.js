import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import * as line from '@/lib/channels/line'
import { renderReceiptPdf } from '@/lib/pdf/receiptPdf'
import { money, thaiDate } from '@/lib/docs/quotation'
import { SHOP } from '@/lib/shop'
import { receiptSnapshot } from '@/lib/docs/receipt'
import { requireUser, createSupabaseServer } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { documentImageMessages } from '@/lib/server/documentImages'

export const maxDuration = 60
const SENDERS = ['owner', 'admin', 'sales', 'accounting']
const fail = (error, status = 400) => NextResponse.json({ error }, { status })

/**
 * POST /api/inbox/send-receipt (login, owner/admin/sales/accounting)
 * Body: { conversationId, receiptId, clientKey }
 * Only a receipt accounting confirmed (paid, not voided), for the customer linked to the chat.
 * Sent to LINE as picture(s) + a short caption. Same clientKey = same message.
 */
export async function POST(req) {
  const auth = await requireUser()
  if (auth.response) return auth.response
  const me = auth.user.sub
  const { data: role } = await (await createSupabaseServer()).rpc('app_role')
  if (!SENDERS.includes(role)) return fail('บัญชีนี้ไม่มีสิทธิ์ส่งใบเสร็จ', 403)

  let body
  try { body = await req.json() } catch { return fail('bad json') }
  const { conversationId, receiptId, clientKey } = body || {}
  if (!conversationId || !receiptId || typeof clientKey !== 'string' || !clientKey || clientKey.length > 100) return fail('ข้อมูลไม่ครบ')

  let db
  try { db = supabaseAdmin() } catch (e) { return fail(e.message, 500) }
  const [{ data: conv }, { data: r }] = await Promise.all([
    db.from('conversations').select('id, platform, customer_id, identity:contact_identities(external_id)').eq('id', conversationId).maybeSingle(),
    db.from('receipts').select('*').eq('id', receiptId).maybeSingle(),
  ])
  if (!conv) return fail('ไม่พบแชท', 404)
  if (!r) return fail('ไม่พบใบเสร็จ', 404)
  if (conv.platform !== 'line') return fail('ส่งเอกสารได้เฉพาะ LINE ในตอนนี้')
  if (!r.paid) return fail('ใบเสร็จนี้ยังไม่ได้ยืนยันรับเงิน — ส่งให้ลูกค้าไม่ได้')
  if (r.voided_at) return fail('ใบเสร็จนี้ถูกยกเลิกแล้ว')
  if (!r.invoice_id) return fail('ใบเสร็จนี้ไม่ได้ผูกใบแจ้งหนี้')
  if (!conv.customer_id || conv.customer_id !== r.customer_id) return fail('ใบเสร็จนี้เป็นของลูกค้าคนอื่น — ส่งได้เฉพาะลูกค้าที่ผูกกับแชทนี้')

  const [{ data: inv }, { data: c }, { data: others }, { data: sub }] = await Promise.all([
    db.from('invoices').select('id, code, total').eq('id', r.invoice_id).maybeSingle(),
    db.from('customers').select('name, phone, address, tax_id').eq('id', r.customer_id).maybeSingle(),
    db.from('receipts').select('id, total, paid_at, created_at').eq('invoice_id', r.invoice_id).eq('paid', true).is('voided_at', null),
    db.from('payment_submissions').select('bank_reference, decided_by').eq('receipt_id', r.id).maybeSingle(),
  ])
  if (!inv) return fail('ไม่พบใบแจ้งหนี้ของใบเสร็จนี้', 404)
  let receivedBy = null
  if (sub?.decided_by) receivedBy = (await db.from('profiles').select('full_name').eq('id', sub.decided_by).maybeSingle()).data?.full_name || null
  const snap = receiptSnapshot({ shop: SHOP, receipt: r, invoice: inv, customer: c, others: others || [], submission: sub, receivedBy })

  // PDF (receipts never change once paid → same file every time)
  const pdfPath = `receipts/${r.code}.pdf`
  let pdf
  try {
    pdf = await renderReceiptPdf(snap)
    const up = await db.storage.from('documents').upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: true })
    if (up.error) throw new Error(up.error.message)
  } catch (e) {
    console.error('[send-receipt] pdf', e.message)
    return fail('สร้างใบเสร็จไม่สำเร็จ: ' + e.message, 500)
  }

  const caption = `ใบเสร็จรับเงิน ${r.code} · ${money(r.total)} บาท`
  const { data: msg, error: rErr } = await db.rpc('reserve_outgoing_message', {
    p_conversation_id: conversationId, p_client_key: clientKey, p_text: caption, p_kind: 'document',
    p_attachment: { bucket: 'documents', path: pdfPath, name: `${r.code}.pdf`, mime: 'application/pdf' }, p_sender: me,
  })
  if (rErr) return fail(rErr.message, 409)
  await db.from('messages').update({ document: { type: 'receipt', id: r.id, code: r.code, total: Number(r.total), invoice: inv.code, sha256: crypto.createHash('sha256').update(pdf).digest('hex') } }).eq('id', msg.id)
  if (msg.status === 'sent') return NextResponse.json({ message: msg })

  try {
    const { messages: pictures } = await documentImageMessages(db, pdfPath, pdf)
    const text = [
      `ใบเสร็จรับเงิน ${r.code}`,
      `ได้รับเงิน ${money(r.total)} บาท (${snap.label.replace('รับชำระเงิน', '')}) วันที่ ${thaiDate(r.paid_at)}`,
      `ใบแจ้งหนี้ ${inv.code}: ${snap.invoice.balance > 0 ? `คงเหลือ ${money(snap.invoice.balance)} บาท` : 'ชำระครบแล้ว'}`,
      'ขอบคุณค่ะ 🙏',
    ].join('\n')
    await line.push(conv.identity.external_id, [...pictures, { type: 'text', text }], clientKey)
    await db.rpc('finish_outgoing_message', { p_message_id: msg.id, p_ok: true })
    await db.from('audit_log').insert({ actor: me, action: 'send_receipt', entity: 'receipts', entity_id: r.id, detail: { code: r.code, conversation: conversationId, message: msg.id } })
    return NextResponse.json({ message: { ...msg, status: 'sent' } })
  } catch (e) {
    await db.rpc('finish_outgoing_message', { p_message_id: msg.id, p_ok: false, p_error: e.message })
    console.error('[send-receipt]', e.message)
    return fail(e.message, 502)
  }
}
