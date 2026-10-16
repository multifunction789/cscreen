// node lib/pdf/pdfImages.test.mjs [outDir] — quotation PDF → LINE-sized JPEGs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { renderQuotationPdf } from './quotationPdf.js'
import { pdfToImages } from './pdfImages.js'
import { calcQuotation, DEFAULT_TERMS } from '../docs/quotation.js'
import { SHOP } from '../shop.js'

const many = Array.from({ length: 28 }, (_, i) => ({ desc: `เสื้อรุ่นที่ ${i + 1} ผ้าจูติ สีกรม`, qty: 10 + i, price: 189 }))
for (const [label, items] of [['short', [{ desc: 'เสื้อยืด Cotton สกรีน 2 สี', qty: 50, price: 120 }, { desc: 'ค่าบล็อก', qty: 1, price: 500 }]], ['multi', many]]) {
  const calc = calcQuotation({ items, discount: 100, vat_pct: 7 })
  const pdf = await renderQuotationPdf({ version: 1, shop: SHOP, prepared_by: 'ทดสอบ', terms: DEFAULT_TERMS,
    customer: { name: 'ลูกค้าทดสอบ', phone: '0800000000', address: 'กรุงเทพ' },
    quotation: { code: 'QT-9999', document_date: '2026-10-17', valid_until: '2026-11-01', ...calc } })
  const t0 = Date.now()
  const { pages, images } = pdfToImages(pdf)
  const ms = Date.now() - t0
  assert.equal(images.length, Math.min(pages, 4), label)
  for (const im of images) {
    assert.equal(im.full.subarray(0, 2).toString('hex'), 'ffd8', 'jpeg')
    assert.ok(im.full.length < 10e6 && im.preview.length < 1e6, `${label} sizes ${im.full.length} ${im.preview.length}`)
    assert.ok(im.width >= 1200, 'sharp enough')
  }
  if (label === 'multi') assert.ok(pages >= 2)
  if (process.argv[2]) images.forEach((im, i) => fs.writeFileSync(`${process.argv[2]}/${label}-${i + 1}.jpg`, im.full))
  console.log(label, pages, 'pages', images.map(i => `${i.width}x${i.height} ${Math.round(i.full.length / 1024)}KB/${Math.round(i.preview.length / 1024)}KB`).join(' '), ms + 'ms')
}
console.log('pdf images ok')
