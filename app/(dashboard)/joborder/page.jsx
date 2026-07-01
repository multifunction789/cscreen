'use client'
import { useState, useEffect, useRef } from 'react'
import { getJobOrders, insertJobOrder, updateJobOrder, updateJobStatus, deleteJobOrder, getCustomers, getInvoices } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { fmtDate, SHOP } from '@/lib/shop'
import { todayStr, exportJpeg, shareDoc, uploadFile, printDoc } from '@/lib/docUtils'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import FileDropZone from '@/components/ui/FileDropZone'
import { createJobFoldersClient, uploadFileClient, uploadDataUrlClient } from '@/lib/driveClient'

const STATUS_BADGE = {
  'รอมัดจำ'      : 'badge badge-gray',
  'รอออกแบบ'     : 'badge badge-cyan',
  'รอทำไฟล์'     : 'badge badge-purple',
  'สั่งของ'       : 'badge badge-yellow',
  'กำลังสกรีน'   : 'badge badge-blue',
  'แพ็คพร้อมส่ง' : 'badge badge-green',
  'ส่งงานแล้ว'   : 'badge badge-green',
  'เลยกำหนด'     : 'badge badge-red',
}
const ALL_STATUS = Object.keys(STATUS_BADGE)
const DEFAULT_SIZES = ['SS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL']

// ── helpers ──────────────────────────────────────────────────────
function makeRow(sizes, style = '') {
  return { style, qtys: Object.fromEntries(sizes.map(s => [s, ''])) }
}
function rowTotal(qtys) {
  return Object.values(qtys || {}).reduce((s, v) => s + (parseInt(v) || 0), 0)
}
function grandTotal(rows) {
  return (rows || []).reduce((s, r) => s + rowTotal(r.qtys), 0)
}

// แปลง reference เก่า (string) + ใหม่ (array) → [url, ...]
function normalizeRefImages(j) {
  const arr = j.items?.reference_images || j.reference_images
  if (Array.isArray(arr) && arr.length) return arr.filter(Boolean)
  // legacy single string
  const single = j.items?.reference_url || j.reference_url
  return single ? [single] : []
}

// แปลง finish_photos ทุกรูปแบบ → [{url, label}]
function normalizeQc(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(p => p?.url)
  // legacy object format: {front,back,side,group} หรือ {QC1,QC2,...}
  const LABELS = { front:'มุมตรง', back:'มุมหลัง', side:'มุมข้าง', group:'รูปรวม' }
  return Object.entries(raw)
    .filter(([, v]) => v)
    .map(([k, url]) => ({ url, label: LABELS[k] || k }))
}

// ── Extract matrix data stored in items column ───────────────────
function readMatrix(j) {
  if (j.items && j.items.type === 'size_matrix') {
    return {
      sizes:           (j.items.sizes || [...DEFAULT_SIZES]).filter(s => s !== 'XXL'),
      prod_items:      j.items.rows            || [],
      fabric_type:     j.items.fabric_type     || '',
      shirt_color:     j.items.shirt_color     || '',
      screen_color:    j.items.screen_color    || '',
      production_note: j.items.production_note || '',
      mockup_url:      j.items.mockup_url      || '',
      finish_photos:   normalizeQc(j.items.finish_photos),
      drive_folders:   j.items.drive_folders   || null,
      design_detail:   j.design_detail         || {},
      reference_images: normalizeRefImages(j),
    }
  }
  // Legacy / empty
  const sizes = [...DEFAULT_SIZES]
  return { sizes, prod_items: [makeRow(sizes)], fabric_type:'', shirt_color:'', screen_color:'', production_note:'', mockup_url:'', finish_photos:[], drive_folders: null, design_detail:{}, reference_images:[] }
}

const emptyForm = () => ({
  customer_id: '', invoice_id: '', note: '', due_date: '', document_date: todayStr(), status: 'รอมัดจำ',
  fabric_type: '', shirt_color: '', screen_color: '', production_note: '',
  artwork_url: '', mockup_url: '', reference_images: [],
  design_detail: { size: '', position: '', color_count: '', technique: '', special: '' },
  sizes: [...DEFAULT_SIZES],
  prod_items: [makeRow(DEFAULT_SIZES)],
  finish_photos: [],
})

function SectionHeader({ icon, title }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, paddingBottom:8, borderBottom:'2px solid var(--border)' }}>
      <span style={{ fontSize:16 }}>{icon}</span>
      <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{title}</span>
    </div>
  )
}

// ── Calendar View Component ──────────────────────────────────────
function CalendarView({ jobs, month, onMonthChange, onView }) {
  const [year, m] = month.split('-').map(Number)
  const firstDay  = new Date(year, m - 1, 1)
  const lastDay   = new Date(year, m, 0)
  const thM = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

  // Build cells (Mon-first grid)
  const cells = []
  const startDow = firstDay.getDay()
  const offset   = startDow === 0 ? 6 : startDow - 1
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  // Group jobs by due date day
  const jobsByDay = {}
  jobs.forEach(j => {
    if (!j.due_date) return
    const d = new Date(j.due_date)
    if (d.getFullYear() === year && d.getMonth() === m - 1) {
      const day = d.getDate()
      if (!jobsByDay[day]) jobsByDay[day] = []
      jobsByDay[day].push(j)
    }
  })

  const today  = new Date()
  const prevMo = () => { const d = new Date(year, m - 2, 1); onMonthChange(d.toISOString().slice(0, 7)) }
  const nextMo = () => { const d = new Date(year, m, 1);     onMonthChange(d.toISOString().slice(0, 7)) }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn btn-outline btn-sm" onClick={prevMo}>◀ ก่อนหน้า</button>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{thM[m - 1]} {year + 543}</span>
        <button className="btn btn-outline btn-sm" onClick={nextMo}>ถัดไป ▶</button>
      </div>
      {/* Day labels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        {['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'].map((d, i) => (
          <div key={d} style={{ padding: '8px 4px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: i >= 5 ? 'var(--danger)' : 'var(--text-muted)' }}>{d}</div>
        ))}
      </div>
      {/* Weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid var(--border)' }}>
          {week.map((day, di) => {
            if (!day) return <div key={di} style={{ minHeight: 90, background: 'var(--bg)', opacity: .4, borderLeft: di > 0 ? '1px solid var(--border)' : 'none' }} />
            const isToday = today.getDate() === day && today.getMonth() === m - 1 && today.getFullYear() === year
            const dayJobs = jobsByDay[day] || []
            const dateObj = new Date(year, m - 1, day)
            return (
              <div key={di} style={{ minHeight: 90, padding: '4px 6px', borderLeft: di > 0 ? '1px solid var(--border)' : 'none', background: isToday ? 'rgba(184,15,11,0.05)' : 'transparent' }}>
                <div style={{
                  fontSize: 12, fontWeight: isToday ? 900 : 400, marginBottom: 3,
                  width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%', background: isToday ? 'var(--primary)' : 'transparent',
                  color: isToday ? '#fff' : 'var(--text-muted)',
                }}>{day}</div>
                {dayJobs.map(j => {
                  const overdue = dateObj < today && j.status !== 'ส่งงานแล้ว'
                  const done    = j.status === 'ส่งงานแล้ว'
                  return (
                    <div key={j.id} onClick={() => onView(j)} style={{
                      fontSize: 10, padding: '2px 5px', borderRadius: 4, marginBottom: 2, cursor: 'pointer',
                      background: done ? '#D1FAE5' : overdue ? '#FEE2E2' : '#EFF6FF',
                      color:      done ? '#065f46' : overdue ? '#991B1B' : '#1E40AF',
                      border: `1px solid ${done ? '#A7F3D0' : overdue ? '#FECACA' : '#BFDBFE'}`,
                      fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                    }}>
                      {j.code} {j.customers?.name || ''}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      ))}
      {/* Legend */}
      <div style={{ padding: '8px 16px', display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-muted)' }}>
        {[['#EFF6FF','#BFDBFE','ปกติ'],['#FEE2E2','#FECACA','เลยกำหนด'],['#D1FAE5','#A7F3D0','ส่งแล้ว']].map(([bg, border, label]) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: bg, border: `1px solid ${border}`, display: 'inline-block' }} />{label}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function JobOrderPage() {
  const [rows, setRows]           = useState([])
  const [customers, setCustomers] = useState([])
  const [invoices, setInvoices]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [filterStatus, setFilter] = useState('')
  const [showForm, setShowForm]   = useState(false)
  const [editId, setEditId]       = useState(null)
  const [form, setForm]           = useState(emptyForm())
  const [saving, setSaving]       = useState(false)
  const [view, setView]           = useState(null)
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7))
  const [viewMode, setViewMode]       = useState('table')
  const [calMonth, setCalMonth]       = useState(new Date().toISOString().slice(0, 7))
  const [artworkFile, setArtworkFile]   = useState(null)
  const [artworkPreview, setArtworkPreview] = useState(null)
  const [mockupFile, setMockupFile]         = useState(null)
  const [mockupPreview, setMockupPreview]   = useState(null)
  const [artworkSourceFile, setArtworkSourceFile] = useState(null)
  const [mockupSourceFile,  setMockupSourceFile]  = useState(null)
  const [referenceFiles,    setReferenceFiles]    = useState([])   // [{file, preview}]
  const [qcFiles,     setQcFiles]     = useState({})
  const [qcPreviews,  setQcPreviews]  = useState({})
  const [newSizeInput, setNewSizeInput] = useState('')
  const [viewQcFiles,    setViewQcFiles]    = useState({})
  const [viewQcPreviews, setViewQcPreviews] = useState({})
  const [savingQc,       setSavingQc]       = useState(false)
  const printRef = useRef(null)

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!view) return
    const custName = (view.customers?.name || customers.find(c => c.id === view.customer_id)?.name || '')
      .replace(/\s+/g, '_').replace(/[\/\\:*?"<>|]/g, '')
    const prev = document.title
    document.title = `${custName}_${view.code}`
    return () => { document.title = prev }
  }, [view])

  async function load() {
    const [jRes, cRes, iRes] = await Promise.all([getJobOrders(), getCustomers(), getInvoices()])
    setRows(jRes.data || [])
    setCustomers(cRes.data || [])
    setInvoices(iRes.data || [])
    setLoading(false)
  }

  // ── Invoice selection → auto-fill ─────────────────────────────
  function onSelectInvoice(invId) {
    const inv = invoices.find(i => i.id === invId)
    if (!inv) { setForm(f => ({ ...f, invoice_id: invId })); return }
    // Build rows from invoice items
    const invItems = inv.items || []
    const newRows = invItems.length > 0
      ? invItems.map(it => makeRow(form.sizes, it.desc || ''))
      : [makeRow(form.sizes)]
    setForm(f => ({ ...f, invoice_id: invId, customer_id: inv.customer_id, prod_items: newRows }))
  }

  // ── Size matrix helpers ───────────────────────────────────────
  function addSize() {
    const s = newSizeInput.trim()
    if (!s || form.sizes.includes(s)) return
    const newSizes = [...form.sizes, s]
    setForm(f => ({
      ...f, sizes: newSizes,
      prod_items: f.prod_items.map(r => ({ ...r, qtys: { ...r.qtys, [s]: '' } })),
    }))
    setNewSizeInput('')
  }
  function removeSize(s) {
    setForm(f => ({
      ...f, sizes: f.sizes.filter(x => x !== s),
      prod_items: f.prod_items.map(r => { const { [s]: _, ...rest } = r.qtys; return { ...r, qtys: rest } }),
    }))
  }
  function addRow()         { setForm(f => ({ ...f, prod_items: [...f.prod_items, makeRow(f.sizes)] })) }
  function removeRow(idx)   { setForm(f => ({ ...f, prod_items: f.prod_items.filter((_, i) => i !== idx) })) }
  function updateStyle(idx, val) {
    setForm(f => { const u = [...f.prod_items]; u[idx] = { ...u[idx], style: val }; return { ...f, prod_items: u } })
  }
  function updateQty(idx, size, val) {
    setForm(f => {
      const u = [...f.prod_items]
      u[idx] = { ...u[idx], qtys: { ...u[idx].qtys, [size]: val } }
      return { ...f, prod_items: u }
    })
  }

  // ── File upload ───────────────────────────────────────────────
  function handleFileChange(e, setFile, setPreview) {
    const file = e.target.files?.[0]; if (!file) return
    setFile(file)
    const r = new FileReader()
    r.onload = ev => setPreview(ev.target.result)
    r.readAsDataURL(file)
  }

  // ── Save ─────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.invoice_id) return alert('กรุณาเลือก Invoice — ใบงานต้องอ้างอิง Invoice')
    if (!form.customer_id) return alert('กรุณาเลือกลูกค้า')
    setSaving(true)

    // คำนวณ job code ก่อน (ต้องใช้ก่อนสร้าง folder)
    const maxNum = rows.reduce((max, r) => {
      const n = parseInt(r.code?.replace('JO-', '') || '0'); return n > max ? n : max
    }, 0)
    const jobCode    = editId
      ? (rows.find(r => r.id === editId)?.code || 'JO-EDIT')
      : 'JO-' + String(Math.max(maxNum + 1, 1001)).padStart(4, '0')
    const cust     = customers.find(c => c.id === form.customer_id) || {}
    const custName = cust.name || 'unknown'
    // ใช้ folder ของลูกค้า (สร้างตอน สร้างลูกค้า)
    const custFolderId = cust.drive_folder_id || null

    // Upload reference → Supabase only (ไม่ต้องขึ้น Drive)
    let reference_images = Array.isArray(form.reference_images) ? [...form.reference_images] : []
    let artwork_url      = form.artwork_url || null
    let mockup_url       = form.mockup_url  || null
    try {
      for (const { file } of referenceFiles) {
        const url = await uploadFile(supabase, 'job-images', file)
        if (url) reference_images.push(url)
      }
      if (artworkFile) {
        const ext  = artworkFile.name.split('.').pop()
        const name = `${jobCode}_${custName}_AW.${ext}`
        if (custFolderId) {
          const r = await uploadFileClient(artworkFile, custFolderId, name)
          artwork_url = r.directUrl
        } else {
          artwork_url = await uploadFile(supabase, 'job-images', artworkFile)
        }
      }
      if (mockupFile) {
        const ext  = mockupFile.name.split('.').pop()
        const name = `${jobCode}_${custName}_MOCKUP.${ext}`
        if (custFolderId) {
          const r = await uploadFileClient(mockupFile, custFolderId, name)
          mockup_url = r.directUrl
        } else {
          mockup_url = await uploadFile(supabase, 'job-images', mockupFile)
        }
      }
      // .ai / .psd — คงชื่อเดิม
      if (artworkSourceFile && custFolderId)
        await uploadFileClient(artworkSourceFile, custFolderId, artworkSourceFile.name)
      if (mockupSourceFile && custFolderId)
        await uploadFileClient(mockupSourceFile, custFolderId, mockupSourceFile.name)
    } catch (e) {
      console.warn('Upload error:', e.message)
    }

    // Upload QC photos (dynamic array)
    let finish_photos = Array.isArray(form.finish_photos) ? [...form.finish_photos] : normalizeQc(form.finish_photos)
    try {
      const newEntries = Object.values(qcFiles).filter(e => e?.file)
      for (let i = 0; i < newEntries.length; i++) {
        const { file, label } = newEntries[i]
        const qcNum = finish_photos.length + 1
        const ext   = file.name.split('.').pop()
        const name  = `${jobCode}_${custName}_QC${qcNum}.${ext}`
        let url = ''
        if (custFolderId) {
          const r = await uploadFileClient(file, custFolderId, name)
          url = r.directUrl
        } else {
          url = await uploadFile(supabase, 'job-images', file)
        }
        finish_photos.push({ url, label: label || `รูปที่ ${qcNum}` })
      }
    } catch (e) {
      console.warn('QC upload error:', e.message)
    }

    // Summary for list view
    const validRows = form.prod_items.filter(r => r.style)
    const item_desc = validRows.map(r => r.style).join(', ') || '—'

    const itemsPayload = {
      type:            'size_matrix',
      sizes:           form.sizes,
      rows:            form.prod_items,
      fabric_type:     form.fabric_type     || null,
      shirt_color:     form.shirt_color     || null,
      screen_color:    form.screen_color    || null,
      production_note: form.production_note || null,
      mockup_url:      mockup_url           || null,
      reference_images: reference_images.length ? reference_images : null,
      design_detail:   form.design_detail   || null,
      finish_photos:   finish_photos.length ? finish_photos : null,
      drive_folders:   custFolderId ? { jobFolderId: custFolderId } : null,
    }

    const payload = {
      customer_id:    form.customer_id,
      invoice_id:     form.invoice_id,
      item_desc,
      items:          itemsPayload,
      due_date:       form.due_date || null,
      document_date:  form.document_date || todayStr(),
      note:           form.note,
      status:         form.status,
      design_detail:  form.design_detail || null,
      ...(artwork_url ? { image_url: artwork_url } : {}),
    }

    if (editId) {
      await updateJobOrder(editId, payload)
      setEditId(null)
    } else {
      await insertJobOrder({ ...payload, code: jobCode })
    }

    setForm(emptyForm())
    setReferenceFiles([])
    setQcFiles({})
    setQcPreviews({})
    setArtworkFile(null);        setArtworkPreview(null)
    setMockupFile(null);         setMockupPreview(null)
    setArtworkSourceFile(null);  setMockupSourceFile(null)
    setShowForm(false); setSaving(false)
    load()
  }


  async function handleDelete(j) {
    if (!confirm(`ลบใบงาน ${j.code} ใช่ไหม?`)) return
    await deleteJobOrder(j.id); load()
  }

  function startEdit(j) {
    const m = readMatrix(j)
    setForm({
      customer_id:     j.customer_id,
      invoice_id:      j.invoice_id  || '',
      note:            j.note        || '',
      due_date:        j.due_date    || '',
      document_date:   j.document_date || todayStr(),
      status:          j.status,
      artwork_url:      j.image_url     || '',
      reference_images: normalizeRefImages(j),
      design_detail:    j.design_detail || { size:'', position:'', color_count:'', technique:'', special:'' },
      ...m,
      finish_photos:    m.finish_photos || [],
    })
    setReferenceFiles([])
    setQcFiles({})
    setQcPreviews({})
    setArtworkFile(null); setArtworkPreview(null)
    setMockupFile(null);  setMockupPreview(null)
    setEditId(j.id); setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const filtered = rows.filter(j => {
    const ms = j.code?.includes(search) || j.customers?.name?.includes(search) || j.item_desc?.includes(search)
    const dm = !monthFilter || (j.document_date || j.created_at || '').startsWith(monthFilter)
    return ms && (!filterStatus || j.status === filterStatus) && dm
  })
  const isOverdue = j => j.due_date && new Date(j.due_date) < new Date() && j.status !== 'ส่งงานแล้ว'
  const monthCount = filtered.length
  const monthQty   = filtered.reduce((s, j) => s + grandTotal(readMatrix(j).prod_items), 0)

  // ── บันทึก QC photos จาก view inline (array format) ──────────
  async function handleSaveQc() {
    if (!view) return
    setSavingQc(true)
    const mCur     = readMatrix(view)
    const custObj  = customers.find(c => c.id === view.customer_id) || {}
    const custName = custObj.name || 'unknown'
    const folder   = custObj.drive_folder_id || mCur.drive_folders?.jobFolderId || null
    // existing photos (array)
    let photos = [...(mCur.finish_photos || [])]
    try {
      // viewQcFiles: { [tempIdx]: { file, label } }
      const entries = Object.entries(viewQcFiles).sort(([a],[b]) => Number(a)-Number(b))
      for (const [idx, { file, label }] of entries) {
        if (!file) continue
        const qcNum  = photos.length + 1
        const ext    = file.name.split('.').pop()
        const name   = `${view.code}_${custName}_QC${qcNum}.${ext}`
        let url = ''
        if (folder) {
          const r = await uploadFileClient(file, folder, name)
          url = r.directUrl
        } else {
          url = await uploadFile(supabase, 'job-images', file)
        }
        photos.push({ url, label: label || `รูปที่ ${qcNum}` })
      }
    } catch (e) { console.warn('QC upload:', e.message) }

    const itemsPayload = { ...view.items, finish_photos: photos }
    await updateJobOrder(view.id, { items: itemsPayload })
    setViewQcFiles({})
    setViewQcPreviews({})
    setView(v => ({ ...v, items: itemsPayload }))
    load()
    setSavingQc(false)
  }

  // ── ลบ QC photo ออกจาก view ───────────────────────────────────
  async function handleDeleteQc(idx) {
    if (!view) return
    const mCur   = readMatrix(view)
    const photos = [...(mCur.finish_photos || [])]
    photos.splice(idx, 1)
    const itemsPayload = { ...view.items, finish_photos: photos }
    await updateJobOrder(view.id, { items: itemsPayload })
    setView(v => ({ ...v, items: itemsPayload }))
    load()
  }

  // ──── PRINT VIEW (3 pages) ───────────────────────────────────
  if (view) {
    const cust = customers.find(c => c.id === view.customer_id) || view.customers || {}
    const inv  = invoices.find(i => i.id === view.invoice_id)
    const m    = readMatrix(view)
    const { sizes, prod_items: prod, fabric_type, shirt_color, screen_color, production_note, mockup_url, finish_photos, design_detail, reference_images } = m
    const dd = design_detail || {}
    const FINISH_SLOTS = [
      { key: 'front', label: 'มุมตรง' },
      { key: 'back',  label: 'มุมหลัง' },
      { key: 'side',  label: 'มุมข้าง' },
      { key: 'group', label: 'รูปรวม' },
    ]
    const filePrefix = `${(cust.name||'').replace(/\s+/g,'_').replace(/[\/\\:*?"<>|]/g,'')}_${view.code}`

    // shared header component
    function PageHeader({ page }) {
      return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, paddingBottom: 12, borderBottom: '2px solid var(--primary)' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--primary)', letterSpacing: -1 }}>C-SCREEN</div>
            <div style={{ fontSize: 10, color: '#666', maxWidth: 240, lineHeight: 1.6 }}>
              {SHOP.address} | Tel: {SHOP.tel}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)' }}>ใบงานการผลิต <span style={{ color: '#999', fontSize: 12 }}>หน้า {page}/3</span></div>
            <div style={{ fontSize: 13, color: 'var(--primary)', fontFamily: 'monospace', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
              {view.code}
              {m.drive_folders?.jobFolderId && (
                <a href={`https://drive.google.com/drive/folders/${m.drive_folders.jobFolderId}`}
                  target="_blank" rel="noreferrer" style={{ fontSize: 11, textDecoration: 'none', color: '#1a73e8' }}>
                  📁 Drive
                </a>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#666' }}>วันที่: {fmtDate(view.document_date || view.created_at)}</div>
            {view.due_date && <div style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 700 }}>กำหนดส่ง: {fmtDate(view.due_date)}</div>}
          </div>
        </div>
      )
    }

    return (
      <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
        {/* Toolbar */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <button className="btn btn-outline" onClick={() => setView(null)}>← กลับ</button>
          <button className="btn btn-outline" onClick={() => printDoc('print-area', filePrefix)}>🖨️ พิมพ์</button>
        </div>

        <div id="print-area" ref={printRef}>

          {/* ═══════════════ PAGE 1 ═══════════════ */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 32, marginBottom: 24 }}>
            <PageHeader page={1} />

            {/* Customer strip */}
            <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '10px 16px', marginBottom: 16, display: 'flex', gap: 24, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#888' }}>ลูกค้า</div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{cust.name || view.customers?.name || '—'}</div>
                {cust.phone && <div style={{ fontSize: 11, color: '#666' }}>Tel: {cust.phone}</div>}
              </div>
              {inv && <div style={{ fontSize: 11, color: '#888', marginLeft: 'auto' }}>อ้างอิง Invoice: <strong>{inv.code}</strong></div>}
              <span className={STATUS_BADGE[view.status] || 'badge badge-gray'}>{view.status}</span>
            </div>

            {/* Design detail table */}
            {(dd.size || dd.position || dd.color_count || dd.technique || dd.special) && (
              <div style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ background: '#374151', color: '#fff', fontSize: 11, fontWeight: 700, padding: '5px 12px', letterSpacing: .5 }}>
                  รายละเอียดลาย
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)' }}>
                  {[
                    { label: 'ขนาดลาย', value: dd.size },
                    { label: 'ตำแหน่ง',  value: dd.position },
                    { label: 'จำนวนสี',  value: dd.color_count },
                    { label: 'เทคนิค',   value: dd.technique },
                    { label: 'พิเศษ',    value: dd.special },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ padding: '8px 12px', borderRight: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#999', textTransform: 'uppercase' }}>{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: value ? 'var(--text)' : '#ccc' }}>{value || '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mockup + Artwork */}
            {(mockup_url || view.image_url) && (
              <div style={{ display: 'grid', gridTemplateColumns: mockup_url && view.image_url ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 12 }}>
                {[mockup_url && { url: mockup_url, label: 'MOCKUP', bg: '#1D4ED8' }, view.image_url && { url: view.image_url, label: 'ARTWORK', bg: '#374151' }].filter(Boolean).map(({ url, label, bg }) => (
                  <div key={label} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: bg, padding: '4px 10px', letterSpacing: .5 }}>{label}</div>
                    <img src={url} alt={label} crossOrigin="anonymous"
                      style={{ width: '100%', maxHeight: 260, objectFit: 'contain', display: 'block', background: '#f9f9f9', padding: 8 }} />
                  </div>
                ))}
              </div>
            )}

            {/* Reference images — grid ไม่จำกัดจำนวน */}
            {reference_images?.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: .5 }}>
                  Reference ({reference_images.length} รูป)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(reference_images.length, 4)}, 1fr)`, gap: 8 }}>
                  {reference_images.map((url, i) => (
                    <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                      <img src={url} alt={`ref-${i+1}`} crossOrigin="anonymous"
                        style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block', background: '#f9f9f9' }} />
                      <div style={{ fontSize: 9, textAlign: 'center', padding: '2px 0', color: '#9CA3AF', background: '#F8FAFC' }}>REF {i+1}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ═══════════════ PAGE 2 ═══════════════ */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 32, marginBottom: 24, pageBreakBefore: 'always' }}>
            <PageHeader page={2} />

            {/* Customer mini */}
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
              {cust.name || '—'} <span style={{ color: '#999', fontWeight: 400, fontSize: 11 }}>· {view.code}</span>
            </div>

            {/* Production info badges */}
            {(fabric_type || shirt_color || screen_color) && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                {[{ l: 'ประเภทผ้า', v: fabric_type }, { l: 'สีเสื้อ', v: shirt_color }, { l: 'สีสกรีน', v: screen_color }]
                  .filter(f => f.v).map(f => (
                    <div key={f.l} style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '5px 12px', fontSize: 12 }}>
                      <span style={{ color: '#666' }}>{f.l}: </span><span style={{ fontWeight: 700 }}>{f.v}</span>
                    </div>
                  ))}
              </div>
            )}

            {/* Size Matrix */}
            <div style={{ overflowX: 'auto', marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--primary)', color: '#fff' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', minWidth: 160 }}>แบบ / รายการ</th>
                    {sizes.map(s => <th key={s} style={{ padding: '8px 10px', textAlign: 'center', minWidth: 52 }}>{s}</th>)}
                    <th style={{ padding: '8px 12px', textAlign: 'center', minWidth: 56, background: '#7f1d1d' }}>รวม</th>
                  </tr>
                </thead>
                <tbody>
                  {prod.length > 0 ? prod.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #eee', background: i % 2 ? '#fafafa' : '#fff' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.style || '—'}</td>
                      {sizes.map(s => (
                        <td key={s} style={{ padding: '8px 10px', textAlign: 'center',
                          fontWeight: parseInt(r.qtys?.[s]) > 0 ? 700 : 400,
                          color:     parseInt(r.qtys?.[s]) > 0 ? 'var(--text)' : '#ccc' }}>
                          {parseInt(r.qtys?.[s]) > 0 ? r.qtys[s] : '—'}
                        </td>
                      ))}
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 800, color: 'var(--primary)' }}>
                        {rowTotal(r.qtys)}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={sizes.length + 2} style={{ padding: 20, textAlign: 'center', color: '#999' }}>ไม่มีรายการ</td></tr>
                  )}
                  {prod.length > 0 && (
                    <tr style={{ background: '#F9FAFB', borderTop: '2px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: '#888', fontSize: 12 }}>รวมทั้งหมด</td>
                      {sizes.map(s => (
                        <td key={s} style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>
                          {prod.reduce((sum, r) => sum + (parseInt(r.qtys?.[s]) || 0), 0) || '—'}
                        </td>
                      ))}
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 900, color: 'var(--primary)', fontSize: 15 }}>
                        {grandTotal(prod)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Grand total */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                จำนวนรวม: <span style={{ color: 'var(--primary)', fontSize: 22, fontWeight: 900 }}>{grandTotal(prod)}</span> ตัว
              </div>
            </div>

            {/* Notes */}
            {(production_note || view.note) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {production_note && (
                  <div style={{ padding: '8px 14px', background: '#FFF7ED', borderRadius: 6, borderLeft: '3px solid #F97316', fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: '#C2410C' }}>หมายเหตุผลิต: </span>{production_note}
                  </div>
                )}
                {view.note && (
                  <div style={{ padding: '8px 14px', background: '#FFFBEB', borderRadius: 6, fontSize: 12 }}>
                    <span style={{ fontWeight: 700 }}>หมายเหตุ: </span>{view.note}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ═══════════════ PAGE 3 ═══════════════ */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 32, pageBreakBefore: 'always' }}>
            <PageHeader page={3} />

            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>
              {cust.name || '—'} <span style={{ color: '#999', fontWeight: 400, fontSize: 11 }}>· {view.code}</span>
            </div>

            {/* รูปที่บันทึกแล้ว */}
            {finish_photos.length > 0 && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:16 }}>
                {finish_photos.map((p, i) => (
                  <div key={i} style={{ borderRadius:10, overflow:'hidden', border:'1px solid var(--border)', background:'#fff' }}>
                    <img src={p.url} alt={p.label} crossOrigin="anonymous"
                      style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', display:'block' }} />
                    <div style={{ display:'flex', alignItems:'center', padding:'6px 10px', background:'#F8FAFC' }}>
                      <span style={{ fontSize:11, fontWeight:700, color:'#64748B', flex:1 }}>{p.label || `รูปที่ ${i+1}`}</span>
                      <button className="no-print" onClick={() => handleDeleteQc(i)}
                        style={{ fontSize:11, padding:'3px 8px', borderRadius:6, border:'1.5px solid #FCA5A5', background:'#fff', color:'#EF4444', cursor:'pointer', fontWeight:700 }}>
                        ลบ
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ช่องเพิ่มรูปใหม่ */}
            <div className="no-print">
              {/* รูปที่รอบันทึก */}
              {Object.keys(viewQcPreviews).filter(k => viewQcPreviews[k]).length > 0 && (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:12 }}>
                  {Object.entries(viewQcPreviews).filter(([,v]) => v).map(([k, src]) => (
                    <div key={k} style={{ borderRadius:10, overflow:'hidden', border:'2px solid #6366F1', background:'#fff' }}>
                      <div style={{ position:'relative' }}>
                        <img src={src} alt={`new-${k}`}
                          style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', display:'block' }} />
                        <div style={{ position:'absolute', top:6, left:6, background:'#6366F1', color:'#fff', fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20 }}>รอบันทึก</div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', padding:'6px 10px', background:'#EEF2FF' }}>
                        <input
                          placeholder="ชื่อรูป เช่น เสื้อแบบ A"
                          value={viewQcFiles[k]?.label || ''}
                          onChange={e => setViewQcFiles(f => ({ ...f, [k]: { ...f[k], label: e.target.value } }))}
                          style={{ flex:1, fontSize:11, border:'none', background:'transparent', outline:'none', fontWeight:600, color:'#4F46E5' }}
                        />
                        <button onClick={() => { setViewQcFiles(f=>{const n={...f};delete n[k];return n}); setViewQcPreviews(p=>{const n={...p};delete n[k];return n}) }}
                          style={{ fontSize:11, padding:'3px 8px', borderRadius:6, border:'1.5px solid #FCA5A5', background:'#fff', color:'#EF4444', cursor:'pointer', fontWeight:700 }}>ลบ</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ปุ่มเพิ่มรูป */}
              <label style={{
                display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                padding:'12px', borderRadius:10,
                border:'2px dashed #CBD5E1', background:'#F8FAFC',
                cursor:'pointer', fontSize:13, fontWeight:700, color:'#64748B',
                transition:'border-color .15s, background .15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='var(--primary)'; e.currentTarget.style.background='#EFF6FF' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='#CBD5E1'; e.currentTarget.style.background='#F8FAFC' }}
              >
                <span style={{ fontSize:18 }}>📎</span> เพิ่มรูป QC
                <input type="file" accept="image/*" multiple style={{ display:'none' }}
                  onChange={e => {
                    Array.from(e.target.files || []).forEach(file => {
                      const k = `new_${Date.now()}_${Math.random().toString(36).slice(2)}`
                      setViewQcFiles(f => ({ ...f, [k]: { file, label: '' } }))
                      const r = new FileReader()
                      r.onload = ev => setViewQcPreviews(p => ({ ...p, [k]: ev.target.result }))
                      r.readAsDataURL(file)
                    })
                    e.target.value = ''
                  }}
                />
              </label>

              {/* ปุ่มบันทึก */}
              {Object.values(viewQcFiles).some(Boolean) && (
                <div style={{ marginTop:12, display:'flex', justifyContent:'flex-end' }}>
                  <button className="btn btn-primary" onClick={handleSaveQc} disabled={savingQc}
                    style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, padding:'10px 24px' }}>
                    {savingQc ? '⏳ กำลังบันทึก...' : `💾 บันทึก ${Object.values(viewQcFiles).filter(Boolean).length} รูป`}
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    )
  }

  // ──── LIST VIEW ─────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {[
          { label: 'ใบงานทั้งหมด',              value: rows.length + ' ใบ',                                        accent: 'var(--primary)', icon: '📝' },
          { label: `ใบงานเดือน ${monthFilter}`,  value: `${monthCount} ใบ · ${monthQty} ตัว`,                       accent: '#7C3AED',        icon: '📅' },
          { label: 'ส่งงานแล้ว',                 value: rows.filter(j => j.status === 'ส่งงานแล้ว').length + ' ใบ', accent: 'var(--success)', icon: '✅' },
          { label: 'เลยกำหนด',                   value: rows.filter(j => isOverdue(j)).length + ' ใบ',               accent: 'var(--danger)',  icon: '⏰' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--card)', borderRadius: 'var(--radius)', padding: '14px 16px', boxShadow: 'var(--shadow)', border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: k.accent, borderRadius: '10px 0 0 10px' }} />
            <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 26, opacity: .1 }}>{k.icon}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.accent, marginTop: 3 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>🔍</span>
            <input type="text" placeholder="ค้นหาใบงาน..." value={search}
              onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36, width: 200 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>📅</span>
            <input type="month" value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
              style={{ fontSize: 13, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)' }} />
            {monthFilter && (
              <button className="btn btn-outline btn-sm" onClick={() => setMonthFilter('')}>ทั้งหมด</button>
            )}
          </div>
          {ALL_STATUS.map(s => {
            const count = rows.filter(j => j.status === s).length
            return count > 0 && (
              <span key={s} onClick={() => setFilter(filterStatus === s ? '' : s)}
                className={filterStatus === s ? 'badge badge-blue' : 'badge badge-gray'}
                style={{ cursor: 'pointer' }}>{s} · {count}</span>
            )
          })}
          {filterStatus && <span className="badge badge-gray" style={{ cursor: 'pointer' }} onClick={() => setFilter('')}>✕ ล้าง</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn ${viewMode === 'calendar' ? 'btn-primary' : 'btn-outline'} btn-sm`}
            onClick={() => setViewMode(v => v === 'table' ? 'calendar' : 'table')}>
            {viewMode === 'calendar' ? '📋 รายการ' : '📅 ตารางงาน'}
          </button>
          <button className="btn btn-primary" onClick={() => {
            setShowForm(!showForm)
            if (showForm) { setEditId(null); setForm(emptyForm()) }
          }}>{showForm ? '✕ ปิด' : '+ สร้างใบงาน'}</button>
        </div>
      </div>

      {/* ──── FORM ──────────────────────────────────────────── */}
      {showForm && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>{editId ? '✏️ แก้ไขใบงาน' : '➕ สร้างใบงานใหม่'}</div>

          {/* Section 1: ข้อมูลพื้นฐาน */}
          <SectionHeader icon="📋" title="ข้อมูลพื้นฐาน" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>Invoice อ้างอิง *</label>
              <select value={form.invoice_id} onChange={e => onSelectInvoice(e.target.value)}>
                <option value="">— เลือก Invoice —</option>
                {invoices.map(i => <option key={i.id} value={i.id}>{i.code} – {i.customers?.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>ลูกค้า</label>
              <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}>
                <option value="">— เลือกลูกค้า —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>สถานะ</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {ALL_STATUS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>วันที่เอกสาร</label>
              <input type="date" value={form.document_date} onChange={e => setForm({ ...form, document_date: e.target.value })} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>กำหนดส่ง</label>
              <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>หมายเหตุ</label>
              <input type="text" placeholder="หมายเหตุ..." value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
            </div>
          </div>

          {/* Section 2: Size Matrix */}
          <SectionHeader icon="📐" title="รายการสินค้า" />
          <div style={{ marginBottom: 24 }}>
            {/* Size column controls */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ไซส์:</span>
              {form.sizes.map(s => (
                <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--primary)', color: '#fff', borderRadius: 99, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                  {s}
                  <button onClick={() => removeSize(s)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1, opacity: .8 }}>×</button>
                </span>
              ))}
              <div style={{ display: 'flex', gap: 4 }}>
                <input type="text" placeholder="+ ไซส์" value={newSizeInput}
                  onChange={e => setNewSizeInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSize()}
                  style={{ width: 80, fontSize: 12, padding: '4px 8px' }} />
                <button className="btn btn-outline btn-sm" onClick={addSize}>เพิ่ม</button>
              </div>
            </div>

            {/* Table: แบบ | sizes | รวม */}
            <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', minWidth: 200, color: 'var(--text-muted)', fontSize: 12 }}>แบบ / รายการ</th>
                    {form.sizes.map(s => (
                      <th key={s} style={{ padding: '8px 8px', textAlign: 'center', minWidth: 56, color: 'var(--text-muted)', fontSize: 12 }}>{s}</th>
                    ))}
                    <th style={{ padding: '8px 10px', textAlign: 'center', minWidth: 56, color: 'var(--primary)', fontSize: 12, fontWeight: 700 }}>รวม</th>
                    <th style={{ width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {form.prod_items.map((r, idx) => (
                    <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px' }}>
                        <input type="text" placeholder="ชื่อแบบ / รายการ" value={r.style}
                          onChange={e => updateStyle(idx, e.target.value)}
                          style={{ width: '100%', fontSize: 13 }} />
                      </td>
                      {form.sizes.map(s => (
                        <td key={s} style={{ padding: '6px 4px', textAlign: 'center' }}>
                          <input type="number" min="0" placeholder="0" value={r.qtys[s] || ''}
                            onChange={e => updateQty(idx, s, e.target.value)}
                            style={{ width: 50, textAlign: 'center', fontSize: 13, padding: '4px 2px' }} />
                        </td>
                      ))}
                      <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 800, color: 'var(--primary)', fontSize: 14 }}>
                        {rowTotal(r.qtys) || '—'}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        {form.prod_items.length > 1 && (
                          <button onClick={() => removeRow(idx)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16 }}>×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {form.prod_items.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'var(--bg)', borderTop: '2px solid var(--border)' }}>
                      <td style={{ padding: '6px 12px', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>รวมทั้งหมด</td>
                      {form.sizes.map(s => (
                        <td key={s} style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: 13 }}>
                          {form.prod_items.reduce((sum, r) => sum + (parseInt(r.qtys[s]) || 0), 0) || '—'}
                        </td>
                      ))}
                      <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 900, color: 'var(--primary)', fontSize: 15 }}>
                        {grandTotal(form.prod_items)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={addRow}>+ เพิ่มแถว</button>
          </div>

          {/* Section 3: ข้อมูลการผลิต */}
          <SectionHeader icon="🎨" title="ข้อมูลการผลิต" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>ประเภทผ้า</label>
              <input type="text" placeholder="Cotton 100%, TC, CVC..." value={form.fabric_type}
                onChange={e => setForm({ ...form, fabric_type: e.target.value })} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>สีเสื้อ</label>
              <input type="text" placeholder="ขาว, ดำ, กรม..." value={form.shirt_color}
                onChange={e => setForm({ ...form, shirt_color: e.target.value })} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>สีสกรีน</label>
              <input type="text" placeholder="แดง+ขาว, CMYK..." value={form.screen_color}
                onChange={e => setForm({ ...form, screen_color: e.target.value })} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
              <label>หมายเหตุผลิต</label>
              <textarea rows={3} placeholder="รายละเอียดการผลิต..." value={form.production_note}
                onChange={e => setForm({ ...form, production_note: e.target.value })}
                style={{ resize: 'vertical' }} />
            </div>
          </div>

          {/* Design Detail */}
          <SectionHeader icon="📐" title="รายละเอียดลาย" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'ขนาดลาย', key: 'size',        placeholder: 'เช่น 10×15 cm' },
              { label: 'ตำแหน่ง',  key: 'position',    placeholder: 'เช่น หน้าอกซ้าย' },
              { label: 'จำนวนสี',  key: 'color_count', placeholder: 'เช่น 3 สี' },
              { label: 'เทคนิค',   key: 'technique',   placeholder: 'เช่น Spot Color, Discharge' },
              { label: 'พิเศษ',    key: 'special',     placeholder: 'เช่น Puff, Foil, Glitter' },
            ].map(({ label, key, placeholder }) => (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label>{label}</label>
                <input type="text" placeholder={placeholder}
                  value={form.design_detail?.[key] || ''}
                  onChange={e => setForm(f => ({ ...f, design_detail: { ...f.design_detail, [key]: e.target.value } }))} />
              </div>
            ))}
          </div>

          {/* Reference Images — เพิ่มได้หลายรูป */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: .4 }}>
              📎 Reference — ภาพตัวอย่างจากลูกค้า ({(form.reference_images?.length || 0) + referenceFiles.length} รูป)
            </div>
            {/* รูปที่บันทึกแล้ว */}
            {form.reference_images?.length > 0 && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:8 }}>
                {form.reference_images.map((url, i) => (
                  <div key={i} style={{ position:'relative', borderRadius:8, overflow:'hidden', border:'1px solid var(--border)' }}>
                    <img src={url} alt={`ref-${i}`} style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', display:'block' }} />
                    <button onClick={() => setForm(f => ({ ...f, reference_images: f.reference_images.filter((_,j)=>j!==i) }))}
                      style={{ position:'absolute', top:4, right:4, width:20, height:20, borderRadius:'50%', background:'rgba(0,0,0,.55)', border:'none', color:'#fff', fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                    <div style={{ fontSize:9, textAlign:'center', padding:'2px 0', color:'#9CA3AF', background:'#F8FAFC' }}>REF {i+1}</div>
                  </div>
                ))}
              </div>
            )}
            {/* รูปใหม่รอ upload */}
            {referenceFiles.length > 0 && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:8 }}>
                {referenceFiles.map((item, i) => (
                  <div key={i} style={{ position:'relative', borderRadius:8, overflow:'hidden', border:'2px solid #6366F1' }}>
                    <img src={item.preview} alt={`new-ref-${i}`} style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', display:'block' }} />
                    <div style={{ position:'absolute', top:4, left:4, background:'#6366F1', color:'#fff', fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:10 }}>ใหม่</div>
                    <button onClick={() => setReferenceFiles(f => f.filter((_,j)=>j!==i))}
                      style={{ position:'absolute', top:4, right:4, width:20, height:20, borderRadius:'50%', background:'rgba(0,0,0,.55)', border:'none', color:'#fff', fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                  </div>
                ))}
              </div>
            )}
            {/* ปุ่มเพิ่มรูป */}
            <label style={{
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              padding:'10px', borderRadius:10, border:'2px dashed #CBD5E1',
              background:'#F8FAFC', cursor:'pointer', fontSize:12, fontWeight:700, color:'#64748B',
              transition:'all .15s',
            }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--primary)';e.currentTarget.style.background='#EFF6FF'}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='#CBD5E1';e.currentTarget.style.background='#F8FAFC'}}
            >
              <span>🖼️</span> เพิ่มรูป Reference (เลือกได้หลายรูปพร้อมกัน)
              <input type="file" accept="image/*" multiple style={{ display:'none' }}
                onChange={e => {
                  Array.from(e.target.files||[]).forEach(file => {
                    const r = new FileReader()
                    r.onload = ev => setReferenceFiles(f => [...f, { file, preview: ev.target.result }])
                    r.readAsDataURL(file)
                  })
                  e.target.value=''
                }}
              />
            </label>
          </div>

          {/* Artwork + Mockup */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 8 }}>

            {/* Artwork column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>🖼️ Artwork</div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>รูปภาพ (JPG/PNG) — แสดงในใบงาน</div>
                <FileDropZone
                  accept="image/*"
                  icon="🎨"
                  label="วางหรือคลิกแนบ Artwork"
                  preview={artworkPreview || form.artwork_url || null}
                  imageOnly
                  onFile={file => handleFileChange({ target: { files: [file] } }, setArtworkFile, setArtworkPreview)}
                  onClear={() => { setArtworkFile(null); setArtworkPreview(null); setForm(f => ({ ...f, artwork_url: '' })) }}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>ไฟล์ต้นฉบับ (.ai / .psd / .pdf) → Drive</div>
                <FileDropZone
                  accept=".ai,.psd,.pdf,.eps,.svg,.cdr,application/postscript,application/pdf,image/svg+xml"
                  icon="📐"
                  label="วางหรือคลิกแนบไฟล์ต้นฉบับ"
                  fileName={artworkSourceFile?.name}
                  fileSize={artworkSourceFile?.size}
                  compact
                  onFile={file => setArtworkSourceFile(file)}
                  onClear={() => setArtworkSourceFile(null)}
                />
              </div>
            </div>

            {/* Mockup column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>👕 Mockup</div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>รูปภาพ (JPG/PNG) — แสดงในใบงาน</div>
                <FileDropZone
                  accept="image/*"
                  icon="👕"
                  label="วางหรือคลิกแนบ Mockup"
                  preview={mockupPreview || form.mockup_url || null}
                  imageOnly
                  onFile={file => handleFileChange({ target: { files: [file] } }, setMockupFile, setMockupPreview)}
                  onClear={() => { setMockupFile(null); setMockupPreview(null); setForm(f => ({ ...f, mockup_url: '' })) }}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>ไฟล์ต้นฉบับ (.ai / .psd / .pdf) → Drive</div>
                <FileDropZone
                  accept=".ai,.psd,.pdf,.eps,.svg,.cdr,application/postscript,application/pdf,image/svg+xml"
                  icon="📐"
                  label="วางหรือคลิกแนบไฟล์ต้นฉบับ"
                  fileName={mockupSourceFile?.name}
                  fileSize={mockupSourceFile?.size}
                  compact
                  onFile={file => setMockupSourceFile(file)}
                  onClear={() => setMockupSourceFile(null)}
                />
              </div>
            </div>

          </div>

          {/* QC Photos */}
          <SectionHeader icon="✅" title="รูปงานเสร็จ QC" />
          {/* รูปที่มีอยู่แล้ว (edit mode) */}
          {Array.isArray(form.finish_photos) && form.finish_photos.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:12 }}>
              {form.finish_photos.map((p, i) => (
                <div key={i} style={{ borderRadius:8, overflow:'hidden', border:'1px solid var(--border)' }}>
                  <img src={p.url} alt={p.label} style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', display:'block' }} />
                  <div style={{ display:'flex', alignItems:'center', padding:'4px 8px', background:'#F8FAFC', gap:4 }}>
                    <span style={{ fontSize:10, fontWeight:600, color:'#64748B', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.label || `รูปที่ ${i+1}`}</span>
                    <button onClick={() => setForm(f => ({ ...f, finish_photos: f.finish_photos.filter((_,j)=>j!==i) }))}
                      style={{ fontSize:10, padding:'2px 6px', borderRadius:5, border:'1px solid #FCA5A5', background:'#fff', color:'#EF4444', cursor:'pointer', fontWeight:700, flexShrink:0 }}>ลบ</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* รูปรอบันทึก */}
          {Object.keys(qcPreviews).filter(k => qcPreviews[k]).length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:12 }}>
              {Object.entries(qcPreviews).filter(([,v])=>v).map(([k, src]) => (
                <div key={k} style={{ borderRadius:8, overflow:'hidden', border:'2px solid #6366F1' }}>
                  <img src={src} alt={k} style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', display:'block' }} />
                  <div style={{ display:'flex', alignItems:'center', padding:'4px 8px', background:'#EEF2FF', gap:4 }}>
                    <input placeholder="ชื่อรูป" value={qcFiles[k]?.label||''}
                      onChange={e => setQcFiles(f=>({...f,[k]:{...f[k],label:e.target.value}}))}
                      style={{ flex:1, fontSize:10, border:'none', background:'transparent', outline:'none', fontWeight:600, color:'#4F46E5', minWidth:0 }} />
                    <button onClick={() => { setQcFiles(f=>{const n={...f};delete n[k];return n}); setQcPreviews(p=>{const n={...p};delete n[k];return n}) }}
                      style={{ fontSize:10, padding:'2px 6px', borderRadius:5, border:'1px solid #FCA5A5', background:'#fff', color:'#EF4444', cursor:'pointer', fontWeight:700, flexShrink:0 }}>ลบ</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <label style={{
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            padding:'10px', borderRadius:10, border:'2px dashed #CBD5E1',
            background:'#F8FAFC', cursor:'pointer', fontSize:12, fontWeight:700,
            color:'#64748B', marginBottom:20, transition:'all .15s',
          }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--primary)';e.currentTarget.style.background='#EFF6FF'}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='#CBD5E1';e.currentTarget.style.background='#F8FAFC'}}
          >
            <span>📎</span> เพิ่มรูป QC (เลือกได้หลายรูปพร้อมกัน)
            <input type="file" accept="image/*" multiple style={{ display:'none' }}
              onChange={e => {
                Array.from(e.target.files||[]).forEach(file => {
                  const k = `qc_${Date.now()}_${Math.random().toString(36).slice(2)}`
                  setQcFiles(f=>({...f,[k]:{file,label:''}}))
                  const r = new FileReader()
                  r.onload = ev => setQcPreviews(p=>({...p,[k]:ev.target.result}))
                  r.readAsDataURL(file)
                })
                e.target.value=''
              }}
            />
          </label>

          <div style={{ display: 'flex', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'กำลังบันทึก...' : '💾 บันทึก'}
            </button>
            <button className="btn btn-outline" onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm()) }}>ยกเลิก</button>
          </div>
        </div>
      )}

      {/* ──── CALENDAR VIEW ─────────────────────────────────── */}
      {viewMode === 'calendar' && (
        <CalendarView
          jobs={filtered}
          month={calMonth}
          onMonthChange={setCalMonth}
          onView={setView}
        />
      )}

      {/* ──── TABLE ──────────────────────────────────────────── */}
      {viewMode === 'table' && <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? <LoadingSpinner /> : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>เลขที่</th><th>ลูกค้า</th><th>รายการ</th>
                    <th style={{ textAlign: 'center' }}>จำนวน</th>
                    <th>กำหนดส่ง</th><th>สถานะ</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(j => {
                    const m = readMatrix(j)
                    return (
                      <tr key={j.id} className="row-link" style={{ background: isOverdue(j) ? '#FFF5F5' : undefined }}>
                        <td style={{ color: 'var(--primary)', fontFamily: 'monospace', fontWeight: 700 }}>{j.code}</td>
                        <td style={{ fontWeight: 600 }}>{j.customers?.name || '—'}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                          {(j.item_desc || '').slice(0, 36)}{(j.item_desc || '').length > 36 ? '…' : ''}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--primary)' }}>
                          {grandTotal(m.prod_items) > 0 ? grandTotal(m.prod_items) : '—'}
                        </td>
                        <td style={{ fontSize: 12, color: isOverdue(j) ? 'var(--danger)' : 'var(--text-muted)', fontWeight: isOverdue(j) ? 700 : 400 }}>
                          {fmtDate(j.due_date)}
                        </td>
                        <td><span className={STATUS_BADGE[j.status] || 'badge badge-gray'}>{j.status}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <button className="btn btn-outline btn-sm" onClick={() => setView(j)}>ดู</button>
                            <button className="btn btn-outline btn-sm" onClick={() => startEdit(j)}>✏️</button>
                            {j.status !== 'ส่งงานแล้ว' && (
                              <button className="btn btn-outline btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(j)}>🗑️</button>
                            )}
                            {j.status !== 'ส่งงานแล้ว' && (() => {
                              const idx = ALL_STATUS.indexOf(j.status)
                              const next = ALL_STATUS[idx + 1]
                              return next ? (
                                <button className="btn btn-primary btn-sm" title={next}
                                  onClick={() => updateJobStatus(j.id, next).then(() => load())}>▶</button>
                              ) : null
                            })()}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>ไม่พบรายการ</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
              แสดง {filtered.length} จาก {rows.length} รายการ
            </div>
          </>
        )}
      </div>}

    </div>
  )
}
