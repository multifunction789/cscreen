// e2e phase 8: slip in chat → accounting approves → paid receipt → picture to LINE (mock Supabase + mock LINE on :54321)
import { chromium } from 'playwright'
import crypto from 'node:crypto'
const B = 'http://localhost:3100', DB = 'http://localhost:54321'
const OUT = process.argv[2]
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1 }
const sign = body => crypto.createHmac('sha256', 'test-secret').update(body).digest('base64')
const hook = obj => { const body = JSON.stringify(obj); return fetch(B + '/api/channels/line', { method: 'POST', headers: { 'content-type': 'application/json', 'x-line-signature': sign(body) }, body }) }
const say = (id, text, user) => hook({ destination: 'U-bot', events: [{ type: 'message', webhookEventId: id, timestamp: Date.now(), source: { type: 'user', userId: user }, replyToken: 'rt-' + id, message: { id: 'm-' + id, type: 'text', text } }] })
const line = () => fetch(DB + '/__line').then(r => r.json())
const dbs = () => fetch(DB + '/__db').then(r => r.json())
const role = r => fetch(DB + '/__role?r=' + r)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const rpc = (fn, args) => fetch(`${DB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) })
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(200) } return false }

await role('sales')
await say('P1', 'โอนมัดจำแล้วนะคะ', 'U-pay')
await sleep(800)
let d = await dbs()
const conv = d.conversations.find(c => c.identity_id === d.contact_identities.find(i => i.external_id === 'U-pay').id)
await rpc('link_conversation_customer', { p_conversation_id: conv.id, p_customer_id: 'c1', p_evidence: 'ลูกค้าแจ้งเบอร์โทรตรงกับในระบบ' })
await fetch(`${DB}/rest/v1/conversations?id=eq.${conv.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bot_active: false }) })
await fetch(DB + '/__insert', { method: 'POST', body: JSON.stringify({ table: 'messages', row: { conversation_id: conv.id, direction: 'in', kind: 'image', attachment: { bucket: 'chat-media', path: `in/${conv.id}/slip1.png`, mime: 'image/png', name: 'slip.png' }, status: 'received' } }) })

const errors = []
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
p.on('pageerror', e => errors.push('pageerror @' + p.url() + ': ' + e.message.slice(0, 120)))
p.on('console', m => { if (m.type() === 'error' && !/favicon|404|WebSocket|realtime|400 \(Bad Request\)/.test(m.text())) errors.push('console: ' + m.text()) })
await p.goto(B + '/login')
await p.fill('input[type=email]', 'staff@cscreen.test'); await p.fill('input[type=password]', 'correct-horse')
await p.click('button[type=submit]'); await p.waitForURL(/dashboard/)

// ── sales: picture in chat → "บันทึกเป็นสลิป"
await p.goto(B + '/inbox?c=' + conv.id); await p.waitForSelector('.ib-actions')
await p.getByRole('button', { name: 'บันทึกเป็นสลิป' }).click()
await p.waitForSelector('.ib-pay select')
const form = await p.locator('.ib-pay').innerText()
check(form.includes('INV-0123') && form.includes('30,000.00'), 'แสดงใบแจ้งหนี้ค้างชำระของลูกค้า + คงเหลือ')
check(await p.getByLabel('ยอดที่ลูกค้าโอน (บาท)').inputValue() === '15000', 'เสนอยอดมัดจำ 50% อัตโนมัติ')
check(form.includes('ยังไม่ถือว่าชำระแล้ว'), 'เตือนว่าสลิปยังไม่ใช่เงินเข้า')
await p.getByLabel('เลขอ้างอิงในสลิป (ถ้ามี)').fill('REF-1')
if (OUT) await p.locator('.ib-sheet').screenshot({ path: OUT + '/pay-slip-form.png' })
await p.getByRole('button', { name: 'ส่งให้ฝ่ายบัญชีตรวจ' }).click()
await until(async () => (await dbs()).payment_submissions.length === 1)
d = await dbs()
const s1 = d.payment_submissions[0]
check(s1?.status === 'pending' && s1.amount_claimed === 15000 && s1.slip?.path === `in/${conv.id}/slip1.png`, 'บันทึกสลิปรอตรวจ (รูปจากข้อความในแชท)')
check(d.receipts.length === 0 && d.transactions.length === 0, 'ยังไม่มีใบเสร็จ / รายรับ จนกว่าบัญชีอนุมัติ')

// ── sales on /payments: can see, cannot approve
await p.goto(B + '/payments'); await p.waitForSelector('.pay-card')
check(await p.getByRole('button', { name: 'ยืนยันรับเงิน + ออกใบเสร็จ' }).count() === 0 && (await p.locator('.pay-card').innerText()).includes('รอฝ่ายบัญชี'), 'ฝ่ายขายเห็นแต่ยืนยันรับเงินไม่ได้')
check((await p.locator('nav').innerText()).includes('ตรวจรับเงิน'), 'มีเมนูตรวจรับเงิน')

// ── accounting approves → receipt + picture to LINE
await role('accounting')
await p.reload(); await p.waitForSelector('.pay-card')
check((await p.locator('.pay-tabs').innerText()).includes('รอตรวจ (1)'), 'แท็บรอตรวจแสดงจำนวน')
if (OUT) await p.screenshot({ path: OUT + '/pay-review.png' })
await p.getByRole('button', { name: 'ยืนยันรับเงิน + ออกใบเสร็จ' }).click()
check(await until(async () => (await line()).pushes.some(x => x.messages?.at(-1)?.text?.includes('ใบเสร็จรับเงิน'))), 'ส่งใบเสร็จเข้า LINE หลังอนุมัติ')
d = await dbs()
const r1 = d.receipts[0]
check(d.receipts.length === 1 && r1.paid && r1.total === 15000 && d.transactions.length === 1, 'ออกใบเสร็จ + บันทึกรายรับ 15,000')
let L = await line()
let push = L.pushes.at(-1).messages
check(push[0].type === 'image' && push[0].originalContentUrl.includes(`/documents/receipts/${r1.code}-p1.jpg`), 'ใบเสร็จเป็นรูป')
check(push.at(-1).text.includes(r1.code) && push.at(-1).text.includes('คงเหลือ 15,000.00 บาท') && push.at(-1).text.includes('มัดจำ'), 'ข้อความกำกับ: เลขที่ + มัดจำ + คงเหลือ')
const jpg = Buffer.from(await (await fetch(`${DB}/storage/v1/object/sign/documents/receipts/${r1.code}-p1.jpg`)).arrayBuffer())
check(jpg.subarray(0, 2).toString('hex') === 'ffd8', 'รูปใบเสร็จเป็น JPEG จริง')
if (OUT) (await import('node:fs')).writeFileSync(OUT + '/receipt-line.jpg', jpg)
await until(async () => (await p.locator('.pay-card').count()) === 0)
check(await p.locator('.pay-card').count() === 0, 'รายการออกจากแท็บรอตรวจ')

// ── second slip uploaded as a file; duplicate bank reference refused; then installment closes the invoice
await role('sales')
await p.goto(B + '/inbox?c=' + conv.id); await p.waitForSelector('.ib-actions')
await p.locator('.ib-actions').getByRole('button', { name: 'รับเงิน' }).click()
await p.waitForSelector('.ib-pay select')
check(await p.getByLabel('ยอดที่ลูกค้าโอน (บาท)').inputValue() === '15000', 'งวดถัดไปเสนอยอดคงเหลือ')
check((await p.locator('.ib-pay').innerText()).includes('รับเงินแล้ว'), 'เห็นสถานะสลิปก่อนหน้า')
await p.getByLabel('เลขอ้างอิงในสลิป (ถ้ามี)').fill('ref-1')
await p.getByLabel('แนบรูปสลิป').setInputFiles({ name: 'slip2.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') })
await p.getByRole('button', { name: 'ส่งให้ฝ่ายบัญชีตรวจ' }).click()
await until(async () => (await dbs()).payment_submissions.length === 2)
d = await dbs()
check(d.payment_submissions[1]?.slip?.bucket === 'payment-slips', 'สลิปแนบไฟล์เก็บใน payment-slips')

await role('accounting')
await p.goto(B + '/payments'); await p.waitForSelector('.pay-card')
await p.getByRole('button', { name: 'ยืนยันรับเงิน + ออกใบเสร็จ' }).click()
await p.waitForSelector('text=ถูกใช้รับเงินไปแล้ว', { timeout: 5000 }).catch(() => {})
check((await dbs()).receipts.length === 1 && await p.locator('text=ถูกใช้รับเงินไปแล้ว').count() > 0, 'เลขอ้างอิงซ้ำ → ไม่รับเงิน + แจ้งเตือน')
await p.getByLabel('เลขอ้างอิงธนาคาร').fill('REF-2')
await p.getByRole('button', { name: 'ยืนยันรับเงิน + ออกใบเสร็จ' }).click()
await until(async () => (await dbs()).receipts.length === 2)
d = await dbs()
check(d.receipts.reduce((t, r) => t + r.total, 0) === 30000, 'มัดจำ + งวดสุดท้าย = ครบ 30,000')
await until(async () => (await line()).pushes.at(-1)?.messages?.at(-1)?.text?.includes('ชำระครบแล้ว'))
check((await line()).pushes.at(-1).messages.at(-1).text.includes('ชำระครบแล้ว'), 'ใบเสร็จงวดสุดท้ายแจ้งว่าชำระครบ')

// ── nothing left: over-payment blocked, rejected with reason
await rpc('submit_payment_slip', { p_invoice_id: 'i1', p_amount: 500, p_conversation_id: conv.id })
await p.reload(); await p.waitForSelector('.pay-card')
check(await p.getByRole('button', { name: 'ยืนยันรับเงิน + ออกใบเสร็จ' }).isDisabled() && (await p.locator('.pay-card').innerText()).includes('เกินคงเหลือ'), 'ยอดเกินคงเหลือ → กดยืนยันไม่ได้')
await p.getByRole('button', { name: 'ไม่ผ่าน' }).click()
await p.getByLabel('เหตุผลที่ไม่ผ่าน').fill('ลูกค้าโอนเกิน — คืนเงินแล้ว')
await p.getByRole('button', { name: 'บันทึกว่าไม่ผ่าน' }).click()
await until(async () => (await dbs()).payment_submissions.at(-1).status === 'rejected')
check((await dbs()).payment_submissions.at(-1).reject_reason === 'ลูกค้าโอนเกิน — คืนเงินแล้ว', 'ไม่ผ่าน + เก็บเหตุผล')

// ── chat: resend a receipt
await role('sales')
await p.goto(B + '/inbox?c=' + conv.id); await p.waitForSelector('.ib-actions')
await p.locator('.ib-actions').getByRole('button', { name: 'ใบเสร็จ' }).click()
await p.waitForSelector('.ib-qline')
check(await p.locator('.ib-sheet .ib-qline').count() === 2, 'แผงใบเสร็จแสดงใบเสร็จที่รับเงินแล้ว 2 ใบ')
const before = (await line()).pushes.length
await p.locator('.ib-sheet .ib-qline').first().getByRole('button', { name: 'ส่งเข้าแชท' }).click()
check(await until(async () => (await line()).pushes.length === before + 1), 'ส่งใบเสร็จซ้ำจากแชทได้')
await p.waitForSelector('.ib-doccard.receipt')
check((await p.locator('.ib-doccard.receipt').last().innerText()).includes('ใบเสร็จรับเงิน'), 'หน้าแชทแสดงการ์ดใบเสร็จ')
if (OUT) await p.screenshot({ path: OUT + '/pay-chat.png' })

// ── owner voids by reversal
await role('owner')
await p.goto(B + '/payments'); await p.waitForSelector('.pay-tabs')
await p.getByRole('tab', { name: 'รับเงินแล้ว' }).click(); await p.waitForSelector('.pay-card')
await p.locator('.pay-card').first().getByRole('button', { name: 'ยกเลิกรับเงิน…' }).click()
await p.getByLabel(/เหตุผลที่ยกเลิก/).fill('ลูกค้าโอนผิดบัญชี')
await p.getByRole('button', { name: 'ยืนยันยกเลิก' }).click()
check(await until(async () => (await dbs()).receipts.some(r => r.voided_at)), 'เจ้าของยกเลิกรับเงิน (กลับรายการ ไม่ลบ)')
check((await dbs()).receipts.length === 2, 'ใบเสร็จยังอยู่ครบ')

console.log('errors:', errors)
if (errors.length) process.exitCode = 1
await br.close()
