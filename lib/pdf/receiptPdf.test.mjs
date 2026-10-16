// node lib/pdf/receiptPdf.test.mjs [outDir] — renders a real receipt and its LINE picture
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { renderReceiptPdf } from './receiptPdf.js'
import { pdfToImages } from './pdfImages.js'
import { SHOP } from '../shop.js'

const pdf = await renderReceiptPdf({ shop: SHOP, received_by: 'ฝ่ายบัญชี ทดสอบ', label: 'รับชำระเงินมัดจำ',
  customer: { name: 'โรงเรียนสาธิตตัวอย่าง', phone: '081-234-5678', address: '123 ถ.ตัวอย่าง อ.เมือง จ.เชียงใหม่ 50200' },
  receipt: { code: 'REC-261001', document_date: '2026-10-17', total: 15000, payment_method: 'โอน', paid_at: '2026-10-17T09:30:00Z', bank_reference: '0123ABC' },
  invoice: { code: 'INV-0123', total: 30000, paid_to_date: 15000, balance: 15000 } })
assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
const { pages, images } = pdfToImages(pdf)
assert.equal(pages, 1)
if (process.argv[2]) fs.writeFileSync(process.argv[2] + '/receipt.jpg', images[0].full)
console.log('receipt pdf ok')
