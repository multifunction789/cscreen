'use client'
import { DEAL_STAGES, DEAL_STAGE_TH, PLATFORMS } from '@/lib/inbox/model'

const baht = n => n == null ? '—' : '฿' + Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 })
const when = iso => iso ? new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }) : ''

export default function CustomerPanel({ store, conv, notes, onAction, onClose }) {
  const c = conv.customer
  const deal = conv.deal || {}
  return (
    <aside className="ib-col ib-info" aria-label="ข้อมูลลูกค้า">
      <div className="ib-info-head">
        <b>ข้อมูลลูกค้า</b>
        <button type="button" className="ib-icon ib-hide-wide" onClick={onClose} aria-label="ปิด">✕</button>
      </div>

      <div className="ib-card">
        {c ? (
          <>
            <div className="ib-card-title">{c.name} <span className="ib-tag">{c.kind === 'company' ? 'บริษัท' : 'บุคคล'}</span></div>
            <dl className="ib-dl">
              <dt>โทร</dt><dd>{c.phone || '—'}</dd>
              {c.email && <><dt>อีเมล</dt><dd>{c.email}</dd></>}
              <dt>เลขภาษี</dt><dd>{c.taxId || '—'}</dd>
              <dt>ช่องทาง</dt><dd>{(c.linked || []).map(id => PLATFORMS[id]?.label).join(' · ')}</dd>
              <dt>ค้างชำระ</dt><dd className={c.outstanding ? 'ib-due' : ''}>{baht(c.outstanding)}</dd>
            </dl>
            {c.notes && <p className="ib-small">ความต้องการพิเศษ: {c.notes}</p>}
            <button type="button" className="ib-link" onClick={() => onAction('customer')}>แก้ไขข้อมูลลูกค้า</button>
          </>
        ) : (
          <>
            <div className="ib-card-title">ยังไม่ได้ผูกกับลูกค้า</div>
            <p className="ib-small">แชทนี้ยังไม่รู้ว่าเป็นลูกค้าคนไหน — ระบบจะไม่รวมให้เองจากชื่อที่คล้ายกัน</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onAction('customer')}>สร้าง / ผูกลูกค้า</button>
          </>
        )}
      </div>

      <div className="ib-card">
        <div className="ib-card-title">งานขาย</div>
        <label className="ib-small">ขั้นตอน
          <select aria-label="ขั้นตอนงานขาย" value={deal.stage || 'New Lead'} onChange={e => store.update(conv.id, { deal: { ...deal, stage: e.target.value } })}>
            {DEAL_STAGES.map(s => <option key={s} value={s}>{DEAL_STAGE_TH[s]} ({s})</option>)}
          </select>
        </label>
        <dl className="ib-dl">
          <dt>มูลค่า</dt><dd>{baht(deal.value)}</dd>
          <dt>ใบเสนอราคา</dt><dd>{deal.quotation || '—'}</dd>
          <dt>ใบแจ้งหนี้</dt><dd>{deal.invoice || '—'}</dd>
          <dt>ใบงาน</dt><dd>{deal.job || '—'}</dd>
        </dl>
      </div>

      <div className="ib-card">
        <div className="ib-card-title">งานถัดไป</div>
        {conv.followUpAt
          ? <p className="ib-small">ติดตามลูกค้า: {when(conv.followUpAt)}</p>
          : <p className="ib-small">ยังไม่ได้ตั้งเตือน</p>}
        {deal.stage === 'Waiting for Deposit' && <p className="ib-small ib-due">มีสลิปรอตรวจ — ฝ่ายบัญชียืนยันก่อนออกใบเสร็จ</p>}
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
