// Quotation PDF (A4) with @react-pdf/renderer — server only.
// Built from a quotation_versions snapshot, so a sent PDF never changes.
// Plain createElement (no JSX) so tests can run it with node directly.
import { createElement as h } from 'react'
import { Document, Page, View, Text, Image, Font, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import path from 'node:path'
import fs from 'node:fs'
import { prepareThai as T, PDF_HYPHENATION } from './thaiText.mjs'
import { money, thaiBahtText, thaiDate } from '../docs/quotation.js'

const ROOT = process.cwd()
let fontsReady = false
function setupFonts() {
  if (fontsReady) return
  Font.register({ family: 'Sarabun', fonts: [
    { src: path.join(ROOT, 'assets/fonts/Sarabun-Regular.ttf') },
    { src: path.join(ROOT, 'assets/fonts/Sarabun-Bold.ttf'), fontWeight: 'bold' },
  ] })
  Font.registerHyphenationCallback(PDF_HYPHENATION)
  fontsReady = true
}

const BLUE = '#1D4ED8', DARK = '#1e3a8a', LIGHT = '#EFF6FF', MID = '#DBEAFE', LINE = '#E5E7EB', GREY = '#6B7280'
const s = StyleSheet.create({
  page: { fontFamily: 'Sarabun', fontSize: 10, color: '#111827', paddingTop: 22, paddingBottom: 36, paddingHorizontal: 0 },
  stripe: { position: 'absolute', top: 0, left: 0, right: 0, height: 6, backgroundColor: BLUE },
  body: { paddingHorizontal: 28 },
  head: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 10, borderBottomWidth: 1.5, borderBottomColor: LINE },
  brand: { flexDirection: 'row', width: '64%' },
  logo: { width: 52, height: 70, objectFit: 'contain', marginRight: 10 },
  shopName: { fontWeight: 'bold', fontSize: 12 },
  small: { fontSize: 8.5, color: '#374151', lineHeight: 1.5 },
  docTitle: { fontSize: 22, fontWeight: 'bold', color: BLUE, textAlign: 'right' },
  docSub: { fontSize: 8.5, color: GREY, textAlign: 'right', letterSpacing: 2 },
  boxes: { flexDirection: 'row', marginTop: 10 },
  box: { borderWidth: 1, borderColor: LINE, borderRadius: 6, flexGrow: 1 },
  boxHead: { backgroundColor: LIGHT, paddingVertical: 4, paddingHorizontal: 9, fontSize: 9, fontWeight: 'bold', color: DARK, borderBottomWidth: 1, borderBottomColor: LINE },
  boxBody: { paddingVertical: 6, paddingHorizontal: 9 },
  kv: { flexDirection: 'row', marginVertical: 1 },
  k: { width: 66, color: GREY },
  v: { flexGrow: 1, flexShrink: 1, flexBasis: 0, fontWeight: 'bold' },
  table: { marginTop: 10, borderWidth: 1, borderColor: LINE, borderRadius: 6 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#EEF0F3', minHeight: 20, alignItems: 'stretch' },
  th: { backgroundColor: BLUE, color: '#fff', fontWeight: 'bold', fontSize: 9.5 },
  c1: { width: 26, padding: 5, textAlign: 'center' },
  c2: { flex: 1, padding: 5 },
  c3: { width: 50, padding: 5, textAlign: 'center' },
  c4: { width: 74, padding: 5, textAlign: 'right' },
  c5: { width: 84, padding: 5, textAlign: 'right' },
  words: { marginTop: 8, backgroundColor: LIGHT, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10, flexDirection: 'row' },
  bottom: { flexDirection: 'row', marginTop: 8 },
  notes: { flex: 1, borderWidth: 1, borderStyle: 'dashed', borderColor: '#CBD5E1', borderRadius: 6, padding: 8, marginRight: 8, fontSize: 9, lineHeight: 1.6 },
  totals: { width: 200, borderWidth: 1, borderColor: LINE, borderRadius: 6 },
  tRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: 9, borderBottomWidth: 0.5, borderBottomColor: '#EEF0F3' },
  grand: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, paddingHorizontal: 9, backgroundColor: MID, color: DARK, fontWeight: 'bold', fontSize: 12.5 },
  sign: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 26 },
  signBox: { width: '40%', alignItems: 'center' },
  signLine: { borderTopWidth: 1, borderTopColor: '#9CA3AF', width: '100%', marginTop: 34, paddingTop: 3, textAlign: 'center', fontSize: 9, color: GREY },
  footer: { position: 'absolute', bottom: 14, left: 28, right: 28, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: '#9CA3AF' },
})

// hyphenationPenalty = infinity: Thai lines break only between words, never with a '-'
const t = (style, text) => h(Text, { style, hyphenationPenalty: 10000 }, T(text))
const kv = (k, v) => v ? h(View, { style: s.kv, key: k }, t(s.k, k), t(s.v, v)) : null

function QuotationDoc({ snap, logo }) {
  const { shop, customer: c, quotation: q } = snap
  const sizeLine = it => {
    const z = Object.entries(it.sizes || {}).filter(([k, n]) => k !== 'XXL' && Number(n) > 0)
    return z.length ? z.map(([k, n]) => `${k}:${n}`).join(' · ') : null
  }
  return h(Document, { title: `${q.code} ${c.name || ''}`.trim(), author: shop.name, subject: 'ใบเสนอราคา' },
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
            t(s.docTitle, 'ใบเสนอราคา'),
            t(s.docSub, 'QUOTATION'),
            t({ ...s.small, textAlign: 'right', marginTop: 6 }, `เลขที่ ${q.code}${snap.version > 1 ? ` (ฉบับที่ ${snap.version})` : ''}`))),
        h(View, { style: s.boxes },
          h(View, { style: { ...s.box, width: '63%', flexGrow: 0, marginRight: 8 } },
            t(s.boxHead, 'ข้อมูลลูกค้า / BILL TO'),
            h(View, { style: s.boxBody },
              kv('ชื่อ / บริษัท', c.name || '—'),
              kv('ผู้ติดต่อ', c.contact_person),
              kv('โทรศัพท์', c.phone),
              kv('ที่อยู่', c.address),
              kv('เลขภาษี', c.tax_id))),
          h(View, { style: { ...s.box, flexGrow: 1, flexBasis: 0 } },
            t(s.boxHead, 'รายละเอียดเอกสาร'),
            h(View, { style: s.boxBody },
              kv('เลขที่', q.code),
              kv('วันที่', thaiDate(q.document_date)),
              kv('ใช้ได้ถึง', q.valid_until ? thaiDate(q.valid_until) : null),
              kv('ผู้เสนอราคา', snap.prepared_by)))),
        h(View, { style: s.table },
          h(View, { style: [s.tr, s.th], fixed: true },
            t(s.c1, '#'), t(s.c2, 'รายการ / รายละเอียดงาน'), t(s.c3, 'จำนวน'), t(s.c4, 'ราคา/หน่วย'), t(s.c5, 'จำนวนเงิน')),
          ...q.items.map((it, i) => h(View, { style: [s.tr, i % 2 ? { backgroundColor: '#F7F9FF' } : null], key: i, wrap: false },
            t({ ...s.c1, color: '#9CA3AF' }, String(i + 1)),
            h(View, { style: s.c2 }, t({ fontWeight: 'bold' }, it.desc), sizeLine(it) ? t({ fontSize: 8, color: GREY }, sizeLine(it)) : null),
            t(s.c3, String(it.qty)),
            t(s.c4, money(it.price)),
            t({ ...s.c5, fontWeight: 'bold' }, money(it.amount))))),
        h(View, { style: s.words, wrap: false },
          t({ width: 90, fontWeight: 'bold', color: DARK }, 'รวมจำนวนเงิน'),
          t({ flex: 1, color: DARK }, thaiBahtText(q.total))),
        h(View, { style: s.bottom, wrap: false },
          h(View, { style: s.notes },
            t({ fontWeight: 'bold', color: DARK, marginBottom: 2 }, 'หมายเหตุ / เงื่อนไข'),
            t(null, q.notes || snap.terms)),
          h(View, { style: s.totals },
            h(View, { style: s.tRow }, t({ color: GREY }, 'รวมเป็นเงิน'), t({ fontWeight: 'bold' }, money(q.subtotal))),
            q.discount > 0 ? h(View, { style: s.tRow }, t({ color: GREY }, 'ส่วนลด'), t({ fontWeight: 'bold', color: '#DC2626' }, '-' + money(q.discount))) : null,
            q.vat_pct > 0 ? h(View, { style: s.tRow }, t({ color: GREY }, `ภาษีมูลค่าเพิ่ม ${q.vat_pct}%`), t({ fontWeight: 'bold' }, money(q.vat_amount))) : null,
            h(View, { style: s.grand }, t(null, 'ยอดสุทธิ'), t(null, money(q.total) + ' บาท')))),
        h(View, { style: s.sign, wrap: false },
          h(View, { style: s.signBox }, t(s.signLine, 'ผู้เสนอราคา')),
          h(View, { style: s.signBox }, t(s.signLine, 'ลูกค้าผู้อนุมัติ / วันที่')))),
      h(View, { style: s.footer, fixed: true },
        t(null, `${q.code}${snap.version > 1 ? ` ฉบับที่ ${snap.version}` : ''} · ${shop.name}`),
        h(Text, { render: ({ pageNumber, totalPages }) => `หน้า ${pageNumber}/${totalPages}` }))))
}

/** snapshot → PDF Buffer */
export async function renderQuotationPdf(snap) {
  setupFonts()
  let logo = null
  try { logo = { data: fs.readFileSync(path.join(ROOT, 'public', path.basename(snap.shop.logo || 'cstyle-apparel-logo.png'))), format: 'png' } } catch { /* no logo */ }
  return renderToBuffer(h(QuotationDoc, { snap, logo }))
}
