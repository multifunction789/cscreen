'use client'
import Link from 'next/link'
import { DEAL_STAGES, DEAL_STAGE_TH, PLATFORMS } from '@/lib/inbox/model'
import { docHref } from '@/lib/docLinks'
import { notify } from '@/lib/feedback'

const baht = n => n == null ? '—' : '฿' + Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 })
const when = iso => iso ? new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }) : ''

function History({ title, rows, type, render }) {
  if (!rows?.length) return null
  return (
    <div className="ib-hist">
      <div className="ib-hist-title">{title} ({rows.length})</div>
      {rows.slice(0, 4).map(r => (
        <Link key={r.id} className="ib-hist-row" href={docHref(type, r.id)}>
          <b>{r.code}</b><span>{render(r)}</span>
        </Link>
      ))}
    </div>
  )
}

export default function CustomerPanel({ store, conv, notes, onAction, onClose }) {
  const c = conv.customer
  const deal = conv.deal || {}
  const summary = c ? store.customerSummary(c.id) : null
  const outstanding = summary ? summary.outstanding : c?.outstanding
  const linked = summary?.linked?.length ? summary.linked : c?.linked || []

  async function setStage(stage) {
    try { await store.update(conv.id, { deal: { ...deal, stage } }) }
    catch (e) { notify.error('บันทึกขั้นตอนไม่สำเร็จ: ' + e.message) }
  }

  return (
    <aside className="ib-col ib-info" aria-label="ข้อมูลลูกค้า">
      <div className="ib-info-head">
        <b>ข้อมูลลูกค้า</b>
        <button type="button" className="ib-icon ib-hide-wide" onClick={onClose} aria-label="ปิด">✕</button>
      </div>

      <div className="ib-card">
        {c ? (
          <>
            <div className="ib-card-title">{c.name} <span className="ib-tag">{c.kind === 'company' ? 'นิติบุคคล' : 'บุคคลธรรมดา'}</span></div>
            <dl className="ib-dl">
              {c.code && <><dt>รหัส</dt><dd>{c.code}</dd></>}
              <dt>โทร</dt><dd>{c.phone || '—'}</dd>
              {c.email && <><dt>อีเมล</dt><dd>{c.email}</dd></>}
              <dt>เลขภาษี</dt><dd>{c.taxId || '—'}</dd>
              <dt>ช่องทาง</dt><dd>{linked.map(id => PLATFORMS[id]?.label || id).join(' · ') || '—'}</dd>
              <dt>ค้างชำระ</dt><dd className={outstanding ? 'ib-due' : ''}>{outstanding == null ? 'กำลังโหลด…' : baht(outstanding)}</dd>
            </dl>
            {c.shippingAddress && <p className="ib-small">ที่อยู่จัดส่ง: {c.shippingAddress}</p>}
            {c.notes && <p className="ib-small">ความต้องการพิเศษ: {c.notes}</p>}
            {conv.linkEvidence && <p className="ib-small">ผูกแชทเพราะ: {conv.linkEvidence}</p>}
            <button type="button" className="ib-link" onClick={() => onAction('customer')}>แก้ไข / เปลี่ยนลูกค้า</button>
          </>
        ) : (
          <>
            <div className="ib-card-title">ยังไม่ได้ผูกกับลูกค้า</div>
            <p className="ib-small">ค้นหาลูกค้าเดิมด้วยเบอร์ / เลขภาษี / อีเมล หรือสร้างใหม่ — ระบบไม่รวมให้เองจากชื่อที่คล้ายกัน</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onAction('customer')}>ค้นหา / ผูกลูกค้า</button>
          </>
        )}
      </div>

      {summary && (summary.quotations.length + summary.invoices.length + summary.receipts.length + summary.jobs.length > 0) && (
        <div className="ib-card">
          <div className="ib-card-title">ประวัติการสั่งซื้อ</div>
          <History title="ใบเสนอราคา" type="quotation" rows={summary.quotations} render={r => `${baht(r.total)} · ${r.status || ''}`} />
          <History title="ใบแจ้งหนี้" type="invoice" rows={summary.invoices} render={r => baht(r.total)} />
          <History title="ใบเสร็จ" type="receipt" rows={summary.receipts} render={r => `${baht(r.total)} · ${r.paid ? 'รับเงินแล้ว' : 'รอรับเงิน'}`} />
          <History title="ใบงาน" type="joborder" rows={summary.jobs} render={r => r.status || ''} />
        </div>
      )}

      <div className="ib-card">
        <div className="ib-card-title">งานขาย</div>
        <label className="ib-small">ขั้นตอน
          <select aria-label="ขั้นตอนงานขาย" value={deal.stage || 'New Lead'} onChange={e => setStage(e.target.value)}>
            {DEAL_STAGES.map(s => <option key={s} value={s}>{DEAL_STAGE_TH[s]} ({s})</option>)}
          </select>
        </label>
        <dl className="ib-dl">
          <dt>มูลค่า</dt><dd>{baht(deal.value)}</dd>
          <dt>ใบเสนอราคา</dt><dd>{deal.quotation || '—'}</dd>
          <dt>ใบแจ้งหนี้</dt><dd>{deal.invoice || '—'}</dd>
          {'job' in deal && <><dt>ใบงาน</dt><dd>{deal.job || '—'}</dd></>}
        </dl>
      </div>

      <div className="ib-card">
        <div className="ib-card-title">งานถัดไป</div>
        {conv.followUpAt
          ? <p className="ib-small">ติดตามลูกค้า: {when(conv.followUpAt)}</p>
          : <p className="ib-small">ยังไม่ได้ตั้งเตือน</p>}
        {deal.stage === 'Waiting for Deposit' && <p className="ib-small ib-due">รอมัดจำ — ฝ่ายบัญชียืนยันสลิปก่อนออกใบเสร็จ</p>}
        <button type="button" className="ib-link" onClick={() => onAction('followup')}>ตั้งเตือนติดตาม</button>
      </div>

      {notes.length > 0 && (
        <div className="ib-card">
          <div className="ib-card-title">หมายเหตุภายใน ({notes.length})</div>
          {notes.slice(-3).map(n => <p key={n.id} className="ib-small">• {n.text}</p>)}
        </div>
      )}
    </aside>
  )
}
