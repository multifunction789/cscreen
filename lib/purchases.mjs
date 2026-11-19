// หน้าจัดซื้อ — คำนวณยอด / งบ / ต้นทุนต่อ Invoice (ฟังก์ชันล้วน ทดสอบได้)
// รายจ่ายนับตาม "วันที่จ่ายเงินจริง" (paid_at) เท่านั้น · ต้นทุนต่อ Invoice นับทุกใบที่ผูกไว้ (รวมที่ยังไม่จ่าย)

export const PURPOSES = [
  { id: 'job',     icon: '🧵', label: 'งานลูกค้า',        short: 'งานลูกค้า', hint: 'ผูก INV / ใบงาน → เป็นต้นทุนของ INV' },
  { id: 'stock',   icon: '📦', label: 'เข้าสต๊อก',         short: 'เข้าสต๊อก', hint: 'เพิ่มจำนวนวัตถุดิบในสต๊อก (แทนหน้ารับสินค้าเข้า)' },
  { id: 'general', icon: '💼', label: 'ค่าใช้จ่ายทั่วไป', short: 'ทั่วไป',     hint: 'ค่าเช่า ค่าไฟ เงินเดือน โฆษณา — ไม่ผูกงาน' },
]
export const purposeOf = id => PURPOSES.find(p => p.id === id) || PURPOSES[0]

export const STATUSES = ['สั่งแล้ว', 'รับของแล้ว', 'จ่ายแล้ว']
export const PAID = 'จ่ายแล้ว'
export const PAY_METHODS = ['โอน', 'เงินสด', 'บัตรเครดิต', 'เช็ค']

/** หมวดเริ่มต้น (แก้/เพิ่มได้ในหน้าจัดซื้อ — เก็บใน settings) */
export const DEFAULT_JOB_CATEGORIES = ['DFT', 'ผ้า', 'ปัก', 'เสื้อสำเร็จ', 'สกรีน', 'Sublimation', 'ตัดเย็บ', 'ค่าส่ง', 'อื่น ๆ']
export const DEFAULT_STOCK_CATEGORIES = ['ผ้า', 'หมึก', 'ฟิล์ม', 'เสื้อเปล่า', 'อุปกรณ์', 'วัตถุดิบ']
export const DEFAULT_BUDGETS = [
  { name: 'ค่าเช่า', budget: 0 }, { name: 'ค่าไฟ / น้ำ', budget: 0 }, { name: 'เงินเดือน', budget: 0 },
  { name: 'ค่าโฆษณา', budget: 0 }, { name: 'ค่าซ่อมบำรุง', budget: 0 },
]

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0 }
const round2 = n => Math.round(n * 100) / 100

/** ยอดของใบจัดซื้อจากรายการ */
export function calcTotals({ items = [], shipping = 0, vat_pct = 0 }) {
  const lines = items.map(it => ({ ...it, amount: round2(num(it.qty) * num(it.price)) }))
  const subtotal = round2(lines.reduce((t, it) => t + it.amount, 0))
  const vat_amount = round2(subtotal * num(vat_pct) / 100)
  const total = round2(subtotal + vat_amount + num(shipping))
  return { items: lines, subtotal, vat_amount, total }
}

/** "YYYY-MM" ของวันที่ (รองรับ ISO date / timestamp) — ใช้เวลาไทย */
export function monthKey(d) {
  if (!d) return ''
  const s = String(d)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7)
  const t = new Date(s)
  if (Number.isNaN(+t)) return ''
  const bkk = new Date(t.getTime() + 7 * 3600e3)
  return bkk.toISOString().slice(0, 7)
}

export const isPaid = p => p.status === PAID && !!p.paid_at
export const paidIn = (list, month) => list.filter(p => isPaid(p) && (!month || monthKey(p.paid_at) === month))
export const sum = (list, f = p => p.total) => round2(list.reduce((t, p) => t + num(f(p)), 0))

/** สรุปการ์ดของเดือน */
export function monthSummary(list, month) {
  const paid = paidIn(list, month)
  const by = id => paid.filter(p => p.purpose === id)
  const unpaid = list.filter(p => p.status !== PAID)
  return {
    paidTotal: sum(paid), paidCount: paid.length,
    job: sum(by('job')), jobInvoices: new Set(by('job').map(invoiceOf).filter(Boolean)).size,
    stock: sum(by('stock')), stockCount: by('stock').length,
    general: sum(by('general')),
    unpaidTotal: sum(unpaid), unpaidCount: unpaid.length,
  }
}

/** ค่าใช้จ่ายทั่วไปเทียบงบของเดือน */
export function budgetUsage(list, month, budgets) {
  const paid = paidIn(list, month).filter(p => p.purpose === 'general')
  const names = [...budgets.map(b => b.name), ...paid.map(p => p.category).filter(Boolean)]
  return [...new Set(names)].map(name => {
    const budget = num(budgets.find(b => b.name === name)?.budget)
    const used = sum(paid.filter(p => (p.category || '') === name))
    return { name, budget, used, pct: budget > 0 ? Math.round(used / budget * 100) : null, over: budget > 0 && used > budget }
  })
}

/** Invoice ที่ใบจัดซื้อผูกอยู่ (ตรง หรือผ่านใบงาน) */
export const invoiceOf = p => p.invoice_id || p.job_orders?.invoice_id || null

/** ต้นทุน / กำไรต่อ Invoice: รายรับ = ใบเสร็จที่รับเงินแล้ว · ต้นทุน = ใบจัดซื้อที่ผูก INV (ทุกสถานะ) */
export function costPerInvoice(invoices, receipts, purchases) {
  return invoices.map(inv => {
    const revenue = sum(receipts.filter(r => r.paid && r.invoice_id === inv.id))
    const linked = purchases.filter(p => invoiceOf(p) === inv.id)
    const cost = sum(linked)
    const unpaid = sum(linked.filter(p => p.status !== PAID))
    const profit = round2(revenue - cost)
    return { ...inv, revenue, cost, unpaid, profit, margin: revenue > 0 ? Math.round(profit / revenue * 1000) / 10 : null, count: linked.length }
  }).filter(r => r.revenue > 0 || r.cost > 0)
}

/** รายจ่ายรายเดือน (จ่ายแล้ว) ย้อนหลัง n เดือน แยกตามประเภท */
export function monthlyExpense(list, n = 6, now = new Date()) {
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const key = d.toISOString().slice(0, 7)
    const paid = paidIn(list, key)
    out.push({ key, job: sum(paid.filter(p => p.purpose === 'job')), stock: sum(paid.filter(p => p.purpose === 'stock')), general: sum(paid.filter(p => p.purpose === 'general')) })
  }
  return out
}

/** รายจ่ายแยกหมวด (จ่ายแล้ว ในเดือน หรือทั้งหมด) */
export function expenseByCategory(list, month) {
  const map = {}
  paidIn(list, month).forEach(p => { const k = p.category || 'ไม่ระบุ'; map[k] = (map[k] || 0) + num(p.total) })
  return Object.entries(map).map(([name, total]) => ({ name, total: round2(total) })).sort((a, b) => b.total - a.total)
}
