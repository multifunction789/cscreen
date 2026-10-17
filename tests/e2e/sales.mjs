// e2e phase 9: งานขาย board / table / my tasks + แดชบอร์ดการขาย (mock Supabase on :54321)
import { chromium } from 'playwright'
import crypto from 'node:crypto'
const B = 'http://localhost:3100', DB = 'http://localhost:54321'
const OUT = process.argv[2]
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1 }
const sign = body => crypto.createHmac('sha256', 'test-secret').update(body).digest('base64')
const hook = obj => { const body = JSON.stringify(obj); return fetch(B + '/api/channels/line', { method: 'POST', headers: { 'content-type': 'application/json', 'x-line-signature': sign(body) }, body }) }
const say = (id, text, user) => hook({ destination: 'U-bot', events: [{ type: 'message', webhookEventId: id, timestamp: Date.now(), source: { type: 'user', userId: user }, replyToken: 'rt-' + id, message: { id: 'm-' + id, type: 'text', text } }] })
const dbs = () => fetch(DB + '/__db').then(r => r.json())
const role = r => fetch(DB + '/__role?r=' + r)
const insert = (table, row) => fetch(DB + '/__insert', { method: 'POST', body: JSON.stringify({ table, row }) })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(200) } return false }
const ago = h => new Date(Date.now() - h * 3600e3).toISOString()
const ME = '11111111-1111-1111-1111-111111111111'
const deal = id => dbs().then(d => d.deals.find(x => x.id === id))
// HTML5 drag & drop with a real DataTransfer (Playwright's mouse drag scrolls the board mid-drag)
async function drag(src, dst) {
  const target = await dst.elementHandle()
  await src.evaluate((s, t) => {
    const dt = new DataTransfer()
    s.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }))
    t.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }))
    t.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
    s.dispatchEvent(new DragEvent('dragend', { dataTransfer: dt, bubbles: true }))
  }, target)
}

await role('sales')
await say('S1', 'ขอราคาเสื้อกีฬาสีค่ะ', 'U-sales')
await sleep(800)
let d = await dbs()
const conv = d.conversations.find(c => c.identity_id === d.contact_identities.find(i => i.external_id === 'U-sales').id)
await fetch(`${DB}/rest/v1/conversations?id=eq.${conv.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bot_active: false, assigned_to: ME, customer_id: 'c1' }) })
await insert('deals', { id: 'd1', title: 'เสื้อกีฬาสี 300 ตัว', stage: 'New Lead', value: 9000, owner: ME, conversation_id: conv.id, customer_id: 'c1', stage_changed_at: ago(72), updated_at: ago(1), created_at: ago(72) })
await insert('deals', { id: 'd2', stage: 'Quotation Sent', value: 6420, owner: 'u-2', customer_id: 'c1', quotation_id: null, follow_up_at: ago(2), stage_changed_at: ago(5), updated_at: ago(2), created_at: ago(30) })
await insert('deals', { id: 'd3', title: 'งานเก่าปิดแล้ว', stage: 'Completed', value: 1000, owner: ME, stage_changed_at: ago(200), updated_at: ago(200), created_at: ago(300) })

const errors = []
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
p.on('pageerror', e => errors.push('pageerror @' + p.url() + ': ' + e.message.slice(0, 120)))
p.on('console', m => { if (m.type() === 'error' && !/favicon|404|WebSocket|realtime|400 \(Bad Request\)/.test(m.text())) errors.push('console: ' + m.text()) })
await p.goto(B + '/login')
await p.fill('input[type=email]', 'staff@cscreen.test'); await p.fill('input[type=password]', 'correct-horse')
await p.click('button[type=submit]'); await p.waitForURL(/dashboard/)

// ── board
await p.goto(B + '/sales'); await p.waitForSelector('.sb-board')
const nav = await p.locator('nav').innerText()
check(nav.includes('งานขาย') && nav.includes('แดชบอร์ดการขาย'), 'มีเมนูงานขาย + แดชบอร์ดการขาย')
const col = name => p.locator('.sb-col', { has: p.locator('header b', { hasText: new RegExp('^' + name + '$') }) })
check(await col('ลูกค้าใหม่').locator('.sb-card', { hasText: 'เสื้อกีฬาสี' }).count() === 1, 'การ์ดอยู่คอลัมน์ตามขั้นตอน')
check((await col('ลูกค้าใหม่').locator('.sb-card').innerText()).includes('ค้าง 3 วัน'), 'แจ้งงานค้างนาน')
check((await col('ส่งใบเสนอราคาแล้ว').locator('.sb-card').innerText()).includes('เลยเวลาติดตาม'), 'แจ้งเลยเวลาติดตาม')
check(await p.locator('.sb-card', { hasText: 'งานเก่าปิดแล้ว' }).count() === 0, 'งานที่ปิดแล้วซ่อนไว้')
await p.getByLabel('แสดงที่ปิดแล้ว').check()
check(await col('ปิดงาน').locator('.sb-card', { hasText: 'งานเก่าปิดแล้ว' }).count() === 1, 'ติ๊กแล้วเห็นงานที่ปิด')
await p.getByLabel('แสดงที่ปิดแล้ว').uncheck()
check((await p.locator('.pay-intro').first().innerText()).includes('15,420.00'), 'มูลค่างานที่เปิดอยู่รวมถูก')
if (OUT) await p.screenshot({ path: OUT + '/sales-board.png' })

// drag → stage changes and is logged
await drag(col('ลูกค้าใหม่').locator('.sb-card').first(), col('ลูกค้ายืนยัน'))
check(await until(async () => (await deal('d1')).stage === 'Confirmed'), 'ลากการ์ด → เปลี่ยนขั้นตอนในฐานข้อมูล')
check((await dbs()).deal_stage_history.some(h => h.deal_id === 'd1' && h.to_stage === 'Confirmed'), 'เก็บประวัติการย้ายขั้นตอน')

// drag to lost → must give a reason
await drag(col('ส่งใบเสนอราคาแล้ว').locator('.sb-card').first(), col('ยกเลิก / ปิดการขายไม่ได้'))
await p.waitForSelector('.sb-drawer')
check(await p.locator('.sb-drawer select').first().inputValue() === 'Cancelled / Lost' && await p.getByLabel('เหตุผลที่ปิดการขายไม่ได้').isVisible(), 'ลากไปปิดไม่ได้ → เปิดฟอร์มให้ใส่เหตุผล')
check((await deal('d2')).stage === 'Quotation Sent', 'ยังไม่ย้ายจนกว่าจะใส่เหตุผล')
await p.getByLabel('เหตุผลที่ปิดการขายไม่ได้').fill('ราคาสูงกว่าเจ้าอื่น')
await p.locator('.sb-drawer').getByRole('button', { name: 'บันทึก' }).click()
check(await until(async () => (await deal('d2')).stage === 'Cancelled / Lost' && (await deal('d2')).lost_reason === 'ราคาสูงกว่าเจ้าอื่น'), 'ปิดไม่ได้ + เหตุผล บันทึกแล้ว')

// drawer: follow-up + next action
await p.getByLabel('แสดงที่ปิดแล้ว').check()
await p.locator('.sb-card', { hasText: 'เสื้อกีฬาสี' }).click()
await p.waitForSelector('.sb-drawer')
check((await p.locator('.sb-history').innerText()).includes('ลูกค้ายืนยัน'), 'รายละเอียดแสดงประวัติขั้นตอน')
await p.getByRole('button', { name: '+ เตือนพรุ่งนี้ 10:00' }).click()
await p.getByLabel('สิ่งที่ต้องทำต่อ').fill('โทรถามไซซ์')
await p.locator('.sb-drawer').getByRole('button', { name: 'บันทึก' }).click()
check(await until(async () => { const x = await deal('d1'); return x.next_action === 'โทรถามไซซ์' && /T03:00:00/.test(x.follow_up_at || '') }), 'ตั้งเตือนติดตาม (พรุ่งนี้ 10:00 น. เวลาไทย) + สิ่งที่ต้องทำต่อ')
await p.getByLabel('แสดงที่ปิดแล้ว').uncheck()

// ── table + filter
await p.getByRole('tab', { name: 'ตาราง' }).click(); await p.waitForSelector('.sb-table')
check(p.url().includes('view=table') && await p.locator('.sb-table tbody tr').count() === 3, 'ตารางแสดงทุกงาน')
await p.getByRole('button', { name: /^มูลค่า/ }).click()
check((await p.locator('.sb-table tbody tr').first().innerText()).includes('เสื้อกีฬาสี'), 'เรียงตามมูลค่าได้')
await p.getByLabel('ผู้ดูแล').selectOption({ label: 'ของฉัน' })
check(await p.locator('.sb-table tbody tr').count() === 2, 'กรองเฉพาะงานของฉัน')
await p.getByLabel('ค้นหางานขาย').fill('กีฬา')
check(await p.locator('.sb-table tbody tr').count() === 1, 'ค้นหาได้')

// ── my tasks
await p.getByRole('tab', { name: /งานของฉัน/ }).click(); await p.waitForSelector('.sb-tasks, .sb-emptycard')
const tasks = await p.locator('.sb-tasks').innerText()
check(tasks.includes('ลูกค้ารอคำตอบ') && tasks.includes('โทรถามไซซ์'), 'งานของฉัน: แชทที่ลูกค้ารอ + งานที่ต้องติดตาม')
check(await p.locator('.sb-task', { hasText: 'ลูกค้ารอคำตอบ' }).getByRole('link', { name: 'เปิดแชท' }).getAttribute('href') === `/inbox?c=${conv.id}`, 'กดไปแชทได้ทันที')
if (OUT) await p.screenshot({ path: OUT + '/sales-mine.png' })

// ── new deal
await p.goto(B + '/sales'); await p.waitForSelector('.sb-board')
await p.getByRole('button', { name: '+ งานขายใหม่' }).click(); await p.waitForSelector('.sb-drawer')
await p.waitForFunction(() => document.querySelectorAll('.sb-drawer select option').length > 1)
await p.locator('.sb-drawer select').first().selectOption('c1')
await p.getByLabel('ชื่องาน (ถ้ามี)').fill('เสื้อโปโลบริษัท')
await p.getByLabel('มูลค่า (บาท)').fill('25000')
await p.locator('.sb-drawer').getByRole('button', { name: 'บันทึก' }).click()
check(await until(async () => (await dbs()).deals.some(x => x.title === 'เสื้อโปโลบริษัท' && x.value === 25000 && x.owner === ME && x.customer_id === 'c1')), 'เพิ่มงานขายใหม่ (ผู้ดูแล = ฉัน)')
check(await until(async () => await col('ลูกค้าใหม่').locator('.sb-card', { hasText: 'เสื้อโปโลบริษัท' }).count() === 1), 'งานใหม่ขึ้นบอร์ดทันที')

// ── read-only roles
await role('designer')
await p.reload(); await p.waitForSelector('.sb-board')
check(await p.getByRole('button', { name: '+ งานขายใหม่' }).count() === 0 && await p.locator('.sb-card[draggable="true"]').count() === 0, 'ฝ่ายออกแบบดูได้อย่างเดียว')

// ── dashboard
await role('owner')
await p.goto(B + '/sales/dashboard'); await p.waitForSelector('.sd-kpis')
const kpi = await p.locator('.sd-kpis').innerText()
check(kpi.includes('12 นาที') && kpi.includes('67%') && kpi.includes('15,000.00'), 'แดชบอร์ด: เวลาตอบ / ปิดการขาย / เงินเข้า')
check(await p.locator('.sd-sec table tbody tr').count() === 2 && (await p.locator('.sd-sec table').innerText()).includes('มุก'), 'ตารางรายคน (เจ้าของเห็นทุกคน)')
check((await p.locator('.sd-sec', { hasText: 'เหตุผลที่ปิดการขายไม่ได้' }).innerText()).includes('ราคาสูงกว่าเจ้าอื่น'), 'แสดงเหตุผลที่แพ้')
let calls = (await fetch(DB + '/__dash').then(r => r.json())).calls
const first = calls.at(-1)
check(Date.parse(first.p_to) - Date.parse(first.p_from) === 30 * 864e5, 'ค่าเริ่มต้น 30 วัน')
await p.getByRole('tab', { name: 'วันนี้' }).click()
check(await until(async () => { calls = (await fetch(DB + '/__dash').then(r => r.json())).calls; const c = calls.at(-1); return Date.parse(c.p_to) - Date.parse(c.p_from) === 864e5 }), 'เปลี่ยนช่วงเวลา → คำนวณใหม่')
if (OUT) await p.screenshot({ path: OUT + '/sales-dashboard.png', fullPage: true })
await role('sales')
await p.reload(); await p.waitForSelector('.sd-kpis')
check(await p.locator('.sd-sec table tbody tr').count() === 1 && (await p.locator('.sd-page').innerText()).includes('แสดงเฉพาะของคุณ'), 'ฝ่ายขายเห็นตารางเฉพาะของตัวเอง')

// mobile layout
await p.setViewportSize({ width: 390, height: 844 })
await p.goto(B + '/sales'); await p.waitForSelector('.sb-board')
check(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'มือถือ: หน้าไม่ล้นแนวนอน (บอร์ดเลื่อนในกรอบ)')
if (OUT) await p.screenshot({ path: OUT + '/sales-mobile.png' })

console.log('errors:', errors)
if (errors.length) process.exitCode = 1
await br.close()
