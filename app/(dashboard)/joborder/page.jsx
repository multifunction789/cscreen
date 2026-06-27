'use client'
import { useState, useEffect, useRef } from 'react'
import { getJobOrders, insertJobOrder, updateJobOrder, updateJobStatus, deleteJobOrder, getCustomers, getInvoices } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { fmtDate, SHOP } from '@/lib/shop'
import { todayStr, exportJpeg, shareDoc, uploadFile, printDoc } from '@/lib/docUtils'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

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
    }
  }
  // Legacy / empty
  const sizes = [...DEFAULT_SIZES]
  return { sizes, prod_items: [makeRow(sizes)], fabric_type:'', shirt_color:'', screen_color:'', production_note:'', mockup_url:'' }
}

const emptyForm = () => ({
  customer_id: '', invoice_id: '', note: '', due_date: '', document_date: todayStr(), status: 'รอมัดจำ',
  fabric_type: '', shirt_color: '', screen_color: '', production_note: '',
  artwork_url: '', mockup_url: '',
  sizes: [...DEFAULT_SIZES],
  prod_items: [makeRow(DEFAULT_SIZES)],
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
  const [mockupFile, setMockupFile]     = useState(null)
  const [mockupPreview, setMockupPreview]   = useState(null)
  const [newSizeInput, setNewSizeInput] = useState('')
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

    // Upload artwork / mockup
    let artwork_url = form.artwork_url || null
    let mockup_url  = form.mockup_url  || null
    if (artworkFile) artwork_url = await uploadFile(supabase, 'job-images', artworkFile)
    if (mockupFile)  mockup_url  = await uploadFile(supabase, 'job-images', mockupFile)

    // Summary for list view
    const validRows = form.prod_items.filter(r => r.style)
    const item_desc = validRows.map(r => r.style).join(', ') || '—'

    // Store everything inside items jsonb (no new DB columns needed)
    const itemsPayload = {
      type:            'size_matrix',
      sizes:           form.sizes,
      rows:            form.prod_items,
      fabric_type:     form.fabric_type     || null,
      shirt_color:     form.shirt_color     || null,
      screen_color:    form.screen_color    || null,
      production_note: form.production_note || null,
      mockup_url:      mockup_url           || null,
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
      ...(artwork_url ? { image_url: artwork_url } : {}),
    }

    if (editId) {
      await updateJobOrder(editId, payload)
      setEditId(null)
    } else {
      const maxNum = rows.reduce((max, r) => {
        const n = parseInt(r.code?.replace('JO-', '') || '0'); return n > max ? n : max
      }, 0)
      await insertJobOrder({ ...payload, code: 'JO-' + String(Math.max(maxNum + 1, 1001)).padStart(4, '0') })
    }

    setForm(emptyForm())
    setArtworkFile(null); setArtworkPreview(null)
    setMockupFile(null);  setMockupPreview(null)
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
      artwork_url:     j.image_url   || '',
      ...m,
    })
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

  // ──── PRINT VIEW ─────────────────────────────────────────────
  if (view) {
    const cust = customers.find(c => c.id === view.customer_id) || view.customers || {}
    const inv  = invoices.find(i => i.id === view.invoice_id)
    const m    = readMatrix(view)
    const { sizes, prod_items: prod, fabric_type, shirt_color, screen_color, production_note, mockup_url } = m

    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <button className="btn btn-outline" onClick={() => setView(null)}>← กลับ</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" onClick={() => exportJpeg('print-area', `${(cust.name||'').replace(/\s+/g,'_').replace(/[\/\\:*?"<>|]/g,'')}_${view.code}`)}>📷 JPEG</button>
            <button className="btn btn-outline" onClick={() => printDoc('print-area', `${(cust.name||'').replace(/\s+/g,'_').replace(/[\/\\:*?"<>|]/g,'')}_${view.code}`)}>🖨️ พิมพ์</button>
          </div>
        </div>

        <div id="print-area" ref={printRef} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 40 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--primary)', letterSpacing: -1 }}>C-SCREEN</div>
              <div style={{ fontSize: 11, color: '#666', maxWidth: 260, lineHeight: 1.7 }}>
                {SHOP.address}<br />Tel: {SHOP.tel} | Line: {SHOP.line}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', marginBottom: 4 }}>ใบงานการผลิต</div>
              <div style={{ fontSize: 13, color: 'var(--primary)', fontFamily: 'monospace', fontWeight: 700 }}>{view.code}</div>
              {inv && <div style={{ fontSize: 11, color: '#888' }}>อ้างอิง: {inv.code}</div>}
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>วันที่: {fmtDate(view.document_date || view.created_at)}</div>
              {view.due_date && <div style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 700 }}>กำหนดส่ง: {fmtDate(view.due_date)}</div>}
            </div>
          </div>

          {/* Customer */}
          <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '10px 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 2 }}>ลูกค้า</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{cust.name || view.customers?.name || '—'}</div>
            {cust.phone && <div style={{ fontSize: 12, color: '#666' }}>Tel: {cust.phone}</div>}
          </div>

          {/* Production Info badges */}
          {(fabric_type || shirt_color || screen_color) && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              {[{ l: 'ประเภทผ้า', v: fabric_type }, { l: 'สีเสื้อ', v: shirt_color }, { l: 'สีสกรีน', v: screen_color }]
                .filter(f => f.v).map(f => (
                  <div key={f.l} style={{ background: '#EFF6FF', borderRadius: 6, padding: '5px 12px', fontSize: 12 }}>
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

          {/* Artwork / Mockup */}
          {(view.image_url || mockup_url) && (
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
              {view.image_url && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 6 }}>ARTWORK</div>
                  <img src={view.image_url} alt="artwork" style={{ maxHeight: 160, maxWidth: 220, borderRadius: 6, border: '1px solid var(--border)', objectFit: 'contain' }} />
                </div>
              )}
              {mockup_url && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 6 }}>MOCKUP</div>
                  <img src={mockup_url} alt="mockup" style={{ maxHeight: 160, maxWidth: 220, borderRadius: 6, border: '1px solid var(--border)', objectFit: 'contain' }} />
                </div>
              )}
            </div>
          )}

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

          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className={STATUS_BADGE[view.status] || 'badge badge-gray'}>{view.status}</span>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              จำนวนรวม: <span style={{ color: 'var(--primary)', fontSize: 18 }}>{grandTotal(prod)}</span> ตัว
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

          {/* Artwork + Mockup */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>🖼️ Artwork</label>
              <input type="file" accept="image/*" onChange={e => handleFileChange(e, setArtworkFile, setArtworkPreview)} />
              {(artworkPreview || form.artwork_url) && (
                <img src={artworkPreview || form.artwork_url} alt="artwork"
                  style={{ maxHeight: 140, borderRadius: 8, objectFit: 'contain', border: '1px solid var(--border)' }} />
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>👕 Mockup</label>
              <input type="file" accept="image/*" onChange={e => handleFileChange(e, setMockupFile, setMockupPreview)} />
              {(mockupPreview || form.mockup_url) && (
                <img src={mockupPreview || form.mockup_url} alt="mockup"
                  style={{ maxHeight: 140, borderRadius: 8, objectFit: 'contain', border: '1px solid var(--border)' }} />
              )}
            </div>
          </div>

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
