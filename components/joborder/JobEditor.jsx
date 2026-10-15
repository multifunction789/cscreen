'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  updateJobOrder, getJobSteps, insertJobStep, updateJobStep, deleteJobStep,
  getJobLogs, insertJobLog, getJobFiles, insertJobFile, updateJobFile, deleteJobFile, currentUserEmail,
} from '@/lib/db'
import {
  SPEC_FIELDS, TECHNIQUES, QUICK_STEPS, PHASES, STEP_STATUSES, FILE_KINDS, QC_ITEMS, DELIVERY_CHANNELS,
  statusCls, guessPhase, computeOverall, legacyStatus, latestFile, fileKindLabel, sizeTotal, rid, thDate, thDateLong,
} from '@/lib/jobV2'
import { uploadJobImage } from '@/lib/jobProduction.mjs'
import { uploadFileClient } from '@/lib/driveClient'
import { docHref } from '@/lib/docLinks'
import { notify, ask } from '@/lib/feedback'
import { todayStr, printDoc } from '@/lib/docUtils'
import JobPrint from './JobPrint'

const clone = o => JSON.parse(JSON.stringify(o || {}))
const isImage = f => /^image\//.test(f?.mime || '') || /\.(png|jpe?g|webp|gif)$/i.test(f?.name || '')
const fmtTime = t => {
  if (!t) return ''
  const d = new Date(t)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String((d.getFullYear() + 543) % 100).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** อัปโหลดไฟล์ของใบงาน: เข้าโฟลเดอร์ Drive ของใบงานถ้ามี ไม่งั้นเก็บใน Supabase Storage */
async function uploadAny(job, file, name) {
  if (job.drive_folder_id) {
    const r = await uploadFileClient(file, job.drive_folder_id, name)
    return { url: r.webViewLink || r.directUrl, thumb: /^image\//.test(file.type) ? r.directUrl : null }
  }
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `jobs/${job.id}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('job-images').upload(path, file, { upsert: false, contentType: file.type || undefined })
  if (error) throw new Error(error.message)
  const url = supabase.storage.from('job-images').getPublicUrl(path).data.publicUrl
  return { url, thumb: /^image\//.test(file.type) ? url : null }
}

export default function JobEditor({ job, invoice, siblings, suppliers, onBack, onSaved, onCreateFromInvoice }) {
  const [d, setD]           = useState(() => clone(job.items))
  const [due, setDue]       = useState(job.due_date || '')
  const [urgent, setUrgent] = useState(!!job.urgent)
  const [dirty, setDirty]   = useState(false)
  const [saving, setSaving] = useState(false)
  const [steps, setSteps]   = useState([])
  const [logs, setLogs]     = useState([])
  const [files, setFiles]   = useState([])
  const [busyFile, setBusyFile] = useState(false)
  const [upKind, setUpKind] = useState('artwork')
  const [newSize, setNewSize] = useState('')
  const [printing, setPrinting] = useState(false)
  const [dragIdx, setDragIdx] = useState(null)
  const [overIdx, setOverIdx] = useState(null)
  const emailRef = useRef(null)
  const statusRef = useRef(job.status)

  // โหลดแผนการผลิต / ประวัติ / ไฟล์
  useEffect(() => {
    let alive = true
    Promise.all([getJobSteps(job.id), getJobLogs(job.id), getJobFiles(job.id), currentUserEmail()]).then(([s, l, f, email]) => {
      if (!alive) return
      if (s.error || l.error || f.error) notify.error('โหลดแผนการผลิตไม่ครบ: ' + (s.error || l.error || f.error).message)
      setSteps(s.data || []); setLogs(l.data || []); setFiles(f.data || [])
      emailRef.current = email
    })
    return () => { alive = false }
  }, [job.id])

  // เตือนก่อนปิดแท็บถ้ายังไม่บันทึก
  useEffect(() => {
    if (!dirty) return
    const h = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const overall = useMemo(() => computeOverall(steps), [steps])
  const total = sizeTotal(d.qtys)
  const src = d.source || {}

  const set = (path, value) => {
    setDirty(true)
    setD(prev => {
      const next = clone(prev)
      const keys = path.split('.')
      let o = next
      keys.slice(0, -1).forEach(k => { o[k] = o[k] ?? {}; o = o[k] })
      o[keys.at(-1)] = value
      return next
    })
  }

  async function save() {
    setSaving(true)
    const payload = {
      items: d, due_date: due || null, urgent,
      item_desc: d.product?.name || job.item_desc,
      status: legacyStatus(overall),
    }
    const { error } = await updateJobOrder(job.id, payload)
    setSaving(false)
    if (error) return notify.error('บันทึกไม่สำเร็จ: ' + error.message)
    setDirty(false)
    notify.success(`บันทึก ${job.code} แล้ว`)
    onSaved?.({ ...job, ...payload })
  }

  async function back() {
    if (dirty && !(await ask({ title: 'ยังไม่ได้บันทึก', message: 'มีการแก้ไขที่ยังไม่บันทึก ต้องการออกโดยไม่บันทึกหรือไม่?', confirmLabel: 'ออกโดยไม่บันทึก', danger: true }))) return
    onBack()
  }

  /* ── แผนการผลิต (บันทึกทันทีทุกครั้งที่แก้) ───────────────── */
  async function log(step, from, to, detail) {
    const row = { job_order_id: job.id, step_id: step?.id || null, step_name: step?.name || null, from_status: from || null, to_status: to || null, detail: detail || null, changed_by: emailRef.current || await currentUserEmail() }
    const { error } = await insertJobLog(row)
    if (!error) setLogs(l => [{ ...row, id: rid(), changed_at: new Date().toISOString() }, ...l])
  }

  /** อัปเดตสถานะรวมของใบงานให้หน้าติดตามงาน/บอร์ดเดิมเห็น */
  async function syncStatus(nextSteps) {
    const st = legacyStatus(computeOverall(nextSteps))
    if (st !== statusRef.current) {
      statusRef.current = st
      await updateJobOrder(job.id, { status: st })
      onSaved?.({ ...job, status: st }, { silent: true })
    }
  }

  async function addStep(name = '') {
    const seq = steps.reduce((m, s) => Math.max(m, s.seq || 0), 0) + 1
    const { data, error } = await insertJobStep({ job_order_id: job.id, seq, name: name || 'ขั้นตอนใหม่', phase: guessPhase(name), status: 'รอเริ่ม', updated_by: emailRef.current })
    if (error) return notify.error('เพิ่มขั้นตอนไม่สำเร็จ: ' + error.message)
    const next = [...steps, data]
    setSteps(next)
    log(data, null, null, `เพิ่มขั้นตอน "${data.name}"`)
    syncStatus(next)
  }

  async function patchStep(step, patch) {
    const before = step
    const optimistic = steps.map(s => s.id === step.id ? { ...s, ...patch } : s)
    setSteps(optimistic)
    const extra = {}
    if (patch.status === 'เสร็จแล้ว' && !step.received_date && !('received_date' in patch)) extra.received_date = todayStr()
    if (patch.status === 'ส่งงานแล้ว' && !step.sent_date && !('sent_date' in patch)) extra.sent_date = todayStr()
    const { data, error } = await updateJobStep(step.id, { ...patch, ...extra, updated_by: emailRef.current })
    if (error) {
      setSteps(s => s.map(x => x.id === step.id ? before : x))
      return notify.error('บันทึกขั้นตอนไม่สำเร็จ: ' + error.message)
    }
    const next = optimistic.map(s => s.id === step.id ? { ...s, ...data } : s)
    setSteps(next)
    if ('status' in patch && patch.status !== before.status) {
      log(data, before.status, patch.status, extra.received_date ? `รับจริง ${thDate(extra.received_date)}` : extra.sent_date ? `ส่งงาน ${thDate(extra.sent_date)}` : null)
      syncStatus(next)
    } else if ('supplier_id' in patch && patch.supplier_id !== before.supplier_id) {
      log(data, null, null, `เปลี่ยน Supplier เป็น ${data.suppliers?.name || 'ไม่ระบุ'}`)
    } else if ('received_date' in patch && patch.received_date !== before.received_date) {
      log(data, null, null, `บันทึกรับจริง ${thDate(patch.received_date) || '(ล้าง)'}`)
    }
  }

  async function removeStep(step) {
    if (!(await ask({ title: `ลบขั้นตอน "${step.name}"?`, message: 'ประวัติการเปลี่ยนสถานะยังเก็บไว้', confirmLabel: 'ลบ', danger: true }))) return
    const { error } = await deleteJobStep(step.id)
    if (error) return notify.error('ลบไม่สำเร็จ: ' + error.message)
    const next = steps.filter(s => s.id !== step.id)
    setSteps(next)
    log(step, null, null, `ลบขั้นตอน "${step.name}"`)
    syncStatus(next)
  }

  async function moveStep(from, to) {
    if (from === to || to < 0 || to >= steps.length) return
    const ordered = [...steps].sort((a, b) => a.seq - b.seq)
    const [m] = ordered.splice(from, 1)
    ordered.splice(to, 0, m)
    const next = ordered.map((s, i) => ({ ...s, seq: i + 1 }))
    setSteps(next)
    const changed = next.filter(s => steps.find(o => o.id === s.id)?.seq !== s.seq)
    const res = await Promise.all(changed.map(s => updateJobStep(s.id, { seq: s.seq })))
    if (res.some(r => r.error)) notify.error('เรียงลำดับไม่สำเร็จบางขั้น — กรุณาลองใหม่')
    syncStatus(next)
  }

  /* ── ไฟล์งาน ─────────────────────────────────────────────── */
  async function uploadFiles(fileList, kind, side = null) {
    const arr = Array.from(fileList || [])
    if (!arr.length) return
    setBusyFile(true)
    try {
      for (const file of arr) {
        if (file.size > 25 * 1024 * 1024) { notify.warn(`${file.name} ใหญ่เกิน 25 MB`); continue }
        const sameKind = files.filter(f => f.kind === kind && (f.side || null) === side)
        const version = sameKind.reduce((m, f) => Math.max(m, f.version || 0), 0) + 1
        const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : ''
        const name = `${job.code}_${fileKindLabel(kind)}${side ? '-' + (side === 'front' ? 'หน้า' : 'หลัง') : ''}_v${version}${ext}`
        const up = await uploadAny(job, file, name)
        const { data, error } = await insertJobFile({ job_order_id: job.id, kind, side, name: file.name, url: up.url, thumb_url: up.thumb, mime: file.type || null, version, approved: false, uploaded_by: emailRef.current })
        if (error) throw new Error(error.message)
        setFiles(f => [data, ...f])
      }
      notify.success('อัปโหลดแล้ว')
    } catch (e) {
      notify.error('อัปโหลดไม่สำเร็จ: ' + e.message)
    } finally {
      setBusyFile(false)
    }
  }

  async function toggleApprove(f) {
    const { error } = await updateJobFile(f.id, { approved: !f.approved })
    if (error) return notify.error('บันทึกไม่สำเร็จ: ' + error.message)
    setFiles(list => list.map(x => x.id === f.id ? { ...x, approved: !f.approved } : x))
    log(null, null, null, `${f.approved ? 'ยกเลิกอนุมัติ' : 'อนุมัติ'} ${fileKindLabel(f.kind)} v${f.version}`)
  }

  async function removeFile(f) {
    if (!(await ask({ title: 'ลบไฟล์นี้ออกจากใบงาน?', message: `${fileKindLabel(f.kind)} v${f.version} · ${f.name}`, confirmLabel: 'ลบ', danger: true }))) return
    const { error } = await deleteJobFile(f.id)
    if (error) return notify.error('ลบไม่สำเร็จ: ' + error.message)
    setFiles(list => list.filter(x => x.id !== f.id))
  }

  async function decoImage(idx, file) {
    if (!file) return
    try {
      const url = await uploadJobImage(supabase, 'job-images', file)
      set(`decorations.${idx}.image_url`, url)
    } catch (e) { notify.error(e.message) }
  }

  const ordered = [...steps].sort((a, b) => a.seq - b.seq)
  const mockFront = latestFile(files, 'mockup', 'front')
  const mockBack  = latestFile(files, 'mockup', 'back')
  const supplierName = id => suppliers.find(s => s.id === id)?.name || ''

  if (printing) {
    return (
      <div className="jo" style={{ maxWidth: 840, margin: '0 auto' }}>
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={() => setPrinting(false)}>← กลับไปแก้ไข</button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {dirty && <span style={{ fontSize: 12.5, color: '#B45309', fontWeight: 700 }}>มีการแก้ไขที่ยังไม่บันทึก — ใบพิมพ์แสดงตามหน้าจอ</span>}
            <button className="btn btn-primary" onClick={() => printDoc('print-area', `${(d.customer?.name || '').replace(/\s+/g, '_').replace(/[\/\\:*?"<>|]/g, '')}_${job.code}`)}>🖨️ พิมพ์ A4</button>
          </div>
        </div>
        <JobPrint job={{ ...job, due_date: due, urgent }} d={d} steps={ordered} files={files} invoice={invoice} siblings={siblings} supplierName={supplierName} overall={overall} />
      </div>
    )
  }

  return (
    <div className="jo" style={{ maxWidth: 1120 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-outline" onClick={back}>← รายการใบงาน</button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {dirty && <span style={{ fontSize: 12.5, color: '#B45309', fontWeight: 700 }}>● ยังไม่บันทึก</span>}
          <button className="btn btn-outline" onClick={() => setPrinting(true)}>ดูก่อนพิมพ์ A4</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !dirty}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</button>
        </div>
      </div>

      {/* Header */}
      <section className="jo-card jo-head" style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 230px', gap: 16, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 25, fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap' }}>ใบงานผลิต</span>
            <span style={{ background: '#8B0B08', color: '#fff', fontWeight: 800, fontSize: 16, padding: '3px 12px', borderRadius: 6, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{job.code}</span>
            <span className={`jo-badge ${overall.tone}`} style={{ fontSize: 13 }}>สถานะรวม: {overall.label}</span>
          </div>
          <div style={{ fontSize: 15.5, fontWeight: 800 }}>
            อ้างอิง {invoice ? <Link href={docHref('invoice', invoice.id)} style={{ color: '#B80F0B' }}>{invoice.code}</Link> : src.invoice_code || '—'} · รายการที่ {src.item_no || '—'} จาก {src.item_count || '—'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input className="jo-in" aria-label="ชื่อสินค้า" value={d.product?.name || ''} onChange={e => set('product.name', e.target.value)}
              style={{ width: 'auto', minWidth: 220, flex: '0 1 320px', background: '#F8E1E0', borderColor: '#F8E1E0', fontWeight: 800, fontSize: 16, color: '#8B0B08' }} />
            <span style={{ fontWeight: 800, fontSize: 16 }}>— {total || d.product?.qty || 0} ตัว</span>
            <span style={{ fontSize: 12.5, color: '#6B5B5A' }}>สร้าง {thDateLong(job.document_date || job.created_at?.slice(0, 10))}{job.created_by ? ` โดย ${job.created_by}` : ''}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ background: '#D7141A', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, display: 'flex', flexDirection: 'column', gap: 2 }}>กำหนดส่ง
            <input type="date" value={due || ''} onChange={e => { setDue(e.target.value); setDirty(true) }}
              style={{ border: 'none', background: 'transparent', color: '#fff', fontSize: 19, fontWeight: 800, padding: 0, outline: 'none', colorScheme: 'dark' }} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button type="button" className="btn btn-outline" aria-pressed={!urgent} onClick={() => { setUrgent(false); setDirty(true) }} style={{ height: 36, justifyContent: 'center', ...(!urgent ? { borderColor: '#1F2937', fontWeight: 800 } : {}) }}>ปกติ</button>
            <button type="button" className="btn btn-outline" aria-pressed={urgent} onClick={() => { setUrgent(true); setDirty(true) }} style={{ height: 36, justifyContent: 'center', ...(urgent ? { background: '#FDE2E3', borderColor: '#D7141A', color: '#C8102E', fontWeight: 800 } : {}) }}>ด่วน</button>
          </div>
        </div>
      </section>

      {/* Customer + Invoice */}
      <section className="jo-grid2">
        <div className="jo-card">
          <div className="jo-hd">ข้อมูลลูกค้า <small>ดึงจาก {src.invoice_code || 'Invoice'} · แก้ในใบงานได้ ไม่กระทบ Invoice</small></div>
          <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label className="jo-lbl" style={{ gridColumn: '1/-1' }}>ชื่อลูกค้า<input className="jo-in" style={{ fontWeight: 800 }} value={d.customer?.name || ''} onChange={e => set('customer.name', e.target.value)} /></label>
            <label className="jo-lbl">ผู้ติดต่อ<input className="jo-in" value={d.customer?.contact || ''} onChange={e => set('customer.contact', e.target.value)} /></label>
            <label className="jo-lbl">โทรศัพท์<input className="jo-in" value={d.customer?.phone || ''} onChange={e => set('customer.phone', e.target.value)} /></label>
            <label className="jo-lbl">LINE<input className="jo-in" value={d.customer?.line || ''} onChange={e => set('customer.line', e.target.value)} /></label>
            <label className="jo-lbl" style={{ gridColumn: '1/-1' }}>ที่อยู่จัดส่ง<input className="jo-in" value={d.customer?.address || ''} onChange={e => set('customer.address', e.target.value)} /></label>
          </div>
        </div>
        <div className="jo-card">
          <div className="jo-hd">อ้างอิงใบแจ้งหนี้ {src.invoice_code} <small>{src.invoice_date ? `ลงวันที่ ${thDateLong(String(src.invoice_date).slice(0, 10))}` : ''}</small></div>
          <div className="table-wrap">
            <table className="jo-tbl">
              <thead><tr><th style={{ width: 36 }}></th><th style={{ width: 56 }}>รายการ</th><th>สินค้า</th><th>จำนวน</th><th>ใบงาน</th></tr></thead>
              <tbody>
                {(invoice?.items || []).map((it, i) => {
                  const n = i + 1
                  const me = n === src.item_no
                  const other = siblings.find(s => s.invoice_item_no === n && s.id !== job.id)
                  return (
                    <tr key={n} style={me ? { background: '#FBEDEC', fontWeight: 800 } : undefined}>
                      <td style={{ textAlign: 'center', color: '#8B0B08', fontSize: 16 }}>{me ? '◉' : '○'}</td>
                      <td>{n}</td><td>{it.desc || '—'}</td><td>{Number(it.qty) || sizeTotal(it.sizes)} ตัว</td>
                      <td>{me ? 'ใบงานนี้'
                        : other ? <Link href={docHref('joborder', other.id)} style={{ fontWeight: 700, color: '#1E40AF', textDecoration: 'none' }}>{other.code} ›</Link>
                        : <button type="button" className="jo-chip" style={{ height: 26, fontSize: 12.5 }} onClick={() => onCreateFromInvoice?.(invoice.id)}>+ สร้างใบงาน</button>}</td>
                    </tr>
                  )
                })}
                {!invoice && <tr><td colSpan={5} className="empty-state">ไม่พบ Invoice ต้นทาง (อาจถูกลบ) — ข้อมูลในใบงานยังอยู่ครบ</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Product detail */}
      <section className="jo-card">
        <div className="jo-hd" style={{ justifyContent: 'flex-start' }}>รายละเอียดสินค้า <small>(ตามรายการที่เลือก)</small></div>
        <div className="jo-spec" style={{ padding: '12px 14px' }}>
          {SPEC_FIELDS.map(f => (
            <label key={f.key} className="jo-lbl">{f.label}
              <input className="jo-in" list={f.options ? `jo-opt-${f.key}` : undefined} value={d.spec?.[f.key] || ''} onChange={e => set(`spec.${f.key}`, e.target.value)} placeholder={f.options ? 'เลือก / พิมพ์' : ''} />
              {f.options && <datalist id={`jo-opt-${f.key}`}>{f.options.map(o => <option key={o} value={o} />)}</datalist>}
            </label>
          ))}
        </div>
        <div className="jo-grid2" style={{ padding: '0 14px 14px', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)' }}>
          <div style={{ border: '1px solid #EBD3D1', borderRadius: 8, overflow: 'hidden' }}>
            <div className="table-wrap">
              <table className="jo-tbl" style={{ textAlign: 'center' }}>
                <thead><tr><th style={{ width: 92 }}>ไซส์</th>{(d.sizes || []).map(s => (
                  <th key={s} style={{ textAlign: 'center' }}>{s}<button type="button" aria-label={`ลบไซส์ ${s}`} onClick={() => { const { [s]: _, ...rest } = d.qtys || {}; void _; set('sizes', d.sizes.filter(x => x !== s)); set('qtys', rest) }} style={{ border: 'none', background: 'none', color: '#B91C1C', fontSize: 12, padding: '0 0 0 3px' }}>×</button></th>
                ))}<th style={{ textAlign: 'center' }}>รวม</th></tr></thead>
                <tbody><tr>
                  <td style={{ fontWeight: 800, fontSize: 13, textAlign: 'left' }}>จำนวน (ตัว)</td>
                  {(d.sizes || []).map(s => (
                    <td key={s} style={{ padding: '6px 3px' }}><input className="jo-in" inputMode="numeric" aria-label={`จำนวนไซส์ ${s}`} value={d.qtys?.[s] || ''} onChange={e => set(`qtys.${s}`, e.target.value.replace(/[^\d]/g, ''))} style={{ width: 50, textAlign: 'center', padding: 0, fontWeight: 700 }} /></td>
                  ))}
                  <td style={{ background: '#F8E1E0', fontWeight: 800, fontSize: 17 }}>{total}</td>
                </tr></tbody>
              </table>
            </div>
            <div style={{ padding: '6px 10px', fontSize: 12.5, borderTop: '1px solid #F1E4E3', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {d.product?.qty ? (total === d.product.qty
                ? <b style={{ color: '#166534' }}>✓ ตรงกับ Invoice ({d.product.qty} ตัว)</b>
                : <b style={{ color: '#B45309' }}>Invoice {d.product.qty} ตัว · ต่างกัน {total - d.product.qty > 0 ? '+' : ''}{total - d.product.qty}</b>) : null}
              <span style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 'auto' }}>
                <input className="jo-in" aria-label="เพิ่มไซส์" placeholder="ไซส์" value={newSize} onChange={e => setNewSize(e.target.value)} style={{ width: 70, height: 30 }} />
                <button type="button" className="jo-chip" onClick={() => { const s = newSize.trim(); if (s && !(d.sizes || []).includes(s)) { set('sizes', [...(d.sizes || []), s]); setNewSize('') } }}>+ เพิ่มไซส์</button>
              </span>
            </div>
          </div>
          <label className="jo-lbl">หมายเหตุการผลิต / ตัดเย็บ<textarea className="jo-in" rows={4} value={d.sew_note || ''} onChange={e => set('sew_note', e.target.value)} placeholder="เช่น ผ่าข้าง 1.5 นิ้ว · ปกขลิบขาว 2 เส้น" /></label>
        </div>
      </section>

      {/* Mockup + decorations */}
      <section className="jo-grid2">
        <div className="jo-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="jo-hd">แบบเสื้อ (Mockup) <small>แสดงฉบับอนุมัติล่าสุด</small></div>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 12 }}>
            {[['front', 'ด้านหน้า', mockFront], ['back', 'ด้านหลัง', mockBack]].map(([side, label, f]) => (
              <div key={side} style={{ position: 'relative', background: '#FAF6F6', border: '1.5px dashed #EBD3D1', borderRadius: 8, padding: '34px 10px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 230 }}>
                <span style={{ position: 'absolute', top: 8, left: 8, background: '#D7141A', color: '#fff', fontSize: 12, fontWeight: 800, padding: '2px 8px', borderRadius: 4 }}>{label}</span>
                {f ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a href={f.url} target="_blank" rel="noreferrer"><img src={f.thumb_url || f.url} alt={`Mockup ${label}`} style={{ maxWidth: '100%', maxHeight: 220, objectFit: 'contain', display: 'block' }} /></a>
                ) : <span style={{ color: '#9CA3AF', fontSize: 13 }}>ยังไม่มีรูป</span>}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {f && <span className={`jo-badge ${f.approved ? 'done' : 'doing'}`}>v{f.version} {f.approved ? 'อนุมัติ' : 'รออนุมัติ'}</span>}
                  <label className="jo-chip" style={{ display: 'inline-flex', alignItems: 'center', cursor: busyFile ? 'wait' : 'pointer' }}>
                    {f ? 'อัปโหลดเวอร์ชันใหม่' : 'อัปโหลดรูป'}
                    <input type="file" accept="image/*" hidden disabled={busyFile} onChange={e => { uploadFiles(e.target.files, 'mockup', side); e.target.value = '' }} />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="jo-card">
          <div className="jo-hd">รายละเอียดงานตกแต่ง
            <button type="button" className="jo-hbtn" onClick={() => set('decorations', [...(d.decorations || []), { id: rid(), technique: '', position: '', size: '', colors: '', image_url: '' }])}>+ เพิ่ม</button>
          </div>
          {(d.decorations || []).map((x, i) => (
            <div key={x.id || i} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0,1fr) 28px', gap: 10, padding: '10px 12px', borderTop: i ? '1px solid #F1E4E3' : 'none' }}>
              <label style={{ width: 64, height: 64, borderRadius: 6, background: x.image_url ? '#fff' : '#8B0B08', border: '1px solid #EBD3D1', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', color: '#fff', fontSize: 11, textAlign: 'center' }} title="แนบรูปลาย">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {x.image_url ? <img src={x.image_url} alt="ลาย" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : '+ รูปลาย'}
                <input type="file" accept="image/*" hidden onChange={e => { decoImage(i, e.target.files?.[0]); e.target.value = '' }} />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 6 }}>
                <label className="jo-lbl">เทคนิค<input className="jo-in" list="jo-opt-tech" value={x.technique} onChange={e => set(`decorations.${i}.technique`, e.target.value)} placeholder="เลือก / พิมพ์" /></label>
                <label className="jo-lbl">ตำแหน่ง<input className="jo-in" value={x.position} onChange={e => set(`decorations.${i}.position`, e.target.value)} placeholder="อกซ้าย" /></label>
                <label className="jo-lbl">ขนาด (ซม.)<input className="jo-in" value={x.size} onChange={e => set(`decorations.${i}.size`, e.target.value)} placeholder="7 × 7" /></label>
                <label className="jo-lbl" style={{ gridColumn: '1/-1' }}>จำนวนสี / สีด้าย<input className="jo-in" value={x.colors} onChange={e => set(`decorations.${i}.colors`, e.target.value)} placeholder="3 สี: ขาว ทอง แดง" /></label>
              </div>
              <button type="button" className="jo-x" aria-label="ลบงานตกแต่ง" onClick={() => set('decorations', d.decorations.filter((_, k) => k !== i))}>×</button>
            </div>
          ))}
          {!(d.decorations || []).length && <div className="empty-state">ยังไม่มีงานตกแต่ง — กด “+ เพิ่ม”</div>}
          <datalist id="jo-opt-tech">{TECHNIQUES.map(t => <option key={t} value={t} />)}</datalist>
        </div>
      </section>

      {/* Files */}
      <section className="jo-card">
        <div className="jo-hd">ไฟล์งาน
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select aria-label="ประเภทไฟล์" value={upKind} onChange={e => setUpKind(e.target.value)} style={{ height: 30, borderRadius: 6, border: 'none', fontSize: 13, padding: '0 6px' }}>
              {FILE_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
            <label className="jo-hbtn" style={{ display: 'inline-flex', alignItems: 'center', cursor: busyFile ? 'wait' : 'pointer' }}>
              {busyFile ? 'กำลังอัปโหลด…' : '+ อัปโหลดไฟล์'}
              <input type="file" multiple hidden disabled={busyFile} onChange={e => { uploadFiles(e.target.files, upKind, upKind === 'mockup' ? 'front' : null); e.target.value = '' }} />
            </label>
          </span>
        </div>
        <div className="jo-grid2" style={{ gridTemplateColumns: 'minmax(0,1fr) 150px', padding: '6px 14px 12px', alignItems: 'center' }}>
          <div className="table-wrap">
            <table className="jo-tbl">
              <thead><tr><th>ประเภท</th><th>ไฟล์</th><th>เวอร์ชัน</th><th>สถานะ</th><th>อัปโหลดโดย</th><th></th></tr></thead>
              <tbody>
                {files.map(f => {
                  const latest = latestFile(files, f.kind, f.side || undefined)
                  const isLatestApproved = f.approved && latest?.id === f.id
                  return (
                    <tr key={f.id} style={!f.approved && latest?.id !== f.id ? { color: '#9CA3AF' } : undefined}>
                      <td><b>{fileKindLabel(f.kind)}</b>{f.side ? <span style={{ fontSize: 12, color: '#6B5B5A' }}> · {f.side === 'front' ? 'หน้า' : 'หลัง'}</span> : null}</td>
                      <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isImage(f) ? '🖼 ' : '📄 '}{f.name}</td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>v{f.version}</td>
                      <td>
                        {isLatestApproved ? <span className="jo-badge done">★ อนุมัติล่าสุด</span>
                          : f.approved ? <span className="jo-badge wait">อนุมัติ (เวอร์ชันเก่า)</span>
                          : <span className="jo-badge doing">รออนุมัติ</span>}
                        {' '}<button type="button" className="jo-chip" style={{ height: 26, fontSize: 12 }} onClick={() => toggleApprove(f)}>{f.approved ? 'ยกเลิกอนุมัติ' : 'อนุมัติ'}</button>
                      </td>
                      <td style={{ fontSize: 12.5, color: '#6B5B5A' }}>{f.uploaded_by || '—'} · {fmtTime(f.created_at)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}><a href={f.url} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>เปิดดู</a> <button type="button" className="jo-x" aria-label="ลบไฟล์" onClick={() => removeFile(f)}>×</button></td>
                    </tr>
                  )
                })}
                {!files.length && <tr><td colSpan={6} className="empty-state">ยังไม่มีไฟล์ — เลือกประเภทแล้วกด “+ อัปโหลดไฟล์”</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ textAlign: 'center', fontSize: 12.5, color: '#6B5B5A' }}>
            {job.drive_folder_id
              ? <a href={`https://drive.google.com/drive/folders/${job.drive_folder_id}`} target="_blank" rel="noreferrer" style={{ fontWeight: 800 }}>📁 เปิดโฟลเดอร์ Drive<br />ของใบงานนี้</a>
              : 'ลูกค้ายังไม่มีโฟลเดอร์ Drive — ไฟล์เก็บในระบบแทน'}
          </div>
        </div>
      </section>

      {/* Phases */}
      <section className="jo-chev" aria-label="ลำดับการผลิต">
        <div className="cap">ลำดับการผลิต</div>
        {overall.phases.map(p => <div key={p.name} className={p.state}>{p.name}{p.state === 'done' ? ' ✓' : p.total ? ` · ${p.done}/${p.total}` : ''}</div>)}
      </section>

      {/* Plan */}
      <section className="jo-card">
        <div className="jo-hd" style={{ justifyContent: 'flex-start' }}>แผนการผลิต / ผู้รับผิดชอบ
          <button type="button" className="jo-hbtn solid" onClick={() => addStep('')}>+ เพิ่มขั้นตอน</button>
          <small style={{ marginLeft: 'auto' }}>ลาก ⋮⋮ หรือกด ▲▼ เพื่อเรียงลำดับ · บันทึกทันที</small>
        </div>
        <div className="table-wrap">
          <table className="jo-tbl" style={{ minWidth: 980 }}>
            <thead><tr><th style={{ width: 54 }}></th><th style={{ width: 40 }}>ลำดับ</th><th>ขั้นตอน</th><th>ช่วง</th><th>Supplier / ผู้รับผิดชอบ</th><th>วันที่ส่ง</th><th>กำหนดรับ</th><th>รับจริง</th><th>สถานะ</th><th>หมายเหตุ</th><th style={{ width: 34 }}></th></tr></thead>
            <tbody>
              {ordered.map((s, i) => (
                <tr key={s.id} className={`jo-steprow${overIdx === i ? ' dragover' : ''}`}
                  draggable onDragStart={() => setDragIdx(i)} onDragOver={e => { e.preventDefault(); setOverIdx(i) }}
                  onDragLeave={() => setOverIdx(null)} onDrop={() => { moveStep(dragIdx, i); setDragIdx(null); setOverIdx(null) }}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className="jo-drag" aria-hidden>⋮⋮</span>
                    <button type="button" aria-label="เลื่อนขึ้น" disabled={i === 0} onClick={() => moveStep(i, i - 1)} style={{ border: 'none', background: 'none', padding: '0 2px', color: '#8B0B08' }}>▲</button>
                    <button type="button" aria-label="เลื่อนลง" disabled={i === ordered.length - 1} onClick={() => moveStep(i, i + 1)} style={{ border: 'none', background: 'none', padding: '0 2px', color: '#8B0B08' }}>▼</button>
                  </td>
                  <td style={{ fontWeight: 700 }}>{i + 1}</td>
                  <td><input className="jo-in" list="jo-opt-steps" aria-label="ชื่อขั้นตอน" defaultValue={s.name} style={{ width: 120, fontWeight: 700 }}
                    onBlur={e => { const v = e.target.value.trim(); if (v && v !== s.name) patchStep(s, { name: v }) }} /></td>
                  <td><select className="jo-in" aria-label="ช่วงการผลิต" value={s.phase || guessPhase(s.name)} onChange={e => patchStep(s, { phase: e.target.value })} style={{ width: 92 }}>
                    {PHASES.map(p => <option key={p}>{p}</option>)}</select></td>
                  <td><select className="jo-in" aria-label="Supplier" value={s.supplier_id || ''} onChange={e => patchStep(s, { supplier_id: e.target.value || null })} style={{ width: 180 }}>
                    <option value="">— ภายใน / ไม่ระบุ —</option>
                    {suppliers.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select></td>
                  <td><input type="date" className="jo-in" aria-label="วันที่ส่ง" value={s.sent_date || ''} onChange={e => patchStep(s, { sent_date: e.target.value || null })} style={{ width: 132 }} /></td>
                  <td><input type="date" className="jo-in" aria-label="กำหนดรับ" value={s.due_date || ''} onChange={e => patchStep(s, { due_date: e.target.value || null })} style={{ width: 132, fontWeight: 700 }} /></td>
                  <td><input type="date" className="jo-in" aria-label="รับจริง" value={s.received_date || ''} onChange={e => patchStep(s, { received_date: e.target.value || null })} style={{ width: 132 }} /></td>
                  <td><select aria-label="สถานะ" className={`jo-st ${statusCls(s.status)}`} value={s.status} onChange={e => patchStep(s, { status: e.target.value })}>
                    {STEP_STATUSES.map(x => <option key={x.id}>{x.id}</option>)}</select></td>
                  <td><input className="jo-in" aria-label="หมายเหตุ" defaultValue={s.note || ''} style={{ minWidth: 140 }}
                    onBlur={e => { if ((e.target.value || '') !== (s.note || '')) patchStep(s, { note: e.target.value }) }} /></td>
                  <td><button type="button" className="jo-x" aria-label="ลบขั้นตอน" onClick={() => removeStep(s)}>×</button></td>
                </tr>
              ))}
              {!ordered.length && <tr><td colSpan={11} className="empty-state">ยังไม่มีขั้นตอน — กด “+ เพิ่มขั้นตอน” หรือเลือกจากปุ่มด้านล่าง</td></tr>}
            </tbody>
          </table>
          <datalist id="jo-opt-steps">{QUICK_STEPS.map(t => <option key={t} value={t} />)}</datalist>
        </div>
        <div style={{ padding: '10px 14px', borderTop: '1px solid #F1E4E3', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#6B5B5A', fontWeight: 700 }}>เพิ่มเร็ว:</span>
          {QUICK_STEPS.map(t => <button key={t} type="button" className="jo-chip" onClick={() => addStep(t)}>+ {t}</button>)}
        </div>
        <div style={{ padding: '10px 14px 14px', borderTop: '1px solid #F1E4E3' }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>ประวัติการเปลี่ยนแปลง</div>
          {logs.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: '4px 14px', fontSize: 13.5 }}>
              {logs.slice(0, 30).map(l => (
                <div key={l.id} style={{ display: 'contents' }}>
                  <span style={{ color: '#6B5B5A', whiteSpace: 'nowrap' }}>{fmtTime(l.changed_at)}</span>
                  <b style={{ whiteSpace: 'nowrap' }}>{l.changed_by}</b>
                  <span>{l.step_name && l.to_status ? <>{l.step_name}: {l.from_status} → <b className={`jo-badge ${statusCls(l.to_status)}`}>{l.to_status}</b></> : l.step_name ? `${l.step_name}: ` : null}{l.detail ? <span style={{ color: '#6B5B5A' }}> {l.detail}</span> : null}</span>
                </div>
              ))}
            </div>
          ) : <div style={{ fontSize: 13, color: '#9CA3AF' }}>ยังไม่มีการเปลี่ยนแปลง</div>}
        </div>
      </section>

      {/* QC + delivery */}
      <section className="jo-grid2">
        <div className="jo-card">
          <div className="jo-hd">ตรวจสอบคุณภาพ (QC Checklist)</div>
          <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 14px' }}>
            {QC_ITEMS.map(q => (
              <label key={q.key} style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 36, fontSize: 14 }}>
                <input type="checkbox" checked={!!d.qc?.[q.key]} onChange={e => set(`qc.${q.key}`, e.target.checked)} style={{ width: 18, height: 18, accentColor: '#8B0B08' }} />
                {q.label}{q.key === 'qty' ? ` (${total} ตัว)` : ''}
              </label>
            ))}
            <label className="jo-chip" style={{ display: 'inline-flex', alignItems: 'center', justifySelf: 'start', cursor: 'pointer' }}>
              + แนบรูปหลังผลิต
              <input type="file" accept="image/*" multiple hidden onChange={e => { uploadFiles(e.target.files, 'finished'); e.target.value = '' }} />
            </label>
          </div>
        </div>
        <div className="jo-card">
          <div className="jo-hd">การส่งมอบ / การติดตาม</div>
          <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label className="jo-lbl">ส่งมอบวันที่<input type="date" className="jo-in" value={d.delivery?.date || ''} onChange={e => set('delivery.date', e.target.value)} /></label>
            <label className="jo-lbl">ช่องทางจัดส่ง<input className="jo-in" list="jo-opt-deliv" value={d.delivery?.channel || ''} onChange={e => set('delivery.channel', e.target.value)} placeholder="เลือก / พิมพ์" /></label>
            <datalist id="jo-opt-deliv">{DELIVERY_CHANNELS.map(t => <option key={t} value={t} />)}</datalist>
            <label className="jo-lbl" style={{ gridColumn: '1/-1' }}>เลขที่พัสดุ / Tracking<input className="jo-in" value={d.delivery?.tracking || ''} onChange={e => set('delivery.tracking', e.target.value)} placeholder="ใส่เมื่อส่งของ" /></label>
          </div>
        </div>
      </section>

      {dirty && (
        <div className="no-print" style={{ position: 'sticky', bottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ boxShadow: '0 6px 20px rgba(0,0,0,.2)' }}>{saving ? 'กำลังบันทึก…' : '💾 บันทึกการแก้ไข'}</button>
        </div>
      )}
    </div>
  )
}
