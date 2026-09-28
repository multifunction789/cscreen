import { verifySignature, replyMessage, jobStatusFlex } from '@/lib/line'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * POST /api/line/webhook — LINE Messaging API webhook
 * ตอบเฉพาะคำสั่ง "สถานะ" / "เช็คสถานะ" / "JO-xxxx"
 * ข้อความอื่นปล่อยให้ auto-reply ใน LINE OA Manager ตอบตามเดิม
 */
const STATUS_RE = /^(เช็ค)?สถานะ(งาน)?$|JO-\d+/i

export async function POST(req) {
  const raw = await req.text()
  if (!verifySignature(raw, req.headers.get('x-line-signature'))) {
    return new Response('bad signature', { status: 401 })
  }

  const { events = [] } = JSON.parse(raw)
  await Promise.all(events.map(handle).map(p => p.catch(e => console.error('[line/webhook]', e))))
  return Response.json({ ok: true })
}

async function handle(ev) {
  if (ev.type !== 'message' || ev.message?.type !== 'text') return
  const text = ev.message.text.trim()
  if (!STATUS_RE.test(text)) return

  const userId = ev.source?.userId
  const db = supabaseAdmin()
  const { data: customer } = await db
    .from('customers').select('id, name').eq('line_user_id', userId).maybeSingle()

  if (!customer) {
    return replyMessage(ev.replyToken, [{
      type: 'text',
      text: 'ยังไม่พบงานที่ผูกกับบัญชี LINE นี้ค่ะ\nพิมพ์ "แอดมิน" พร้อมเลขงาน (JO-xxxx) แอดมินจะเช็คให้นะคะ 🙏',
    }])
  }

  const code = text.match(/JO-\d+/i)?.[0]?.toUpperCase()
  let q = db.from('job_orders')
    .select('code, status, item_desc, due_date')
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false })
  q = code ? q.eq('code', code) : q.neq('status', 'ส่งงานแล้ว').limit(5)
  const { data: jobs } = await q

  if (!jobs?.length) {
    return replyMessage(ev.replyToken, [{
      type: 'text',
      text: code ? `ไม่พบงาน ${code} ในบัญชีของคุณค่ะ` : 'ตอนนี้ไม่มีงานที่กำลังผลิตค่ะ 😊',
    }])
  }

  const bubbles = jobs.map(j => jobStatusFlex(j).contents)
  return replyMessage(ev.replyToken, [
    bubbles.length === 1
      ? jobStatusFlex(jobs[0])
      : { type: 'flex', altText: `สถานะงาน ${jobs.length} รายการ`, contents: { type: 'carousel', contents: bubbles } },
  ])
}
