'use client'
import { useState } from 'react'
import Link from 'next/link'

const TITLES = {
  customer: 'ข้อมูลลูกค้า', quotation: 'ใบเสนอราคา', payment: 'บันทึกการชำระเงิน', receipt: 'ออกใบเสร็จ',
  job: 'ใบงาน', assign: 'มอบหมายพนักงาน', followup: 'ตั้งเตือนติดตามลูกค้า',
}

function Later({ phase, children }) {
  return (
    <div className="ib-later">
      {children}
      <button type="button" className="btn btn-primary" disabled>เปิดใช้ในเฟส {phase}</button>
    </div>
  )
}

export default function ActionPanel({ store, conv, action, context, onClose }) {
  const c = conv.customer
  const [form, setForm] = useState(() => ({
    name: c?.name || '', kind: c?.kind || 'person', phone: c?.phone || '', email: c?.email || '',
    taxId: c?.taxId || '', address: c?.address || '', shippingAddress: c?.shippingAddress || '', notes: c?.notes || '',
  }))
  const [assignee, setAssignee] = useState(conv.assignedTo || '')
  const [followAt, setFollowAt] = useState('')
  const f = k => ({ value: form[k], onChange: e => setForm(s => ({ ...s, [k]: e.target.value })) })

  async function saveCustomer(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    if (c) await store.updateCustomer(conv.id, form)
    else await store.createCustomer(conv.id, form)
    onClose()
  }

  return (
    <div className="ib-sheet-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ib-sheet" role="dialog" aria-modal="true" aria-label={TITLES[action]}>
        <div className="ib-sheet-head">
          <b>{TITLES[action]}</b>
          <button type="button" className="ib-icon" onClick={onClose} aria-label="ปิด">✕</button>
        </div>
        <div className="ib-sheet-body">
          {action === 'customer' && (
            <form onSubmit={saveCustomer} className="ib-form">
              {!c && <p className="ib-small">เฟส 3 จะค้นหาลูกค้าเดิมในระบบก่อน (เบอร์ / เลขภาษี) และผูกได้เมื่อยืนยันตัวตนแล้วเท่านั้น</p>}
              <label>ชื่อลูกค้า / บริษัท<input required {...f('name')} /></label>
              <label>ประเภท<select {...f('kind')}><option value="person">บุคคลธรรมดา</option><option value="company">บริษัท</option></select></label>
              <label>เบอร์โทร<input inputMode="tel" {...f('phone')} /></label>
              <label>อีเมล<input type="email" {...f('email')} /></label>
              <label>เลขประจำตัวผู้เสียภาษี<input inputMode="numeric" {...f('taxId')} /></label>
              <label>ที่อยู่ออกเอกสาร<textarea rows={2} {...f('address')} /></label>
              <label>ที่อยู่จัดส่ง<textarea rows={2} {...f('shippingAddress')} /></label>
              <label>ความต้องการ / หมายเหตุพิเศษ<textarea rows={2} {...f('notes')} /></label>
              <button type="submit" className="btn btn-primary">บันทึก (ข้อมูลจำลอง)</button>
            </form>
          )}
          {action === 'quotation' && (
            <Later phase={7}>
              <p>สร้างใบเสนอราคาจากแชทนี้: ดึงข้อมูลลูกค้าอัตโนมัติ เลือกสินค้า/เทคนิค (สกรีน, DTF, Sublimation, ปัก) หลายรายการ คิดส่วนลด/VAT ตามกฎเดิม แล้วส่ง PDF เข้าแชท</p>
              <p className="ib-small">ระหว่างนี้ใช้หน้าใบเสนอราคาเดิมได้: <Link href="/quotation">เปิดหน้าใบเสนอราคา</Link></p>
            </Later>
          )}
          {action === 'payment' && (
            <Later phase={8}>
              {context?.attachment && <p>สลิป: {context.attachment.name}</p>}
              <ol className="ib-steps">
                <li className="on">รอตรวจ (Pending Verification) — ส่งสลิปตรวจกับ API อัตโนมัติ</li>
                <li>รออนุมัติ — ยอด / บัญชีปลายทาง / เลขอ้างอิงไม่ซ้ำ</li>
                <li>ยืนยันแล้ว (Verified) — ฝ่ายบัญชีกดเท่านั้น จึงนับเป็นเงินจริง</li>
              </ol>
              <p className="ib-small">การส่งรูปสลิปยังไม่ถือว่าชำระแล้ว</p>
            </Later>
          )}
          {action === 'receipt' && (
            <Later phase={8}>
              <p>ออกใบเสร็จได้จากการชำระที่ฝ่ายบัญชียืนยันแล้วเท่านั้น แล้วส่ง PDF เข้าแชท</p>
            </Later>
          )}
          {action === 'job' && (
            <div className="ib-later">
              <p>เปิดใบงานจาก Invoice ของลูกค้าได้ที่หน้าใบงาน (1 ใบงานต่อ 1 รายการ)</p>
              <Link className="btn btn-outline" href="/joborder">ไปหน้าใบงาน</Link>
              <p className="ib-small">เฟส 3 จะเปิดจากแชทนี้ได้ทันทีเมื่อผูกลูกค้าแล้ว</p>
            </div>
          )}
          {action === 'assign' && (
            <div className="ib-form">
              {store.staff.map(s => (
                <label key={s.id} className="ib-radio"><input type="radio" name="assignee" checked={assignee === s.id} onChange={() => setAssignee(s.id)} /> {s.name}</label>
              ))}
              <button type="button" className="btn btn-primary" onClick={async () => { await store.update(conv.id, { assignedTo: assignee || null }); onClose() }}>มอบหมาย</button>
            </div>
          )}
          {action === 'followup' && (
            <div className="ib-form">
              <label>เตือนเมื่อ<input type="datetime-local" value={followAt} onChange={e => setFollowAt(e.target.value)} aria-label="วันเวลาเตือน" /></label>
              <button type="button" className="btn btn-primary" disabled={!followAt}
                onClick={async () => { await store.update(conv.id, { followUpAt: new Date(followAt).toISOString(), status: 'followup' }); onClose() }}>ตั้งเตือน</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
