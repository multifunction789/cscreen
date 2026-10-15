'use client'
import { useMemo, useState } from 'react'
import { insertJobOrder, updateJobOrder, currentUserEmail } from '@/lib/db'
import { buildFromInvoice, nextJobCodes, sizeTotal } from '@/lib/jobV2'
import { createJobFolderClient } from '@/lib/driveClient'
import { notify } from '@/lib/feedback'
import { todayStr } from '@/lib/docUtils'

/**
 * เลือก Invoice → ติ๊กรายการ → สร้างใบงาน 1 ใบต่อ 1 รายการ
 * รายการที่มีใบงานแล้วติ๊กไม่ได้ (ฐานข้อมูลกันซ้ำอีกชั้นด้วย unique index)
 */
export default function JobPicker({ invoices, customers, jobs, initialInvoiceId = '', onClose, onCreated }) {
  const [invId, setInvId]   = useState(initialInvoiceId)
  const [q, setQ]           = useState('')
  const [picked, setPicked] = useState([])
  const [busy, setBusy]     = useState(false)

  const inv = invoices.find(i => i.id === invId) || null
  const items = Array.isArray(inv?.items) ? inv.items : []
  const existing = useMemo(() => {
    const m = {}
    jobs.filter(j => j.invoice_id === invId && j.invoice_item_no).forEach(j => { m[j.invoice_item_no] = j })
    return m
  }, [jobs, invId])
  const legacyJobs = jobs.filter(j => j.invoice_id === invId && !j.invoice_item_no)

  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return invoices.filter(i => !t || [i.code, i.customers?.name].filter(Boolean).join(' ').toLowerCase().includes(t)).slice(0, 30)
  }, [invoices, q])

  function chooseInvoice(id) {
    setInvId(id); setPicked([])
    const it = invoices.find(i => i.id === id)
    const free = (it?.items || []).map((_, i) => i + 1).filter(n => !jobs.some(j => j.invoice_id === id && j.invoice_item_no === n))
    if (free.length === 1) setPicked(free)
  }
  const toggle = n => setPicked(p => p.includes(n) ? p.filter(x => x !== n) : [...p, n].sort((a, b) => a - b))

  async function create() {
    if (!inv || !picked.length) return
    setBusy(true)
    const cust = customers.find(c => c.id === inv.customer_id) || {}
    const email = await currentUserEmail()
    const codes = nextJobCodes(jobs, inv.id, picked.length)
    const created = []
    for (let k = 0; k < picked.length; k++) {
      const n = picked[k]
      const detail = buildFromInvoice(inv, n, cust)
      const { data, error } = await insertJobOrder({
        code: codes[k], customer_id: inv.customer_id, invoice_id: inv.id, invoice_item_no: n,
        item_desc: detail.product.name || `รายการที่ ${n}`, items: detail,
        status: 'รอออกแบบ', document_date: todayStr(), created_by: email, urgent: false,
      })
      if (error) {
        const dup = error.code === '23505' || /duplicate|unique/i.test(error.message)
        notify.error(dup ? `รายการที่ ${n} มีใบงานแล้ว (มีคนสร้างไปก่อน)` : `สร้างใบงานรายการที่ ${n} ไม่สำเร็จ: ${error.message}`)
        continue
      }
      // โฟลเดอร์ Drive ของใบงาน (ไม่สำเร็จก็ยังใช้ใบงานได้ — ไฟล์จะเก็บใน Supabase แทน)
      if (cust.drive_folder_id) {
        try {
          const { folderId } = await createJobFolderClient(cust.drive_folder_id, `${codes[k]}_${detail.product.name || ''}`.slice(0, 120))
          if (folderId) { await updateJobOrder(data.id, { drive_folder_id: folderId }); data.drive_folder_id = folderId }
        } catch { /* ข้ามได้ */ }
      }
      created.push(data)
    }
    setBusy(false)
    if (created.length) {
      notify.success(`สร้าง ${created.map(c => c.code).join(', ')} แล้ว`)
      onCreated(created)
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="dialog jo" role="dialog" aria-modal="true" aria-label="สร้างใบงานจาก Invoice" style={{ maxWidth: 680, padding: 0, gap: 0, overflow: 'hidden' }}>
        <div className="jo-hd" style={{ padding: '14px 18px', fontSize: 16 }}>
          สร้างใบงานจาก Invoice
          <button className="jo-hbtn" onClick={onClose} disabled={busy} aria-label="ปิด">✕</button>
        </div>
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '65vh', overflowY: 'auto' }}>
          {!inv ? (
            <>
              <label className="jo-lbl">ค้นหา Invoice
                <input className="jo-in" autoFocus placeholder="เลขที่ INV หรือชื่อลูกค้า" value={q} onChange={e => setQ(e.target.value)} />
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {list.map(i => {
                  const n = (i.items || []).length
                  const made = jobs.filter(j => j.invoice_id === i.id && j.invoice_item_no).length
                  return (
                    <button key={i.id} type="button" onClick={() => chooseInvoice(i.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1.5px solid #EBD3D1', borderRadius: 8, background: '#fff', textAlign: 'left', fontSize: 14 }}>
                      <b style={{ fontFamily: 'monospace', color: '#8B0B08', minWidth: 90 }}>{i.code}</b>
                      <span style={{ flex: 1 }}>{i.customers?.name || '—'}</span>
                      <span style={{ fontSize: 12.5, color: '#6B5B5A' }}>{n} รายการ · มีใบงาน {made}</span>
                    </button>
                  )
                })}
                {!list.length && <div className="empty-state">ไม่พบ Invoice</div>}
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div><b style={{ fontSize: 16 }}>{inv.code}</b> · {inv.customers?.name}</div>
                {!initialInvoiceId && <button className="jo-chip" onClick={() => { setInvId(''); setPicked([]) }}>เปลี่ยน Invoice</button>}
              </div>
              <div style={{ fontSize: 13, color: '#6B5B5A' }}>เลือกรายการที่จะเปิดใบงาน — <b style={{ color: '#1F1A1A' }}>1 ใบงานต่อ 1 รายการ</b></div>
              {items.map((it, idx) => {
                const n = idx + 1
                const has = existing[n]
                const on = picked.includes(n)
                const sz = Object.entries(it.sizes || {}).filter(([, v]) => Number(v) > 0).map(([s, v]) => `${s} ${v}`).join(' · ')
                return (
                  <label key={n} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 9, cursor: has ? 'default' : 'pointer',
                    border: on ? '2px solid #B80F0B' : '1.5px solid #EBD3D1', background: has ? '#FAFAFA' : on ? '#FDF3F2' : '#fff' }}>
                    <input type="checkbox" disabled={!!has || busy} checked={on} onChange={() => toggle(n)} style={{ width: 20, height: 20, accentColor: '#B80F0B' }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ color: has ? '#6B7280' : '#1F1A1A' }}>{n} · {it.desc || '(ไม่มีชื่อรายการ)'}</b>
                      <span style={{ display: 'block', fontSize: 12.5, color: '#6B5B5A' }}>{Number(it.qty) || sizeTotal(it.sizes)} ตัว{sz ? ` · ${sz}` : ''}</span>
                    </span>
                    {has
                      ? <span className="jo-badge done">มีใบงานแล้ว · {has.code}</span>
                      : <span style={{ fontSize: 12.5, color: '#6B5B5A' }}>ยังไม่มีใบงาน</span>}
                  </label>
                )
              })}
              {!items.length && <div className="empty-state">Invoice นี้ไม่มีรายการสินค้า</div>}
              {legacyJobs.length > 0 && (
                <div style={{ fontSize: 12.5, background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', borderRadius: 8, padding: '8px 12px' }}>
                  Invoice นี้มีใบงานแบบเดิมอยู่แล้ว ({legacyJobs.map(j => j.code).join(', ')}) — ตรวจให้แน่ใจว่าไม่ได้ผลิตรายการเดียวกันซ้ำ
                </div>
              )}
            </>
          )}
        </div>
        <div style={{ padding: '12px 18px', borderTop: '1px solid #F1E4E3', background: '#FCF8F8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5 }}>{inv && picked.length ? <>จะสร้าง <b>{picked.length} ใบงาน</b>: {nextJobCodes(jobs, inv.id, picked.length).join(', ')}</> : 'ยังไม่ได้เลือกรายการ'}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" onClick={onClose} disabled={busy}>ยกเลิก</button>
            <button className="btn btn-primary" onClick={create} disabled={!inv || !picked.length || busy}>{busy ? 'กำลังสร้าง…' : 'สร้างใบงาน'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
