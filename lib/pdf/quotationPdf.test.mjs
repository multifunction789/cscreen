// node lib/pdf/quotationPdf.test.mjs (run from the project root) — renders a real A4 quotation
import assert from 'node:assert/strict'
import { renderQuotationPdf } from './quotationPdf.js'
import { calcQuotation, DEFAULT_TERMS } from '../docs/quotation.js'
import { SHOP } from '../shop.js'

const many = Array.from({ length: 28 }, (_, i) => ({ desc: `เสื้อรุ่นที่ ${i + 1} ผ้าจูติ สีกรม ปักอกซ้าย ทำงานรุ่นผู้ใหญ่`, qty: 10 + i, price: 189 }))
for (const [label, items] of [['short', [{ desc: 'เสื้อยืด', qty: 50, price: 120 }]], ['multi-page', many]]) {
  const calc = calcQuotation({ items, discount: 100, vat_pct: 7 })
  const pdf = await renderQuotationPdf({ version: 1, shop: SHOP, prepared_by: 'ทดสอบ', terms: DEFAULT_TERMS,
    customer: { name: 'ลูกค้าทดสอบ', phone: '0800000000', address: 'กรุงเทพ' },
    quotation: { code: 'QT-9999', document_date: '2026-10-17', valid_until: '2026-11-01', ...calc } })
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-', label)
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length
  assert.ok(label === 'short' ? pages === 1 : pages >= 2, `${label}: ${pages} pages`)
}
console.log('quotation pdf ok')
