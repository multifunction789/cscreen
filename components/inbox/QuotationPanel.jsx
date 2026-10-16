'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { calcQuotation, money, thaiDate, DEFAULT_TERMS } from '@/lib/docs/quotation'
import { newClientKey } from '@/lib/inbox/model'
import { docHref } from '@/lib/docLinks'
import { notify } from '@/lib/feedback'

const blank = () => ({ desc: '', qty: '', price: '' })
const plusDays = n => { const d = new Date(Date.now() + n * 86400e3 + 7 * 3600e3); return d.toISOString().slice(0, 10) }

/** ใบเสนอราคาในแชท: create (amounts recomputed by the database) and send as a PDF card to LINE */
export default function QuotationPanel({ store, conv, onDone, onNeedCustomer }) {
  const c = conv.customer
  const summary = c ? store.customerSummary?.(c.id) : null
  const [items, setItems] = useState([blank(), blank()])
  const [discount, setDiscount] = useState('')
  const [vat, setVat] = useState(0)
  const [validUntil, setValidUntil] = useState(plusDays(15))
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(null)        // 'save' | 'send' | quotation id
  const calc = useMemo(() => calcQuotation({ items, discount, vat_pct: vat }), [items, discount, vat])
  const setItem = (i, k, v) => setItems(rows => rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))

  if (!c) return (
    <div className="ib-later">
      <p>ผูกแชทนี้กับลูกค้าก่อน ใบเสนอราคาจะได้ชื่อ ที่อยู่ และเลขภาษีของลูกค้าอัตโนมัติ</p>
      <button type="button" className="btn btn-primary" onClick={onNeedCustomer}>ค้นหา / ผูกลูกค้า</button>
    </div>
  )

  async function send(quotationId, code) {
    setBusy(quotationId)
    try {
      const res = await store.sendQuotation(conv.id, quotationId, newClientKey())
      notify.success(`ส่ง ${code}${res?.version > 1 ? ` ฉบับที่ ${res.version}` : ''} เข้าแชทแล้ว`)
      onDone()
    } catch (e) { notify.error(e.message) } finally { setBusy(null) }
  }

  async function create(andSend) {
    if (!calc.items.length) { notify.warn('ใส่รายการอย่างน้อย 1 รายการ (ชื่อ + จำนวน)'); return }
    setBusy(andSend ? 'send' : 'save')
    try {
      const q = await store.createQuotation(conv.id, { items: calc.items, discount: calc.discount, vat_pct: calc.vat_pct, valid_until: validUntil, notes })
      notify.success(`สร้าง ${q.code} แล้ว (ยอด ${money(q.total)} บาท)`)
      if (andSend) await send(q.id, q.code)
      else onDone()
    } catch (e) { notify.error(e.message) } finally { setBusy(null) }
  }

  const existing = summary?.quotations || []
  return (
    <div className="ib-form ib-quote">
      <p className="ib-hint">ลูกค้า: <b>{c.name}</b>{c.code ? ` (${c.code})` : ''} · ราคาและยอดรวมคำนวณใหม่ที่เซิร์ฟเวอร์ทุกครั้ง</p>

      <div className="ib-qitems" role="table" aria-label="รายการ">
        <div className="ib-qrow head" role="row"><span>รายการ</span><span>จำนวน</span><span>ราคา/หน่วย</span><span>รวม</span><span /></div>
        {items.map((it, i) => (
          <div key={i} className="ib-qrow" role="row">
            <input type="text" value={it.desc} onChange={e => setItem(i, 'desc', e.target.value)} placeholder="เช่น เสื้อยืด Cotton สกรีน 2 สี" aria-label={`รายการที่ ${i + 1}`} />
            <input type="number" min="0" inputMode="numeric" value={it.qty} onChange={e => setItem(i, 'qty', e.target.value)} aria-label={`จำนวน รายการที่ ${i + 1}`} placeholder="จำนวน" />
            <input type="number" min="0" step="0.5" inputMode="decimal" value={it.price} onChange={e => setItem(i, 'price', e.target.value)} aria-label={`ราคา รายการที่ ${i + 1}`} placeholder="ราคา/หน่วย" />
            <span className="ib-qamt">{money((Number(it.qty) || 0) * (Number(it.price) || 0))}</span>
            <button type="button" className="ib-icon" aria-label={`ลบรายการที่ ${i + 1}`} onClick={() => setItems(r => r.length > 1 ? r.filter((_, j) => j !== i) : [blank()])}>✕</button>
          </div>
        ))}
        <button type="button" className="ib-link" onClick={() => setItems(r => [...r, blank()])}>+ เพิ่มรายการ</button>
      </div>

      <div className="ib-qopts">
        <label>ส่วนลด (บาท)<input type="number" min="0" value={discount} onChange={e => setDiscount(e.target.value)} /></label>
        <label>VAT<select value={vat} onChange={e => setVat(Number(e.target.value))}><option value={0}>ไม่มี VAT</option><option value={7}>VAT 7%</option></select></label>
        <label>ใช้ได้ถึง<input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} /></label>
      </div>
      <label>หมายเหตุ / เงื่อนไข<textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder={DEFAULT_TERMS} /></label>

      <dl className="ib-qtotal">
        <dt>รวมเป็นเงิน</dt><dd>{money(calc.subtotal)}</dd>
        {calc.discount > 0 && <><dt>ส่วนลด</dt><dd>-{money(calc.discount)}</dd></>}
        {calc.vat_pct > 0 && <><dt>VAT 7%</dt><dd>{money(calc.vat_amount)}</dd></>}
        <dt className="grand">ยอดสุทธิ</dt><dd className="grand">{money(calc.total)} บาท</dd>
      </dl>
      <div className="ib-row-btns">
        <button type="button" className="btn btn-outline" disabled={!!busy} onClick={() => create(false)}>{busy === 'save' ? 'กำลังบันทึก…' : 'บันทึกเป็นร่าง'}</button>
        <button type="button" className="btn btn-primary" disabled={!!busy || !store.canSend(conv.platform)} onClick={() => create(true)}>{busy === 'send' ? 'กำลังส่ง…' : 'บันทึกและส่งให้ลูกค้า'}</button>
      </div>

      {existing.length > 0 && (
        <div className="ib-qlist">
          <b className="ib-small">ใบเสนอราคาของลูกค้านี้</b>
          {existing.slice(0, 6).map(q => (
            <div key={q.id} className="ib-qline">
              <Link href={docHref('quotation', q.id)}><b>{q.code}</b></Link>
              <span className="ib-small">{money(q.total)} · {q.status || ''}{q.sent_at ? ` · ส่งแล้ว ${thaiDate(q.sent_at)}` : ''}</span>
              <button type="button" className="btn btn-outline btn-sm" disabled={!!busy || !store.canSend(conv.platform)} onClick={() => send(q.id, q.code)}>
                {busy === q.id ? 'กำลังส่ง…' : q.sent_at ? 'ส่งอีกครั้ง' : 'ส่งเข้าแชท'}
              </button>
            </div>
          ))}
          <p className="ib-hint">แก้ไซซ์ / รายละเอียดการผลิตได้ที่ <Link href="/quotation">หน้าใบเสนอราคา</Link> — ส่งอีกครั้งหลังแก้ ลูกค้าจะได้ฉบับใหม่ (ฉบับเดิมไม่เปลี่ยน)</p>
        </div>
      )}
    </div>
  )
}
