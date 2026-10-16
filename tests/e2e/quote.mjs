// e2e: quotation from chat → PDF → LINE card (mock Supabase + mock LINE on :54321). Same app env as line.mjs.
import { chromium } from 'playwright'
import crypto from 'node:crypto'
import fs from 'node:fs'
const require_write = (f, b) => fs.writeFileSync(f, b)
const B = 'http://localhost:3100', DB = 'http://localhost:54321'
const OUT = process.argv[2]
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1 }
const sign = body => crypto.createHmac('sha256', 'test-secret').update(body).digest('base64')
const hook = obj => { const body = JSON.stringify(obj); return fetch(B + '/api/channels/line', { method: 'POST', headers: { 'content-type': 'application/json', 'x-line-signature': sign(body) }, body }) }
const say = (id, text, user) => hook({ destination: 'U-bot', events: [{ type: 'message', webhookEventId: id, timestamp: Date.now(), source: { type: 'user', userId: user }, replyToken: 'rt-' + id, message: { id: 'm-' + id, type: 'text', text } }] })
const line = () => fetch(DB + '/__line').then(r => r.json())
const dbs = () => fetch(DB + '/__db').then(r => r.json())
const sleep = ms => new Promise(r => setTimeout(r, ms))
const rpc = (fn, args) => fetch(`${DB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) })

await say('Q1', 'ขอใบเสนอราคาเสื้อรุ่นค่ะ', 'U-quote')
await say('Q2', 'สวัสดีครับ', 'U-nolink')
await sleep(800)
let d = await dbs()
const ident = d.contact_identities.find(i => i.external_id === 'U-quote')
const conv = d.conversations.find(c => c.identity_id === ident.id)
await rpc('link_conversation_customer', { p_conversation_id: conv.id, p_customer_id: 'c1', p_evidence: 'ลูกค้าแจ้งเบอร์โทรตรงกับในระบบ' })
for (const c of d.conversations) await fetch(`${DB}/rest/v1/conversations?id=eq.${c.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bot_active: false }) })

const errors = []
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
p.on('pageerror', e => errors.push('pageerror @' + p.url() + ': ' + e.message.slice(0, 120)))
p.on('console', m => { if (m.type() === 'error' && !/favicon|404|WebSocket|realtime/.test(m.text())) errors.push('console: ' + m.text()) })
await p.goto(B + '/login')
await p.fill('input[type=email]', 'staff@cscreen.test'); await p.fill('input[type=password]', 'correct-horse')
await p.click('button[type=submit]'); await p.waitForURL(/dashboard/)

// unlinked chat: asked to link first
await p.goto(B + '/inbox?c=' + d.conversations.find(c => c.identity_id === d.contact_identities.find(i => i.external_id === 'U-nolink').id).id)
await p.waitForSelector('.ib-actions')
await p.locator('.ib-actions').getByRole('button', { name: 'ใบเสนอราคา' }).click()
check((await p.locator('.ib-sheet').innerText()).includes('ผูกแชทนี้กับลูกค้าก่อน'), 'แชทที่ยังไม่ผูกลูกค้า → ให้ผูกก่อนออกใบเสนอราคา')
await p.locator('.ib-sheet').getByRole('button', { name: 'ค้นหา / ผูกลูกค้า' }).click()
check(await p.locator('.ib-sheet').getByRole('button', { name: 'ค้นหาลูกค้าเดิม' }).isVisible(), 'กดแล้วไปหน้าผูกลูกค้าทันที')
await p.locator('.ib-sheet').getByLabel('ปิด').click()

// linked chat: build and send
await p.goto(B + '/inbox?c=' + conv.id); await p.waitForSelector('.ib-actions')
await p.locator('.ib-actions').getByRole('button', { name: 'ใบเสนอราคา' }).click()
await p.waitForSelector('.ib-quote')
check((await p.locator('.ib-quote').innerText()).includes('โรงเรียนสาธิตตัวอย่าง'), 'ดึงชื่อลูกค้าอัตโนมัติ')
await p.getByLabel('รายการที่ 1', { exact: true }).fill('เสื้อยืด Cotton สกรีน 2 สี')
await p.getByLabel('จำนวน รายการที่ 1').fill('50')
await p.getByLabel('ราคา รายการที่ 1').fill('120')
await p.getByLabel('รายการที่ 2', { exact: true }).fill('ค่าบล็อก')
await p.getByLabel('จำนวน รายการที่ 2').fill('1')
await p.getByLabel('ราคา รายการที่ 2').fill('500')
await p.locator('.ib-qopts').getByLabel('ส่วนลด (บาท)').fill('500')
await p.locator('.ib-qopts').getByLabel('VAT').selectOption('7')
check((await p.locator('.ib-qtotal').innerText()).replace(/\s+/g, ' ').includes('ยอดสุทธิ 6,420.00 บาท'), 'คำนวณยอด + ส่วนลด + VAT 7% ถูก (6,420)')
await p.locator('.ib-sheet').screenshot({ path: OUT + '/quote-form.png' })
await p.getByRole('button', { name: 'บันทึกและส่งให้ลูกค้า' }).click()
await p.waitForSelector('.ib-doccard')
let L = await line()
const sent = L.pushes.at(-1)?.messages || []
const img = sent[0], caption = sent.at(-1)
check(img?.type === 'image' && /\/sign\/documents\/quotations\/QT-1017-v1-p1\.jpg/.test(img.originalContentUrl) && /-p1-s\.jpg/.test(img.previewImageUrl), 'LINE ได้รูปใบเสนอราคา (ไม่ใช่ลิงก์)')
check(caption?.type === 'text' && caption.text.includes('QT-1017') && caption.text.includes('6,420.00 บาท') && !/https?:/.test(caption.text), 'ข้อความกำกับมีเลขที่ + ยอด ไม่มีลิงก์')
const jpg = Buffer.from(await (await fetch(`${DB}/storage/v1/object/sign/documents/quotations/QT-1017-v1-p1.jpg`)).arrayBuffer())
check(jpg.subarray(0, 2).toString('hex') === 'ffd8' && jpg.length > 50000, 'รูปเป็น JPEG จริงจาก PDF')
const pdf = Buffer.from(await (await fetch(`${DB}/storage/v1/object/sign/documents/quotations/QT-1017-v1.pdf`)).arrayBuffer())
check(pdf.subarray(0, 4).toString() === '%PDF' && pdf.length > 20000, 'ยังเก็บ PDF ต้นฉบับใน documents')
if (OUT) require_write(OUT + '/quote-line.jpg', jpg)
check((await p.locator('.ib-doccard').last().innerText()).includes('ใบเสนอราคา QT-1017'), 'หน้าแชทแสดงการ์ดเอกสาร')
d = await dbs()
check(d.deals.find(x => x.conversation_id === conv.id)?.stage === 'Quotation Sent', 'งานขายเปลี่ยนเป็น "ส่งใบเสนอราคาแล้ว"')
check(d.quotation_versions.length === 1 && d.quotations.find(q => q.code === 'QT-1017').total === 6420, 'เก็บฉบับที่ 1 (snapshot) + ยอดในฐานข้อมูล')

// resend: same content → same version, no new PDF
await p.locator('.ib-actions').getByRole('button', { name: 'ใบเสนอราคา' }).click()
await p.waitForSelector('.ib-qline')
await p.locator('.ib-qline', { hasText: 'QT-1017' }).getByRole('button', { name: /ส่ง/ }).click()
await p.waitForFunction(n => document.querySelectorAll('.ib-doccard').length > n, 1)
d = await dbs(); L = await line()
check(d.quotation_versions.length === 1 && L.pushes.length >= 2 && L.pushes.at(-1).messages[0].type === 'image', 'ส่งซ้ำโดยไม่แก้ → ฉบับเดิม ไม่สร้าง PDF ใหม่ (ส่งเป็นรูปอีกครั้ง)')
await p.screenshot({ path: OUT + '/quote-chat.png' })

console.log('errors:', errors)
if (errors.length) process.exitCode = 1
await br.close()
