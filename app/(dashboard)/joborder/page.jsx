'use client'
import { useState, useEffect, useRef } from 'react'
import { getJobOrders, insertJobOrder, updateJobOrder, updateJobStatus, deleteJobOrder, getCustomers, getInvoices } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { fmtDate, SHOP } from '@/lib/shop'
import { todayStr, exportJpeg, shareDoc, uploadFile, printDoc } from '@/lib/docUtils'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const STATUS_BADGE = {
  'รอมัดจำ':'badge badge-gray','รอออกแบบ':'badge badge-cyan','รอทำไฟล์':'badge badge-purple',
  'สั่งของ':'badge badge-yellow','กำลังสกรีน':'badge badge-blue','สั่งผลิต':'badge badge-cyan',
  'แพ็คพร้อมส่ง':'badge badge-green','ส่งงานแล้ว':'badge badge-green','เลยกำหนด':'badge badge-red',
}
const ALL_STATUS = Object.keys(STATUS_BADGE)
const DEFAULT_SIZES = ['S', 'M', 'L', 'XL', 'XXL']

function makeItem(sizes) {
  return { style: '', color: '', qtys: Object.fromEntries(sizes.map(s => [s, ''])) }
}
const emptyForm = () => ({
  customer_id: '', invoice_id: '', note: '', due_date: '', document_date: todayStr(), status: 'รอมัดจำ',
  fabric_type: '', shirt_color: '', screen_color: '', production_note: '',
  sizes: [...DEFAULT_SIZES],
  prod_items: [makeItem(DEFAULT_SIZES)],
})

function rowTotal(qtys) {
  return Object.values(qtys || {}).reduce((s, v) => s + (parseInt(v) || 0), 0)
}
function grandTotal(prod_items) {
  return (prod_items || []).reduce((s, it) => s + rowTotal(it.qtys), 0)
}

// ── Section header ──────────────────────────────────────────────
function SectionHeader({ icon, title }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, paddingBottom:8, borderBottom:'2px solid var(--border)' }}>
      <span style={{ fontSize:16 }}>{icon}</span>
      <span style={{ fontSize:13, fontWeight:700, color:'var(--text)', letterSpacing:.3 }}>{title}</span>
    </div>
  )
}

export default function JobOrderPage() {
  const [rows, setRows]             = useState([])
  const [customers, setCustomers]   = useState([])
  const [invoices, setInvoices]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filterStatus, setFilter]   = useState('')
  const [showForm, setShowForm]     = useState(false)
  const [editId, setEditId]         = useState(null)
  const [form, setForm]             = useState(emptyForm)
  const [saving, setSaving]         = useState(false)
  const [view, setView]             = useState(null)
  const [artworkFile, setArtworkFile]   = useState(null)
  const [artworkPreview, setArtworkPreview] = useState(null)
  const [mockupFile, setMockupFile]     = useState(null)
  const [mockupPreview, setMockupPreview]   = useState(null)
  const [newSizeInput, setNewSizeInput] = useState('')
  const printRef = useRef(null)

  useEffect(() => { load() }, [])

  async function load() {
    const [jRes, cRes, iRes] = await Promise.all([getJobOrders(), getCustomers(), getInvoices()])
    setRows(jRes.data || [])
    setCustomers(cRes.data || [])
    setInvoices(iRes.data || [])
    setLoading(false)
  }

  // ── Size Matrix helpers ────────────────────────────────────────
  function addSize() {
    const s = newSizeInput.trim()
    if (!s || form.sizes.includes(s)) return
    const newSizes = [...form.sizes, s]
    setForm(f => ({
      ...f,
      sizes: newSizes,
      prod_items: f.prod_items.map(it => ({ ...it, qtys: { ...it.qtys, [s]: '' } }))
    }))
    setNewSizeInput('')
  }

  function removeSize(s) {
    setForm(f => {
      const newSizes = f.sizes.filter(x => x !== s)
      return {
        ...f,
        sizes: newSizes,
        prod_items: f.prod_items.map(it => {
          const { [s]: _, ...rest } = it.qtys
          return { ...it, qtys: rest }
        })
      }
    })
  }

  function addItemRow() {
    setForm(f => ({ ...f, prod_items: [...f.prod_items, makeItem(f.sizes)] }))
  }

  function removeItemRow(idx) {
    setForm(f => ({ ...f, prod_items: f.prod_items.filter((_, i) => i !== idx) }))
  }

  function updateItemField(idx, field, val) {
    setForm(f => {
      const updated = [...f.prod_items]
      updated[idx] = { ...updated[idx], [field]: val }
      return { ...f, prod_items: updated }
    })
  }

  function updateItemQty(idx, size, val) {
    setForm(f => {
      const updated = [...f.prod_items]
      updated[idx] = { ...updated[idx], qtys: { ...updated[idx].qtys, [size]: val } }
      return { ...f, prod_items: updated }
    })
  }

  // ── Invoice auto-fill ──────────────────────────────────────────
  function onSelectInvoice(invId) {
    const inv = invoices.find(i => i.id === invId)
    setForm(f => ({ ...f, invoice_id: invId, customer_id: inv ? inv.customer_id : f.customer_id }))
  }

  // ── File helpers ───────────────────────────────────────────────
  function handleFileChange(e, setFile, setPreview) {
    const file = e.target.files?.[0]; if (!file) return
    setFile(file)
    const reader = new FileReader()
    reader.onload = ev => setPreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  // ── Save ───────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.customer_id) return alert('กรุณาเลือกลูกค้า')
    setSaving(true)
    // Upload artwork / mockup if new files
    let artwork_url = form.artwork_url || null
    let mockup_url  = form.mockup_url  || null
    if (artworkFile) artwork_url = await uploadFile(supabase, 'job-images', artworkFile)
    if (mockupFile)  mockup_url  = await uploadFile(supabase, 'job-images', mockupFile)

    // Build item_desc summary for list view
    const validItems = form.prod_items.filter(it => it.style || it.color)
    const item_desc = validItems.map(it => [it.style, it.color].filter(Boolean).join(' / ')).join(', ') || '—'

    const payload = {
      customer_id: form.customer_id,
      invoice_id:  form.invoice_id || null,
      item_desc,
      due_date:      form.due_date || null,
      document_date: form.document_date || todayStr(),
      note:          form.note,
      status:        form.status,
      // Production
      fabric_type:     form.fabric_type || null,
      shirt_color:     form.shirt_color || null,
      screen_color:    form.screen_color || null,
      production_note: form.production_note || null,
      artwork_url,
      mockup_url,
      // Size matrix
      sizes:      form.sizes,
      prod_items: form.prod_items,
    }

    if (editId) {
      await updateJobOrder(editId, payload)
      setEditId(null)
    } else {
      // Generate code from max existing
      const all = rows
      const maxNum = all.reduce((max, r) => {
        const n = parseInt(r.code?.replace('JO-', '') || '0')
        return n > max ? n : max
      }, 0)
      const code = 'JO-' + String(maxNum + 1).padStart(4, '0')
      await insertJobOrder({ ...payload, code })
    }
    setForm(emptyForm())
    setArtworkFile(null); setArtworkPreview(null)
    setMockupFile(null);  setMockupPreview(null)
    setShowForm(false); setSaving(false)
    load()
  }

  async function handleDelete(j) {
    if (!confirm(`ลบใบงาน ${j.code} ใช่ไหม?`)) return
    await deleteJobOrder(j.id)
    load()
  }

  function startEdit(j) {
    setEditId(j.id)
    const sizes      = j.sizes      || [...DEFAULT_SIZES]
    const prod_items = j.prod_items || [makeItem(sizes)]
    setForm({
      customer_id:     j.customer_id,
      invoice_id:      j.invoice_id || '',
      note:            j.note || '',
      due_date:        j.due_date || '',
      document_date:   j.document_date || todayStr(),
      status:          j.status,
      fabric_type:     j.fabric_type || '',
      shirt_color:     j.shirt_color || '',
      screen_color:    j.screen_color || '',
      production_note: j.production_note || '',
      artwork_url:     j.artwork_url || '',
      mockup_url:      j.mockup_url  || '',
      sizes,
      prod_items,
    })
    setArtworkFile(null); setArtworkPreview(null)
    setMockupFile(null);  setMockupPreview(null)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const filtered = rows.filter(j => {
    const ms = j.code?.includes(search) || j.customers?.name?.includes(search) || j.item_desc?.includes(search)
    const mf = !filterStatus || j.status === filterStatus
    return ms && mf
  })
  const isOverdue = j => j.due_date && new Date(j.due_date) < new Date() && j.status !== 'ส่งงานแล้ว'

  // ──── PRINT / VIEW ───────────────────────────────────────────
  if (view) {
    const cust  = customers.find(c => c.id === view.customer_id) || view.customers || {}
    const sizes = view.sizes || DEFAULT_SIZES
    const prod  = view.prod_items || []

    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <button className="btn btn-outline" onClick={() => setView(null)}>← กลับ</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" onClick={() => shareDoc({
              title: `ใบงาน ${view.code}`,
              text:  `ลูกค้า: ${cust.name || view.customers?.name || ''}\nรายการ: ${(view.item_desc || '').slice(0, 80)}\nกำหนดส่ง: ${view.due_date ? fmtDate(view.due_date) : '-'}\n— C-Screen ${SHOP.tel}`
            })}>🔗 แชร์</button>
            <button className="btn btn-outline" onClick={() => exportJpeg('print-area', `JO-${view.code}`)}>📷 JPEG</button>
            <button className="btn btn-outline" onClick={() => printDoc()}>🖨️ พิมพ์</button>
          </div>
        </div>

        <div id="print-area" ref={printRef} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 40, maxWidth: 900 }}>
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
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>วันที่: {fmtDate(view.document_date || view.created_at)}</div>
              {view.due_date && <div style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 700 }}>กำหนดส่ง: {fmtDate(view.due_date)}</div>}
              {view.invoices?.code && <div style={{ fontSize: 11, color: '#888' }}>INV: {view.invoices?.code}</div>}
            </div>
          </div>

          {/* Customer */}
          <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '10px 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 2 }}>ลูกค้า</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{cust.name || view.customers?.name || '—'}</div>
            {cust.phone && <div style={{ fontSize: 12, color: '#666' }}>Tel: {cust.phone}</div>}
          </div>

          {/* Production Info */}
          {(view.fabric_type || view.shirt_color || view.screen_color) && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              {[
                { label: 'ประเภทผ้า', value: view.fabric_type },
                { label: 'สีเสื้อ',   value: view.shirt_color },
                { label: 'สีสกรีน',   value: view.screen_color },
              ].filter(f => f.value).map(f => (
                <div key={f.label} style={{ background: '#EFF6FF', borderRadius: 6, padding: '6px 12px', fontSize: 12 }}>
                  <span style={{ color: '#666', marginRight: 6 }}>{f.label}:</span>
                  <span style={{ fontWeight: 700 }}>{f.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Size Matrix Table */}
          <div style={{ marginBottom: 16, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--primary)', color: '#fff' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', minWidth: 120 }}>แบบ</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', minWidth: 100 }}>สี</th>
                  {sizes.map(s => (
                    <th key={s} style={{ padding: '8px 10px', textAlign: 'center', minWidth: 56 }}>{s}</th>
                  ))}
                  <th style={{ padding: '8px 12px', textAlign: 'center', minWidth: 60, background: '#7f1d1d' }}>รวม</th>
                </tr>
              </thead>
              <tbody>
                {prod.length > 0 ? prod.map((it, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eee', background: i % 2 ? '#fafafa' : '#fff' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{it.style || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#555' }}>{it.color || '—'}</td>
                    {sizes.map(s => (
                      <td key={s} style={{ padding: '8px 10px', textAlign: 'center', fontWeight: parseInt(it.qtys?.[s]) > 0 ? 700 : 400, color: parseInt(it.qtys?.[s]) > 0 ? 'var(--text)' : '#ccc' }}>
                        {parseInt(it.qtys?.[s]) > 0 ? it.qtys[s] : '—'}
                      </td>
                    ))}
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 800, color: 'var(--primary)' }}>
                      {rowTotal(it.qtys)}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={sizes.length + 3} style={{ padding: 20, textAlign: 'center', color: '#999' }}>ไม่มีรายการ</td>
                  </tr>
                )}
                {/* Grand total row */}
                {prod.length > 0 && (
                  <tr style={{ background: '#F9FAFB', borderTop: '2px solid var(--border)' }}>
                    <td colSpan={2} style={{ padding: '8px 12px', fontWeight: 700, color: '#888', fontSize: 12 }}>รวมทั้งหมด</td>
                    {sizes.map(s => (
                      <td key={s} style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>
                        {prod.reduce((sum, it) => sum + (parseInt(it.qtys?.[s]) || 0), 0) || '—'}
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
          {(view.artwork_url || view.mockup_url) && (
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
              {view.artwork_url && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 6 }}>ARTWORK</div>
                  <img src={view.artwork_url} alt="artwork" style={{ maxHeight: 160, maxWidth: 220, borderRadius: 6, border: '1px solid var(--border)', objectFit: 'contain' }} />
                </div>
              )}
              {view.mockup_url && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 6 }}>MOCKUP</div>
                  <img src={view.mockup_url} alt="mockup" style={{ maxHeight: 160, maxWidth: 220, borderRadius: 6, border: '1px solid var(--border)', objectFit: 'contain' }} />
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {(view.production_note || view.note) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {view.production_note && (
                <div style={{ padding: '8px 14px', background: '#FFF7ED', borderRadius: 6, borderLeft: '3px solid #F97316', fontSize: 12 }}>
                  <span style={{ fontWeight: 700, color: '#C2410C' }}>หมายเหตุผลิต: </span>{view.production_note}
                </div>
              )}
              {view.note && (
                <div style={{ padding: '8px 14px', background: '#FFFBEB', borderRadius: 6, fontSize: 12 }}>
                  <span style={{ fontWeight: 700 }}>หมายเหตุ: </span>{view.note}
                </div>
              )}
            </div>
          )}

          {/* Status + Total */}
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#888' }}>สถานะ:</span>
              <span className={STATUS_BADGE[view.status] || 'badge badge-gray'}>{view.status}</span>
            </div>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
        {[
          { label: 'ใบงานทั้งหมด',   value: rows.length + ' ใบ',                                  accent: 'var(--primary)', icon: '📝' },
          { label: 'กำลังดำเนินการ', value: rows.filter(j => j.status !== 'ส่งงานแล้ว').length + ' ใบ', accent: 'var(--info)',    icon: '⚙️' },
          { label: 'ส่งงานแล้ว',     value: rows.filter(j => j.status === 'ส่งงานแล้ว').length + ' ใบ', accent: 'var(--success)', icon: '✅' },
          { label: 'เลยกำหนด',       value: rows.filter(j => isOverdue(j)).length + ' ใบ',         accent: 'var(--danger)',  icon: '⏰' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--card)', borderRadius: 'var(--radius)', padding: '16px 18px', boxShadow: 'var(--shadow)', border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: k.accent, borderRadius: '10px 0 0 10px' }} />
            <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 28, opacity: .1 }}>{k.icon}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.accent, marginTop: 4 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>🔍</span>
            <input type="text" placeholder="ค้นหาใบงาน..." value={search}
              onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36, width: 240 }} />
          </div>
          {ALL_STATUS.map(s => {
            const count = rows.filter(j => j.status === s).length
            return count > 0 && (
              <span key={s} onClick={() => setFilter(filterStatus === s ? '' : s)}
                className={filterStatus === s ? 'badge badge-blue' : 'badge badge-gray'}
                style={{ cursor: 'pointer' }}>{s} · {count}</span>
            )
          })}
          {filterStatus && <span className="badge badge-gray" style={{ cursor: 'pointer' }} onClick={() => setFilter('')}>✕ ล้างตัวกรอง</span>}
        </div>
        <button className="btn btn-primary" onClick={() => {
          setShowForm(!showForm)
          if (showForm) { setEditId(null); setForm(emptyForm()) }
        }}>
          {showForm ? '✕ ปิด' : '+ สร้างใบงาน'}
        </button>
      </div>

      {/* ──── CREATE / EDIT FORM ────────────────────────────────── */}
      {showForm && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, color: 'var(--text)' }}>
            {editId ? '✏️ แก้ไขใบงาน' : '➕ สร้างใบงานใหม่'}
          </div>

          {/* Section 1: Info พื้นฐาน */}
          <SectionHeader icon="📋" title="ข้อมูลพื้นฐาน" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>อ้างอิง Invoice</label>
              <select value={form.invoice_id} onChange={e => onSelectInvoice(e.target.value)}>
                <option value="">— เลือก Invoice (ถ้ามี) —</option>
                {invoices.map(i => <option key={i.id} value={i.id}>{i.code} – {i.customers?.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>ลูกค้า *</label>
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
              <label>หมายเหตุทั่วไป</label>
              <input type="text" placeholder="หมายเหตุ..." value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
            </div>
          </div>

          {/* Section 2: Size Matrix */}
          <SectionHeader icon="📐" title="รายการสินค้า (Size Matrix)" />
          <div style={{ marginBottom: 24 }}>
            {/* Size column controls */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ไซส์:</span>
              {form.sizes.map(s => (
                <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--primary)', color: '#fff', borderRadius: 99, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                  {s}
                  <button onClick={() => removeSize(s)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: 14, opacity: .8 }}>×</button>
                </span>
              ))}
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input type="text" placeholder="+ เพิ่มไซส์" value={newSizeInput}
                  onChange={e => setNewSizeInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSize()}
                  style={{ width: 90, fontSize: 12, padding: '4px 8px' }} />
                <button className="btn btn-outline btn-sm" onClick={addSize}>เพิ่ม</button>
              </div>
            </div>

            {/* Matrix table */}
            <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', minWidth: 140, color: 'var(--text-muted)', fontSize: 12 }}>แบบ / สินค้า</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', minWidth: 110, color: 'var(--text-muted)', fontSize: 12 }}>สี</th>
                    {form.sizes.map(s => (
                      <th key={s} style={{ padding: '8px 8px', textAlign: 'center', minWidth: 56, color: 'var(--text-muted)', fontSize: 12 }}>{s}</th>
                    ))}
                    <th style={{ padding: '8px 10px', textAlign: 'center', minWidth: 56, color: 'var(--primary)', fontSize: 12, fontWeight: 700 }}>รวม</th>
                    <th style={{ padding: '8px 8px', width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {form.prod_items.map((it, idx) => (
                    <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px' }}>
                        <input type="text" placeholder="ชื่อแบบ/สินค้า" value={it.style}
                          onChange={e => updateItemField(idx, 'style', e.target.value)}
                          style={{ width: '100%', fontSize: 13 }} />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input type="text" placeholder="สี" value={it.color}
                          onChange={e => updateItemField(idx, 'color', e.target.value)}
                          style={{ width: '100%', fontSize: 13 }} />
                      </td>
                      {form.sizes.map(s => (
                        <td key={s} style={{ padding: '6px 4px', textAlign: 'center' }}>
                          <input type="number" min="0" placeholder="0" value={it.qtys[s] || ''}
                            onChange={e => updateItemQty(idx, s, e.target.value)}
                            style={{ width: 50, textAlign: 'center', fontSize: 13, padding: '4px 2px' }} />
                        </td>
                      ))}
                      <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 800, color: 'var(--primary)', fontSize: 14 }}>
                        {rowTotal(it.qtys) || '—'}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        {form.prod_items.length > 1 && (
                          <button onClick={() => removeItemRow(idx)}
                            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {form.prod_items.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'var(--bg)', borderTop: '2px solid var(--border)' }}>
                      <td colSpan={2} style={{ padding: '6px 12px', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>รวมทั้งหมด</td>
                      {form.sizes.map(s => (
                        <td key={s} style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: 13 }}>
                          {form.prod_items.reduce((sum, it) => sum + (parseInt(it.qtys[s]) || 0), 0) || '—'}
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

            <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={addItemRow}>
              + เพิ่มแถวสินค้า
            </button>
          </div>

          {/* Section 3: Production Info */}
          <SectionHeader icon="🎨" title="ข้อมูลการผลิต" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>ประเภทผ้า</label>
              <input type="text" placeholder="เช่น Cotton 100%, TC, CVC..." value={form.fabric_type}
                onChange={e => setForm({ ...form, fabric_type: e.target.value })} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>สีเสื้อ</label>
              <input type="text" placeholder="เช่น ขาว, ดำ, กรม..." value={form.shirt_color}
                onChange={e => setForm({ ...form, shirt_color: e.target.value })} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>สีสกรีน</label>
              <input type="text" placeholder="เช่น แดง+ขาว, CMYK..." value={form.screen_color}
                onChange={e => setForm({ ...form, screen_color: e.target.value })} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
              <label>หมายเหตุผลิต</label>
              <textarea rows={3} placeholder="รายละเอียดการผลิตเพิ่มเติม..." value={form.production_note}
                onChange={e => setForm({ ...form, production_note: e.target.value })}
                style={{ resize: 'vertical' }} />
            </div>
          </div>

          {/* Artwork + Mockup upload */}
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

      {/* ──── TABLE ──────────────────────────────────────────────── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? <LoadingSpinner /> : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>เลขที่</th>
                    <th>ลูกค้า</th>
                    <th>รายการ</th>
                    <th style={{ textAlign: 'center' }}>จำนวน</th>
                    <th>กำหนดส่ง</th>
                    <th>สถานะ</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(j => (
                    <tr key={j.id} className="row-link" style={{ background: isOverdue(j) ? '#FFF5F5' : undefined }}>
                      <td style={{ color: 'var(--primary)', fontFamily: 'monospace', fontWeight: 700 }}>{j.code}</td>
                      <td style={{ fontWeight: 600 }}>{j.customers?.name || '—'}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        {(j.item_desc || '').slice(0, 40)}{(j.item_desc || '').length > 40 ? '…' : ''}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--primary)' }}>
                        {grandTotal(j.prod_items) > 0 ? grandTotal(j.prod_items) : '—'}
                      </td>
                      <td style={{ fontSize: 12, color: isOverdue(j) ? 'var(--danger)' : 'var(--text-muted)', fontWeight: isOverdue(j) ? 700 : 400 }}>
                        {fmtDate(j.due_date)}
                      </td>
                      <td><span className={STATUS_BADGE[j.status] || 'badge badge-gray'}>{j.status}</span></td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-outline btn-sm" onClick={() => setView(j)}>ดู</button>
                        <button className="btn btn-outline btn-sm" onClick={() => startEdit(j)}>✏️</button>
                        {j.status !== 'ส่งงานแล้ว' && (
                          <button className="btn btn-outline btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(j)}>🗑️</button>
                        )}
                        {j.status !== 'ส่งงานแล้ว' && (() => {
                          const idx = ALL_STATUS.indexOf(j.status)
                          const next = ALL_STATUS[idx + 1]
                          return next ? (
                            <button className="btn btn-primary btn-sm" onClick={() => updateJobStatus(j.id, next).then(() => load())}>
                              ▶ {next}
                            </button>
                          ) : null
                        })()}
                      </td>
                    </tr>
                  ))}
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
      </div>
    </div>
  )
}
