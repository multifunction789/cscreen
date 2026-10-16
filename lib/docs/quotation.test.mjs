// node lib/docs/quotation.test.mjs
import assert from 'node:assert/strict'
import { calcQuotation, thaiBahtText, thaiDate, money } from './quotation.js'

let q = calcQuotation({ items: [{ desc: 'เสื้อยืด', qty: 50, price: 120 }, { desc: 'ค่าบล็อก', qty: 1, price: 500 }, { desc: '', qty: 3, price: 9 }, { desc: 'x', qty: 0, price: 9 }] })
assert.equal(q.items.length, 2, 'blank / zero rows dropped')
assert.deepEqual([q.subtotal, q.discount, q.vat_amount, q.total], [6500, 0, 0, 6500])
q = calcQuotation({ items: [{ desc: 'โปโล', qty: 30, price: 249.5 }], discount: 485, vat_pct: 7 })
assert.equal(q.subtotal, 7485); assert.equal(q.discount, 485); assert.equal(q.vat_amount, 490); assert.equal(q.total, 7490)
assert.equal(calcQuotation({ items: [{ desc: 'a', qty: 1, price: 100 }], discount: 999 }).total, 0, 'discount never makes it negative')
assert.equal(calcQuotation({ items: [{ desc: 'a', qty: 1, price: 100 }], vat_pct: 10 }).vat_pct, 0, 'only 0 or 7 % VAT')
assert.equal(calcQuotation({ items: [{ desc: 'a', qty: 3, price: 33.333 }] }).total, 99.99)

assert.equal(thaiBahtText(0), 'ศูนย์บาทถ้วน')
assert.equal(thaiBahtText(21), 'ยี่สิบเอ็ดบาทถ้วน')
assert.equal(thaiBahtText(101), 'หนึ่งร้อยเอ็ดบาทถ้วน')
assert.equal(thaiBahtText(7490), 'เจ็ดพันสี่ร้อยเก้าสิบบาทถ้วน')
assert.equal(thaiBahtText(1234.5), 'หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์')
assert.equal(thaiBahtText(2_011_000), 'สองล้านหนึ่งหมื่นหนึ่งพันบาทถ้วน')
assert.equal(thaiDate('2026-10-17'), '17/10/2569')
assert.equal(money(1234.5), '1,234.50')
console.log('quotation ok')
