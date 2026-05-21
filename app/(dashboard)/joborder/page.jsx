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
const emptyForm = () => ({ customer_id:'', invoice_id:'', note:'', due_date:'', document_date:todayStr(), status:'รอมัดจำ' })

export default function JobOrderPage() {
  const [rows, setRows]         = useState([])
  const [customers, setCustomers] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [filterStatus, setFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId]     = useState(null)
  const [form, setForm]         = useState(emptyForm)
  const [saving, setSaving]     = useState(false)
  const [view, setView]         = useState(null)
  const [imgFile, setImgFile]   = useState(null)
  const [imgPreview, setImgPreview] = useState(null)
  const printRef = useRef(null)

  useEffect(()=>{ load() },[])

  async function load() {
    const [jRes, cRes, iRes] = await Promise.all([getJobOrders(), getCustomers(), getInvoices()])
    setRows(jRes.data||[])
    setCustomers(cRes.data||[])
    setInvoices(iRes.data||[])
    setLoading(false)
  }

  // เมื่อเลือก invoice → auto-fill customer
  function onSelectInvoice(invId) {
    const inv = invoices.find(i=>i.id===invId)
    setForm(f=>({ ...f, invoice_id:invId, customer_id: inv ? inv.customer_id : f.customer_id }))
  }

  async function handleSave() {
    if (!form.customer_id) return alert('กรุณาเลือกลูกค้า')
    setSaving(true)
    const inv = invoices.find(i=>i.id===form.invoice_id)
    const items = inv?.items || []
    const item_desc = items.map(it=>it.desc).join(', ') || '—'
    // Upload image if any
    let image_url = null
    if (imgFile) image_url = await uploadFile(supabase, 'job-images', imgFile)
    const payload = {
      customer_id:form.customer_id, invoice_id:form.invoice_id||null,
      item_desc, items, due_date:form.due_date||null, document_date:form.document_date||todayStr(),
      note:form.note, status:form.status,
      ...(image_url ? { image_url } : {}),
    }
    if (editId) {
      await updateJobOrder(editId, payload)
      setEditId(null)
    } else {
      const code = 'JO-' + String((rows.length||0)+1).padStart(4,'0')
      await insertJobOrder({ ...payload, code })
    }
    setForm(emptyForm()); setImgFile(null); setImgPreview(null); setShowForm(false); setSaving(false)
    load()
  }

  async function handleDelete(j) {
    if (!confirm(`ลบใบงาน ${j.code} ใช่ไหม?`)) return
    await deleteJobOrder(j.id)
    load()
  }

  function startEdit(j) {
    setEditId(j.id)
    setForm({ customer_id:j.customer_id, invoice_id:j.invoice_id||'', note:j.note||'', due_date:j.due_date||'', document_date:j.document_date||todayStr(), status:j.status })
    setShowForm(true)
    window.scrollTo({top:0,behavior:'smooth'})
  }

  function handleImgChange(e) {
    const file = e.target.files?.[0]; if (!file) return
    setImgFile(file)
    const reader = new FileReader()
    reader.onload = ev => setImgPreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  const filtered = rows.filter(j => {
    const ms = j.code?.includes(search)||j.customers?.name?.includes(search)||j.item_desc?.includes(search)
    const mf = !filterStatus||j.status===filterStatus
    return ms && mf
  })

  const isOverdue = j => j.due_date && new Date(j.due_date)<new Date() && j.status!=='ส่งงานแล้ว'

  // ──── PRINT VIEW ────────────────────────────────────────────
  if (view) {
    const cust = customers.find(c=>c.id===view.customer_id) || view.customers || {}
    const items = view.items && view.items.length ? view.items : (view.item_desc ? [{ desc:view.item_desc, qty:'-', price:'-' }] : [])
    return (
      <div style={{ maxWidth:794, margin:'0 auto', padding:24 }}>
        <div className="no-print" style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
          <button className="btn btn-outline" onClick={()=>setView(null)}>← กลับ</button>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-outline" onClick={()=>shareDoc({
              title:`ใบงาน ${view.code}`,
              text:`ลูกค้า: ${cust.name||view.customers?.name||''}\nรายการ: ${(view.item_desc||'').slice(0,80)}\nกำหนดส่ง: ${view.due_date?fmtDate(view.due_date):'-'}\n— C-Screen ${SHOP.tel}`
            })}>🔗 แชร์</button>
            <button className="btn btn-outline" onClick={()=>exportJpeg('print-area',`JO-${view.code}`)}>📷 JPEG</button>
            <button className="btn btn-outline" onClick={()=>printDoc()}>🖨️ พิมพ์</button>
          </div>
        </div>

        <div id="print-area" ref={printRef} style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:8, padding:40, maxWidth:794 }}>
          {/* Header */}
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:24 }}>
            <div>
              <div style={{ fontSize:22, fontWeight:900, color:'var(--primary)', letterSpacing:-1 }}>C-SCREEN</div>
              <div style={{ fontSize:11, color:'#666', maxWidth:260, lineHeight:1.6 }}>
                {SHOP.address}<br/>Tel: {SHOP.tel} | Line: {SHOP.line}
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:24, fontWeight:900, color:'var(--text)', marginBottom:4 }}>ใบงานการผลิต</div>
              <div style={{ fontSize:13, color:'var(--primary)', fontFamily:'monospace', fontWeight:700 }}>{view.code}</div>
              <div style={{ fontSize:12, color:'#666', marginTop:4 }}>วันที่: {fmtDate(view.document_date||view.created_at)}</div>
              {view.due_date && <div style={{ fontSize:12, color:'var(--danger)', fontWeight:700 }}>กำหนดส่ง: {fmtDate(view.due_date)}</div>}
              {view.invoices?.code && <div style={{ fontSize:11, color:'#666' }}>INV: {view.invoices?.code}</div>}
            </div>
          </div>

          {/* Customer */}
          <div style={{ background:'#F9FAFB', borderRadius:8, padding:'12px 16px', marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#888', marginBottom:4 }}>ลูกค้า</div>
            <div style={{ fontSize:14, fontWeight:700 }}>{cust.name || view.customers?.name}</div>
            {cust.phone && <div style={{ fontSize:12, color:'#666' }}>Tel: {cust.phone}</div>}
          </div>

          {/* Items */}
          <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:16 }}>
            <thead>
              <tr style={{ background:'var(--primary)', color:'#fff' }}>
                <th style={{ padding:'8px 12px', textAlign:'left', fontSize:12 }}>รายการสินค้า</th>
                <th style={{ padding:'8px 12px', textAlign:'center', fontSize:12, width:100 }}>ไซส์ / ลักษณะ</th>
                <th style={{ padding:'8px 12px', textAlign:'center', fontSize:12, width:80 }}>จำนวน</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it,i)=>(
                <tr key={i} style={{ borderBottom:'1px solid #eee' }}>
                  <td style={{ padding:'10px 12px', fontSize:13, fontWeight:600 }}>{it.desc}</td>
                  <td style={{ padding:'10px 12px', textAlign:'center', fontSize:12, color:'#666' }}>{it.size||'—'}</td>
                  <td style={{ padding:'10px 12px', textAlign:'center', fontWeight:700, fontSize:14 }}>{it.qty}</td>
                </tr>
              ))}
              {items.length===0 && (
                <tr><td colSpan={4} style={{ padding:20, textAlign:'center', color:'#999' }}>ไม่มีรายการ</td></tr>
              )}
            </tbody>
          </table>

          {view.note && (
            <div style={{ marginTop:12, padding:'10px 14px', background:'#FFFBEB', borderRadius:6, fontSize:12 }}>
              <span style={{ fontWeight:700 }}>หมายเหตุ: </span>{view.note}
            </div>
          )}

          {/* Status */}
          <div style={{ marginTop:20, display:'flex', gap:10, alignItems:'center' }}>
            <span style={{ fontSize:12, color:'#888' }}>สถานะ:</span>
            <span className={STATUS_BADGE[view.status]||'badge badge-gray'}>{view.status}</span>
          </div>
        </div>

      </div>
    )
  }

  // ──── LIST VIEW ─────────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* KPI */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
        {[
          { label:'ใบงานทั้งหมด', value:rows.length+' ใบ', accent:'var(--primary)', icon:'📝' },
          { label:'กำลังดำเนินการ', value:rows.filter(j=>j.status!=='ส่งงานแล้ว').length+' ใบ', accent:'var(--info)', icon:'⚙️' },
          { label:'ส่งงานแล้ว', value:rows.filter(j=>j.status==='ส่งงานแล้ว').length+' ใบ', accent:'var(--success)', icon:'✅' },
          { label:'เลยกำหนด', value:rows.filter(j=>isOverdue(j)).length+' ใบ', accent:'var(--danger)', icon:'⏰' },
        ].map(k=>(
          <div key={k.label} style={{ background:'var(--card)', borderRadius:'var(--radius)', padding:'16px 18px', boxShadow:'var(--shadow)', border:'1px solid var(--border)', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, width:4, height:'100%', background:k.accent, borderRadius:'10px 0 0 10px' }} />
            <div style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', fontSize:28, opacity:.1 }}>{k.icon}</div>
            <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase' }}>{k.label}</div>
            <div style={{ fontSize:22, fontWeight:800, color:k.accent, marginTop:4 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }}>🔍</span>
            <input type="text" placeholder="ค้นหาใบงาน..." value={search}
              onChange={e=>setSearch(e.target.value)} style={{ paddingLeft:36, width:240 }} />
          </div>
          {ALL_STATUS.map(s=>{
            const count = rows.filter(j=>j.status===s).length
            return count>0 && (
              <span key={s} onClick={()=>setFilter(filterStatus===s?'':s)}
                className={filterStatus===s?'badge badge-blue':'badge badge-gray'}
                style={{ cursor:'pointer' }}>{s} · {count}</span>
            )
          })}
          {filterStatus && <span className="badge badge-gray" style={{ cursor:'pointer' }} onClick={()=>setFilter('')}>✕ ล้างตัวกรอง</span>}
        </div>
        <button className="btn btn-primary" onClick={()=>{setShowForm(!showForm);if(showForm){setEditId(null);setForm(emptyForm)}}}>
          {showForm?'✕ ปิด':'+ สร้างใบงาน'}
        </button>
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <div className="card" style={{ padding:20 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:16 }}>{editId?'✏️ แก้ไขใบงาน':'➕ สร้างใบงานใหม่'}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label>อ้างอิง Invoice</label>
              <select value={form.invoice_id} onChange={e=>onSelectInvoice(e.target.value)}>
                <option value="">— เลือก Invoice (ถ้ามี) —</option>
                {invoices.map(i=><option key={i.id} value={i.id}>{i.code} – {i.customers?.name}</option>)}
              </select>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label>ลูกค้า *</label>
              <select value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value})}>
                <option value="">— เลือกลูกค้า —</option>
                {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label>สถานะเริ่มต้น</label>
              <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
                {ALL_STATUS.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label>วันที่เอกสาร</label>
              <input type="date" value={form.document_date} onChange={e=>setForm({...form,document_date:e.target.value})} />
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label>กำหนดส่ง</label>
              <input type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})} />
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label>หมายเหตุ</label>
              <input type="text" placeholder="หมายเหตุ / คำแนะนำ..." value={form.note}
                onChange={e=>setForm({...form,note:e.target.value})} />
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4, gridColumn:'1 / -1' }}>
              <label>แนบรูปภาพ (งานออกแบบ / ตัวอย่าง)</label>
              <input type="file" accept="image/*" onChange={handleImgChange} />
              {imgPreview && <img src={imgPreview} alt="preview" style={{ maxHeight:140, borderRadius:8, marginTop:6, objectFit:'contain', border:'1px solid var(--border)' }} />}
            </div>
          </div>

          {/* แสดงรายการจาก Invoice */}
          {form.invoice_id && (() => {
            const inv = invoices.find(i=>i.id===form.invoice_id)
            if (!inv?.items?.length) return null
            return (
              <div style={{ marginTop:14 }}>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:8, color:'var(--text-muted)' }}>📋 รายการจาก {inv.code}</div>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ background:'var(--bg)' }}>
                      <th style={{ padding:'6px 10px', textAlign:'left' }}>รายการ</th>
                      <th style={{ padding:'6px 10px', textAlign:'center', width:80 }}>จำนวน</th>
                      <th style={{ padding:'6px 10px', textAlign:'right', width:100 }}>ราคา</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inv.items.map((it,i)=>(
                      <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
                        <td style={{ padding:'6px 10px' }}>{it.desc}</td>
                        <td style={{ padding:'6px 10px', textAlign:'center' }}>{it.qty}</td>
                        <td style={{ padding:'6px 10px', textAlign:'right' }}>฿{(it.amount||0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })()}

          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving?'กำลังบันทึก...':'💾 บันทึก'}
            </button>
            <button className="btn btn-outline" onClick={()=>{setShowForm(false);setEditId(null);setForm(emptyForm)}}>ยกเลิก</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ overflow:'hidden' }}>
        {loading ? <LoadingSpinner /> : (
          <>
            <div style={{ overflowX:'auto' }}>
              <table>
                <thead>
                  <tr><th>เลขที่</th><th>ลูกค้า</th><th>รายการ</th><th>กำหนดส่ง</th><th>สถานะ</th><th></th></tr>
                </thead>
                <tbody>
                  {filtered.map(j=>(
                    <tr key={j.id} className="row-link" style={{ background:isOverdue(j)?'#FFF5F5':undefined }}>
                      <td style={{ color:'var(--primary)', fontFamily:'monospace', fontWeight:700 }}>{j.code}</td>
                      <td style={{ fontWeight:600 }}>{j.customers?.name||'—'}</td>
                      <td style={{ color:'var(--text-muted)', fontSize:13 }}>{(j.item_desc||'').slice(0,35)}</td>
                      <td style={{ fontSize:12, color: isOverdue(j)?'var(--danger)':'var(--text-muted)', fontWeight: isOverdue(j)?700:400 }}>{fmtDate(j.due_date)}</td>
                      <td><span className={STATUS_BADGE[j.status]||'badge badge-gray'}>{j.status}</span></td>
                      <td style={{ display:'flex', gap:4 }}>
                        <button className="btn btn-outline btn-sm" onClick={()=>setView(j)}>ดู</button>
                        <button className="btn btn-outline btn-sm" onClick={()=>startEdit(j)}>✏️</button>
                        {j.status!=='ส่งงานแล้ว' && (
                          <button className="btn btn-outline btn-sm" style={{ color:'var(--danger)' }} onClick={()=>handleDelete(j)}>🗑️</button>
                        )}
                        {j.status!=='ส่งงานแล้ว' && (
                          <button className="btn btn-primary btn-sm" onClick={()=>{
                            const idx = ALL_STATUS.indexOf(j.status)
                            const next = ALL_STATUS[idx+1]
                            if(next) updateJobStatus(j.id,next).then(()=>load())
                          }}>▶ {ALL_STATUS[ALL_STATUS.indexOf(j.status)+1]||''}</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filtered.length===0 && (
                    <tr><td colSpan={6} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>ไม่พบรายการ</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ padding:'10px 14px', borderTop:'1px solid var(--border)', fontSize:12, color:'var(--text-muted)' }}>
              แสดง {filtered.length} จาก {rows.length} รายการ
            </div>
          </>
        )}
      </div>
    </div>
  )
}
