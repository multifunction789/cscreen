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
  'à¸£à¸­à¸¡à¸±à¸”à¸ˆà¸³'      : 'badge badge-gray',
  'à¸£à¸­à¸­à¸­à¸à¹à¸šà¸š'     : 'badge badge-cyan',
  'à¸£à¸­à¸—à¸³à¹„à¸Ÿà¸¥à¹Œ'     : 'badge badge-purple',
  'à¸ªà¸±à¹ˆà¸‡à¸‚à¸­à¸‡'       : 'badge badge-yellow',
  'à¸à¸³à¸¥à¸±à¸‡à¸ªà¸à¸£à¸µà¸™'   : 'badge badge-blue',
  'à¹à¸žà¹‡à¸„à¸žà¸£à¹‰à¸­à¸¡à¸ªà¹ˆà¸‡' : 'badge badge-green',
  'à¸ªà¹ˆà¸‡à¸‡à¸²à¸™à¹à¸¥à¹‰à¸§'   : 'badge badge-green',
  'à¹€à¸¥à¸¢à¸à¸³à¸«à¸™à¸”'     : 'badge badge-red',
}
const ALL_STATUS = Object.keys(STATUS_BADGE)
const DEFAULT_SIZES = ['SS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL']

// â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function makeRow(sizes, style = '') {
  return { style, qtys: Object.fromEntries(sizes.map(s => [s, ''])) }
}
function rowTotal(qtys) {
  return Object.values(qtys || {}).reduce((s, v) => s + (parseInt(v) || 0), 0)
}
function grandTotal(rows) {
  return (rows || []).reduce((s, r) => s + rowTotal(r.qtys), 0)
}

// à¹à¸›à¸¥à¸‡ reference à¹€à¸à¹ˆà¸² (string) + à¹ƒà¸«à¸¡à¹ˆ (array) â†’ [url, ...]
function normalizeRefImages(j) {
  const arr = j.items?.reference_images || j.reference_images
  if (Array.isArray(arr) && arr.length) return arr.filter(Boolean)
  // legacy single string
  const single = j.items?.reference_url || j.reference_url
  return single ? [single] : []
}

// à¹à¸›à¸¥à¸‡ finish_photos à¸—à¸¸à¸à¸£à¸¹à¸›à¹à¸šà¸š â†’ [{url, label}]
function normalizeQc(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(p => p?.url)
  // legacy object format: {front,back,side,group} à¸«à¸£à¸·à¸­ {QC1,QC2,...}
  const LABELS = { front:'à¸¡à¸¸à¸¡à¸•à¸£à¸‡', back:'à¸¡à¸¸à¸¡à¸«à¸¥à¸±à¸‡', side:'à¸¡à¸¸à¸¡à¸‚à¹‰à¸²à¸‡', group:'à¸£à¸¹à¸›à¸£à¸§à¸¡' }
  return Object.entries(raw)
    .filter(([, v]) => v)
    .map(([k, url]) => ({ url, label: LABELS[k] || k }))
}

// â”€â”€ Extract matrix data stored in items column â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  customer_id: '', invoice_id: '', note: '', due_date: '', document_date: todayStr(), status: 'à¸£à¸­à¸¡à¸±à¸”à¸ˆà¸³',
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

// â”€â”€ Calendar View Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function CalendarView({ jobs, month, onMonthChange, onView }) {
  const [year, m] = month.split('-').map(Number)
  const firstDay  = new Date(year, m - 1, 1)
  const lastDay   = new Date(year, m, 0)
  const thM = ['à¸¡.à¸„.','à¸.à¸ž.','à¸¡à¸µ.à¸„.','à¹€à¸¡.à¸¢.','à¸ž.à¸„.','à¸¡à¸´.à¸¢.','à¸.à¸„.','à¸ª.à¸„.','à¸.à¸¢.','à¸•.à¸„.','à¸ž.à¸¢.','à¸˜.à¸„.']

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
        <button className="btn btn-outline btn-sm" onClick={prevMo}>â—€ à¸à¹ˆà¸­à¸™à¸«à¸™à¹‰à¸²</button>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{thM[m - 1]} {year + 543}</span>
        <button className="btn btn-outline btn-sm" onClick={nextMo}>à¸–à¸±à¸”à¹„à¸› â–¶</button>
      </div>
      {/* Day labels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        {['à¸ˆ.', 'à¸­.', 'à¸ž.', 'à¸žà¸¤.', 'à¸¨.', 'à¸ª.', 'à¸­à¸².'].map((d, i) => (
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
                  const overdue = dateObj < today && j.status !== 'à¸ªà¹ˆà¸‡à¸‡à¸²à¸™à¹à¸¥à¹‰à¸§'
                  const done    = j.status === 'à¸ªà¹ˆà¸‡à¸‡à¸²à¸™à¹à¸¥à¹‰à¸§'
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
        {[['#EFF6FF','#BFDBFE','à¸›à¸à¸•à¸´'],['#FEE2E2','#FECACA','à¹€à¸¥à¸¢à¸à¸³à¸«à¸™à¸”'],['#D1FAE5','#A7F3D0','à¸ªà¹ˆà¸‡à¹à¸¥à¹‰à¸§']].map(([bg, border, label]) => (
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

  // â”€â”€ Invoice selection â†’ auto-fill â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Size matrix helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ File upload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function handleFileChange(e, setFile, setPreview) {
    const file = e.target.files?.[0]; if (!file) return
    setFile(file)
    const r = new FileReader()
    r.onload = ev => setPreview(ev.target.result)
    r.readAsDataURL(file)
  }

  // â”€â”€ Save â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function handleSave() {
    if (!form.invoice_id) return alert('à¸à¸£à¸¸à¸“à¸²à¹€à¸¥à¸·à¸­à¸ Invoice â€” à¹ƒà¸šà¸‡à¸²à¸™à¸•à¹‰à¸­à¸‡à¸­à¹‰à¸²à¸‡à¸­à¸´à¸‡ Invoice')
    if (!form.customer_id) return alert('à¸à¸£à¸¸à¸“à¸²à¹€à¸¥à¸·à¸­à¸à¸¥à¸¹à¸à¸„à¹‰à¸²')
    setSaving(true)

    // à¸„à¸³à¸™à¸§à¸“ job code à¸à¹ˆà¸­à¸™ (à¸•à¹‰à¸­à¸‡à¹ƒà¸Šà¹‰à¸à¹ˆà¸­à¸™à¸ªà¸£à¹‰à¸²à¸‡ folder)
    const maxNum = rows.reduce((max, r) => {
      const n = parseInt(r.code?.replace('JO-', '') || '0'); return n > max ? n : max
    }, 0)
    const jobCode    = editId
      ? (rows.find(r => r.id === editId)?.code || 'JO-EDIT')
      : 'JO-' + String(Math.max(maxNum + 1, 1001)).padStart(4, '0')
    const cust     = customers.find(c => c.id === form.customer_id) || {}
    const custName = cust.name || 'unknown'
    // à¹ƒà¸Šà¹‰ folder à¸‚à¸­à¸‡à¸¥à¸¹à¸à¸„à¹‰à¸² (à¸ªà¸£à¹‰à¸²à¸‡à¸•à¸­à¸™ à¸ªà¸£à¹‰à¸²à¸‡à¸¥à¸¹à¸à¸„à¹‰à¸²)
    const custFolderId = cust.drive_folder_id || null

    // Upload reference â†’ Supabase only (à¹„à¸¡à¹ˆà¸•à¹‰à¸­à¸‡à¸‚à¸¶à¹‰à¸™ Drive)
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
      // .ai / .psd â€” à¸„à¸‡à¸Šà¸·à¹ˆà¸­à¹€à¸”à¸´à¸¡
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
        finish_photos.push({ url, label: label || `à¸£à¸¹à¸›à¸—à¸µà¹ˆ ${qcNum}` })
      }
    } catch (e) {
      console.warn('QC upload error:', e.message)
    }

    // Summary for list view
    const validRows = form.prod_items.filter(r => r.style)
    const item_desc = validRows.map(r => r.style).join(', ') || 'â€”'

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
    if (!confirm(`à¸¥à¸šà¹ƒà¸šà¸‡à¸²à¸™ ${j.code} à¹ƒà¸Šà¹ˆà¹„à¸«à¸¡?`)) return
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
  const isOverdue = j => j.due_date && new Date(j.due_date) < new Date() && j.status !== 'à¸ªà¹ˆà¸‡à¸‡à¸²à¸™à¹à¸¥à¹‰à¸§'
  const monthCount = filtered.length
  const monthQty   = filtered.reduce((s, j) => s + grandTotal(readMatrix(j).prod_items), 0)

  // â”€â”€ à¸šà¸±à¸™à¸—à¸¶à¸ QC photos à¸ˆà¸²à¸ view inline (array format) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        photos.push({ url, label: label || `à¸£à¸¹à¸›à¸—à¸µà¹ˆ ${qcNum}` })
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

  // â”€â”€ à¸¥à¸š QC photo à¸­à¸­à¸à¸ˆà¸²à¸ view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€â”€ PRINT VIEW (3 pages) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (view) {
    const cust = customers.find(c => c.id === view.customer_id) || view.customers || {}
    const inv  = invoices.find(i => i.id === view.invoice_id)
    const m    = readMatrix(view)
    const { sizes, prod_items: prod, fabric_type, shirt_color, screen_color, production_note, mockup_url, finish_photos, design_detail, reference_images } = m
    const dd = design_detail || {}
    const FINISH_SLOTS = [
      { key: 'front', label: 'à¸¡à¸¸à¸¡à¸•à¸£à¸‡' },
      { key: 'back',  label: 'à¸¡à¸¸à¸¡à¸«à¸¥à¸±à¸‡' },
      { key: 'side',  label: 'à¸¡à¸¸à¸¡à¸‚à¹‰à¸²à¸‡' },
      { key: 'group', label: 'à¸£à¸¹à¸›à¸£à¸§à¸¡' },
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
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)' }}>à¹ƒà¸šà¸‡à¸²à¸™à¸à¸²à¸£à¸œà¸¥à¸´à¸• <span style={{ color: '#999', fontSize: 12 }}>à¸«à¸™à¹‰à¸² {page}/3</span></div>
            <div style={{ fontSize: 13, color: 'var(--primary)', fontFamily: 'monospace', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
              {view.code}
              {m.drive_folders?.jobFolderId && (
                <a href={`https://drive.google.com/drive/folders/${m.drive_folders.jobFolderId}`}
                  target="_blank" rel="noreferrer" style={{ fontSize: 11, textDecoration: 'none', color: '#1a73e8' }}>
                  ðŸ“ Drive
                </a>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#666' }}>à¸§à¸±à¸™à¸—à¸µà¹ˆ: {fmtDate(view.document_date || view.created_at)}</div>
            {view.due_date && <div style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 700 }}>à¸à¸³à¸«à¸™à¸”à¸ªà¹ˆà¸‡: {fmtDate(view.due_date)}</div>}
          </div>
        </div>
      )
    }

    return (
      <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
        {/* Toolbar */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <button className="btn btn-outline" onClick={() => setView(null)}>â† à¸à¸¥à¸±à¸š</button>
          <button className="btn btn-outline" onClick={() => printDoc('print-area', filePrefix)}>ðŸ–¨ï¸ à¸žà¸´à¸¡à¸žà¹Œ</button>
        </div>

        <div id="print-area" ref={printRef}>
          {/* â”€â”€ shared helpers â”€â”€ */}
          {(() => {
            const PAGE_STYLE = { background:'#fff', border:'1px solid var(--border)', borderRadius:8, padding:32, marginBottom:24 }
            const BREAK      = { ...PAGE_STYLE, pageBreakBefore:'always' }
            const LABEL_BAR  = (text, bg='#374151') => (
              <div style={{ fontSize:10, fontWeight:700, color:'#fff', background:bg, padding:'4px 10px', letterSpacing:.5 }}>{text}</div>
            )

            // chunk array into groups of n
            const chunk = (arr, n) => {
              const out = []
              for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
              return out
            }

            // â”€â”€ Customer header strip (reused) â”€â”€
            const CustStrip = () => (
              <div style={{ background:'#F9FAFB', borderRadius:8, padding:'8px 16px', marginBottom:14, display:'flex', gap:20, alignItems:'center', flexWrap:'wrap' }}>
                <div>
                  <div style={{ fontSize:10, fontWeight:700, color:'#888' }}>à¸¥à¸¹à¸à¸„à¹‰à¸²</div>
                  <div style={{ fontSize:14, fontWeight:800 }}>{cust.name || view.customers?.name || 'â€”'}</div>
                  {cust.phone && <div style={{ fontSize:11, color:'#666' }}>Tel: {cust.phone}</div>}
                </div>
                {inv && <div style={{ fontSize:11, color:'#888', marginLeft:'auto' }}>Invoice: <strong>{inv.code}</strong></div>}
                <span className={STATUS_BADGE[view.status] || 'badge badge-gray'}>{view.status}</span>
              </div>
            )

            // â”€â”€ photo grid 2Ã—2 (4 à¸£à¸¹à¸›à¸•à¹ˆà¸­à¸«à¸™à¹‰à¸²) â”€â”€
            const PhotoGrid = ({ items, labelFn }) => (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:14 }}>
                {items.map((item, i) => (
                  <div key={i} style={{ borderRadius:8, overflow:'hidden', border:'1px solid var(--border)' }}>
                    <img src={typeof item === 'string' ? item : item.url} alt={labelFn(item,i)} crossOrigin="anonymous"
                      style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', display:'block', background:'#f9f9f9' }} />
                    <div style={{ fontSize:11, fontWeight:700, textAlign:'center', padding:'5px 0', color:'#555', background:'#F8FAFC' }}>
                      {labelFn(item,i)}
                    </div>
                  </div>
                ))}
                {/* fill empty slots so grid stays 2Ã—2 */}
                {Array.from({ length: (4 - items.length % 4) % 4 }).map((_,i) => (
                  <div key={`empty-${i}`} style={{ borderRadius:8, border:'1px dashed #E5E7EB', aspectRatio:'4/3', background:'#FAFAFA' }} />
                ))}
              </div>
            )

            const totalPages = 1
              + (finish_photos.length > 0 ? Math.ceil(finish_photos.length / 4) : 1)
              + (reference_images.length > 0 ? Math.ceil(reference_images.length / 4) : 1)

            return (<>

          {/* â•â•â•â•â•â•â•â•â•â•â• PAGE 1 â€” à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸‡à¸²à¸™ + Mockup + Artwork â•â•â•â•â•â•â•â•â•â•â• */}
          <div style={PAGE_STYLE}>
            <PageHeader page={`1/${totalPages}`} />
            <CustStrip />

            {/* Design detail */}
            {(dd.size || dd.position || dd.color_count || dd.technique || dd.special) && (
              <div style={{ marginBottom:14, border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
                <div style={{ background:'#374151', color:'#fff', fontSize:11, fontWeight:700, padding:'5px 12px', letterSpacing:.5 }}>à¸£à¸²à¸¢à¸¥à¸°à¹€à¸­à¸µà¸¢à¸”à¸¥à¸²à¸¢</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)' }}>
                  {[['à¸‚à¸™à¸²à¸”à¸¥à¸²à¸¢',dd.size],['à¸•à¸³à¹à¸«à¸™à¹ˆà¸‡',dd.position],['à¸ˆà¸³à¸™à¸§à¸™à¸ªà¸µ',dd.color_count],['à¹€à¸—à¸„à¸™à¸´à¸„',dd.technique],['à¸žà¸´à¹€à¸¨à¸©',dd.special]].map(([l,v]) => (
                    <div key={l} style={{ padding:'7px 12px', borderRight:'1px solid var(--border)' }}>
                      <div style={{ fontSize:9, fontWeight:700, color:'#999', textTransform:'uppercase' }}>{l}</div>
                      <div style={{ fontSize:13, fontWeight:700, color:v?'var(--text)':'#ccc' }}>{v||'â€”'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Size matrix */}
            <div style={{ overflowX:'auto', marginBottom:14 }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'var(--primary)', color:'#fff' }}>
                    <th style={{ padding:'7px 10px', textAlign:'left', minWidth:140 }}>à¹à¸šà¸š / à¸£à¸²à¸¢à¸à¸²à¸£</th>
                    {sizes.map(s=><th key={s} style={{ padding:'7px 8px', textAlign:'center', minWidth:44 }}>{s}</th>)}
                    <th style={{ padding:'7px 10px', textAlign:'center', minWidth:50, background:'#7f1d1d' }}>à¸£à¸§à¸¡</th>
                  </tr>
                </thead>
                <tbody>
                  {prod.map((r,i)=>(
                    <tr key={i} style={{ borderBottom:'1px solid #eee', background:i%2?'#fafafa':'#fff' }}>
                      <td style={{ padding:'6px 10px', fontWeight:600, fontSize:11 }}>{r.style||'â€”'}</td>
                      {sizes.map(s=>(
                        <td key={s} style={{ padding:'6px 8px', textAlign:'center', fontWeight:parseInt(r.qtys?.[s])>0?700:400, color:parseInt(r.qtys?.[s])>0?'var(--text)':'#ccc' }}>
                          {parseInt(r.qtys?.[s])>0?r.qtys[s]:'â€”'}
                        </td>
                      ))}
                      <td style={{ padding:'6px 10px', textAlign:'center', fontWeight:800, color:'var(--primary)' }}>{rowTotal(r.qtys)}</td>
                    </tr>
                  ))}
                  <tr style={{ background:'#F9FAFB', borderTop:'2px solid var(--border)' }}>
                    <td style={{ padding:'6px 10px', fontWeight:700, color:'#888', fontSize:11 }}>à¸£à¸§à¸¡à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”</td>
                    {sizes.map(s=>(
                      <td key={s} style={{ padding:'6px 8px', textAlign:'center', fontWeight:700, fontSize:12 }}>
                        {prod.reduce((sum,r)=>sum+(parseInt(r.qtys?.[s])||0),0)||'â€”'}
                      </td>
                    ))}
                    <td style={{ padding:'6px 10px', textAlign:'center', fontWeight:900, color:'var(--primary)', fontSize:14 }}>{grandTotal(prod)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Production badges + notes */}
            {(fabric_type||shirt_color||screen_color) && (
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                {[['à¸›à¸£à¸°à¹€à¸ à¸—à¸œà¹‰à¸²',fabric_type],['à¸ªà¸µà¹€à¸ªà¸·à¹‰à¸­',shirt_color],['à¸ªà¸µà¸ªà¸à¸£à¸µà¸™',screen_color]].filter(([,v])=>v).map(([l,v])=>(
                  <div key={l} style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:6, padding:'4px 10px', fontSize:11 }}>
                    <span style={{ color:'#666' }}>{l}: </span><span style={{ fontWeight:700 }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            {production_note && <div style={{ padding:'6px 12px', background:'#FFF7ED', borderRadius:6, borderLeft:'3px solid #F97316', fontSize:11, marginBottom:6 }}><span style={{ fontWeight:700, color:'#C2410C' }}>à¸«à¸¡à¸²à¸¢à¹€à¸«à¸•à¸¸à¸œà¸¥à¸´à¸•: </span>{production_note}</div>}
            {view.note && <div style={{ padding:'6px 12px', background:'#FFFBEB', borderRadius:6, fontSize:11, marginBottom:6 }}><span style={{ fontWeight:700 }}>à¸«à¸¡à¸²à¸¢à¹€à¸«à¸•à¸¸: </span>{view.note}</div>}

            {/* Mockup (1) + Artwork (1) */}
            {(mockup_url || view.image_url) && (
              <div style={{ display:'grid', gridTemplateColumns: mockup_url && view.image_url ? '1fr 1fr' : '1fr', gap:12, marginTop:14 }}>
                {mockup_url && (
                  <div style={{ border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'#fff', background:'#1D4ED8', padding:'4px 10px', letterSpacing:.5 }}>MOCKUP</div>
                    <img src={mockup_url} alt="mockup" crossOrigin="anonymous"
                      style={{ width:'100%', maxHeight:280, objectFit:'contain', display:'block', background:'#f9f9f9', padding:8 }} />
                  </div>
                )}
                {view.image_url && (
                  <div style={{ border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'#fff', background:'#374151', padding:'4px 10px', letterSpacing:.5 }}>ARTWORK</div>
                    <img src={view.image_url} alt="artwork" crossOrigin="anonymous"
                      style={{ width:'100%', maxHeight:280, objectFit:'contain', display:'block', background:'#f9f9f9', padding:8 }} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* â•â•â•â•â•â•â•â•â•â•â• PAGE 2+ â€” à¸£à¸¹à¸›à¸‡à¸²à¸™à¹€à¸ªà¸£à¹‡à¸ˆ QC (4 à¸£à¸¹à¸›/à¸«à¸™à¹‰à¸²) â•â•â•â•â•â•â•â•â•â•â• */}
          {chunk(finish_photos.length > 0 ? finish_photos : [], 4).map((group, pi) => (
            <div key={`qc-${pi}`} style={pi===0 ? { ...PAGE_STYLE, pageBreakBefore:'always' } : BREAK}>
              <PageHeader page={`${2+pi}/${totalPages}`} />
              <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>
                {cust.name||'â€”'} <span style={{ color:'#999', fontWeight:400, fontSize:11 }}>Â· {view.code} Â· à¸£à¸¹à¸›à¸‡à¸²à¸™à¹€à¸ªà¸£à¹‡à¸ˆ QC à¸«à¸™à¹‰à¸² {pi+1}</span>
              </div>
              <PhotoGrid items={group} labelFn={(p,i) => p.label || `à¸£à¸¹à¸›à¸—à¸µà¹ˆ ${pi*4+i+1}`} />
            </div>
          ))}
          {finish_photos.length === 0 && (
            <div style={{ ...PAGE_STYLE, pageBreakBefore:'always' }}>
              <PageHeader page={`2/${totalPages}`} />
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:260, color:'#D1D5DB', gap:10 }}>
                <span style={{ fontSize:40 }}>ðŸ“·</span>
                <div style={{ fontSize:13, fontWeight:700 }}>à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸£à¸¹à¸›à¸‡à¸²à¸™à¹€à¸ªà¸£à¹‡à¸ˆ</div>
              </div>
              {/* QC upload zone */}
              <div className="no-print">
                {Object.keys(viewQcPreviews).filter(k=>viewQcPreviews[k]).length > 0 && (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:12 }}>
                    {Object.entries(viewQcPreviews).filter(([,v])=>v).map(([k,src])=>(
                      <div key={k} style={{ borderRadius:10, overflow:'hidden', border:'2px solid #6366F1' }}>
                        <div style={{ position:'relative' }}>
                          <img src={src} style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', display:'block' }} />
                          <div style={{ position:'absolute', top:6, left:6, background:'#6366F1', color:'#fff', fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20 }}>à¸£à¸­à¸šà¸±à¸™à¸—à¸¶à¸</div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', padding:'6px 10px', background:'#EEF2FF' }}>
                          <input placeholder="à¸Šà¸·à¹ˆà¸­à¸£à¸¹à¸›" value={viewQcFiles[k]?.label||''} onChange={e=>setViewQcFiles(f=>({...f,[k]:{...f[k],label:e.target.value}}))}
                            style={{ flex:1, fontSize:11, border:'none', background:'transparent', outline:'none', fontWeight:600, color:'#4F46E5' }} />
                          <button onClick={()=>{setViewQcFiles(f=>{const n={...f};delete n[k];return n});setViewQcPreviews(p=>{const n={...p};delete n[k];return n})}}
                            style={{ fontSize:11, padding:'3px 8px', borderRadius:6, border:'1.5px solid #FCA5A5', background:'#fff', color:'#EF4444', cursor:'pointer', fontWeight:700 }}>à¸¥à¸š</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <label style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'12px', borderRadius:10, border:'2px dashed #CBD5E1', background:'#F8FAFC', cursor:'pointer', fontSize:13, fontWeight:700, color:'#64748B' }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--primary)';e.currentTarget.style.background='#EFF6FF'}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='#CBD5E1';e.currentTarget.style.background='#F8FAFC'}}>
                  <span>ðŸ“Ž</span> à¹€à¸žà¸´à¹ˆà¸¡à¸£à¸¹à¸› QC
                  <input type="file" accept="image/*" multiple style={{ display:'none' }}
                    onChange={e=>{
                      const nf={};const np={}
                      Array.from(e.target.files||[]).forEach(file=>{
                        const k=`new_${Date.now()}_${Math.random().toString(36).slice(2)}`
                        nf[k]={file,label:''}
                        np[k]=URL.createObjectURL(file)
                      })
                      setViewQcFiles(f=>({...f,...nf}))
                      setViewQcPreviews(p=>({...p,...np}))
                      e.target.value=''
                    }} />
                </label>
                {Object.values(viewQcFiles).some(Boolean) && (
                  <div style={{ marginTop:12, display:'flex', justifyContent:'flex-end' }}>
                    <button className="btn btn-primary" onClick={handleSaveQc} disabled={savingQc} style={{ fontSize:13, padding:'10px 24px' }}>
                      {savingQc?'â³ à¸à¸³à¸¥à¸±à¸‡à¸šà¸±à¸™à¸—à¸¶à¸...':`ðŸ’¾ à¸šà¸±à¸™à¸—à¸¶à¸ ${Object.values(viewQcFiles).filter(Boolean).length} à¸£à¸¹à¸›`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          {finish_photos.length > 0 && (
            <div className="no-print" style={{ marginBottom:16, display:'flex', flexDirection:'column', gap:10 }}>
              {/* upload more QC when photos exist */}
              {Object.keys(viewQcPreviews).filter(k=>viewQcPreviews[k]).length > 0 && (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
                  {Object.entries(viewQcPreviews).filter(([,v])=>v).map(([k,src])=>(
                    <div key={k} style={{ borderRadius:10, overflow:'hidden', border:'2px solid #6366F1' }}>
                      <div style={{ position:'relative' }}><img src={src} style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', display:'block' }} />
                        <div style={{ position:'absolute', top:6, left:6, background:'#6366F1', color:'#fff', fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20 }}>à¸£à¸­à¸šà¸±à¸™à¸—à¸¶à¸</div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', padding:'6px 10px', background:'#EEF2FF' }}>
                        <input placeholder="à¸Šà¸·à¹ˆà¸­à¸£à¸¹à¸›" value={viewQcFiles[k]?.label||''} onChange={e=>setViewQcFiles(f=>({...f,[k]:{...f[k],label:e.target.value}}))}
                          style={{ flex:1, fontSize:11, border:'none', background:'transparent', outline:'none', fontWeight:600, color:'#4F46E5' }} />
                        <button onClick={()=>{setViewQcFiles(f=>{const n={...f};delete n[k];return n});setViewQcPreviews(p=>{const n={...p};delete n[k];return n})}}
                          style={{ fontSize:11, padding:'3px 8px', borderRadius:6, border:'1.5px solid #FCA5A5', background:'#fff', color:'#EF4444', cursor:'pointer', fontWeight:700 }}>à¸¥à¸š</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <label style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'10px', borderRadius:10, border:'2px dashed #CBD5E1', background:'#F8FAFC', cursor:'pointer', fontSize:12, fontWeight:700, color:'#64748B' }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--primary)';e.currentTarget.style.background='#EFF6FF'}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='#CBD5E1';e.currentTarget.style.background='#F8FAFC'}}>
                <span>ðŸ“Ž</span> à¹€à¸žà¸´à¹ˆà¸¡à¸£à¸¹à¸› QC
                <input type="file" accept="image/*" multiple style={{ display:'none' }}
                  onChange={e=>{
                    const nf={};const np={}
                    Array.from(e.target.files||[]).forEach(file=>{
                      const k=`new_${Date.now()}_${Math.random().toString(36).slice(2)}`
                      nf[k]={file,label:''}
                      np[k]=URL.createObjectURL(file)
                    })
                    setViewQcFiles(f=>({...f,...nf}))
                    setViewQcPreviews(p=>({...p,...np}))
                    e.target.value=''
                  }} />
              </label>
              {Object.values(viewQcFiles).some(Boolean) && (
                <div style={{ display:'flex', justifyContent:'flex-end' }}>
                  <button className="btn btn-primary" onClick={handleSaveQc} disabled={savingQc} style={{ fontSize:13, padding:'10px 24px' }}>
                    {savingQc?'â³ à¸à¸³à¸¥à¸±à¸‡à¸šà¸±à¸™à¸—à¸¶à¸...':`ðŸ’¾ à¸šà¸±à¸™à¸—à¸¶à¸ ${Object.values(viewQcFiles).filter(Boolean).length} à¸£à¸¹à¸›`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* â•â•â•â•â•â•â•â•â•â•â• PAGE 3+ â€” à¸£à¸¹à¸› Reference (4 à¸£à¸¹à¸›/à¸«à¸™à¹‰à¸²) â•â•â•â•â•â•â•â•â•â•â• */}
          {chunk(reference_images.length > 0 ? reference_images : [], 4).map((group, pi) => (
            <div key={`ref-${pi}`} style={BREAK}>
              <PageHeader page={`${2 + Math.ceil(Math.max(finish_photos.length,1)/4) + pi}/${totalPages}`} />
              <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>
                {cust.name||'â€”'} <span style={{ color:'#999', fontWeight:400, fontSize:11 }}>Â· à¸£à¸¹à¸› Reference à¸«à¸™à¹‰à¸² {pi+1}</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:14 }}>
                {group.map((url,i)=>(
                  <div key={i} style={{ borderRadius:8, overflow:'hidden', border:'1px solid var(--border)' }}>
                    <img src={url} alt={`REF ${pi*4+i+1}`} crossOrigin="anonymous"
                      style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', display:'block', background:'#f9f9f9' }} />
                    <div style={{ fontSize:11, fontWeight:700, textAlign:'center', padding:'5px 0', color:'#555', background:'#F8FAFC' }}>REF {pi*4+i+1}</div>
                  </div>
                ))}
                {Array.from({ length:(4-group.length%4)%4 }).map((_,i)=>(
                  <div key={`e${i}`} style={{ borderRadius:8, border:'1px dashed #E5E7EB', aspectRatio:'4/3', background:'#FAFAFA' }} />
                ))}
              </div>
            </div>
          ))}
          {reference_images.length === 0 && (
            <div style={BREAK}>
              <PageHeader page={`${totalPages}/${totalPages}`} />
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:200, color:'#D1D5DB', gap:8 }}>
                <span style={{ fontSize:36 }}>ðŸ–¼ï¸</span>
                <div style={{ fontSize:13, fontWeight:700 }}>à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸£à¸¹à¸› Reference</div>
              </div>
            </div>
          )}

            </>)
          })()}

        </div>
      </div>
    )
  }

  // â”€â”€â”€â”€ LIST VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {[
          { label: 'à¹ƒà¸šà¸‡à¸²à¸™à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”',              value: rows.length + ' à¹ƒà¸š',                                        accent: 'var(--primary)', icon: 'ðŸ“' },
          { label: `à¹ƒà¸šà¸‡à¸²à¸™à¹€à¸”à¸·à¸­à¸™ ${monthFilter}`,  value: `${monthCount} à¹ƒà¸š Â· ${monthQty} à¸•à¸±à¸§`,                       accent: '#7C3AED',        icon: 'ðŸ“…' },
          { label: 'à¸ªà¹ˆà¸‡à¸‡à¸²à¸™à¹à¸¥à¹‰à¸§',                 value: rows.filter(j => j.status === 'à¸ªà¹ˆà¸‡à¸‡à¸²à¸™à¹à¸¥à¹‰à¸§').length + ' à¹ƒà¸š', accent: 'var(--success)', icon: 'âœ…' },
          { label: 'à¹€à¸¥à¸¢à¸à¸³à¸«à¸™à¸”',                   value: rows.filter(j => isOverdue(j)).length + ' à¹ƒà¸š',               accent: 'var(--danger)',  icon: 'â°' },
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
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>ðŸ”</span>
            <input type="text" placeholder="à¸„à¹‰à¸™à¸«à¸²à¹ƒà¸šà¸‡à¸²à¸™..." value={search}
              onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36, width: 200 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ðŸ“…</span>
            <input type="month" value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
              style={{ fontSize: 13, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)' }} />
            {monthFilter && (
              <button className="btn btn-outline btn-sm" onClick={() => setMonthFilter('')}>à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”</button>
            )}
          </div>
          {ALL_STATUS.map(s => {
            const count = rows.filter(j => j.status === s).length
            return count > 0 && (
              <span key={s} onClick={() => setFilter(filterStatus === s ? '' : s)}
                className={filterStatus === s ? 'badge badge-blue' : 'badge badge-gray'}
                style={{ cursor: 'pointer' }}>{s} Â· {count}</span>
            )
          })}
          {filterStatus && <span className="badge badge-gray" style={{ cursor: 'pointer' }} onClick={() => setFilter('')}>âœ• à¸¥à¹‰à¸²à¸‡</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn ${viewMode === 'calendar' ? 'btn-primary' : 'btn-outline'} btn-sm`}
            onClick={() => setViewMode(v => v === 'table' ? 'calendar' : 'table')}>
            {viewMode === 'calendar' ? 'ðŸ“‹ à¸£à¸²à¸¢à¸à¸²à¸£' : 'ðŸ“… à¸•à¸²à¸£à¸²à¸‡à¸‡à¸²à¸™'}
          </button>
          <button className="btn btn-primary" onClick={() => {
            setShowForm(!showForm)
            if (showForm) { setEditId(null); setForm(emptyForm()) }
          }}>{showForm ? 'âœ• à¸›à¸´à¸”' : '+ à¸ªà¸£à¹‰à¸²à¸‡à¹ƒà¸šà¸‡à¸²à¸™'}</button>
        </div>
      </div>

      {/* â”€â”€â”€â”€ FORM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {showForm && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>{editId ? 'âœï¸ à¹à¸à¹‰à¹„à¸‚à¹ƒà¸šà¸‡à¸²à¸™' : 'âž• à¸ªà¸£à¹‰à¸²à¸‡à¹ƒà¸šà¸‡à¸²à¸™à¹ƒà¸«à¸¡à¹ˆ'}</div>

          {/* Section 1: à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸žà¸·à¹‰à¸™à¸à¸²à¸™ */}
          <SectionHeader icon="ðŸ“‹" title="à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸žà¸·à¹‰à¸™à¸à¸²à¸™" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>Invoice à¸­à¹‰à¸²à¸‡à¸­à¸´à¸‡ *</label>
              <select value={form.invoice_id} onChange={e => onSelectInvoice(e.target.value)}>
                <option value="">â€” à¹€à¸¥à¸·à¸­à¸ Invoice â€”</option>
                {invoices.map(i => <option key={i.id} value={i.id}>{i.code} â€“ {i.customers?.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>à¸¥à¸¹à¸à¸„à¹‰à¸²</label>
              <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}>
                <option value="">â€” à¹€à¸¥à¸·à¸­à¸à¸¥à¸¹à¸à¸„à¹‰à¸² â€”</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>à¸ªà¸–à¸²à¸™à¸°</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {ALL_STATUS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>à¸§à¸±à¸™à¸—à¸µà¹ˆà¹€à¸­à¸à¸ªà¸²à¸£</label>
              <input type="date" value={form.document_date} onChange={e => setForm({ ...form, document_date: e.target.value })} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>à¸à¸³à¸«à¸™à¸”à¸ªà¹ˆà¸‡</label>
              <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>à¸«à¸¡à¸²à¸¢à¹€à¸«à¸•à¸¸</label>
              <input type="text" placeholder="à¸«à¸¡à¸²à¸¢à¹€à¸«à¸•à¸¸..." value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
            </div>
          </div>

          {/* Section 2: Size Matrix */}
          <SectionHeader icon="ðŸ“" title="à¸£à¸²à¸¢à¸à¸²à¸£à¸ªà¸´à¸™à¸„à¹‰à¸²" />
          <div style={{ marginBottom: 24 }}>
            {/* Size column controls */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>à¹„à¸‹à¸ªà¹Œ:</span>
              {form.sizes.map(s => (
                <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--primary)', color: '#fff', borderRadius: 99, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                  {s}
                  <button onClick={() => removeSize(s)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1, opacity: .8 }}>Ã—</button>
                </span>
              ))}
              <div style={{ display: 'flex', gap: 4 }}>
                <input type="text" placeholder="+ à¹„à¸‹à¸ªà¹Œ" value={newSizeInput}
                  onChange={e => setNewSizeInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSize()}
                  style={{ width: 80, fontSize: 12, padding: '4px 8px' }} />
                <button className="btn btn-outline btn-sm" onClick={addSize}>à¹€à¸žà¸´à¹ˆà¸¡</button>
              </div>
            </div>

            {/* Table: à¹à¸šà¸š | sizes | à¸£à¸§à¸¡ */}
            <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', minWidth: 200, color: 'var(--text-muted)', fontSize: 12 }}>à¹à¸šà¸š / à¸£à¸²à¸¢à¸à¸²à¸£</th>
                    {form.sizes.map(s => (
                      <th key={s} style={{ padding: '8px 8px', textAlign: 'center', minWidth: 56, color: 'var(--text-muted)', fontSize: 12 }}>{s}</th>
                    ))}
                    <th style={{ padding: '8px 10px', textAlign: 'center', minWidth: 56, color: 'var(--primary)', fontSize: 12, fontWeight: 700 }}>à¸£à¸§à¸¡</th>
                    <th style={{ width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {form.prod_items.map((r, idx) => (
                    <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px' }}>
                        <input type="text" placeholder="à¸Šà¸·à¹ˆà¸­à¹à¸šà¸š / à¸£à¸²à¸¢à¸à¸²à¸£" value={r.style}
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
                        {rowTotal(r.qtys) || 'â€”'}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        {form.prod_items.length > 1 && (
                          <button onClick={() => removeRow(idx)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16 }}>Ã—</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {form.prod_items.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'var(--bg)', borderTop: '2px solid var(--border)' }}>
                      <td style={{ padding: '6px 12px', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>à¸£à¸§à¸¡à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”</td>
                      {form.sizes.map(s => (
                        <td key={s} style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: 13 }}>
                          {form.prod_items.reduce((sum, r) => sum + (parseInt(r.qtys[s]) || 0), 0) || 'â€”'}
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
            <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={addRow}>+ à¹€à¸žà¸´à¹ˆà¸¡à¹à¸–à¸§</button>
          </div>

          {/* Section 3: à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸à¸²à¸£à¸œà¸¥à¸´à¸• */}
          <SectionHeader icon="ðŸŽ¨" title="à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸à¸²à¸£à¸œà¸¥à¸´à¸•" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>à¸›à¸£à¸°à¹€à¸ à¸—à¸œà¹‰à¸²</label>
              <input type="text" placeholder="Cotton 100%, TC, CVC..." value={form.fabric_type}
                onChange={e => setForm({ ...form, fabric_type: e.target.value })} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>à¸ªà¸µà¹€à¸ªà¸·à¹‰à¸­</label>
              <input type="text" placeholder="à¸‚à¸²à¸§, à¸”à¸³, à¸à¸£à¸¡..." value={form.shirt_color}
                onChange={e => setForm({ ...form, shirt_color: e.target.value })} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>à¸ªà¸µà¸ªà¸à¸£à¸µà¸™</label>
              <input type="text" placeholder="à¹à¸”à¸‡+à¸‚à¸²à¸§, CMYK..." value={form.screen_color}
                onChange={e => setForm({ ...form, screen_color: e.target.value })} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
              <label>à¸«à¸¡à¸²à¸¢à¹€à¸«à¸•à¸¸à¸œà¸¥à¸´à¸•</label>
              <textarea rows={3} placeholder="à¸£à¸²à¸¢à¸¥à¸°à¹€à¸­à¸µà¸¢à¸”à¸à¸²à¸£à¸œà¸¥à¸´à¸•..." value={form.production_note}
                onChange={e => setForm({ ...form, production_note: e.target.value })}
                style={{ resize: 'vertical' }} />
            </div>
          </div>

          {/* Design Detail */}
          <SectionHeader icon="ðŸ“" title="à¸£à¸²à¸¢à¸¥à¸°à¹€à¸­à¸µà¸¢à¸”à¸¥à¸²à¸¢" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'à¸‚à¸™à¸²à¸”à¸¥à¸²à¸¢', key: 'size',        placeholder: 'à¹€à¸Šà¹ˆà¸™ 10Ã—15 cm' },
              { label: 'à¸•à¸³à¹à¸«à¸™à¹ˆà¸‡',  key: 'position',    placeholder: 'à¹€à¸Šà¹ˆà¸™ à¸«à¸™à¹‰à¸²à¸­à¸à¸‹à¹‰à¸²à¸¢' },
              { label: 'à¸ˆà¸³à¸™à¸§à¸™à¸ªà¸µ',  key: 'color_count', placeholder: 'à¹€à¸Šà¹ˆà¸™ 3 à¸ªà¸µ' },
              { label: 'à¹€à¸—à¸„à¸™à¸´à¸„',   key: 'technique',   placeholder: 'à¹€à¸Šà¹ˆà¸™ Spot Color, Discharge' },
              { label: 'à¸žà¸´à¹€à¸¨à¸©',    key: 'special',     placeholder: 'à¹€à¸Šà¹ˆà¸™ Puff, Foil, Glitter' },
            ].map(({ label, key, placeholder }) => (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label>{label}</label>
                <input type="text" placeholder={placeholder}
                  value={form.design_detail?.[key] || ''}
                  onChange={e => setForm(f => ({ ...f, design_detail: { ...f.design_detail, [key]: e.target.value } }))} />
              </div>
            ))}
          </div>

          {/* Reference Images â€” à¹€à¸žà¸´à¹ˆà¸¡à¹„à¸”à¹‰à¸«à¸¥à¸²à¸¢à¸£à¸¹à¸› */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: .4 }}>
              ðŸ“Ž Reference â€” à¸ à¸²à¸žà¸•à¸±à¸§à¸­à¸¢à¹ˆà¸²à¸‡à¸ˆà¸²à¸à¸¥à¸¹à¸à¸„à¹‰à¸² ({(form.reference_images?.length || 0) + referenceFiles.length} à¸£à¸¹à¸›)
            </div>
            {/* à¸£à¸¹à¸›à¸—à¸µà¹ˆà¸šà¸±à¸™à¸—à¸¶à¸à¹à¸¥à¹‰à¸§ */}
            {form.reference_images?.length > 0 && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:8 }}>
                {form.reference_images.map((url, i) => (
                  <div key={i} style={{ position:'relative', borderRadius:8, overflow:'hidden', border:'1px solid var(--border)' }}>
                    <img src={url} alt={`ref-${i}`} style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', display:'block' }} />
                    <button onClick={() => setForm(f => ({ ...f, reference_images: f.reference_images.filter((_,j)=>j!==i) }))}
                      style={{ position:'absolute', top:4, right:4, width:20, height:20, borderRadius:'50%', background:'rgba(0,0,0,.55)', border:'none', color:'#fff', fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>âœ•</button>
                    <div style={{ fontSize:9, textAlign:'center', padding:'2px 0', color:'#9CA3AF', background:'#F8FAFC' }}>REF {i+1}</div>
                  </div>
                ))}
              </div>
            )}
            {/* à¸£à¸¹à¸›à¹ƒà¸«à¸¡à¹ˆà¸£à¸­ upload */}
            {referenceFiles.length > 0 && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:8 }}>
                {referenceFiles.map((item, i) => (
                  <div key={i} style={{ position:'relative', borderRadius:8, overflow:'hidden', border:'2px solid #6366F1' }}>
                    <img src={item.preview} alt={`new-ref-${i}`} style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', display:'block' }} />
                    <div style={{ position:'absolute', top:4, left:4, background:'#6366F1', color:'#fff', fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:10 }}>à¹ƒà¸«à¸¡à¹ˆ</div>
                    <button onClick={() => setReferenceFiles(f => f.filter((_,j)=>j!==i))}
                      style={{ position:'absolute', top:4, right:4, width:20, height:20, borderRadius:'50%', background:'rgba(0,0,0,.55)', border:'none', color:'#fff', fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>âœ•</button>
                  </div>
                ))}
              </div>
            )}
            {/* à¸›à¸¸à¹ˆà¸¡à¹€à¸žà¸´à¹ˆà¸¡à¸£à¸¹à¸› */}
            <label style={{
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              padding:'10px', borderRadius:10, border:'2px dashed #CBD5E1',
              background:'#F8FAFC', cursor:'pointer', fontSize:12, fontWeight:700, color:'#64748B',
              transition:'all .15s',
            }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--primary)';e.currentTarget.style.background='#EFF6FF'}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='#CBD5E1';e.currentTarget.style.background='#F8FAFC'}}
            >
              <span>ðŸ–¼ï¸</span> à¹€à¸žà¸´à¹ˆà¸¡à¸£à¸¹à¸› Reference (à¹€à¸¥à¸·à¸­à¸à¹„à¸”à¹‰à¸«à¸¥à¸²à¸¢à¸£à¸¹à¸›à¸žà¸£à¹‰à¸­à¸¡à¸à¸±à¸™)
              <input type="file" accept="image/*" multiple style={{ display:'none' }}
                onChange={e => {
                  const newItems = Array.from(e.target.files || []).map(file => ({
                    file,
                    preview: URL.createObjectURL(file),
                  }))
                  if (newItems.length) setReferenceFiles(f => [...f, ...newItems])
                  e.target.value = ''
                }}
              />
            </label>
          </div>

          {/* Artwork + Mockup */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 8 }}>

            {/* Artwork column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>ðŸ–¼ï¸ Artwork</div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>à¸£à¸¹à¸›à¸ à¸²à¸ž (JPG/PNG) â€” à¹à¸ªà¸”à¸‡à¹ƒà¸™à¹ƒà¸šà¸‡à¸²à¸™</div>
                <FileDropZone
                  accept="image/*"
                  icon="ðŸŽ¨"
                  label="à¸§à¸²à¸‡à¸«à¸£à¸·à¸­à¸„à¸¥à¸´à¸à¹à¸™à¸š Artwork"
                  preview={artworkPreview || form.artwork_url || null}
                  imageOnly
                  onFile={file => handleFileChange({ target: { files: [file] } }, setArtworkFile, setArtworkPreview)}
                  onClear={() => { setArtworkFile(null); setArtworkPreview(null); setForm(f => ({ ...f, artwork_url: '' })) }}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>à¹„à¸Ÿà¸¥à¹Œà¸•à¹‰à¸™à¸‰à¸šà¸±à¸š (.ai / .psd / .pdf) â†’ Drive</div>
                <FileDropZone
                  accept=".ai,.psd,.pdf,.eps,.svg,.cdr,application/postscript,application/pdf,image/svg+xml"
                  icon="ðŸ“"
                  label="à¸§à¸²à¸‡à¸«à¸£à¸·à¸­à¸„à¸¥à¸´à¸à¹à¸™à¸šà¹„à¸Ÿà¸¥à¹Œà¸•à¹‰à¸™à¸‰à¸šà¸±à¸š"
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
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>ðŸ‘• Mockup</div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>à¸£à¸¹à¸›à¸ à¸²à¸ž (JPG/PNG) â€” à¹à¸ªà¸”à¸‡à¹ƒà¸™à¹ƒà¸šà¸‡à¸²à¸™</div>
                <FileDropZone
                  accept="image/*"
                  icon="ðŸ‘•"
                  label="à¸§à¸²à¸‡à¸«à¸£à¸·à¸­à¸„à¸¥à¸´à¸à¹à¸™à¸š Mockup"
                  preview={mockupPreview || form.mockup_url || null}
                  imageOnly
                  onFile={file => handleFileChange({ target: { files: [file] } }, setMockupFile, setMockupPreview)}
                  onClear={() => { setMockupFile(null); setMockupPreview(null); setForm(f => ({ ...f, mockup_url: '' })) }}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>à¹„à¸Ÿà¸¥à¹Œà¸•à¹‰à¸™à¸‰à¸šà¸±à¸š (.ai / .psd / .pdf) â†’ Drive</div>
                <FileDropZone
                  accept=".ai,.psd,.pdf,.eps,.svg,.cdr,application/postscript,application/pdf,image/svg+xml"
                  icon="ðŸ“"
                  label="à¸§à¸²à¸‡à¸«à¸£à¸·à¸­à¸„à¸¥à¸´à¸à¹à¸™à¸šà¹„à¸Ÿà¸¥à¹Œà¸•à¹‰à¸™à¸‰à¸šà¸±à¸š"
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
          <SectionHeader icon="âœ…" title="à¸£à¸¹à¸›à¸‡à¸²à¸™à¹€à¸ªà¸£à¹‡à¸ˆ QC" />
          {/* à¸£à¸¹à¸›à¸—à¸µà¹ˆà¸¡à¸µà¸­à¸¢à¸¹à¹ˆà¹à¸¥à¹‰à¸§ (edit mode) */}
          {Array.isArray(form.finish_photos) && form.finish_photos.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:12 }}>
              {form.finish_photos.map((p, i) => (
                <div key={i} style={{ borderRadius:8, overflow:'hidden', border:'1px solid var(--border)' }}>
                  <img src={p.url} alt={p.label} style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', display:'block' }} />
                  <div style={{ display:'flex', alignItems:'center', padding:'4px 8px', background:'#F8FAFC', gap:4 }}>
                    <span style={{ fontSize:10, fontWeight:600, color:'#64748B', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.label || `à¸£à¸¹à¸›à¸—à¸µà¹ˆ ${i+1}`}</span>
                    <button onClick={() => setForm(f => ({ ...f, finish_photos: f.finish_photos.filter((_,j)=>j!==i) }))}
                      style={{ fontSize:10, padding:'2px 6px', borderRadius:5, border:'1px solid #FCA5A5', background:'#fff', color:'#EF4444', cursor:'pointer', fontWeight:700, flexShrink:0 }}>à¸¥à¸š</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* à¸£à¸¹à¸›à¸£à¸­à¸šà¸±à¸™à¸—à¸¶à¸ */}
          {Object.keys(qcPreviews).filter(k => qcPreviews[k]).length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:12 }}>
              {Object.entries(qcPreviews).filter(([,v])=>v).map(([k, src]) => (
                <div key={k} style={{ borderRadius:8, overflow:'hidden', border:'2px solid #6366F1' }}>
                  <img src={src} alt={k} style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', display:'block' }} />
                  <div style={{ display:'flex', alignItems:'center', padding:'4px 8px', background:'#EEF2FF', gap:4 }}>
                    <input placeholder="à¸Šà¸·à¹ˆà¸­à¸£à¸¹à¸›" value={qcFiles[k]?.label||''}
                      onChange={e => setQcFiles(f=>({...f,[k]:{...f[k],label:e.target.value}}))}
                      style={{ flex:1, fontSize:10, border:'none', background:'transparent', outline:'none', fontWeight:600, color:'#4F46E5', minWidth:0 }} />
                    <button onClick={() => { setQcFiles(f=>{const n={...f};delete n[k];return n}); setQcPreviews(p=>{const n={...p};delete n[k];return n}) }}
                      style={{ fontSize:10, padding:'2px 6px', borderRadius:5, border:'1px solid #FCA5A5', background:'#fff', color:'#EF4444', cursor:'pointer', fontWeight:700, flexShrink:0 }}>à¸¥à¸š</button>
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
            <span>ðŸ“Ž</span> à¹€à¸žà¸´à¹ˆà¸¡à¸£à¸¹à¸› QC (à¹€à¸¥à¸·à¸­à¸à¹„à¸”à¹‰à¸«à¸¥à¸²à¸¢à¸£à¸¹à¸›à¸žà¸£à¹‰à¸­à¸¡à¸à¸±à¸™)
            <input type="file" accept="image/*" multiple style={{ display:'none' }}
              onChange={e => {
                const nf = {}; const np = {}
                Array.from(e.target.files||[]).forEach(file => {
                  const k = `qc_${Date.now()}_${Math.random().toString(36).slice(2)}`
                  nf[k] = { file, label: '' }
                  np[k] = URL.createObjectURL(file)
                })
                setQcFiles(f=>({...f,...nf}))
                setQcPreviews(p=>({...p,...np}))
                e.target.value=''
              }}
            />
          </label>

          <div style={{ display: 'flex', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'à¸à¸³à¸¥à¸±à¸‡à¸šà¸±à¸™à¸—à¸¶à¸...' : 'ðŸ’¾ à¸šà¸±à¸™à¸—à¸¶à¸'}
            </button>
            <button className="btn btn-outline" onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm()) }}>à¸¢à¸à¹€à¸¥à¸´à¸</button>
          </div>
        </div>
      )}

      {/* â”€â”€â”€â”€ CALENDAR VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {viewMode === 'calendar' && (
        <CalendarView
          jobs={filtered}
          month={calMonth}
          onMonthChange={setCalMonth}
          onView={setView}
        />
      )}

      {/* â”€â”€â”€â”€ TABLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {viewMode === 'table' && <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? <LoadingSpinner /> : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>à¹€à¸¥à¸‚à¸—à¸µà¹ˆ</th><th>à¸¥à¸¹à¸à¸„à¹‰à¸²</th><th>à¸£à¸²à¸¢à¸à¸²à¸£</th>
                    <th style={{ textAlign: 'center' }}>à¸ˆà¸³à¸™à¸§à¸™</th>
                    <th>à¸à¸³à¸«à¸™à¸”à¸ªà¹ˆà¸‡</th><th>à¸ªà¸–à¸²à¸™à¸°</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(j => {
                    const m = readMatrix(j)
                    return (
                      <tr key={j.id} className="row-link" style={{ background: isOverdue(j) ? '#FFF5F5' : undefined }}>
                        <td style={{ color: 'var(--primary)', fontFamily: 'monospace', fontWeight: 700 }}>{j.code}</td>
                        <td style={{ fontWeight: 600 }}>{j.customers?.name || 'â€”'}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                          {(j.item_desc || '').slice(0, 36)}{(j.item_desc || '').length > 36 ? 'â€¦' : ''}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--primary)' }}>
                          {grandTotal(m.prod_items) > 0 ? grandTotal(m.prod_items) : 'â€”'}
                        </td>
                        <td style={{ fontSize: 12, color: isOverdue(j) ? 'var(--danger)' : 'var(--text-muted)', fontWeight: isOverdue(j) ? 700 : 400 }}>
                          {fmtDate(j.due_date)}
                        </td>
                        <td><span className={STATUS_BADGE[j.status] || 'badge badge-gray'}>{j.status}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <button className="btn btn-outline btn-sm" onClick={() => setView(j)}>à¸”à¸¹</button>
                            <button className="btn btn-outline btn-sm" onClick={() => startEdit(j)}>âœï¸</button>
                            {j.status !== 'à¸ªà¹ˆà¸‡à¸‡à¸²à¸™à¹à¸¥à¹‰à¸§' && (
                              <button className="btn btn-outline btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(j)}>ðŸ—‘ï¸</button>
                            )}
                            {j.status !== 'à¸ªà¹ˆà¸‡à¸‡à¸²à¸™à¹à¸¥à¹‰à¸§' && (() => {
                              const idx = ALL_STATUS.indexOf(j.status)
                              const next = ALL_STATUS[idx + 1]
                              return next ? (
                                <button className="btn btn-primary btn-sm" title={next}
                                  onClick={() => updateJobStatus(j.id, next).then(() => load())}>â–¶</button>
                              ) : null
                            })()}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>à¹„à¸¡à¹ˆà¸žà¸šà¸£à¸²à¸¢à¸à¸²à¸£</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
              à¹à¸ªà¸”à¸‡ {filtered.length} à¸ˆà¸²à¸ {rows.length} à¸£à¸²à¸¢à¸à¸²à¸£
            </div>
          </>
        )}
      </div>}

    </div>
  )
}
