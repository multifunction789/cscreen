import { verifyIdToken, pushMessage, leadConfirmText } from '@/lib/line'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * POST /api/line/quote — รับฟอร์มขอใบเสนอราคาจาก LIFF
 * Body: { idToken, contact_name, phone, company, product, qty, method, positions, color, need_date, note }
 */
const clip = (v, n = 300) => (v == null ? null : String(v).trim().slice(0, n) || null)

export async function POST(req) {
  try {
    const body = await req.json()
    const profile = await verifyIdToken(body.idToken)   // throws if forged/expired

    const lead = {
      line_user_id: profile.sub,
      display_name: clip(profile.name, 100),
      contact_name: clip(body.contact_name, 100),
      phone:        clip(body.phone, 30),
      company:      clip(body.company, 150),
      product:      clip(body.product, 50),
      qty:          Number.isFinite(+body.qty) && +body.qty > 0 ? Math.floor(+body.qty) : null,
      method:       clip(body.method, 30),
      positions:    clip(body.positions, 100),
      color:        clip(body.color, 100),
      need_date:    /^\d{4}-\d{2}-\d{2}$/.test(body.need_date || '') ? body.need_date : null,
      note:         clip(body.note, 1000),
    }
    if (!lead.product || !lead.qty) {
      return Response.json({ error: 'กรุณาเลือกประเภทเสื้อและจำนวน' }, { status: 400 })
    }

    const db = supabaseAdmin()
    const { data: existing } = await db
      .from('customers').select('id').eq('line_user_id', lead.line_user_id).maybeSingle()
    if (existing) lead.customer_id = existing.id

    const { error } = await db.from('line_leads').insert(lead)
    if (error) throw error

    try { await pushMessage(lead.line_user_id, [leadConfirmText(lead)]) }
    catch (e) { console.warn('[line/quote] push failed', e.message) }

    return Response.json({ ok: true })
  } catch (err) {
    console.error('[line/quote]', err)
    return Response.json({ error: 'ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 })
  }
}
