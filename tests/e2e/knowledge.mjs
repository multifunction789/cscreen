// e2e: knowledge base page, bot answers from it, chat picker (mock Supabase + mock LINE on :54321).
import { chromium } from 'playwright'
import crypto from 'node:crypto'
import { writeFileSync } from 'node:fs'
const B = 'http://localhost:3100', DB = 'http://localhost:54321'
const OUT = process.argv[2]
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1 }
const sign = body => crypto.createHmac('sha256', 'test-secret').update(body).digest('base64')
const hook = obj => { const body = JSON.stringify(obj); return fetch(B + '/api/channels/line', { method: 'POST', headers: { 'content-type': 'application/json', 'x-line-signature': sign(body) }, body }) }
const say = (id, text, user = 'U-kb-cust') => hook({ destination: 'U-bot', events: [{ type: 'message', webhookEventId: id, timestamp: Date.now(), source: { type: 'user', userId: user }, replyToken: 'rt-' + id, message: { id: 'm-' + id, type: 'text', text } }] })
const line = () => fetch(DB + '/__line').then(r => r.json())
const dbs = () => fetch(DB + '/__db').then(r => r.json())
const sleep = ms => new Promise(r => setTimeout(r, ms))
const replyFor = async token => { for (let i = 0; i < 30; i++) { const r = (await line()).replies.find(x => x.replyToken === token); if (r) return r; await sleep(200) } return null }

const errors = []
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } })
const p = await ctx.newPage()
p.on('pageerror', e => errors.push('pageerror @' + p.url() + ': ' + e.message.slice(0, 120)))
p.on('console', m => { if (m.type() === 'error' && !/favicon|404|WebSocket|realtime/.test(m.text())) errors.push('console: ' + m.text()) })
await fetch(DB + '/__role?r=owner')
await p.goto(B + '/login')
await p.fill('input[type=email]', 'staff@cscreen.test'); await p.fill('input[type=password]', 'correct-horse')
await p.click('button[type=submit]'); await p.waitForURL(/dashboard/)

// menu + page
await p.getByRole('link', { name: /คลังความรู้/ }).click()
await p.waitForSelector('.kb-card')
check((await p.locator('.kb-group').first().innerText()).includes('ระยะเวลาผลิต'), 'เมนูคลังความรู้: เห็นถาม-ตอบเดิมที่ย้ายมา')

// customer article with picture, used by the bot
writeFileSync(OUT + '/size.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
await p.getByRole('button', { name: '+ เพิ่มหัวข้อ' }).click()
await p.locator('.kb-editor').getByLabel('หมวด').fill('ไซซ์ชาร์ต')
await p.locator('.kb-editor').getByLabel('หัวข้อ', { exact: true }).fill('ไซซ์เสื้อยืด')
await p.locator('.kb-editor').getByLabel('เนื้อหาที่ส่งให้ลูกค้า').fill('เสื้อยืดมีไซซ์ S–5XL ค่ะ อก 36–52 นิ้ว')
await p.locator('.kb-editor').getByLabel(/หมายเหตุสำหรับพนักงาน/).fill('ถ้าลูกค้าอกเกิน 52 ให้เสนอสั่งตัดพิเศษ')
await p.locator('.kb-editor input[type=file]').setInputFiles(OUT + '/size.png')
await p.waitForSelector('.kb-editor .kb-thumb img')
await p.locator('.kb-editor').getByLabel(/คำสำคัญ/).fill('ไซซ์, size, อก')
await p.locator('.kb-editor').getByText('🤖 ให้บอทใช้ตอบลูกค้า').click()
await p.locator('.kb-editor').getByRole('button', { name: 'บันทึก' }).click()
await p.waitForSelector('.kb-card:has-text("ไซซ์เสื้อยืด")')
let d = await dbs()
const size = d.kb_articles.find(a => a.title === 'ไซซ์เสื้อยืด')
check(size && size.bot_enabled && size.images.length === 1 && size.visibility === 'customer', 'เพิ่มหัวข้อ + รูป + เปิดให้บอทใช้')

// internal article: bot switch disappears, never reaches customers
await p.getByRole('button', { name: '+ เพิ่มหัวข้อ' }).click()
await p.locator('.kb-editor').getByText('🔒 ใช้ภายในเท่านั้น').click()
check(await p.locator('.kb-editor').getByText('🤖 ให้บอทใช้ตอบลูกค้า').count() === 0, 'หัวข้อภายใน: ไม่มีตัวเลือกให้บอทใช้')
await p.locator('.kb-editor').getByLabel('หมวด').fill('สินค้า / ผ้า')
await p.locator('.kb-editor').getByLabel('หัวข้อ', { exact: true }).fill('ต้นทุนผ้า Cotton')
await p.locator('.kb-editor').getByLabel(/เนื้อหา/).first().fill('ต้นทุนกิโลละ 280 บาท')
await p.locator('.kb-editor').getByLabel(/คำสำคัญ/).fill('ผ้า, cotton, คอตตอน')
await p.locator('.kb-editor').getByRole('button', { name: 'บันทึก' }).click()
await p.waitForSelector('.kb-card.internal')
check((await dbs()).kb_articles.find(a => a.title === 'ต้นทุนผ้า Cotton')?.visibility === 'internal', 'เพิ่มหัวข้อภายในได้')

// search
await p.getByLabel('ค้นหาคลังความรู้').fill('อก')
check(await p.locator('.kb-card').count() === 1, 'ค้นหาด้วยคำในเนื้อหา')
await p.getByLabel('ค้นหาคลังความรู้').fill('')
await p.screenshot({ path: OUT + '/knowledge.png', fullPage: true })

// bot uses the customer article, never the internal one
const s0 = (await dbs()).bot_settings[0]
if (!s0.enabled) await fetch(DB + '/rest/v1/bot_settings?id=eq.true', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true }) })
await sleep(31000)                                     // server caches bot config for 30 s
await say('K1', 'มีไซซ์อะไรบ้างคะ')
let r = await replyFor('rt-K1')
check(r && r.messages[0].text.includes('S–5XL'), 'ลูกค้าถามไซซ์ → บอทตอบจากคลังความรู้')
await say('K2', 'ผ้าคอตตอนดีไหม', 'U-kb-cust2')
r = await replyFor('rt-K2')
check(r && !JSON.stringify(r).includes('280'), 'บอทไม่เคยส่งหัวข้อภายใน (ต้นทุน) ให้ลูกค้า')

// staff use the picker in chat
await p.goto(B + '/inbox'); await p.waitForSelector('.ib-item')
await p.locator('.ib-item').first().click()
await p.getByRole('button', { name: 'คลังความรู้', exact: true }).click()
await p.getByLabel('ค้นหาคลังความรู้').fill('ไซซ์')
await p.locator('.ib-kb-list button', { hasText: 'ไซซ์เสื้อยืด' }).click()
check((await p.locator('.ib-kb-detail').innerText()).includes('ถ้าลูกค้าอกเกิน 52'), 'หน้าแชท: เห็นหมายเหตุสำหรับพนักงาน')
await p.getByRole('button', { name: 'แทรกในช่องพิมพ์' }).click()
check((await p.getByLabel('พิมพ์ข้อความ').inputValue()).includes('S–5XL'), 'แทรกคำตอบจากคลังลงช่องพิมพ์')
await p.getByRole('button', { name: 'คลังความรู้', exact: true }).click()
await p.locator('.ib-kb-list button', { hasText: 'ไซซ์เสื้อยืด' }).click()
const before = (await line()).pushes.length
await p.getByRole('button', { name: 'ส่งรูปนี้' }).click()
await sleep(1500)
const L = await line()
check(L.pushes.length === before + 1 && L.pushes.at(-1).messages[0].type === 'image' && L.pushes.at(-1).messages[0].originalContentUrl.includes('/bot-assets/kb/'), 'ส่งรูปจากคลังให้ลูกค้าได้')
await p.getByRole('button', { name: 'ปิดคลังความรู้' }).click()
await p.getByRole('button', { name: 'คลังความรู้', exact: true }).click()
await p.getByLabel('ค้นหาคลังความรู้').fill('ต้นทุน')
await p.locator('.ib-kb-list button', { hasText: 'ต้นทุนผ้า' }).click()
check(await p.getByRole('button', { name: 'แทรกในช่องพิมพ์' }).count() === 0 && (await p.locator('.ib-kb-detail').innerText()).includes('ส่งให้ลูกค้าไม่ได้'), 'หัวข้อภายใน: อ่านได้ แต่แทรก/ส่งไม่ได้')
await p.screenshot({ path: OUT + '/kb-chat.png' })

// sales: read-only
await fetch(DB + '/__role?r=sales')
await p.goto(B + '/knowledge'); await p.waitForSelector('.kb-card')
check(await p.getByRole('button', { name: '+ เพิ่มหัวข้อ' }).count() === 0 && await p.getByRole('button', { name: 'คัดลอกคำตอบ' }).count() > 0, 'sales: อ่าน/คัดลอกได้ แก้ไม่ได้')

console.log('errors:', errors)
if (errors.length) process.exitCode = 1
await br.close()
