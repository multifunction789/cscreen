// Quotation math + Thai amount words, shared by the chat form, the PDF and tests.
// Same rule as the quotation page: VAT is charged on (subtotal − discount).

const r2 = n => Math.round((Number(n) || 0) * 100) / 100

export function calcQuotation({ items = [], discount = 0, vat_pct = 0 }) {
  const rows = items
    .map(it => ({ ...it, desc: String(it.desc || '').trim(), qty: Number(it.qty) || 0, price: r2(it.price) }))
    .filter(it => it.desc && it.qty > 0)
    .map(it => ({ ...it, amount: r2(it.qty * it.price) }))
  const subtotal = r2(rows.reduce((s, it) => s + it.amount, 0))
  const disc = Math.min(r2(discount), subtotal)
  const vat = [0, 7].includes(Number(vat_pct)) ? Number(vat_pct) : 0
  const vat_amount = r2((subtotal - disc) * vat / 100)
  return { items: rows, subtotal, discount: disc, vat_pct: vat, vat_amount, total: r2(subtotal - disc + vat_amount) }
}

const ONES = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
const POS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน']
function chunk(n) {
  const s = String(n)
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const d = +s[i], p = s.length - i - 1
    if (!d) continue
    if (p === 1 && d === 1) { out += 'สิบ'; continue }
    if (p === 1 && d === 2) { out += 'ยี่สิบ'; continue }
    if (p === 0 && d === 1 && s.length > 1) { out += 'เอ็ด'; continue }
    out += ONES[d] + POS[p]
  }
  return out
}
function millions(n) {
  if (n >= 1_000_000) return millions(Math.floor(n / 1_000_000)) + 'ล้าน' + chunk(n % 1_000_000)
  return chunk(n)
}

/** 1234.5 → "หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์" */
export function thaiBahtText(amount) {
  const [b, s] = (Math.round((Number(amount) || 0) * 100) / 100).toFixed(2).split('.')
  const baht = +b, satang = +s
  let out = (baht ? millions(baht) : 'ศูนย์') + 'บาท'
  out += satang ? chunk(satang) + 'สตางค์' : 'ถ้วน'
  return out
}

export const money = n => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** DD/MM/YYYY พ.ศ. */
export function thaiDate(d) {
  if (!d) return '—'
  const x = new Date(typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T00:00:00+07:00' : d)
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(x)
  const g = t => p.find(q => q.type === t).value
  return `${g('day')}/${g('month')}/${Number(g('year')) + 543}`
}

export const DEFAULT_TERMS = 'ราคานี้มีผลถึงวันที่ระบุ · ราคาอาจเปลี่ยนตามวัสดุและจำนวนสั่งผลิต · ยืนยันสั่งผลิตและชำระมัดจำ 50% ก่อนเริ่มงาน'
