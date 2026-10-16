// e2e: LINE webhook → chat page → staff reply, against the mock Supabase + mock LINE (port 54321).
// App must run with LINE_CHANNEL_SECRET=test-secret LINE_CHANNEL_ACCESS_TOKEN=test-line-token
// LINE_API_BASE=LINE_DATA_API_BASE=http://localhost:54321 SUPABASE_SERVICE_ROLE_KEY=test-service
import { chromium } from 'playwright'
import crypto from 'node:crypto'
import { writeFileSync } from 'node:fs'
const B = 'http://localhost:3100', DB = 'http://localhost:54321'
const OUT = process.argv[2]
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1 }
const sign = body => crypto.createHmac('sha256', 'test-secret').update(body).digest('base64')
const hook = (obj, sig) => { const body = JSON.stringify(obj); return fetch(B + '/api/channels/line', { method: 'POST', headers: { 'content-type': 'application/json', 'x-line-signature': sig ?? sign(body) }, body }) }
const ev = (id, message, userId = 'U-cust-1') => ({ type: 'message', webhookEventId: id, timestamp: Date.now(), source: { type: 'user', userId }, replyToken: 'rt', message })
const line = () => fetch(DB + '/__line').then(r => r.json())
const dbs = () => fetch(DB + '/__db').then(r => r.json())
const sleep = ms => new Promise(r => setTimeout(r, ms))
const pushesAtLeast = async n => { for (let i = 0; i < 40; i++) { if ((await line()).pushes.length >= n) return true; await sleep(250) } return false }

// ── webhook
check((await hook({ destination: 'U-bot', events: [] }, 'bad')).status === 401, 'ลายเซ็นผิด → ปฏิเสธ (401)')
check((await hook({ destination: 'U-bot', events: [] })).status === 200, 'ปุ่ม Verify ของ LINE → 200')
check((await dbs()).channel_accounts[0]?.status === 'connected', 'กด Verify แล้วช่อง LINE เป็น "เชื่อมต่อแล้ว"')
const e1 = ev('E1', { id: 'm1', type: 'text', text: 'สนใจสกรีนเสื้อ 50 ตัวค่ะ' })
check((await hook({ destination: 'U-bot', events: [e1] })).status === 200, 'รับข้อความลูกค้า')
await hook({ destination: 'U-bot', events: [e1] })
check((await dbs()).messages.filter(m => m.external_id === 'm1').length === 1, 'LINE ส่งซ้ำ → ไม่มีข้อความซ้ำ')
await hook({ destination: 'U-bot', events: [ev('E2', { id: 'm2', type: 'image', contentProvider: { type: 'line' } })] })
await sleep(1500)
let d = await dbs()
check(d.contact_identities[0].display_name === 'สมใจ ใจดี', 'ดึงชื่อโปรไฟล์ LINE อัตโนมัติ (คิวงาน)')
check(d.messages.find(m => m.external_id === 'm2')?.attachment?.path?.startsWith('line/'), 'ดึงรูปจาก LINE เก็บใน chat-media (คิวงาน)')
check(d.channel_accounts[0].display_name === 'CScreen OA', 'ดึงชื่อ LINE OA')
check((await fetch(B + '/api/worker')).status === 200, '/api/worker เรียกได้ (สำหรับ Supabase Cron)')
check((await fetch(B + '/api/inbox/send', { method: 'POST', body: '{}' })).status === 401, 'ส่งข้อความโดยไม่ล็อกอิน → 401')

// ── chat page
const errors = []
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
p.on('pageerror', e => errors.push('pageerror: ' + e.message))
p.on('console', m => { if (m.type() === 'error' && !/favicon|404|502|WebSocket|realtime/.test(m.text())) errors.push('console: ' + m.text()) })
await p.goto(B + '/login')
await p.fill('input[type=email]', 'staff@cscreen.test'); await p.fill('input[type=password]', 'correct-horse')
await p.click('button[type=submit]'); await p.waitForURL(/dashboard/)
await p.waitForSelector('.nav-badge')
check((await p.locator('.nav-badge').innerText()) === '2', 'เมนูแชทลูกค้ามีตัวเลขข้อความยังไม่อ่าน (ทุกหน้า)')
await p.waitForFunction(() => document.title.startsWith('(2) '))
check(true, 'ชื่อแท็บมีจำนวนยังไม่อ่าน (2)')
await p.goto(B + '/inbox'); await p.waitForSelector('.ib-item')
await p.getByRole('button', { name: 'ตั้งค่าแจ้งเตือน' }).click()
check((await p.locator('.ib-alerts-pop').innerText()).includes('เปิดแจ้งเตือนบนเครื่องนี้'), 'ปุ่ม 🔔 เปิดหน้าตั้งค่าแจ้งเตือน')
await p.getByRole('button', { name: 'ตั้งค่าแจ้งเตือน' }).click()
check((await p.locator('.ib-item').innerText()).includes('สมใจ ใจดี'), 'แชทจาก LINE ขึ้นในหน้าแชท พร้อมชื่อลูกค้า')
await p.locator('.ib-item').first().click()
await p.waitForSelector('.ib-media img')
check(await p.locator('.ib-media img').evaluate(i => i.complete && i.naturalWidth > 0), 'รูปจากลูกค้าแสดงในแชท')
check(!(await p.locator('.ib-banners').innerText()).includes('ยังไม่ได้เชื่อมต่อ'), 'ไม่มีป้าย "ยังไม่ได้เชื่อมต่อ" แล้ว')
await p.waitForFunction(() => document.querySelector('.ib-banners')?.innerText.includes('/300'))
check(true, 'แสดงโควตา LINE จริง')

// reply (double click = one push)
await p.getByLabel('พิมพ์ข้อความ').fill('ราคาตัวละ 189 บาทค่ะ')
await p.locator('.ib-composer button[type=submit]').dblclick()
await p.waitForSelector('.ib-msg.out')
await sleep(800)
let L = await line()
check(L.pushes.length === 1 && L.pushes[0].to === 'U-cust-1' && L.pushes[0].messages[0].text === 'ราคาตัวละ 189 บาทค่ะ', 'ตอบลูกค้า → ส่งเข้า LINE จริง 1 ครั้ง (ดับเบิลคลิก)')
check(!(await p.locator('.ib-msg.out').last().innerText()).includes('กำลังส่ง'), 'สถานะข้อความ = ส่งแล้ว')
check((await p.locator('.ib-item').innerText()).includes('ราคาตัวละ 189'), 'รายการแชทอัปเดตข้อความล่าสุดหลังตอบ')
d = await dbs()
check(d.conversations[0].assigned_to && d.conversations[0].status === 'open', 'ตอบแล้วรับแชทเป็นของฉัน + สถานะกำลังคุย')

// LINE error → failed → retry with the same key
await fetch(DB + '/__line/fail')
await p.getByLabel('พิมพ์ข้อความ').fill('ส่งตัวอย่างลายให้นะคะ')
await p.locator('.ib-composer button[type=submit]').click()
await p.waitForSelector('.ib-msg.out :text("ส่งไม่สำเร็จ")')
check(true, 'LINE ล่ม → ข้อความขึ้น "ส่งไม่สำเร็จ" (ไม่หลอกว่าส่งแล้ว)')
check((await p.getByLabel('พิมพ์ข้อความ').inputValue()) === '', 'ส่งไม่สำเร็จแล้วล้างช่องพิมพ์ (กันส่งซ้ำ ใช้ปุ่มลองส่งใหม่แทน)')
await p.getByRole('button', { name: 'ลองส่งใหม่' }).click()
await p.waitForFunction(() => !document.querySelector('.ib-timeline').innerText.includes('ส่งไม่สำเร็จ'))
L = await line()
check(L.pushes.length === 2 && L.pushes[1].messages[0].text === 'ส่งตัวอย่างลายให้นะคะ', 'กดลองส่งใหม่ → ส่งสำเร็จ 1 ครั้ง')

// attachments: PNG goes as an image, PDF as a download link
writeFileSync(OUT + '/mock.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
writeFileSync(OUT + '/quote.pdf', '%PDF-1.4 test')
await p.locator('.ib-composer input[type=file]').setInputFiles(OUT + '/mock.png')
check(await pushesAtLeast(3), 'แนบรูปแล้วส่ง')
await p.locator('.ib-composer input[type=file]').setInputFiles(OUT + '/quote.pdf')
check(await pushesAtLeast(4), 'แนบ PDF แล้วส่ง')
L = await line()
check(L.pushes[2].messages[0].type === 'image' && L.pushes[2].messages[0].originalContentUrl.includes('/sign/chat-media/out/'), 'ส่งรูป → LINE ได้รูปภาพ')
check(L.pushes[3].messages[0].type === 'text' && /quote\.pdf[\s\S]*sign\/chat-media/.test(L.pushes[3].messages[0].text), 'ส่ง PDF → LINE ได้ลิงก์ดาวน์โหลด (LINE รับไฟล์ไม่ได้)')
await p.screenshot({ path: OUT + '/line-chat.png' })

// alert link opens that chat directly
const convId = (await dbs()).conversations[0].id
await p.goto(B + '/inbox?c=' + convId); await p.waitForSelector('.ib-chat-who')
check((await p.locator('.ib-chat-who').innerText()).includes('สมใจ'), 'ลิงก์จากแจ้งเตือน (/inbox?c=…) เปิดแชทนั้นทันที')
check((await fetch(B + '/sw.js')).status === 200, 'service worker โหลดได้โดยไม่ต้องล็อกอิน')

console.log('errors:', errors)
if (errors.length) process.exitCode = 1
await br.close()
