'use client'
import { useState } from 'react'
import Link from 'next/link'
import { notify } from '@/lib/feedback'

const TITLES = {
  customer: 'ข้อมูลลูกค้า', quotation: 'ใบเสนอราคา', payment: 'บันทึกการชำระเงิน', receipt: 'ออกใบเสร็จ',
  job: 'ใบงาน', assign: 'มอบหมายพนักงาน', followup: 'ตั้งเตือนติดตามลูกค้า',
}
const MATCH = { phone: 'เบอร์ตรง', tax_id: 'เลขภาษีตรง', email: 'อีเมลตรง', name: 'ชื่อคล้ายเท่านั้น' }
const REASONS = [
  'ลูกค้าแจ้งเบอร์โทรตรงกับในระบบ',
  'ลูกค้าแจ้งเลขประจำตัวผู้เสียภาษีตรงกับในระบบ',
  'โทรยืนยันกับลูกค้าแล้ว',
  'ลูกค้าส่งเอกสาร/ใบเสนอราคาเดิมมายืนยัน',
]

function Later({ phase, children }) {
  return (
    <div className="ib-later">
      {children}
      <button type="button" className="btn btn-primary" disabled>เปิดใช้ในเฟส {phase}</button>
    </div>
  )
}

function CustomerForm({ initial, submitLabel, onSubmit }) {
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const f = k => ({ value: form[k] || '', onChange: e => setForm(s => ({ ...s, [k]: e.target.value })) })
  return (
    <form className="ib-form" onSubmit={async e => { e.preventDefault(); if (!form.name?.trim()) return; setBusy(true); try { await onSubmit(form) } finally { setBusy(false) } }}>
      <label>ชื่อลูกค้า / บริษัท<input required {...f('name')} /></label>
      <label>ประเภท<select {...f('kind')}><option value="person">บุคคลธรรมดา</option><option value="company">นิติบุคคล</option></select></label>
      <label>เบอร์โทร<input inputMode="tel" {...f('phone')} /></label>
      <label>อีเมล<input type="email" {...f('email')} /></label>
      <label>เลขประจำตัวผู้เสียภาษี<input inputMode="numeric" {...f('taxId')} /></label>
      <label>ที่อยู่ออกเอกสาร<textarea rows={2} {...f('address')} /></label>
      <label>ที่อยู่จัดส่ง<textarea rows={2} {...f('shippingAddress')} /></label>
      <label>ความต้องการ / หมายเหตุพิเศษ<textarea rows={2} {...f('notes')} /></label>
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : submitLabel}</button>
    </form>
  )
}

function LinkCustomer({ store, conv, onDone, onCreate }) {
  const [q, setQ] = useState({ phone: '', taxId: '', email: '', name: '' })
  const [results, setResults] = useState(null)
  const [pick, setPick] = useState(null)
  const [reason, setReason] = useState('')
  const [extra, setExtra] = useState('')
  const [busy, setBusy] = useState(false)
  const chosen = results?.find(r => r.id === pick)
  const evidence = [reason, extra.trim()].filter(Boolean).join(' · ')
  const weak = chosen?.match === 'name'
  const ok = chosen && evidence && (!weak || extra.trim().length >= 5)

  async function search(e) {
    e.preventDefault()
    if (!Object.values(q).some(v => v.trim())) return
    setBusy(true)
    try { setResults(await store.findCandidates(q)); setPick(null); setReason(''); setExtra('') } catch (err) { notify.error(err.message) } finally { setBusy(false) }
  }
  async function link() {
    setBusy(true)
    try { await store.linkCustomer(conv.id, chosen.id, evidence); notify.success(`ผูกแชทกับ ${chosen.name} แล้ว`); onDone() }
    catch (err) { notify.error(err.message) } finally { setBusy(false) }
  }
  const f = k => ({ value: q[k], onChange: e => setQ(s => ({ ...s, [k]: e.target.value })) })

  return (
    <div className="ib-form">
      <form className="ib-form" onSubmit={search}>
        <p className="ib-small">ค้นหาด้วยข้อมูลที่ลูกค้าให้มา — เบอร์ / เลขภาษี / อีเมล ที่ตรงกันเท่านั้นที่นับเป็นหลักฐาน</p>
        <label>เบอร์โทร<input inputMode="tel" {...f('phone')} /></label>
        <label>เลขประจำตัวผู้เสียภาษี<input inputMode="numeric" {...f('taxId')} /></label>
        <label>อีเมล<input type="email" {...f('email')} /></label>
        <label>ชื่อ (ช่วยค้นเท่านั้น)<input {...f('name')} /></label>
        <button type="submit" className="btn btn-outline" disabled={busy}>ค้นหาลูกค้าเดิม</button>
      </form>
      {results && (
        <div className="ib-cands" role="radiogroup" aria-label="ลูกค้าที่พบ">
          {!results.length && <p className="ib-small">ไม่พบลูกค้าเดิมที่ตรงกัน</p>}
          {results.map(r => (
            <label key={r.id} className={`ib-cand${pick === r.id ? ' on' : ''}`}>
              <input type="radio" name="cand" checked={pick === r.id} onChange={() => { setPick(r.id); setReason(''); setExtra('') }} />
              <span><b>{r.code} · {r.name}</b><br /><span className="ib-small">{[r.phone, r.tax_id, r.email].filter(Boolean).join(' · ') || '—'}</span></span>
              <span className={`ib-match ${r.match}`}>{MATCH[r.match]}</span>
            </label>
          ))}
        </div>
      )}
      {chosen && (
        <div className="ib-form">
          {weak && <p className="ib-banner warn">พบจากชื่ออย่างเดียว — ต้องมีหลักฐานอื่นยืนยันก่อนผูก (เช่น โทรยืนยัน หรือเอกสารเดิม)</p>}
          <label>หลักฐานการยืนยันตัวตน
            <select value={reason} onChange={e => setReason(e.target.value)}>
              <option value="">— เลือก —</option>
              {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label>รายละเอียดเพิ่มเติม{weak && ' (จำเป็น)'}<textarea rows={2} value={extra} onChange={e => setExtra(e.target.value)} placeholder="เช่น โทร 081-xxx เวลา 14:00 ลูกค้ายืนยันชื่อโรงเรียน" /></label>
          <button type="button" className="btn btn-primary" disabled={!ok || busy} onClick={link}>ผูกแชทนี้กับ {chosen.name}</button>
        </div>
      )}
      <hr className="ib-hr" />
      <button type="button" className="btn btn-outline" onClick={onCreate}>ไม่พบ — สร้างลูกค้าใหม่</button>
    </div>
  )
}

export default function ActionPanel({ store, conv, action, context, onClose }) {
  const c = conv.customer
  const [view, setView] = useState(c ? 'edit' : 'find')    // customer: edit | find | create
  const [confirmUnlink, setConfirmUnlink] = useState(false)
  const [assignee, setAssignee] = useState(conv.assignedTo || '')
  const [followAt, setFollowAt] = useState('')
  const initial = { name: c?.name || conv.contact.displayName.replace(/\s*\(ตัวอย่าง\)$/, ''), kind: c?.kind || 'person', phone: c?.phone || '', email: c?.email || '',
    taxId: c?.taxId || '', address: c?.address || '', shippingAddress: c?.shippingAddress || '', notes: c?.notes || '' }

  const run = async (fn, ok) => { try { await fn(); if (ok) notify.success(ok); onClose() } catch (e) { notify.error(e.message) } }

  return (
    <div className="ib-sheet-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ib-sheet" role="dialog" aria-modal="true" aria-label={TITLES[action]}>
        <div className="ib-sheet-head">
          <b>{TITLES[action]}</b>
          <button type="button" className="ib-icon" onClick={onClose} aria-label="ปิด">✕</button>
        </div>
        <div className="ib-sheet-body">
          {action === 'customer' && view === 'edit' && c && (
            <div className="ib-form">
              <CustomerForm initial={initial} submitLabel="บันทึกข้อมูลลูกค้า" onSubmit={form => run(() => store.updateCustomer(conv.id, form), 'บันทึกข้อมูลลูกค้าแล้ว')} />
              <hr className="ib-hr" />
              <p className="ib-small">ผูกผิดคน? ยกเลิกการผูกแล้วค้นหาใหม่ (บันทึกในประวัติการแก้ไข)</p>
              {confirmUnlink !== false && (
                <label>เหตุผลที่ยกเลิก<textarea rows={2} value={confirmUnlink} onChange={e => setConfirmUnlink(e.target.value)} placeholder="เช่น ผูกผิดคน ลูกค้าคนละรายกัน" /></label>
              )}
              <button type="button" className="btn btn-outline" disabled={confirmUnlink !== false && !confirmUnlink.trim()} onClick={() => confirmUnlink !== false
                ? run(() => store.linkCustomer(conv.id, null, confirmUnlink.trim()), 'ยกเลิกการผูกแล้ว')
                : setConfirmUnlink('')}>{confirmUnlink !== false ? 'ยืนยันยกเลิกการผูก' : 'ยกเลิกการผูกลูกค้า'}</button>
            </div>
          )}
          {action === 'customer' && view === 'find' && <LinkCustomer store={store} conv={conv} onDone={onClose} onCreate={() => setView('create')} />}
          {action === 'customer' && view === 'create' && (
            <div className="ib-form">
              <button type="button" className="ib-link" onClick={() => setView('find')}>‹ กลับไปค้นหาลูกค้าเดิม</button>
              <CustomerForm initial={initial} submitLabel="สร้างลูกค้าและผูกกับแชทนี้"
                onSubmit={form => run(() => store.createCustomer(conv.id, form), `สร้างลูกค้า ${form.name} แล้ว`)} />
            </div>
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
              {c ? <p>เปิดใบงานจาก Invoice ของ {c.name} ได้ที่หน้าใบงาน (1 ใบงานต่อ 1 รายการ)</p> : <p>ผูกแชทกับลูกค้าก่อน แล้วเปิดใบงานจาก Invoice ของลูกค้า</p>}
              <Link className="btn btn-outline" href="/joborder">ไปหน้าใบงาน</Link>
            </div>
          )}
          {action === 'assign' && (
            <div className="ib-form">
              <label className="ib-radio"><input type="radio" name="assignee" checked={!assignee} onChange={() => setAssignee('')} /> ยังไม่มีคนรับ</label>
              {store.staff.map(s => (
                <label key={s.id} className="ib-radio"><input type="radio" name="assignee" checked={assignee === s.id} onChange={() => setAssignee(s.id)} /> {s.name}</label>
              ))}
              <button type="button" className="btn btn-primary" onClick={() => run(() => store.update(conv.id, { assignedTo: assignee || null }), 'มอบหมายแล้ว')}>มอบหมาย</button>
            </div>
          )}
          {action === 'followup' && (
            <div className="ib-form">
              <label>เตือนเมื่อ<input type="datetime-local" value={followAt} onChange={e => setFollowAt(e.target.value)} aria-label="วันเวลาเตือน" /></label>
              <button type="button" className="btn btn-primary" disabled={!followAt}
                onClick={() => run(() => store.update(conv.id, { followUpAt: new Date(followAt).toISOString(), status: 'followup' }), 'ตั้งเตือนแล้ว')}>ตั้งเตือน</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
