'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { money, thaiDate } from '@/lib/docs/quotation'
import { newClientKey } from '@/lib/inbox/model'
import { notify } from '@/lib/feedback'
import MessageMedia from './MessageMedia'

const STATUS = { pending: 'รอฝ่ายบัญชีตรวจ', approved: 'รับเงินแล้ว', rejected: 'ไม่ผ่าน', voided: 'ยกเลิกแล้ว' }
const localNow = () => { const d = new Date(Date.now() + 7 * 3600e3); return d.toISOString().slice(0, 16) }

function usePaymentInfo(store, customerId) {
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!customerId) return
    let live = true
    store.paymentInfo(customerId).then(x => { if (live) { setInfo(x); setError(null) } }, e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [store, customerId, tick])
  return { info, error, reload: () => setTick(t => t + 1) }
}

function NeedCustomer({ onNeedCustomer, what }) {
  return (
    <div className="ib-later">
      <p>ผูกแชทนี้กับลูกค้าก่อน จึงจะ{what}ได้ — ระบบจะได้รู้ว่าเป็นเงินของใบแจ้งหนี้ใบไหน</p>
      <button type="button" className="btn btn-primary" onClick={onNeedCustomer}>ค้นหา / ผูกลูกค้า</button>
    </div>
  )
}

/** บันทึกสลิป: a picture from the customer is only a claim — accounting confirms before it counts as money */
export function PaymentPanel({ store, conv, slipMessage, onDone, onNeedCustomer }) {
  const c = conv.customer
  const { info, error } = usePaymentInfo(store, c?.id)
  const open = useMemo(() => (info?.balances || []).filter(b => Number(b.balance) > 0), [info])
  const [picked, setInvoiceId] = useState('')
  const [amounts, setAmounts] = useState({})        // what staff typed, per invoice
  const [transferAt, setTransferAt] = useState(localNow())
  const [bankRef, setBankRef] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  // newest open invoice by default; suggest the deposit first, otherwise what is left
  const invoiceId = picked || open[0]?.invoice_id || ''
  const inv = open.find(b => b.invoice_id === invoiceId)
  const suggested = inv ? (() => {
    const dep = Number(inv.deposit_amount) || (Number(inv.deposit_pct) ? Math.round(inv.total * inv.deposit_pct) / 100 : 0)
    return String(Number(inv.paid) === 0 && dep > 0 && dep < inv.balance ? dep : inv.balance)
  })() : ''
  const amount = amounts[invoiceId] ?? suggested
  const setAmount = v => setAmounts(a => ({ ...a, [invoiceId]: v }))

  if (!c) return <NeedCustomer onNeedCustomer={onNeedCustomer} what="บันทึกสลิป" />
  if (error) return <p className="ib-hint">โหลดข้อมูลใบแจ้งหนี้ไม่สำเร็จ: {error}</p>
  if (!info) return <p className="ib-hint">กำลังโหลดใบแจ้งหนี้…</p>

  async function submit(e) {
    e.preventDefault()
    if (!inv) { notify.warn('เลือกใบแจ้งหนี้ก่อน'); return }
    if (!(Number(amount) > 0)) { notify.warn('ใส่ยอดที่ลูกค้าโอน'); return }
    if (!slipMessage && !file) { notify.warn('แนบรูปสลิป หรือกด "บันทึกเป็นสลิป" ที่รูปในแชท'); return }
    setBusy(true)
    try {
      await store.submitSlip(conv.id, { invoiceId, amount, transferAt, bankRef, note, messageId: slipMessage?.id, file })
      notify.success(`ส่งสลิป ${money(amount)} บาท ให้ฝ่ายบัญชีตรวจแล้ว — ยังไม่นับเป็นเงินเข้า`)
      onDone()
    } catch (err) { notify.error(err.message) } finally { setBusy(false) }
  }

  const recent = info.submissions.slice(0, 5)
  return (
    <form className="ib-form ib-pay" onSubmit={submit}>
      <p className="ib-hint">ลูกค้า: <b>{c.name}</b> · การส่งรูปสลิป<b>ยังไม่ถือว่าชำระแล้ว</b> — ฝ่ายบัญชีต้องตรวจยอดเข้าบัญชีก่อน</p>
      {slipMessage?.attachment && (
        <div className="ib-slipprev"><MessageMedia kind="image" attachment={slipMessage.attachment} /><span className="ib-hint">รูปจากแชท</span></div>
      )}
      {!open.length ? (
        <div className="ib-later">
          <p>ลูกค้านี้ยังไม่มีใบแจ้งหนี้ที่ค้างชำระ — ออกใบแจ้งหนี้ก่อน แล้วจึงบันทึกสลิป</p>
          <Link className="btn btn-outline" href="/invoice">ไปหน้าใบแจ้งหนี้</Link>
        </div>
      ) : (
        <>
          <label>ใบแจ้งหนี้
            <select value={invoiceId} onChange={e => setInvoiceId(e.target.value)}>
              {open.map(b => <option key={b.invoice_id} value={b.invoice_id}>{b.code} · คงเหลือ {money(b.balance)} บาท</option>)}
            </select>
          </label>
          {inv && (
            <dl className="ib-qtotal">
              <dt>ยอดใบแจ้งหนี้</dt><dd>{money(inv.total)}</dd>
              <dt>รับเงินแล้ว</dt><dd>{money(inv.paid)}</dd>
              {Number(inv.pending_slips) > 0 && <><dt>สลิปรอตรวจ</dt><dd>{money(inv.pending_slips)}</dd></>}
              <dt className="grand">คงเหลือ</dt><dd className="grand">{money(inv.balance)} บาท</dd>
            </dl>
          )}
          <div className="ib-payrow">
            <label>ยอดที่ลูกค้าโอน (บาท)<input type="number" min="0" step="0.01" inputMode="decimal" required value={amount} onChange={e => setAmount(e.target.value)} /></label>
            <label>เวลาโอนตามสลิป<input type="datetime-local" value={transferAt} onChange={e => setTransferAt(e.target.value)} /></label>
          </div>
          <label>เลขอ้างอิงในสลิป (ถ้ามี)<input value={bankRef} onChange={e => setBankRef(e.target.value)} placeholder="ช่วยกันสลิปซ้ำ" /></label>
          {!slipMessage && <label>แนบรูปสลิป<input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} /></label>}
          <label>หมายเหตุถึงฝ่ายบัญชี<input value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น มัดจำ 50%" /></label>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'ส่งให้ฝ่ายบัญชีตรวจ'}</button>
        </>
      )}
      {recent.length > 0 && (
        <div className="ib-qlist">
          <b className="ib-small">สลิปล่าสุดของลูกค้านี้</b>
          {recent.map(sp => (
            <div key={sp.id} className="ib-qline">
              <b>{money(sp.amount_approved ?? sp.amount_claimed)}</b>
              <span className={`ib-paystatus ${sp.status}`}>{STATUS[sp.status]}{sp.reject_reason ? ` — ${sp.reject_reason}` : ''}</span>
              <span className="ib-small">{thaiDate(sp.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </form>
  )
}

/** ส่งใบเสร็จเข้าแชท: only receipts accounting has confirmed */
export function ReceiptPanel({ store, conv, onDone, onNeedCustomer }) {
  const c = conv.customer
  const { info, error } = usePaymentInfo(store, c?.id)
  const [busy, setBusy] = useState(null)
  if (!c) return <NeedCustomer onNeedCustomer={onNeedCustomer} what="ส่งใบเสร็จ" />
  if (error) return <p className="ib-hint">โหลดใบเสร็จไม่สำเร็จ: {error}</p>
  if (!info) return <p className="ib-hint">กำลังโหลดใบเสร็จ…</p>
  const codeOf = id => info.balances.find(b => b.invoice_id === id)?.code
  async function send(r) {
    setBusy(r.id)
    try { await store.sendReceipt(conv.id, r.id, newClientKey()); notify.success(`ส่งใบเสร็จ ${r.code} เข้าแชทแล้ว`); onDone() }
    catch (e) { notify.error(e.message) } finally { setBusy(null) }
  }
  return (
    <div className="ib-form">
      <p className="ib-hint">ออกใบเสร็จได้เฉพาะยอดที่ฝ่ายบัญชียืนยันรับเงินแล้ว — ส่งเป็นรูปเข้าแชท</p>
      {!info.receipts.length && <p className="ib-later">ยังไม่มีใบเสร็จที่รับเงินแล้วสำหรับลูกค้านี้{info.submissions.some(s => s.status === 'pending') ? ' (มีสลิปรอฝ่ายบัญชีตรวจ)' : ''}</p>}
      {info.receipts.map(r => (
        <div key={r.id} className="ib-qline">
          <b>{r.code}</b>
          <span className="ib-small">{money(r.total)} บาท · {r.payment_method || ''} · {thaiDate(r.paid_at)}{codeOf(r.invoice_id) ? ` · ${codeOf(r.invoice_id)}` : ''}</span>
          <button type="button" className="btn btn-outline btn-sm" disabled={!!busy || !store.canSend(conv.platform)} onClick={() => send(r)}>{busy === r.id ? 'กำลังส่ง…' : 'ส่งเข้าแชท'}</button>
        </div>
      ))}
    </div>
  )
}
