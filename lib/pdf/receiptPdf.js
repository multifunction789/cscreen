// Receipt PDF (A4, green) with @react-pdf/renderer — server only.
// Made only for a receipt accounting has confirmed (paid, not voided).
import { createElement as h } from 'react'
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { prepareThai as T } from './thaiText.mjs'
import { setupFonts, loadLogo } from './quotationPdf.js'
import { money, thaiBahtText, thaiDate } from '../docs/quotation.js'

const GREEN = '#047857', DARK = '#064E3B', LIGHT = '#ECFDF5', MID = '#D1FAE5', LINE = '#E5E7EB', GREY = '#6B7280'
const s = StyleSheet.create({
  page: { fontFamily: 'Sarabun', fontSize: 10, color: '#111827', paddingTop: 22, paddingBottom: 36 },
  stripe: { position: 'absolute', top: 0, left: 0, right: 0, height: 6, backgroundColor: GREEN },
  body: { paddingHorizontal: 28 },
  head: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 10, borderBottomWidth: 1.5, borderBottomColor: LINE },
  brand: { flexDirection: 'row', width: '64%' },
  logo: { width: 52, height: 70, objectFit: 'contain', marginRight: 10 },
  shopName: { fontWeight: 'bold', fontSize: 12 },
  small: { fontSize: 8.5, color: '#374151', lineHeight: 1.5 },
  docTitle: { fontSize: 22, fontWeight: 'bold', color: GREEN, textAlign: 'right' },
  docSub: { fontSize: 8.5, color: GREY, textAlign: 'right', letterSpacing: 2 },
  boxes: { flexDirection: 'row', marginTop: 10 },
  box: { borderWidth: 1, borderColor: LINE, borderRadius: 6 },
  boxHead: { backgroundColor: LIGHT, paddingVertical: 4, paddingHorizontal: 9, fontSize: 9, fontWeight: 'bold', color: DARK, borderBottomWidth: 1, borderBottomColor: LINE },
  boxBody: { paddingVertical: 6, paddingHorizontal: 9 },
  kv: { flexDirection: 'row', marginVertical: 1 },
  k: { width: 74, color: GREY },
  v: { flexGrow: 1, flexShrink: 1, flexBasis: 0, fontWeight: 'bold' },
  table: { marginTop: 10, borderWidth: 1, borderColor: LINE, borderRadius: 6 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#EEF0F3', minHeight: 22, alignItems: 'stretch' },
  th: { backgroundColor: GREEN, color: '#fff', fontWeight: 'bold', fontSize: 9.5 },
  c1: { width: 26, padding: 5, textAlign: 'center' },
  c2: { flex: 1, padding: 5 },
  c3: { width: 110, padding: 5, textAlign: 'right' },
  words: { marginTop: 8, backgroundColor: LIGHT, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10, flexDirection: 'row' },
  bottom: { flexDirection: 'row', marginTop: 8 },
  notes: { flex: 1, borderWidth: 1, borderStyle: 'dashed', borderColor: '#CBD5E1', borderRadius: 6, padding: 8, marginRight: 8, fontSize: 9, lineHeight: 1.6 },
  totals: { width: 210, borderWidth: 1, borderColor: LINE, borderRadius: 6 },
  tRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: 9, borderBottomWidth: 0.5, borderBottomColor: '#EEF0F3' },
  grand: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, paddingHorizontal: 9, backgroundColor: MID, color: DARK, fontWeight: 'bold', fontSize: 12.5 },
  stamp: { marginTop: 10, alignSelf: 'flex-start', borderWidth: 1.5, borderColor: GREEN, color: GREEN, borderRadius: 4, paddingVertical: 2, paddingHorizontal: 8, fontWeight: 'bold', fontSize: 11 },
  sign: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 26 },
  signBox: { width: '40%', alignItems: 'center' },
  signName: { fontSize: 9.5, textAlign: 'center', marginTop: 20 },
  signLine: { borderTopWidth: 1, borderTopColor: '#9CA3AF', width: '100%', marginTop: 2, paddingTop: 3, textAlign: 'center', fontSize: 9, color: GREY },
  footer: { position: 'absolute', bottom: 14, left: 28, right: 28, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: '#9CA3AF' },
})
const t = (style, text) => h(Text, { style, hyphenationPenalty: 10000 }, T(text))
const kv = (k, v) => v ? h(View, { style: s.kv, key: k }, t(s.k, k), t(s.v, v)) : null

/**
 * snap: { shop, customer: {name, address, tax_id, phone}, receipt: {code, document_date, total, payment_method, paid_at, bank_reference},
 *         invoice: {code, total, paid_to_date, balance}, received_by, label }
 */
function ReceiptDoc({ snap, logo }) {
  const { shop, customer: c, receipt: r, invoice: inv } = snap
  return h(Document, { title: `${r.code} ${c.name || ''}`.trim(), author: shop.name, subject: 'ใบเสร็จรับเงิน' },
    h(Page, { size: 'A4', style: s.page },
      h(View, { style: s.stripe, fixed: true }),
      h(View, { style: s.body },
        h(View, { style: s.head },
          h(View, { style: s.brand },
            logo ? h(Image, { style: s.logo, src: logo }) : null,
            h(View, { style: { flex: 1 } },
              t(s.shopName, shop.name + (shop.branch ? ` (${shop.branch})` : '')),
              t(s.small, shop.address),
              t(s.small, `เลขประจำตัวผู้เสียภาษี ${shop.taxId}`),
              t(s.small, `โทร ${shop.tel} · LINE ${shop.line}`))),
          h(View, null,
            t(s.docTitle, 'ใบเสร็จรับเงิน'),
            t(s.docSub, 'RECEIPT'),
            t({ ...s.small, textAlign: 'right', marginTop: 6 }, `เลขที่ ${r.code}`))),
        h(View, { style: s.boxes },
          h(View, { style: { ...s.box, width: '58%', marginRight: 8 } },
            t(s.boxHead, 'ได้รับเงินจาก / RECEIVED FROM'),
            h(View, { style: s.boxBody },
              kv('ชื่อ / บริษัท', c.name || '—'),
              kv('โทรศัพท์', c.phone),
              kv('ที่อยู่', c.address),
              kv('เลขภาษี', c.tax_id))),
          h(View, { style: { ...s.box, flexGrow: 1, flexBasis: 0 } },
            t(s.boxHead, 'รายละเอียดการรับเงิน'),
            h(View, { style: s.boxBody },
              kv('เลขที่', r.code),
              kv('วันที่', thaiDate(r.document_date || r.paid_at)),
              kv('อ้างอิง', inv.code),
              kv('ชำระโดย', r.payment_method),
              kv('วันที่รับเงิน', thaiDate(r.paid_at)),
              kv('เลขอ้างอิงโอน', r.bank_reference)))),
        h(View, { style: s.table },
          h(View, { style: [s.tr, s.th] }, t(s.c1, '#'), t(s.c2, 'รายการ'), t(s.c3, 'จำนวนเงิน')),
          h(View, { style: s.tr },
            t({ ...s.c1, color: '#9CA3AF' }, '1'),
            t({ ...s.c2, fontWeight: 'bold' }, `${snap.label || 'รับชำระเงิน'} ตามใบแจ้งหนี้ ${inv.code}`),
            t({ ...s.c3, fontWeight: 'bold' }, money(r.total)))),
        h(View, { style: s.words, wrap: false },
          t({ width: 90, fontWeight: 'bold', color: DARK }, 'จำนวนเงิน'),
          t({ flex: 1, color: DARK }, thaiBahtText(r.total))),
        h(View, { style: s.bottom, wrap: false },
          h(View, { style: s.notes },
            t({ fontWeight: 'bold', color: DARK, marginBottom: 2 }, 'สถานะใบแจ้งหนี้'),
            t(null, Number(inv.balance) > 0 ? `ยังคงค้างชำระ ${money(inv.balance)} บาท` : 'ชำระครบตามใบแจ้งหนี้แล้ว ขอบคุณค่ะ'),
            t({ ...s.small, marginTop: 4 }, 'เอกสารนี้ไม่ใช่ใบกำกับภาษี')),
          h(View, { style: s.totals },
            h(View, { style: s.tRow }, t({ color: GREY }, 'ยอดใบแจ้งหนี้'), t({ fontWeight: 'bold' }, money(inv.total))),
            h(View, { style: s.tRow }, t({ color: GREY }, 'รับชำระแล้วรวม'), t({ fontWeight: 'bold' }, money(inv.paid_to_date))),
            h(View, { style: s.tRow }, t({ color: GREY }, 'คงเหลือ'), t({ fontWeight: 'bold' }, money(inv.balance))),
            h(View, { style: s.grand }, t(null, 'รับเงินครั้งนี้'), t(null, money(r.total) + ' บาท')))),
        t(s.stamp, 'ได้รับเงินแล้ว / PAID'),
        h(View, { style: s.sign, wrap: false },
          h(View, { style: s.signBox }, t(s.signName, snap.received_by || ' '), t(s.signLine, 'ผู้รับเงิน')),
          h(View, { style: s.signBox }, t(s.signName, ' '), t(s.signLine, 'ผู้มีอำนาจลงนาม')))),
      h(View, { style: s.footer, fixed: true },
        t(null, `${r.code} · ${shop.name}`),
        h(Text, { render: ({ pageNumber, totalPages }) => `หน้า ${pageNumber}/${totalPages}` }))))
}

export async function renderReceiptPdf(snap) {
  setupFonts()
  return renderToBuffer(h(ReceiptDoc, { snap, logo: loadLogo(snap.shop) }))
}
