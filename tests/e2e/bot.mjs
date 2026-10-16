// e2e: auto-reply bot settings page + LINE webhook replies (mock Supabase + mock LINE on :54321).
// Same app env as tests/e2e/line.mjs.
import { chromium } from 'playwright'
import crypto from 'node:crypto'
const B = 'http://localhost:3100', DB = 'http://localhost:54321'
const OUT = process.argv[2]
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1 }
const sign = body => crypto.createHmac('sha256', 'test-secret').update(body).digest('base64')
const hook = obj => { const body = JSON.stringify(obj); return fetch(B + '/api/channels/line', { method: 'POST', headers: { 'content-type': 'application/json', 'x-line-signature': sign(body) }, body }) }
const say = (id, text, user = 'U-bot-cust') => hook({ destination: 'U-bot', events: [{ type: 'message', webhookEventId: id, timestamp: Date.now(), source: { type: 'user', userId: user }, replyToken: 'rt-' + id, message: { id: 'm-' + id, type: 'text', text } }] })
const line = () => fetch(DB + '/__line').then(r => r.json())
const dbs = () => fetch(DB + '/__db').then(r => r.json())
const sleep = ms => new Promise(r => setTimeout(r, ms))
const lastReplyFor = async token => { for (let i = 0; i < 30; i++) { const r = (await line()).replies.find(x => x.replyToken === token); if (r) return r; await sleep(200) } return null }

const errors = []
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } })
const p = await ctx.newPage()
p.on('pageerror', e => errors.push('pageerror @' + p.url() + ': ' + e.message.slice(0, 120)))
p.on('console', m => { if (m.type() === 'error' && !/favicon|404|WebSocket|realtime/.test(m.text())) errors.push('console: ' + m.text()) })
await p.goto(B + '/login')
await p.fill('input[type=email]', 'staff@cscreen.test'); await p.fill('input[type=password]', 'correct-horse')
await p.click('button[type=submit]'); await p.waitForURL(/dashboard/)

// bot OFF (default) → nothing is sent to the customer
await say('B0', 'ผลิตกี่วันคะ')
await sleep(800)
check(!(await line()).replies.length, 'บอทปิดอยู่ (ค่าเริ่มต้น) → ไม่ตอบลูกค้า')

// sales can look but not change
await p.goto(B + '/inbox/bot'); await p.waitForSelector('.bot-section')
check((await p.locator('.bot-page').innerText()).includes('ดูได้อย่างเดียว') && await p.getByRole('button', { name: 'เปิดบอท' }).isDisabled(), 'sales เปิดหน้าบอทได้แต่แก้ไม่ได้')

// owner switches it on and adds a price
await fetch(DB + '/__role?r=owner')
await p.reload(); await p.waitForSelector('.bot-section')
await p.getByRole('button', { name: 'เปิดบอท' }).click()
await p.waitForSelector('.bot-switch.on')
check((await dbs()).bot_settings[0].enabled === true, 'owner เปิดบอทได้')
await p.getByLabel('ชนิดเสื้อใหม่').fill('เสื้อยืด'); await p.getByLabel('เทคนิคใหม่').fill('สกรีน')
await p.getByLabel('จำนวนขั้นต่ำใหม่').fill('30'); await p.getByLabel('ราคาใหม่').fill('120')
await p.getByRole('button', { name: '+ เพิ่มราคา' }).click()
await p.waitForSelector('.bot-table input[value="เสื้อยืด"]')
check((await dbs()).bot_prices.length === 1, 'เพิ่มตารางราคาเริ่มต้นได้')

// preview uses the same engine
await p.getByLabel('ข้อความทดลอง').fill('ราคาเท่าไหร่')
await p.getByRole('button', { name: 'ส่งทดลอง' }).click()
await p.locator('.bot-chips button', { hasText: 'เสื้อยืด' }).last().click()
await p.locator('.bot-chips button', { hasText: '30 ตัวขึ้นไป' }).last().click()
check((await p.locator('.bot-log').innerText()).includes('ตัวละ 120 บาท'), 'ลองคุยกับบอท: ถามราคา → เลือก → ได้ราคาเริ่มต้น')
await p.screenshot({ path: OUT + '/bot-settings.png', fullPage: true })

// live: Q&A answered with the free Reply API, recorded with a "บอท" label
await sleep(31000)   // server caches bot settings for 30 s
await say('B1', 'สั่งวันนี้ ผลิตกี่วันคะ')
let r = await lastReplyFor('rt-B1')
check(r && r.messages[0].text.includes('7–14 วัน'), 'ลูกค้าถาม "กี่วัน" → บอทตอบทันทีผ่าน Reply API')
check((await line()).pushes.length === 0, 'บอทไม่ใช้ Push (ไม่เสียโควตา)')
await say('B2', 'อยากได้ลายแบบในรูป')
r = await lastReplyFor('rt-B2')
check(r && r.messages[0].text.includes('พนักงานจะตอบกลับ'), 'คำถามที่ไม่มีในระบบ → ส่งข้อความรับเรื่อง แล้วส่งต่อพนักงาน')
await say('B3', 'ตอนนี้ว่างไหม')
await sleep(1200)
check(!(await line()).replies.some(x => x.replyToken === 'rt-B3'), 'ข้อความรับเรื่องส่งครั้งเดียว ไม่ตอบซ้ำทุกข้อความ')

// chat page shows the bot and staff take over
await p.goto(B + '/inbox'); await p.waitForSelector('.ib-item')
await p.locator('.ib-item').first().click()
await p.waitForSelector('.ib-botbar')
check((await p.locator('.ib-botbar').innerText()).includes('บอทดูแลแชทนี้อยู่'), 'หน้าแชทบอกว่าบอทกำลังดูแลแชทนี้')
check(await p.locator('.ib-msg.out .ib-bot').count() >= 2, 'ข้อความบอทมีป้าย "บอท"')
await p.getByLabel('พิมพ์ข้อความ').fill('สวัสดีค่ะ ส่งรูปลายมาได้เลยนะคะ')
await p.locator('.ib-composer button[type=submit]').click()
await p.waitForFunction(() => document.querySelector('.ib-botbar')?.innerText.includes('บอทหยุดในแชทนี้'))
check(true, 'พนักงานตอบ → บอทหยุดเองในแชทนั้น')
await say('B4', 'ราคาเท่าไหร่คะ')
await sleep(1200)
check(!(await line()).replies.some(x => x.replyToken === 'rt-B4'), 'หลังพนักงานรับแชท บอทไม่แทรก')
await p.getByRole('button', { name: 'ให้บอทดูแลต่อ' }).click()
await p.waitForFunction(() => document.querySelector('.ib-botbar')?.innerText.includes('บอทดูแลแชทนี้อยู่'))
check(true, 'เปิดบอทกลับให้แชทนี้ได้')
await p.screenshot({ path: OUT + '/bot-chat.png' })

// postback buttons work end to end
await hook({ destination: 'U-bot', events: [{ type: 'postback', webhookEventId: 'B5', timestamp: Date.now(), source: { type: 'user', userId: 'U-bot-cust' }, replyToken: 'rt-B5', postback: { data: 'ระยะเวลาผลิต|bot:rule:r2' } }] })
r = await lastReplyFor('rt-B5')
check(r && r.messages[0].text.includes('7–14 วัน'), 'ลูกค้ากดปุ่มเมนู → บอทตอบหัวข้อนั้น')
check((await dbs()).messages.some(m => m.text === '👆 ระยะเวลาผลิต'), 'บันทึกว่าลูกค้ากดปุ่มอะไร')

await fetch(DB + '/__role?r=sales')
console.log('errors:', errors)
if (errors.length) process.exitCode = 1
await br.close()
