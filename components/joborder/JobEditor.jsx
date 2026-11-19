'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  updateJobOrder, getJobSteps, insertJobStep, updateJobStep, deleteJobStep,
  getJobLogs, insertJobLog, getJobFiles, insertJobFile, currentUserEmail,
} from '@/lib/db'
import {
  QUICK_STEPS, PHASES, STEP_STATUSES, QC_ITEMS, DELIVERY_CHANNELS,
  statusCls, guessPhase, computeOverall, legacyStatus, latestFile, sizeTotal, rid, thDate, thDateLong,
  jobVariants, jobItemNos, aggregateSizes, orderSizes, itemNosLabel, mockSide,
} from '@/lib/jobV2'
import { uploadJobImage } from '@/lib/jobProduction.mjs'
import { docHref } from '@/lib/docLinks'
import { notify, ask } from '@/lib/feedback'
import { todayStr, printDoc } from '@/lib/docUtils'
import JobPrint from './JobPrint'
import DateInput from '@/components/ui/DateInput'

const clone = o => JSON.parse(JSON.stringify(o || {}))

/** ข้อมูลใบงานพร้อมแก้ไข: ใบงานรุ่นแรก (1 รายการ) แปลงเป็น variants ให้หน้าจอใช้รูปแบบเดียวกัน */
function normalize(items) {
  const d = clone(items)
  d.variants = clone(jobVariants(d))
  const used = d.variants.flatMap(v => Object.keys(v.qtys || {}))
  d.sizes = orderSizes([...(d.sizes || []), ...used])
  if (!d.sizes.length) d.sizes = ['S', 'M', 'L', 'XL', '2XL', '3XL']
  d.decorations = d.decorations || []
  // สเปกสินค้า / งานตกแต่ง ไม่มีช่องแล้ว — ใบงานเก่าที่เคยกรอกไว้ ย้ายข้อความมาต่อท้ายหมายเหตุการผลิต (ครั้งเดียว)
  if (!d.note_merged) {
    const extra = legacyNoteLines(d)
    if (extra.length) d.sew_note = [d.sew_note, ...extra].filter(Boolean).join('\n')
    d.note_merged = true
  }
  return d
}

/** แปลงสเปกสินค้า + งานตกแต่งของใบงานเก่าเป็นบรรทัดข้อความ */
function legacyNoteLines(d) {
  const sp = d.spec || {}
  const lines = []
  const spec = [sp.fabric && `ผ้า ${sp.fabric}`, sp.neck, sp.sleeve, sp.fit, sp.color && `สีผ้า ${sp.color}`, sp.buttons && `กระดุม ${sp.buttons}`, sp.label && `ป้ายคอ ${sp.label}`].filter(Boolean)
  if (spec.length) lines.push(spec.join(' · '))
  ;(d.decorations || []).forEach(x => {
    const size = x.size_in ? `${x.size_in} นิ้ว` : x.size ? `${x.size} ซม.` : ''
    const t = [x.name, x.position, x.technique, x.colors, size && `ขนาด ${size}`, x.placement, x.placement_note].filter(Boolean).join(' · ')
    if (t) lines.push(t)
  })
  return lines
}
const fmtTime = t => {
  if (!t) return ''
  const d = new Date(t)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String((d.getFullYear() + 543) % 100).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** อัปโหลดรูป Mockup ของใบงาน → Supabase Storage (ย่อรูปก่อน · ไม่ผ่าน Google Drive แล้ว) */
async function uploadAny(job, file) {
  const url = await uploadJobImage(supabase, 'job-images', file)
  return { url, thumb: url }
}

export default function JobEditor({ job, invoice, siblings, suppliers, onBack, onSaved, onCreateFromInvoice }) {
  const [d, setD]           = useState(() => normalize(job.items))
  const [due, setDue]       = useState(job.due_date || '')
  const [urgent, setUrgent] = useState(!!job.urgent)
  const [dirty, setDirty]   = useState(false)
  const [saving, setSaving] = useState(false)
  const [steps, setSteps]   = useState([])
  const [logs, setLogs]     = useState([])
  const [files, setFiles]   = useState([])
  const [busyFile, setBusyFile] = useState(false)
  const [newSize, setNewSize] = useState('')
  const [printing, setPrinting] = useState(false)
  const [dragIdx, setDragIdx] = useState(null)
  const [overIdx, setOverIdx] = useState(null)
  const emailRef = useRef(null)
  const statusRef = useRef(job.status)

  // โหลดแผนการผลิต / ประวัติ / ไฟล์
  useEffect(() => {
    let alive = true
    Promise.all([getJobSteps(job.id), getJobLogs(job.id), getJobFiles(job.id, 'mockup'), currentUserEmail()]).then(([s, l, f, email]) => {
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
  const variants = d.variants || []
  const total = variants.reduce((t, v) => t + sizeTotal(v.qtys), 0)
  const src = d.source || {}
  const myItems = jobItemNos({ ...job, items: d })

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

  const removeSize = s => {
    set('sizes', (d.sizes || []).filter(x => x !== s))
    set('variants', variants.map(v => { const { [s]: _, ...rest } = v.qtys || {}; void _; return { ...v, qtys: rest } }))
  }
  const addSize = () => {
    const s = newSize.trim().toUpperCase()
    if (!s || (d.sizes || []).includes(s)) return
    set('sizes', orderSizes([...(d.sizes || []), s])); setNewSize('')
  }

  async function save() {
    setSaving(true)
    const items = { ...d, ...aggregateSizes(d.sizes || [], variants) }
    const payload = {
      items, due_date: due || null, urgent,
      item_desc: d.product?.name || job.item_desc,
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

  /** สถานะรวมคำนวณจากแผนการผลิต (job_steps) ทุกหน้าที่แสดงผล —
   *  คอลัมน์ status ในฐานข้อมูลถูกคำนวณโดย trigger และห้ามเขียนตรง จึงไม่บันทึกที่นี่ */
  async function syncStatus(nextSteps) {
    statusRef.current = legacyStatus(computeOverall(nextSteps))
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
        const sameKind = files.filter(f => f.kind === kind && (f.side || null) === side)
        const version = sameKind.reduce((m, f) => Math.max(m, f.version || 0), 0) + 1
        const up = await uploadAny(job, file)
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

  const ordered = [...steps].sort((a, b) => a.seq - b.seq)
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
            <span style={{ background: '#8A6500', color: '#fff', fontWeight: 800, fontSize: 16, padding: '3px 12px', borderRadius: 6, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{job.code}</span>
            <span className={`jo-badge ${overall.tone}`} style={{ fontSize: 13 }}>สถานะรวม: {overall.label}</span>
          </div>
          <div style={{ fontSize: 15.5, fontWeight: 800 }}>
            อ้างอิง {invoice ? <Link href={docHref('invoice', invoice.id)} style={{ color: '#B8860B' }}>{invoice.code}</Link> : src.invoice_code || '—'} · {itemNosLabel({ ...src, item_nos: myItems }) || '—'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input className="jo-in" aria-label="ชื่อสินค้า" value={d.product?.name || ''} onChange={e => set('product.name', e.target.value)}
              style={{ width: 'auto', minWidth: 220, flex: '0 1 320px', background: '#F7E7B4', borderColor: '#F7E7B4', fontWeight: 800, fontSize: 16, color: '#8A6500' }} />
            <span style={{ fontWeight: 800, fontSize: 16 }}>— {total || d.product?.qty || 0} ตัว</span>
            <span style={{ fontSize: 12.5, color: '#6B6250' }}>สร้าง {thDateLong(job.document_date || job.created_at?.slice(0, 10))}{d.created_by_email ? ` โดย ${d.created_by_email}` : ''}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ background: '#D7141A', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, display: 'flex', flexDirection: 'column', gap: 2 }}>กำหนดส่ง
            <DateInput value={due || ''} onChange={e => { setDue(e.target.value); setDirty(true) }}
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
                  const me = myItems.includes(n)
                  const other = siblings.find(s => s.id !== job.id && s.invoice_item_no && jobItemNos(s).includes(n))
                  return (
                    <tr key={n} style={me ? { background: '#FDF6E3', fontWeight: 800 } : undefined}>
                      <td style={{ textAlign: 'center', color: '#8A6500', fontSize: 16 }}>{me ? '◉' : '○'}</td>
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

      {/* Sizes per item */}
      <section className="jo-card">
        <div className="jo-hd">รายละเอียดสินค้า &amp; จำนวนตามไซซ์ <small>อ้างอิงจาก {src.invoice_code || 'Invoice'} · แก้ในใบงานได้ ไม่กระทบ Invoice</small></div>
        <div className="table-wrap">
          <table className="jo-tbl" style={{ minWidth: 640 }}>
            <thead><tr>
              <th style={{ width: 34 }}>#</th><th style={{ minWidth: 220 }}>รายการ / สี</th>
              {(d.sizes || []).map(s => (
                <th key={s} style={{ textAlign: 'center' }}>{s}<button type="button" aria-label={`ลบไซส์ ${s}`} onClick={() => removeSize(s)} style={{ border: 'none', background: 'none', color: '#B91C1C', fontSize: 12, padding: '0 0 0 3px' }}>×</button></th>
              ))}
              <th style={{ textAlign: 'center' }}>รวม</th><th>เทียบ Invoice</th>
            </tr></thead>
            <tbody>
              {variants.map((v, vi) => {
                const t = sizeTotal(v.qtys)
                return (
                  <tr key={v.id || vi}>
                    <td style={{ fontWeight: 800, color: '#8A6500' }}>{v.item_no || vi + 1}</td>
                    <td>
                      <input className="jo-in" aria-label={`ชื่อรายการ ${vi + 1}`} value={v.name || ''} onChange={e => set(`variants.${vi}.name`, e.target.value)} style={{ fontWeight: 700, marginBottom: 4 }} />
                      <input className="jo-in" aria-label={`สี รายการ ${vi + 1}`} value={v.color || ''} onChange={e => set(`variants.${vi}.color`, e.target.value)} placeholder="สีที่แสดงในใบงาน เช่น สีดำ (Black)" style={{ height: 32, fontSize: 13 }} />
                    </td>
                    {(d.sizes || []).map(s => (
                      <td key={s} style={{ padding: '6px 3px', textAlign: 'center' }}><input className="jo-in" inputMode="numeric" aria-label={`จำนวนไซส์ ${s} รายการ ${vi + 1}`} value={v.qtys?.[s] || ''} onChange={e => set(`variants.${vi}.qtys.${s}`, e.target.value.replace(/[^\d]/g, ''))} style={{ width: 50, textAlign: 'center', padding: 0, fontWeight: 700 }} /></td>
                    ))}
                    <td style={{ background: '#F7E7B4', fontWeight: 800, fontSize: 17, textAlign: 'center' }}>{t}</td>
                    <td style={{ fontSize: 12.5 }}>{v.inv_qty ? (t === v.inv_qty
                      ? <b style={{ color: '#166534' }}>✓ ตรง ({v.inv_qty})</b>
                      : <b style={{ color: '#B45309' }}>Invoice {v.inv_qty} · {t - v.inv_qty > 0 ? '+' : ''}{t - v.inv_qty}</b>) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot><tr style={{ background: '#FDF6E3', fontWeight: 800 }}>
              <td></td><td style={{ textAlign: 'right' }}>รวมทุกรายการ</td>
              {(d.sizes || []).map(s => <td key={s} style={{ textAlign: 'center' }}>{variants.reduce((t, v) => t + (parseInt(v.qtys?.[s]) || 0), 0) || '—'}</td>)}
              <td style={{ background: '#F7E7B4', fontSize: 17, textAlign: 'center' }}>{total}</td><td></td>
            </tr></tfoot>
          </table>
        </div>
        <div style={{ padding: '8px 14px', borderTop: '1px solid #F1E8CC', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input className="jo-in" aria-label="เพิ่มไซส์" placeholder="ไซส์" value={newSize} onChange={e => setNewSize(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSize() }} style={{ width: 70, height: 30 }} />
            <button type="button" className="jo-chip" onClick={addSize}>+ เพิ่มไซส์</button>
          </span>
        </div>
      </section>

      {/* Production note — ใช้แทนสเปกสินค้าและรายละเอียดงานตกแต่ง (พิมพ์ออกในใบงาน) */}
      <section className="jo-card">
        <div className="jo-hd">หมายเหตุการผลิต <small>ผ้า · ทรง · ลาย · ตำแหน่ง · ขนาด · ระยะวาง — พิมพ์ออกในใบงาน</small></div>
        <div style={{ padding: 12 }}>
          <textarea className="jo-in" aria-label="หมายเหตุการผลิต" rows={7} value={d.sew_note || ''} onChange={e => set('sew_note', e.target.value)}
            style={{ fontSize: 15, lineHeight: 1.6, minHeight: 170 }}
            placeholder={'เช่น\nผ้า Cotton 32 · คอกลม แขนสั้น\nโลโก้หน้าอกซ้าย สกรีน 1 สี ขนาด 3.5 × 3 นิ้ว · ใต้คอ 3 นิ้ว\nตัวอักษรกลางหลัง DFT 11 × 3 นิ้ว · ใต้คอ 4 นิ้ว'} />
        </div>
      </section>

      {/* Mockup per item */}
      <section className="jo-card">
        <div className="jo-hd">แบบเสื้อ (Mockup) แยกตามสี <small>แสดงฉบับอนุมัติล่าสุด · รูปจากใบแจ้งหนี้อยู่ที่รายการแรก</small></div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(variants.length, 2)}, minmax(0,1fr))`, gap: 12, padding: 12 }}>
          {variants.map((v, vi) => (
            <div key={v.id || vi} style={{ border: '1px solid #E9D9A6', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <b style={{ color: '#8A6500' }}>{v.item_no || vi + 1} · {v.color || v.name || `รายการที่ ${vi + 1}`} <span style={{ color: '#6B6250', fontWeight: 600 }}>— {sizeTotal(v.qtys)} ตัว</span></b>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[['front', 'ด้านหน้า'], ['back', 'ด้านหลัง']].map(([face, label]) => {
                  const side = mockSide(face, vi)
                  const f = latestFile(files, 'mockup', side)
                  return (
                    <div key={face} style={{ position: 'relative', background: '#FBF8EE', border: '1.5px dashed #E9D9A6', borderRadius: 8, padding: '30px 8px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 200 }}>
                      <span style={{ position: 'absolute', top: 6, left: 6, background: '#B8860B', color: '#fff', fontSize: 12, fontWeight: 800, padding: '2px 8px', borderRadius: 4 }}>{label}</span>
                      {f ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <a href={f.url} target="_blank" rel="noreferrer"><img src={f.thumb_url || f.url} alt={`Mockup ${label}`} style={{ maxWidth: '100%', maxHeight: 180, objectFit: 'contain', display: 'block' }} /></a>
                      ) : <span style={{ color: '#9CA3AF', fontSize: 13 }}>ยังไม่มีรูป</span>}
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {f && <span className={`jo-badge ${f.approved ? 'done' : 'doing'}`}>v{f.version} {f.approved ? 'อนุมัติ' : 'รออนุมัติ'}</span>}
                        <label className="jo-chip" style={{ display: 'inline-flex', alignItems: 'center', cursor: busyFile ? 'wait' : 'pointer' }}>
                          {f ? 'เวอร์ชันใหม่' : 'อัปโหลดรูป'}
                          <input type="file" accept="image/*" hidden disabled={busyFile} onChange={e => { uploadFiles(e.target.files, 'mockup', side); e.target.value = '' }} />
                        </label>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
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
          <table className="jo-tbl" style={{ minWidth: 820 }}>
            <thead><tr><th style={{ width: 54 }}></th><th style={{ width: 40 }}>ลำดับ</th><th>ขั้นตอน</th><th>ช่วง</th><th>Supplier / ผู้รับผิดชอบ</th><th>วันที่ส่ง</th><th>สถานะ</th><th>หมายเหตุ</th><th style={{ width: 34 }}></th></tr></thead>
            <tbody>
              {ordered.map((s, i) => (
                <tr key={s.id} className={`jo-steprow${overIdx === i ? ' dragover' : ''}`}
                  draggable onDragStart={() => setDragIdx(i)} onDragOver={e => { e.preventDefault(); setOverIdx(i) }}
                  onDragLeave={() => setOverIdx(null)} onDrop={() => { moveStep(dragIdx, i); setDragIdx(null); setOverIdx(null) }}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className="jo-drag" aria-hidden>⋮⋮</span>
                    <button type="button" aria-label="เลื่อนขึ้น" disabled={i === 0} onClick={() => moveStep(i, i - 1)} style={{ border: 'none', background: 'none', padding: '0 2px', color: '#8A6500' }}>▲</button>
                    <button type="button" aria-label="เลื่อนลง" disabled={i === ordered.length - 1} onClick={() => moveStep(i, i + 1)} style={{ border: 'none', background: 'none', padding: '0 2px', color: '#8A6500' }}>▼</button>
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
                  <td><DateInput className="jo-in" aria-label="วันที่ส่ง" value={s.sent_date || ''} onChange={e => patchStep(s, { sent_date: e.target.value || null })} style={{ width: 132 }} /></td>
                  <td><select aria-label="สถานะ" className={`jo-st ${statusCls(s.status)}`} value={s.status} onChange={e => patchStep(s, { status: e.target.value })}>
                    {STEP_STATUSES.map(x => <option key={x.id}>{x.id}</option>)}</select></td>
                  <td><input className="jo-in" aria-label="หมายเหตุ" defaultValue={s.note || ''} style={{ minWidth: 140 }}
                    onBlur={e => { if ((e.target.value || '') !== (s.note || '')) patchStep(s, { note: e.target.value }) }} /></td>
                  <td><button type="button" className="jo-x" aria-label="ลบขั้นตอน" onClick={() => removeStep(s)}>×</button></td>
                </tr>
              ))}
              {!ordered.length && <tr><td colSpan={9} className="empty-state">ยังไม่มีขั้นตอน — กด “+ เพิ่มขั้นตอน” หรือเลือกจากปุ่มด้านล่าง</td></tr>}
            </tbody>
          </table>
          <datalist id="jo-opt-steps">{QUICK_STEPS.map(t => <option key={t} value={t} />)}</datalist>
        </div>
        <div style={{ padding: '10px 14px', borderTop: '1px solid #F1E8CC', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#6B6250', fontWeight: 700 }}>เพิ่มเร็ว:</span>
          {QUICK_STEPS.map(t => <button key={t} type="button" className="jo-chip" onClick={() => addStep(t)}>+ {t}</button>)}
        </div>
        <div style={{ padding: '10px 14px 14px', borderTop: '1px solid #F1E8CC' }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>ประวัติการเปลี่ยนแปลง</div>
          {logs.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: '4px 14px', fontSize: 13.5 }}>
              {logs.slice(0, 30).map(l => (
                <div key={l.id} style={{ display: 'contents' }}>
                  <span style={{ color: '#6B6250', whiteSpace: 'nowrap' }}>{fmtTime(l.changed_at)}</span>
                  <b style={{ whiteSpace: 'nowrap' }}>{l.changed_by}</b>
                  <span>{l.step_name && l.to_status ? <>{l.step_name}: {l.from_status} → <b className={`jo-badge ${statusCls(l.to_status)}`}>{l.to_status}</b></> : l.step_name ? `${l.step_name}: ` : null}{l.detail ? <span style={{ color: '#6B6250' }}> {l.detail}</span> : null}</span>
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
                <input type="checkbox" checked={!!d.qc?.[q.key]} onChange={e => set(`qc.${q.key}`, e.target.checked)} style={{ width: 18, height: 18, accentColor: '#8A6500' }} />
                {q.label}{q.key === 'qty' ? ` (${total} ตัว)` : ''}
              </label>
            ))}
          </div>
        </div>
        <div className="jo-card">
          <div className="jo-hd">การส่งมอบ / การติดตาม</div>
          <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label className="jo-lbl">ส่งมอบวันที่<DateInput className="jo-in" value={d.delivery?.date || ''} onChange={e => set('delivery.date', e.target.value)} /></label>
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
