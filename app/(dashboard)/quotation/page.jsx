'use client'
import { useState, useEffect } from 'react'
import { getQuotations, insertQuotation, updateQuotation, deleteQuotation, getCustomers, insertInvoice, getInvoices } from '@/lib/db'
import { fmtDate, SHOP } from '@/lib/shop'
import { todayStr, exportJpeg, shareDoc, printDoc } from '@/lib/docUtils'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const STATUS_BADGE = {
  'รออนุมัติ':'badge badge-yellow','อนุมัติแล้ว':'badge badge-green',
  'แปลงเป็น Invoice':'badge badge-blue','ปฏิเสธ':'badge badge-red',
}
const emptyItem = { desc:'', qty:1, price:0, amount:0 }
function calcQtItems(items) { return items.map(it=>({...it, amount:(parseFloat(it.qty)||0)*(parseFloat(it.price)||0)})) }
const emptyForm = () => ({ customer_id:'', valid_until:'', document_date:todayStr(), items:[{...emptyItem}] })

export default function QuotationPage() {
  const [rows, setRows]           = useState([])
  const [customers, setCustomers] = useState([])
  const [invoices, setInvoices]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [filterStatus, setFilter] = useState('')
  const [showForm, setShowForm]   = useState(false)
  const [view, setView]           = useState(null)
  const [editId, setEditId]       = useState(null)
  const [form, setForm]           = useState(emptyForm())
  const [saving, setSaving]       = useState(false)

  useEffect(()=>{ load() },[])

  async function load() {
    const [qtRes,cusRes,invRes] = await Promise.all([getQuotations(), getCustomers(), getInvoices()])
    setRows(qtRes.data||[])
    setCustomers(cusRes.data||[])
    setInvoices(invRes.data||[])
    setLoading(false)
  }

  function updateQtItem(idx,key,val){
    setForm(f=>{ const items=[...f.items]; items[idx]={...items[idx],[key]:val}; return {...f,items:calcQtItems(items)} })
  }

  async function handleSave() {
    if (!form.customer_id||form.items.length===0) return
    setSaving(true)
    const items = calcQtItems(form.items)
    const total = items.reduce((s,it)=>s+(it.amount||0),0)
    const payload = { customer_id:form.customer_id, valid_until:form.valid_until||null, document_date:form.document_date||todayStr(), items, total, status:'รออนุมัติ' }
    if (editId) {
      await updateQuotation(editId, payload)
      setEditId(null)
    } else {
      const code = 'QT-'+String((rows.length||0)+1).padStart(4,'0')
      await insertQuotation({ ...payload, code })
    }
    setForm(emptyForm()); setShowForm(false); setSaving(false)
    load()
  }

  async function handleDelete(qt) {
    if (!confirm(`ลบ ${qt.code} ใช่ไหม?`)) return
    await deleteQuotation(qt.id)
    load()
  }

  function startEdit(qt) {
    setEditId(qt.id)
    setForm({ customer_id:qt.customer_id, valid_until:qt.valid_until||'', document_date:qt.document_date||todayStr(), items:qt.items&&qt.items.length?qt.items:[{desc:qt.item_desc||'',qty:1,price:qt.total,amount:qt.total}] })
    setShowForm(true)
    window.scrollTo({top:0,behavior:'smooth'})
  }

  async function handleConvertToInvoice(qt) {
    const code = 'INV-'+String((invoices.length||0)+1).padStart(4,'0')
    const items = qt.items&&qt.items.length ? qt.items : [{ desc:qt.item_desc||'', qty:1, price:qt.total||0, amount:qt.total||0 }]
    const subtotal = items.reduce((s,it)=>s+(it.amount||0),0)
    await insertInvoice({ code, customer_id:qt.customer_id, quotation_id:qt.id, items, subtotal, discount:0, vat_pct:0, vat_amount:0, total:subtotal, status:'รอชำระ' })
    await updateQuotation(qt.id, { status:'แปลงเป็น Invoice' })
    alert(`สร้าง Invoice แล้ว (${code})`)
    load()
  }

  const filtered = rows.filter(q => {
    const ms = q.code?.includes(search)||q.customers?.name?.includes(search)||q.item_desc?.includes(search)
    return ms && (!filterStatus||q.status===filterStatus)
  })

  const totalVal = rows.reduce((s,q)=>s+(q.total||0),0)

  if (view) {
    const cust = customers.find(c=>c.id===view.customer_id)||{}
    return (
      <div style={{ maxWidth:720, margin:'0 auto', padding:24 }}>
        <div className="no-print" style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
          <button className="btn btn-outline" onClick={()=>setView(null)}>← กลับ</button>
          <div style={{ display:'flex', gap:8 }}>
            {view.status!=='แปลงเป็น Invoice' && (
              <button className="btn btn-primary" onClick={()=>{handleConvertToInvoice(view);setView(null)}}>→ Invoice</button>
            )}
            <button className="btn btn-outline" onClick={()=>shareDoc({
              title:`ใบเสนอราคา ${view.code}`,
              text:`ลูกค้า: ${cust.name||''}\nยอดรวม: ฿${(view.total||0).toLocaleString()}\nใช้ได้ถึง: ${view.valid_until?fmtDate(view.valid_until):'-'}\n— C-Screen ${SHOP.tel}`
            })}>🔗 แชร์</button>
            <button className="btn btn-outline" onClick={()=>exportJpeg('print-area',`QT-${view.code}`)}>📷 JPEG</button>
            <button className="btn btn-outline" onClick={()=>printDoc()}>🖨️ พิมพ์</button>
          </div>
        </div>
        <div id="print-area" style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:8, padding:40, maxWidth:794, margin:'0 auto' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:24 }}>
            <div>
              <div style={{ fontSize:22, fontWeight:900, color:'var(--primary)' }}>C-SCREEN</div>
              <div style={{ fontSize:11, color:'#666', maxWidth:260, lineHeight:1.6 }}>
                {SHOP.address}<br/>Tel: {SHOP.tel} | Line: {SHOP.line}<br/>
                เลขผู้เสียภาษี: {SHOP.taxId}
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:22, fontWeight:900 }}>ใบเสนอราคา</div>
              <div style={{ color:'var(--primary)', fontFamily:'monospace', fontWeight:700 }}>{view.code}</div>
              <div style={{ fontSize:12, color:'#666' }}>วันที่: {fmtDate(view.document_date||view.created_at)}</div>
              {view.valid_until && <div style={{ fontSize:12, color:'#666' }}>ใช้ได้ถึง: {fmtDate(view.valid_until)}</div>}
            </div>
          </div>
          <div style={{ background:'#F9FAFB', borderRadius:8, padding:'12px 16px', marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#888', marginBottom:4 }}>ลูกค้า</div>
            <div style={{ fontSize:14, fontWeight:700 }}>{cust.name||view.customers?.name}</div>
            {cust.address && <div style={{ fontSize:12, color:'#666' }}>{cust.address}</div>}
            {cust.phone && <div style={{ fontSize:12, color:'#666' }}>Tel: {cust.phone}</div>}
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:16 }}>
            <thead>
              <tr style={{ background:'var(--primary)', color:'#fff' }}>
                <th style={{ padding:'8px 12px', textAlign:'left', fontSize:12 }}>รายการ</th>
                <th style={{ padding:'8px 12px', textAlign:'right', fontSize:12, width:70 }}>จำนวน</th>
                <th style={{ padding:'8px 12px', textAlign:'right', fontSize:12, width:110 }}>ราคา/หน่วย</th>
                <th style={{ padding:'8px 12px', textAlign:'right', fontSize:12, width:120 }}>จำนวนเงิน</th>
              </tr>
            </thead>
            <tbody>
              {(view.items&&view.items.length ? view.items : [{ desc:view.item_desc||'', qty:1, price:view.total||0, amount:view.total||0 }]).map((it,i)=>(
                <tr key={i} style={{ borderBottom:'1px solid #eee' }}>
                  <td style={{ padding:'8px 12px', fontSize:13 }}>{it.desc}</td>
                  <td style={{ padding:'8px 12px', textAlign:'right', fontSize:13 }}>{it.qty}</td>
                  <td style={{ padding:'8px 12px', textAlign:'right', fontSize:13 }}>฿{(it.price||0).toLocaleString()}</td>
                  <td style={{ padding:'8px 12px', textAlign:'right', fontWeight:600, fontSize:13 }}>฿{(it.amount||0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display:'flex', justifyContent:'flex-end' }}>
            <div style={{ minWidth:200, display:'flex', justifyContent:'space-between', padding:'8px 0', fontSize:16, fontWeight:800, color:'var(--primary)', borderTop:'2px solid var(--primary)' }}>
              <span>ยอดรวม</span><span>฿{(view.total||0).toLocaleString()}</span>
            </div>
          </div>
          <div style={{ marginTop:20, padding:12, background:'#F9FAFB', borderRadius:6, fontSize:12, color:'#666' }}>
            <span className={STATUS_BADGE[view.status]||'badge badge-gray'}>{view.status}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
        {[
          { label:'มูลค่าทั้งหมด', value:`฿${totalVal.toLocaleString()}`, accent:'var(--primary)', icon:'💰' },
          { label:'รออนุมัติ', value:rows.filter(q=>q.status==='รออนุมัติ').length, accent:'var(--warning)', icon:'⏳' },
          { label:'อนุมัติแล้ว', value:rows.filter(q=>q.status==='อนุมัติแล้ว').length, accent:'var(--success)', icon:'✅' },
          { label:'แปลงเป็น Invoice', value:rows.filter(q=>q.status==='แปลงเป็น Invoice').length, accent:'var(--info)', icon:'📄' },
        ].map(k=>(
          <div key={k.label} style={{ background:'var(--card)', borderRadius:'var(--radius)', padding:'16px 18px', boxShadow:'var(--shadow)', border:'1px solid var(--border)', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, width:4, height:'100%', background:k.accent, borderRadius:'10px 0 0 10px' }} />
            <div style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', fontSize:28, opacity:.1 }}>{k.icon}</div>
            <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase' }}>{k.label}</div>
            <div style={{ fontSize:22, fontWeight:800, color:k.accent, marginTop:4 }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }}>🔍</span>
            <input type="text" placeholder="ค้นหา..." value={search}
              onChange={e=>setSearch(e.target.value)} style={{ paddingLeft:36, width:220 }} />
          </div>
          <button onClick={()=>setFilter('')} className={!filterStatus?'btn btn-primary btn-sm':'btn btn-outline btn-sm'}>ทั้งหมด</button>
          {Object.keys(STATUS_BADGE).map(s=>(
            <button key={s} onClick={()=>setFilter(filterStatus===s?'':s)}
              className={filterStatus===s?'btn btn-primary btn-sm':'btn btn-outline btn-sm'}>{s}</button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={()=>setShowForm(!showForm)}>
          {showForm?'✕ ปิด':'+ สร้างใบเสนอราคา'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ padding:20 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>{editId?'✏️ แก้ไขใบเสนอราคา':'➕ ใบเสนอราคาใหม่'}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:14 }}>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              <label>ลูกค้า *</label>
              <select value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value})}>
                <option value="">— เลือกลูกค้า —</option>
                {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              <label>วันที่เอกสาร</label>
              <input type="date" value={form.document_date}
                onChange={e=>setForm({...form,document_date:e.target.value})} />
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              <label>ใช้ได้ถึง</label>
              <input type="date" value={form.valid_until}
                onChange={e=>setForm({...form,valid_until:e.target.value})} />
            </div>
          </div>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>รายการสินค้า *</div>
          <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:8 }}>
            <thead>
              <tr style={{ background:'var(--bg)', fontSize:12 }}>
                <th style={{ padding:'6px 8px', textAlign:'left', border:'1px solid var(--border)' }}>รายการ</th>
                <th style={{ padding:'6px 8px', textAlign:'right', border:'1px solid var(--border)', width:80 }}>จำนวน</th>
                <th style={{ padding:'6px 8px', textAlign:'right', border:'1px solid var(--border)', width:110 }}>ราคา/หน่วย</th>
                <th style={{ padding:'6px 8px', textAlign:'right', border:'1px solid var(--border)', width:110 }}>รวม</th>
                <th style={{ border:'1px solid var(--border)', width:36 }}></th>
              </tr>
            </thead>
            <tbody>
              {form.items.map((it,idx)=>(
                <tr key={idx}>
                  <td style={{ border:'1px solid var(--border)', padding:4 }}>
                    <input style={{ width:'100%', border:'none', background:'transparent', fontSize:13 }}
                      placeholder="รายละเอียด" value={it.desc} onChange={e=>updateQtItem(idx,'desc',e.target.value)} />
                  </td>
                  <td style={{ border:'1px solid var(--border)', padding:4 }}>
                    <input type="number" style={{ width:'100%', border:'none', background:'transparent', fontSize:13, textAlign:'right' }}
                      value={it.qty} onChange={e=>updateQtItem(idx,'qty',e.target.value)} />
                  </td>
                  <td style={{ border:'1px solid var(--border)', padding:4 }}>
                    <input type="number" style={{ width:'100%', border:'none', background:'transparent', fontSize:13, textAlign:'right' }}
                      value={it.price} onChange={e=>updateQtItem(idx,'price',e.target.value)} />
                  </td>
                  <td style={{ border:'1px solid var(--border)', padding:'4px 8px', textAlign:'right', fontSize:13, fontWeight:600 }}>
                    ฿{(it.amount||0).toLocaleString()}
                  </td>
                  <td style={{ border:'1px solid var(--border)', textAlign:'center' }}>
                    <button onClick={()=>setForm(f=>({...f,items:f.items.filter((_,i)=>i!==idx)}))}
                      style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer', fontSize:14 }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <button className="btn btn-outline btn-sm" onClick={()=>setForm(f=>({...f,items:[...f.items,{...emptyItem}]}))}>+ เพิ่มรายการ</button>
            <div style={{ fontSize:14, fontWeight:700, color:'var(--primary)' }}>
              ยอดรวม: ฿{form.items.reduce((s,it)=>s+(it.amount||0),0).toLocaleString()}
            </div>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              {saving?'กำลังบันทึก...':'💾 บันทึก'}
            </button>
            <button className="btn btn-outline btn-sm" onClick={()=>{setShowForm(false);setEditId(null);setForm(emptyForm)}}>ยกเลิก</button>
          </div>
        </div>
      )}

      <div className="card" style={{ overflow:'hidden' }}>
        {loading ? <LoadingSpinner /> : (
          <>
            <div style={{ overflowX:'auto' }}>
              <table>
                <thead>
                  <tr><th>เลขที่</th><th>วันที่</th><th>ลูกค้า</th><th>รายการ</th><th>มูลค่า</th><th>ใช้ได้ถึง</th><th>สถานะ</th><th></th></tr>
                </thead>
                <tbody>
                  {filtered.map(q=>(
                    <tr key={q.id} className="row-link">
                      <td style={{ color:'var(--primary)', fontFamily:'monospace', fontWeight:700 }}>{q.code}</td>
                      <td style={{ fontSize:12, color:'var(--text-muted)' }}>{fmtDate(q.created_at)}</td>
                      <td style={{ fontWeight:600 }}>{q.customers?.name||'—'}</td>
                      <td style={{ color:'var(--text-muted)', fontSize:13 }}>{(q.item_desc||'').slice(0,28)}</td>
                      <td style={{ fontWeight:700 }}>฿{(q.total||0).toLocaleString()}</td>
                      <td style={{ fontSize:12, color:'var(--text-muted)' }}>{fmtDate(q.valid_until)}</td>
                      <td><span className={STATUS_BADGE[q.status]||'badge badge-gray'}>{q.status}</span></td>
                      <td style={{ display:'flex', gap:4 }}>
                        <button className="btn btn-outline btn-sm" onClick={()=>setView(q)}>ดู</button>
                        {q.status!=='แปลงเป็น Invoice' && (<>
                          <button className="btn btn-outline btn-sm" onClick={()=>startEdit(q)}>✏️</button>
                          <button className="btn btn-outline btn-sm" style={{ color:'var(--danger)' }} onClick={()=>handleDelete(q)}>🗑️</button>
                          <button className="btn btn-primary btn-sm" onClick={()=>handleConvertToInvoice(q)}>→ Invoice</button>
                        </>)}
                      </td>
                    </tr>
                  ))}
                  {filtered.length===0 && (
                    <tr><td colSpan={8} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>ไม่พบรายการ</td></tr>
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
