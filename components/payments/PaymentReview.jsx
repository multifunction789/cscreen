'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { notify } from '@/lib/feedback'
import { money, thaiDate } from '@/lib/docs/quotation'
import MessageMedia from '@/components/inbox/MessageMedia'

const DECIDERS = ['owner', 'accounting']
const METHODS = ['โอน', 'เงินสด', 'เช็ค', 'บัตรเครดิต']
const TABS = [['pending', 'รอตรวจ'], ['approved', 'รับเงินแล้ว'], ['rejected', 'ไม่ผ่าน'], ['voided', 'ยกเลิก']]
const toLocal = iso => { const d = new Date(new Date(iso || Date.now()).getTime() + 7 * 3600e3); return d.toISOString().slice(0, 16) }
const fromLocal = v => (v ? new Date(v + ':00+07:00').toISOString() : null)
const newKey = () => crypto.randomUUID()

const SELECT = 'id, invoice_id, customer_id, conversation_id, message_id, slip, amount_claimed, amount_approved, transfer_at, bank_reference, note, status, method, paid_at, receipt_id, reject_reason, created_at, decided_at, ' +
  'invoice:invoices(id, code, total), customer:customers(id, code, name), receipt:receipts(id, code, total, voided_at, void_reason), ' +
  'creator:profiles!payment_submissions_created_by_fkey(full_name), decider:profiles!payment_submissions_decided_by_fkey(full_name)'

// first send after approval uses a fixed key (a retry never sends twice); "send again" is a new message
async function sendReceipt(conversationId, receiptId, clientKey = 'receipt-' + receiptId) {
  const res = await fetch('/api/inbox/send-receipt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId, receiptId, clientKey }) })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(out.error || 'ส่งใบเสร็จไม่สำเร็จ')
}

function Card({ sp, balance, role, onChanged }) {
  const pending = sp.status === 'pending'
  const canDecide = DECIDERS.includes(role)
  const [amount, setAmount] = useState(String(sp.amount_claimed))
  const [paidAt, setPaidAt] = useState(toLocal(sp.transfer_at || sp.created_at))
  const [method, setMethod] = useState('โอน')
  const [ref, setRef] = useState(sp.bank_reference || '')
  const [sendToChat, setSendToChat] = useState(!!sp.conversation_id)
  const [reason, setReason] = useState(null)       // null = closed
  const [busy, setBusy] = useState(false)
  const [key] = useState(newKey)                    // one key per card: a double click / retry is the same approval

  async function approve() {
    if (!(Number(amount) > 0)) { notify.warn('ใส่ยอดที่เข้าบัญชีจริง'); return }
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('approve_payment_submission', {
        p_submission_id: sp.id, p_amount: Number(amount), p_paid_at: fromLocal(paidAt), p_method: method, p_bank_reference: ref.trim() || null, p_idempotency_key: key,
      })
      if (error) throw new Error(error.message)
      notify.success(`รับเงิน ${money(data.receipt.total)} บาท · ออกใบเสร็จ ${data.receipt.code} แล้ว`)
      if (sendToChat && sp.conversation_id) {
        try { await sendReceipt(sp.conversation_id, data.receipt.id); notify.success('ส่งใบเสร็จเข้าแชทลูกค้าแล้ว') }
        catch (e) { notify.error('รับเงินแล้ว แต่ส่งใบเสร็จเข้าแชทไม่สำเร็จ: ' + e.message) }
      }
      onChanged()
    } catch (e) { notify.error(e.message) } finally { setBusy(false) }
  }
  async function reject() {
    if (!reason?.trim()) { notify.warn('ระบุเหตุผลที่ไม่ผ่าน'); return }
    setBusy(true)
    try {
      const { error } = await supabase.rpc('reject_payment_submission', { p_submission_id: sp.id, p_reason: reason.trim() })
      if (error) throw new Error(error.message)
      notify.success('บันทึกว่าไม่ผ่านแล้ว'); onChanged()
    } catch (e) { notify.error(e.message) } finally { setBusy(false) }
  }
  async function voidIt() {
    if (!reason?.trim()) { notify.warn('ระบุเหตุผลที่ยกเลิก'); return }
    setBusy(true)
    try {
      const { error } = await supabase.rpc('void_payment', { p_receipt_id: sp.receipt_id, p_reason: reason.trim() })
      if (error) throw new Error(error.message)
      notify.success(`ยกเลิกใบเสร็จ ${sp.receipt?.code} แล้ว (กลับรายการ)`); onChanged()
    } catch (e) { notify.error(e.message) } finally { setBusy(false) }
  }
  async function resend() {
    setBusy(true)
    try { await sendReceipt(sp.conversation_id, sp.receipt_id, newKey()); notify.success('ส่งใบเสร็จเข้าแชทแล้ว') } catch (e) { notify.error(e.message) } finally { setBusy(false) }
  }

  const over = balance && Number(amount) > Number(balance.balance)
  return (
    <article className="card pay-card" data-status={sp.status}>
      <div className="pay-slip">
        {sp.slip?.path ? <MessageMedia kind="image" attachment={sp.slip} /> : <div className="pay-noslip">ไม่มีรูปสลิป</div>}
      </div>
      <div className="pay-body">
        <header>
          <b>{sp.customer?.name || '—'}</b>
          <span className="pay-amt">{money(sp.amount_approved ?? sp.amount_claimed)} บาท</span>
        </header>
        <dl className="pay-facts">
          <dt>ใบแจ้งหนี้</dt><dd>{sp.invoice?.code} · ยอด {money(sp.invoice?.total)}</dd>
          {balance && <><dt>รับแล้ว / คงเหลือ</dt><dd>{money(balance.paid)} / <b>{money(balance.balance)}</b></dd></>}
          <dt>ลูกค้าแจ้งโอน</dt><dd>{money(sp.amount_claimed)}{sp.transfer_at ? ` · ${thaiDate(sp.transfer_at)} ${new Date(sp.transfer_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })}` : ''}</dd>
          {sp.bank_reference && <><dt>เลขอ้างอิง</dt><dd>{sp.bank_reference}</dd></>}
          {sp.note && <><dt>หมายเหตุ</dt><dd>{sp.note}</dd></>}
          <dt>บันทึกโดย</dt><dd>{sp.creator?.full_name || '—'} · {thaiDate(sp.created_at)}</dd>
          {sp.conversation_id && <><dt>แชท</dt><dd><Link href={`/inbox?c=${sp.conversation_id}`}>เปิดแชทลูกค้า</Link></dd></>}
          {sp.status === 'approved' && <><dt>ใบเสร็จ</dt><dd>{sp.receipt?.code} · {sp.method} · อนุมัติโดย {sp.decider?.full_name || '—'}</dd></>}
          {sp.status === 'rejected' && <><dt>เหตุผล</dt><dd>{sp.reject_reason}</dd></>}
          {sp.status === 'voided' && <><dt>ยกเลิก</dt><dd>{sp.receipt?.code} · {sp.receipt?.void_reason}</dd></>}
        </dl>

        {pending && canDecide && reason === null && (
          <div className="pay-form">
            <p className="pay-warn">ตรวจในแอปธนาคารว่าเงินเข้าจริง ยอดตรง และเลขอ้างอิงไม่ซ้ำ ก่อนกดยืนยัน</p>
            <div className="pay-grid">
              <label>ยอดเข้าบัญชีจริง<input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} aria-label="ยอดเข้าบัญชีจริง" /></label>
              <label>วันเวลาที่เงินเข้า<input type="datetime-local" value={paidAt} onChange={e => setPaidAt(e.target.value)} /></label>
              <label>ช่องทาง<select value={method} onChange={e => setMethod(e.target.value)}>{METHODS.map(m => <option key={m}>{m}</option>)}</select></label>
              <label>เลขอ้างอิงธนาคาร<input value={ref} onChange={e => setRef(e.target.value)} placeholder="กันสลิปซ้ำ" /></label>
            </div>
            {over && <p className="pay-err">ยอดเกินคงเหลือของใบแจ้งหนี้ ({money(balance.balance)}) — ระบบจะไม่รับ</p>}
            {sp.conversation_id && <label className="pay-check"><input type="checkbox" checked={sendToChat} onChange={e => setSendToChat(e.target.checked)} /> ส่งใบเสร็จเข้าแชทลูกค้าทันที (เป็นรูป)</label>}
            <div className="pay-btns">
              <button type="button" className="btn btn-primary" disabled={busy || over} onClick={approve}>{busy ? 'กำลังบันทึก…' : 'ยืนยันรับเงิน + ออกใบเสร็จ'}</button>
              <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setReason('')}>ไม่ผ่าน</button>
            </div>
          </div>
        )}
        {pending && canDecide && reason !== null && (
          <div className="pay-form">
            <label>เหตุผลที่ไม่ผ่าน<input autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="เช่น ยอดไม่เข้าบัญชี / สลิปซ้ำ / ยอดไม่ตรง" /></label>
            <div className="pay-btns">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={reject}>บันทึกว่าไม่ผ่าน</button>
              <button type="button" className="btn btn-outline" onClick={() => setReason(null)}>กลับ</button>
            </div>
          </div>
        )}
        {pending && !canDecide && <p className="pay-warn">รอฝ่ายบัญชี / เจ้าของตรวจยอดเข้าบัญชี</p>}
        {sp.status === 'approved' && (
          <div className="pay-btns">
            {sp.conversation_id && <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={resend}>ส่งใบเสร็จเข้าแชท</button>}
            {role === 'owner' && reason === null && <button type="button" className="btn btn-outline btn-sm" onClick={() => setReason('')}>ยกเลิกรับเงิน…</button>}
          </div>
        )}
        {sp.status === 'approved' && role === 'owner' && reason !== null && (
          <div className="pay-form">
            <label>เหตุผลที่ยกเลิก (ใบเสร็จจะถูกกลับรายการ ไม่ลบ)<input autoFocus value={reason} onChange={e => setReason(e.target.value)} /></label>
            <div className="pay-btns">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={voidIt}>ยืนยันยกเลิก</button>
              <button type="button" className="btn btn-outline" onClick={() => setReason(null)}>กลับ</button>
            </div>
          </div>
        )}
      </div>
    </article>
  )
}

/** ตรวจรับเงิน: slips become money only here, by owner / accounting */
export default function PaymentReview() {
  const [role, setRole] = useState(null)
  const [tab, setTab] = useState('pending')
  const [rows, setRows] = useState(null)
  const [balances, setBalances] = useState({})
  const [counts, setCounts] = useState({})
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const [{ data: r }, list, cnt] = await Promise.all([
      supabase.rpc('app_role'),
      supabase.from('payment_submissions').select(SELECT).eq('status', tab).order('created_at', { ascending: tab === 'pending' }).limit(100),
      supabase.from('payment_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ])
    setRole(r)
    if (list.error) { setError(list.error.message); return }
    setError(null)
    setRows(list.data || [])
    setCounts({ pending: cnt.count ?? 0 })
    const ids = [...new Set((list.data || []).map(x => x.invoice_id))]
    if (ids.length) {
      const { data: b } = await supabase.from('invoice_balances').select('*').in('invoice_id', ids)
      setBalances(Object.fromEntries((b || []).map(x => [x.invoice_id, x])))
    }
  }, [tab])

  useEffect(() => {
    let live = true
    Promise.resolve().then(() => live && load())
    const ch = supabase.channel('payment-review').on('postgres_changes', { event: '*', schema: 'public', table: 'payment_submissions' }, () => load()).subscribe()
    return () => { live = false; supabase.removeChannel(ch) }
  }, [load])

  const total = useMemo(() => (rows || []).reduce((t, x) => t + Number(x.amount_approved ?? x.amount_claimed), 0), [rows])
  return (
    <div className="pay-page">
      <div className="pay-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => { setRows(null); setTab(id) }}>
            {label}{id === 'pending' && counts.pending ? ` (${counts.pending})` : ''}
          </button>
        ))}
      </div>
      <p className="pay-intro">
        สลิปที่พนักงานขายบันทึกจากแชทจะมารอที่นี่ — <b>ยังไม่นับเป็นเงินจนกว่าฝ่ายบัญชีหรือเจ้าของกดยืนยัน</b> เมื่อยืนยันแล้วระบบออกใบเสร็จ บันทึกรายรับ และส่งใบเสร็จเข้าแชทให้
        {role && !DECIDERS.includes(role) && ' (บัญชีของคุณดูได้อย่างเดียว)'}
      </p>
      {error && <p className="pay-err">โหลดไม่สำเร็จ: {error}</p>}
      {!rows && !error && <p className="pay-intro">กำลังโหลด…</p>}
      {rows && !rows.length && <div className="card pay-empty">ไม่มีรายการ{TABS.find(t => t[0] === tab)[1]}</div>}
      {rows && rows.length > 0 && tab !== 'pending' && <p className="pay-intro">รวม {rows.length} รายการ · {money(total)} บาท</p>}
      <div className="pay-list">
        {(rows || []).map(sp => <Card key={sp.id + sp.status} sp={sp} balance={balances[sp.invoice_id]} role={role} onChanged={load} />)}
      </div>
    </div>
  )
}
