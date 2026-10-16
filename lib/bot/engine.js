// Auto-reply bot (no AI). Decides what to answer from the shop's own settings only:
// Q&A rules, greeting, payment details and the "starting price" table.
// Pure functions — no network, no database — so it is easy to test and to preview
// in the settings page ("ลองพิมพ์ข้อความลูกค้า").

export const HANDOFF_COOLDOWN_H = 6
const STAFF = 'bot:staff'
const MENU = 'bot:menu'

/** lower-case, no spaces/punctuation, so "ราคา เท่าไหร่ ครับ?" ⊃ "เท่าไหร่" */
export const normalize = s => String(s || '').toLowerCase().replace(/[\s​.,!?;:'"()[\]{}\-–—~…ๆ/\\]+/g, '')

/** postback data = "<label>|<action>" (label is what the chat shows the customer tapped) */
export const postback = (label, action) => `${String(label).replace(/\|/g, '/').slice(0, 60)}|${action}`
export const actionOf = data => String(data || '').split('|').slice(1).join('|')
const btnLabel = s => (s.length > 20 ? s.slice(0, 19) + '…' : s)   // LINE limit: 20 characters
const button = (label, action) => ({ type: 'action', action: { type: 'postback', label: btnLabel(label), data: postback(label, action) } })
const baht = n => Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 })

/** best rule for a text message: longest matching keyword wins, then sort order */
export function matchRule(text, rules) {
  const t = normalize(text)
  if (!t) return null
  let best = null, bestLen = 0
  for (const r of rules || []) {
    if (!r.enabled) continue
    for (const k of r.keywords || []) {
      const nk = normalize(k)
      if (nk && t.includes(nk) && (nk.length > bestLen || (nk.length === bestLen && (r.sort ?? 100) < (best?.sort ?? 100)))) { best = r; bestLen = nk.length }
    }
  }
  return best
}

function menuButtons(rules) {
  const items = (rules || []).filter(r => r.enabled && r.in_menu).sort((a, b) => (a.sort ?? 100) - (b.sort ?? 100)).slice(0, 11)
    .map(r => button(r.title, `bot:rule:${r.id}`))
  return [...items, button('คุยกับพนักงาน', STAFF)]
}

const withButtons = (text, items) => ({ type: 'text', text, ...(items?.length ? { quickReply: { items: items.slice(0, 13) } } : {}) })

// ── starting price: product → technique → quantity → "ตัวละ X บาท"
const tiersFor = rows => [...new Set(rows.map(r => r.min_qty))].sort((a, b) => a - b)
export function tierLabel(min, tiers) {
  const next = tiers.find(q => q > min)
  return next ? `${min}–${next - 1} ตัว` : `${min} ตัวขึ้นไป`
}

function priceStep(prices, params, fallbackText) {
  const rows = (prices || []).filter(p => p.enabled !== false)
  if (!rows.length) {
    return { texts: [fallbackText || 'รบกวนแจ้งชนิดเสื้อ จำนวน และลาย/จุดสกรีนที่ต้องการ พนักงานจะคิดราคาให้ค่ะ'], buttons: [button('คุยกับพนักงาน', STAFF)], alert: true }
  }
  const enc = o => 'bot:price?' + new URLSearchParams(o).toString()
  const { p, t, q } = params
  if (!p) {
    const products = [...new Set(rows.map(r => r.product))].slice(0, 12)
    return { texts: ['ต้องการเสื้อแบบไหนคะ'], buttons: products.map(x => button(x, enc({ p: x }))) }
  }
  const forP = rows.filter(r => r.product === p)
  const techs = [...new Set(forP.map(r => r.technique))]
  if (!t) {
    if (techs.length === 1) return priceStep(prices, { p, t: techs[0] }, fallbackText)
    return { texts: [`${p} — ทำแบบไหนคะ`], buttons: techs.slice(0, 12).map(x => button(x, enc({ p, t: x }))) }
  }
  const forT = forP.filter(r => r.technique === t)
  const tiers = tiersFor(forT)
  if (!q) {
    return { texts: [`${p} ${t} — ประมาณกี่ตัวคะ`], buttons: tiers.slice(0, 12).map(x => button(tierLabel(x, tiers), enc({ p, t, q: x }))) }
  }
  const row = forT.find(r => r.min_qty === Number(q))
  if (!row) return { texts: ['ขออภัยค่ะ ตารางราคาเปลี่ยนแล้ว รบกวนเลือกใหม่อีกครั้งนะคะ'], buttons: [button('ขอราคา', 'bot:price?')] }
  return {
    texts: [`ราคาเริ่มต้น ${p} ${t} (${tierLabel(row.min_qty, tiers)})\nตัวละ ${baht(row.price_from)} บาท${row.note ? ` · ${row.note}` : ''}\n\n*เป็นราคาเริ่มต้นเท่านั้น ราคาจริงขึ้นกับแบบ ขนาดลาย จำนวนสี และไซซ์ พนักงานจะส่งใบเสนอราคาให้อีกครั้งค่ะ`],
    buttons: [button('ขอใบเสนอราคา', STAFF), button('ดูราคาอื่น', 'bot:price?')],
    alert: true,
  }
}

function answerRule(rule, ctx) {
  if (rule.kind === 'price') return { ...priceStep(ctx.prices, {}, rule.answer), ruleId: rule.id }
  if (rule.kind === 'payment') {
    const texts = [rule.answer, ctx.settings.payment_text].filter(Boolean)
    return { texts: texts.length ? texts : ['รบกวนรอสักครู่ พนักงานจะส่งช่องทางชำระเงินให้ค่ะ'], image: ctx.settings.qr_url || null, buttons: menuButtons(ctx.rules), ruleId: rule.id, alert: true }
  }
  if (!rule.answer) return null
  return { texts: [rule.answer], buttons: menuButtons(ctx.rules), ruleId: rule.id }
}

function handoff(ctx, forced) {
  const recent = ctx.conv.handoffAt && Date.now() - new Date(ctx.conv.handoffAt).getTime() < HANDOFF_COOLDOWN_H * 3600e3
  if (recent && !forced) return null              // say it once, then stay quiet and let staff answer
  return { texts: [ctx.settings.handoff || 'ได้รับข้อความแล้วค่ะ พนักงานจะตอบกลับโดยเร็วที่สุด'], buttons: forced ? [] : menuButtons(ctx.rules), handoff: true, alert: true }
}

/**
 * @param event { type: 'message'|'follow'|'postback', kind?, text?, data? }
 * @param ctx   { settings, rules, prices, conv: { botActive, handoffAt } }
 * @returns null (bot stays silent) or { messages: LINE messages, record: string[], ruleId?, handoff?, alert }
 *   alert=false means the bot fully answered, so staff need no push alert
 */
export function decide(event, ctx) {
  if (!ctx?.settings?.enabled) return null
  let out = null
  if (event.type === 'follow') {
    if (!ctx.settings.greeting) return null
    out = { texts: [ctx.settings.greeting], buttons: menuButtons(ctx.rules) }
  } else if (!ctx.conv?.botActive) {
    return null                                     // staff are handling this chat
  } else if (event.type === 'postback') {
    const a = actionOf(event.data)
    if (a === STAFF) out = handoff(ctx, true)
    else if (a === MENU) out = { texts: ['เลือกหัวข้อได้เลยค่ะ'], buttons: menuButtons(ctx.rules) }
    else if (a.startsWith('bot:rule:')) {
      const rule = (ctx.rules || []).find(r => r.id === a.slice(9) && r.enabled)
      out = rule ? answerRule(rule, ctx) : handoff(ctx)
    } else if (a.startsWith('bot:price?')) out = priceStep(ctx.prices, Object.fromEntries(new URLSearchParams(a.slice(10))), null)
  } else if (event.type === 'message') {
    const rule = event.kind === 'text' ? matchRule(event.text, ctx.rules) : null
    out = (rule && answerRule(rule, ctx)) || handoff(ctx)
  }
  if (!out) return null

  const messages = out.texts.slice(0, 4).map(t => ({ type: 'text', text: String(t).slice(0, 5000) }))
  if (out.image) messages.push({ type: 'image', originalContentUrl: out.image, previewImageUrl: out.image })
  const last = messages.at(-1)
  if (out.buttons?.length && last.type === 'text') Object.assign(last, withButtons(last.text, out.buttons))
  else if (out.buttons?.length) last.quickReply = { items: out.buttons.slice(0, 13) }

  const labels = (out.buttons || []).map(b => b.action.label)
  const record = out.texts.map((t, i) => (i === out.texts.length - 1 && labels.length ? `${t}\n[ปุ่ม: ${labels.join(' · ')}]` : t))
  if (out.image) record.push('[รูป QR ชำระเงิน]')
  return { messages, record, ruleId: out.ruleId || null, handoff: !!out.handoff, alert: !!out.alert }
}
