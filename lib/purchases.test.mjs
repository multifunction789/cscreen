import assert from 'node:assert/strict'
import { calcTotals, monthKey, monthSummary, budgetUsage, costPerInvoice, monthlyExpense, expenseByCategory } from './purchases.mjs'

// totals
const t = calcTotals({ items: [{ qty: '1.2', price: '600' }, { qty: 2, price: 600 }], shipping: 50, vat_pct: 7 })
assert.equal(t.subtotal, 1920)
assert.equal(t.vat_amount, 134.4)
assert.equal(t.total, 2104.4)
assert.equal(t.items[0].amount, 720)

// month key (timestamp → Bangkok date)
assert.equal(monthKey('2026-11-19'), '2026-11')
assert.equal(monthKey('2026-10-31T18:30:00Z'), '2026-11')   // 01:30 Bangkok on 1 Nov
assert.equal(monthKey(null), '')

const P = [
  { id: 1, purpose: 'job', status: 'จ่ายแล้ว', paid_at: '2026-11-03', total: 1000, invoice_id: 'A', category: 'DFT' },
  { id: 2, purpose: 'job', status: 'รับของแล้ว', paid_at: null, total: 500, job_orders: { invoice_id: 'A' }, category: 'ปัก' },
  { id: 3, purpose: 'general', status: 'จ่ายแล้ว', paid_at: '2026-11-10', total: 6200, category: 'ค่าโฆษณา' },
  { id: 4, purpose: 'stock', status: 'จ่ายแล้ว', paid_at: '2026-10-28', total: 700, category: 'ผ้า' },
  { id: 5, purpose: 'general', status: 'จ่ายแล้ว', paid_at: '2026-11-11', total: 300, category: 'ค่ารถ' },
]
const s = monthSummary(P, '2026-11')
assert.equal(s.paidTotal, 7500)
assert.equal(s.job, 1000)
assert.equal(s.jobInvoices, 1)
assert.equal(s.stock, 0)
assert.equal(s.unpaidTotal, 500)

const b = budgetUsage(P, '2026-11', [{ name: 'ค่าโฆษณา', budget: 5000 }, { name: 'ค่าเช่า', budget: 12000 }])
assert.deepEqual(b.find(x => x.name === 'ค่าโฆษณา'), { name: 'ค่าโฆษณา', budget: 5000, used: 6200, pct: 124, over: true })
assert.equal(b.find(x => x.name === 'ค่าเช่า').used, 0)
assert.equal(b.find(x => x.name === 'ค่ารถ').pct, null)   // used without a budget still listed

const c = costPerInvoice([{ id: 'A', code: 'INV-1' }, { id: 'B', code: 'INV-2' }], [{ invoice_id: 'A', paid: true, total: 4000 }, { invoice_id: 'A', paid: false, total: 999 }], P)
assert.equal(c.length, 1)
assert.equal(c[0].revenue, 4000)
assert.equal(c[0].cost, 1500)        // via invoice_id and via job order
assert.equal(c[0].unpaid, 500)
assert.equal(c[0].margin, 62.5)

const m = monthlyExpense(P, 2, new Date('2026-11-19T00:00:00Z'))
assert.deepEqual(m.map(x => x.key), ['2026-10', '2026-11'])
assert.equal(m[0].stock, 700)
assert.equal(m[1].general, 6500)

assert.deepEqual(expenseByCategory(P, '2026-11')[0], { name: 'ค่าโฆษณา', total: 6200 })
console.log('purchases ok')
