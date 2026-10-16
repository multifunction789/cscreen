import { chromium } from 'playwright'
const B = 'http://localhost:3100'
const OUT = process.argv[2]
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1 }
const errors = []
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })

async function login(ctx) {
  const p = await ctx.newPage()
  p.on('pageerror', e => errors.push('pageerror: ' + e.message))
  p.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push('console: ' + m.text()) })
  await p.goto(B + '/login')
  await p.fill('input[type=email]', 'staff@cscreen.test'); await p.fill('input[type=password]', 'correct-horse')
  await p.click('button[type=submit]'); await p.waitForURL(/dashboard/)
  return p
}
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

// ── desktop ──────────────────────────────────────────────
let ctx = await br.newContext({ viewport: { width: 1440, height: 900 } })
let p = await login(ctx)
await p.getByRole('link', { name: /แชทลูกค้า/ }).click()
await p.waitForURL(/\/inbox/)
await p.waitForSelector('.ib-item')
check(await p.locator('.ib-col').count() === 3, 'desktop: 3 คอลัมน์ (รายการ / แชท / ลูกค้า)')
check((await p.locator('.ib-banner.mock').innerText()).includes('ข้อมูลจำลอง'), 'แสดงชัดว่าเป็นข้อมูลจำลอง ไม่ได้เชื่อมต่อจริง')
check((await p.locator('.ib-items .ib-item').count()) === 5, 'รายการแชท 5 ห้อง ทุกช่องทาง')
await p.screenshot({ path: OUT + '/01-desktop.png' })

// filters + search
await p.getByRole('button', { name: 'FB', exact: true }).click()
check(await p.locator('.ib-items .ib-item').count() === 2, 'กรองช่องทาง Facebook')
await p.getByRole('button', { name: 'ทั้งหมด', exact: true }).click()
await p.getByLabel('ผู้รับผิดชอบ').first().selectOption('none')
check(await p.locator('.ib-items .ib-item').count() === 2, 'กรอง: ยังไม่มีคนรับ')
await p.getByLabel('ผู้รับผิดชอบ').first().selectOption('all')
await p.getByLabel('ค้นหาแชท').fill('089-111')
check(await p.locator('.ib-items .ib-item').count() === 1 && (await p.locator('.ib-items').innerText()).includes('ทีมฟุตบอล'), 'ค้นหาด้วยเบอร์โทร')
await p.getByLabel('ค้นหาแชท').fill('ไซส์ชาร์ต')
check((await p.locator('.ib-items').innerText()).includes('บริษัท ตัวอย่าง'), 'ค้นหาด้วยเนื้อหาข้อความ')
await p.getByLabel('ค้นหาแชท').fill('')

// open FB chat: 24h window banner + bot label
await p.locator('.ib-item', { hasText: 'คุณเอ' }).click()
check(/ตอบได้อีก \d+ ชม\./.test(await p.locator('.ib-banners').innerText()), 'Messenger: แสดงเวลาที่เหลือในหน้าต่าง 24 ชม.')
check(await p.locator('.ib-msg .ib-bot').count() >= 1, 'ข้อความจากบอทมีป้าย "บอท"')
check(!(await p.locator('.ib-item', { hasText: 'คุณเอ' }).getAttribute('class')).includes('unread'), 'เปิดแชทแล้ว = อ่านแล้ว')

// send with double click → one message
const before = await p.locator('.ib-msg.out').count()
await p.getByLabel('พิมพ์ข้อความ').fill('ได้เลยครับ โปโลปัก 50 ตัว เดี๋ยวส่งราคาให้นะครับ')
await p.locator('.ib-composer button[type=submit]').dblclick()
await p.waitForTimeout(800)
check(await p.locator('.ib-msg.out').count() === before + 1, 'กดส่งซ้ำ (ดับเบิลคลิก) ได้ข้อความเดียว')
check((await p.locator('.ib-chat-head select').first().inputValue()) === 'u-me', 'ตอบแล้วรับแชทเป็นของฉันอัตโนมัติ')

// internal note
await p.getByRole('tab', { name: 'หมายเหตุภายใน' }).click()
await p.getByLabel('หมายเหตุภายใน').fill('ลูกค้าต้องการด่วน ภายในสิ้นเดือน')
await p.locator('.ib-composer button[type=submit]').click()
await p.waitForSelector('.ib-note:has-text("ด่วน ภายในสิ้นเดือน")')
check(true, 'บันทึกหมายเหตุภายใน (ลูกค้าไม่เห็น)')
await p.getByRole('tab', { name: 'ตอบลูกค้า' }).click()

// collision warning
await p.locator('.ib-demo summary').click()
await p.getByRole('button', { name: 'เพื่อนร่วมทีมตอบแชทที่เปิดอยู่' }).click()
await p.waitForSelector('.ib-typing')
check(true, 'แสดง "กำลังพิมพ์" ของเพื่อนร่วมทีม')
await p.waitForSelector('.ib-collision')
await p.getByLabel('พิมพ์ข้อความ').fill('ราคา 245 บาทครับ')
const before2 = await p.locator('.ib-msg.out').count()
await p.locator('.ib-composer button[type=submit]').click()
await p.waitForTimeout(500)
check(await p.locator('.ib-msg.out').count() === before2 && (await p.locator('.ib-collision').innerText()).includes('ยืนยัน'), 'มีคนตอบไปแล้ว → เตือนก่อน ไม่ส่งทันที')
await p.locator('.ib-composer button[type=submit]').click()
await p.waitForTimeout(800)
check(await p.locator('.ib-msg.out').count() === before2 + 1, 'กดยืนยันแล้วจึงส่ง')
await p.screenshot({ path: OUT + '/02-desktop-chat.png' })

// realtime incoming
const unreadBefore = Number((await p.locator('.ib-title .ib-count').innerText().catch(() => '0')) || 0)
await p.locator('.ib-item', { hasText: 'โรงเรียนสาธิต' }).click()
await p.getByRole('button', { name: 'ลูกค้าทักเข้ามาใหม่' }).click()
await p.waitForTimeout(300)
check((await p.locator('.ib-item', { hasText: 'คุณเอ' }).innerText()).includes('ขอราคาด่วน'), 'ข้อความใหม่ขึ้นในรายการทันที')

// create customer from chat (unlinked)
await p.locator('.ib-item', { hasText: 'คุณเอ' }).click()
await p.locator('.ib-info').getByRole('button', { name: 'สร้าง / ผูกลูกค้า' }).click()
await p.getByLabel('ชื่อลูกค้า / บริษัท').fill('ร้านตัวอย่างการ์เมนต์')
await p.getByLabel('เบอร์โทร').fill('02-000-0000')
await p.getByRole('button', { name: 'บันทึก (ข้อมูลจำลอง)' }).click()
check((await p.locator('.ib-info').innerText()).includes('ร้านตัวอย่างการ์เมนต์') && (await p.locator('.ib-chat-who').innerText()).includes('ร้านตัวอย่างการ์เมนต์'), 'สร้างลูกค้าจากแชท แล้วชื่อขึ้นทั้งหัวแชทและแผงขวา')

// slip → payment panel (pending, not paid)
await p.locator('.ib-item', { hasText: 'โรงเรียนสาธิต' }).click()
await p.getByRole('button', { name: 'บันทึกเป็นสลิป' }).click()
const sheet = await p.locator('.ib-sheet').innerText()
check(sheet.includes('slip.jpg') && sheet.includes('Pending Verification') && sheet.includes('ยังไม่ถือว่าชำระแล้ว'), 'สลิป → สถานะรอตรวจ ไม่นับเป็นเงินจริง')
await p.screenshot({ path: OUT + '/03-desktop-slip.png' })
await p.locator('.ib-sheet').getByLabel('ปิด').click()

// follow-up reminder
await p.locator('.ib-actions').getByRole('button', { name: 'ตั้งเตือน' }).click()
await p.getByLabel('วันเวลาเตือน').fill('2026-10-20T10:00')
await p.locator('.ib-sheet').getByRole('button', { name: 'ตั้งเตือน' }).click()
check((await p.locator('.ib-info').innerText()).includes('ติดตามลูกค้า') && (await p.locator('.ib-chat-head select').nth(1).inputValue()) === 'followup', 'ตั้งเตือนติดตาม → สถานะ "ต้องติดตาม"')

// LINE banner: quota + no file
check((await p.locator('.ib-banners').innerText()).includes('โควตา') && (await p.locator('.ib-banners').innerText()).includes('ส่งไฟล์ PDF ไม่ได้'), 'LINE: แสดงโควตาและข้อจำกัดส่งไฟล์')
check(await overflow(p) <= 0, 'desktop: ไม่ล้นแนวนอน')
await ctx.close()

// ── tablet ───────────────────────────────────────────────
ctx = await br.newContext({ viewport: { width: 1024, height: 768 } })
p = await login(ctx)
await p.goto(B + '/inbox'); await p.waitForSelector('.ib-item')
check(!(await p.locator('.ib-info').isVisible()), 'tablet: แผงลูกค้าซ่อนไว้')
await p.getByRole('button', { name: 'ข้อมูลลูกค้า' }).click()
check(await p.locator('.ib-info').isVisible(), 'tablet: กด ⓘ แล้วแผงลูกค้าเลื่อนออกมา')
await p.screenshot({ path: OUT + '/04-tablet.png' })
check(await overflow(p) <= 0, 'tablet: ไม่ล้นแนวนอน')
await ctx.close()

// ── mobile ───────────────────────────────────────────────
ctx = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
p = await login(ctx)
await p.goto(B + '/inbox'); await p.waitForSelector('.ib-item')
check(await p.locator('.ib-listwrap').isVisible() && !(await p.locator('.ib-chat').isVisible()), 'mobile: เริ่มที่รายการแชท')
await p.screenshot({ path: OUT + '/05-mobile-list.png' })
await p.locator('.ib-item', { hasText: 'โรงเรียนสาธิต' }).click()
check(await p.locator('.ib-chat').isVisible() && !(await p.locator('.ib-listwrap').isVisible()), 'mobile: แตะแล้วเข้าห้องแชท')
await p.screenshot({ path: OUT + '/06-mobile-chat.png' })
check(await overflow(p) <= 0, 'mobile: ไม่ล้นแนวนอน')
await p.getByRole('button', { name: 'ข้อมูลลูกค้า' }).click()
check(await p.locator('.ib-info').isVisible(), 'mobile: เปิดข้อมูลลูกค้า')
await p.screenshot({ path: OUT + '/07-mobile-info.png' })
await p.locator('.ib-info').getByLabel('ปิด').click()
await p.getByLabel('กลับไปรายการแชท').click()
check(await p.locator('.ib-listwrap').isVisible(), 'mobile: ปุ่มกลับไปรายการ')

// dark mode renders
await ctx.close()
ctx = await br.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
p = await login(ctx)
await p.goto(B + '/inbox'); await p.waitForSelector('.ib-item')
const bg = await p.locator('.ib').evaluate(el => getComputedStyle(el).backgroundColor)
check(bg === 'rgb(22, 18, 19)', 'dark mode: หน้าแชทเปลี่ยนเป็นธีมมืด')
await p.screenshot({ path: OUT + '/08-dark.png' })

console.log('errors:', errors)
if (errors.length) process.exitCode = 1
await br.close()
