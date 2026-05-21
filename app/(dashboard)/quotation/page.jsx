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
      const { data: allQt } = await getQuotations()
      const maxQtNum = (allQt || []).reduce((max, r) => {
        const n = parseInt(r.code?.replace('QT-', '') || '0')
        return n > max ? n : max
      }, 0)
      const code = 'QT-' + String(maxQtNum + 1).padStart(4, '0')
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
        <div id="print-area" style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:8, maxWidth:794, margin:'0 auto', fontFamily:"'Sarabun','Noto Sans Thai',sans-serif" }}>

  {/* Header */}
  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding:'24px 32px 20px', borderBottom:'3px solid var(--primary)' }}>
    <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
      <div style={{ width:64, height:64, background:'var(--primary)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <div style={{ color:'#fff', fontWeight:900, fontSize:20, letterSpacing:-1, lineHeight:1 }}>C<br/>S</div>
      </div>
      <div>
        <div style={{ fontWeight:800, fontSize:14, color:'#1a1a1a' }}>{SHOP.name}</div>
        <div style={{ fontSize:11, color:'#555', lineHeight:1.7, marginTop:2 }}>
          {SHOP.address}<br/>
          เลขประจำตัวผู้เสียภาษี: {SHOP.taxId}<br/>
          Tel: {SHOP.tel} | Line: {SHOP.line} | FB: {SHOP.fb}
        </div>
      </div>
    </div>
    <div style={{ textAlign:'right' }}>
      <div style={{ display:'inline-block', border:'2px solid var(--primary)', borderRadius:8, padding:'8px 24px', marginBottom:8 }}>
        <div style={{ fontSize:18, fontWeight:900, color:'var(--primary)', letterSpacing:1 }}>ใบเสนอราคา</div>
        <div style={{ fontSize:12, fontWeight:600, color:'#666', letterSpacing:2 }}>QUOTATION</div>
      </div>
      <div style={{ fontSize:11, color:'#888', marginTop:4 }}>สำหรับลูกค้า</div>
    </div>
  </div>

  {/* Customer + Doc Info */}
  <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:0, margin:'0 32px', borderBottom:'1px solid #e5e7eb', paddingBottom:16, paddingTop:16 }}>
    <div style={{ display:'grid', gridTemplateColumns:'80px 1fr', rowGap:4, fontSize:12 }}>
      <span style={{ color:'#888', fontWeight:600 }}>ชื่อลูกค้า</span>
      <span style={{ fontWeight:700, fontSize:13 }}>{cust.name || view.customers?.name}</span>
      <span style={{ color:'#888', fontWeight:600 }}>ที่อยู่</span>
      <span style={{ color:'#444' }}>{cust.address || '-'}</span>
      <span style={{ color:'#888', fontWeight:600 }}>เบอร์โทร</span>
      <span style={{ color:'#444' }}>{cust.phone || '-'}</span>
      <span style={{ color:'#888', fontWeight:600 }}>เลขภาษี</span>
      <span style={{ color:'#444' }}>{cust.tax_id || '-'}</span>
    </div>
    <div style={{ textAlign:'right', fontSize:12, display:'flex', flexDirection:'column', gap:4 }}>
      <div><span style={{ color:'#888', fontWeight:600 }}>วันที่: </span><span style={{ fontWeight:700 }}>{fmtDate(view.document_date||view.created_at)}</span></div>
      <div><span style={{ color:'#888', fontWeight:600 }}>เลขที่: </span><span style={{ fontWeight:700, color:'var(--primary)', fontFamily:'monospace' }}>{view.code}</span></div>
      {view.valid_until && <div><span style={{ color:'#888', fontWeight:600 }}>ใช้ได้ถึง: </span><span style={{ fontWeight:600, color:'#EF4444' }}>{fmtDate(view.valid_until)}</span></div>}
    </div>
  </div>

  {/* Items Table */}
  <div style={{ padding:'0 32px' }}>
    <table style={{ width:'100%', borderCollapse:'collapse', marginTop:12, fontSize:12 }}>
      <thead>
        <tr style={{ background:'var(--primary)', color:'#fff' }}>
          <th style={{ padding:'8px 10px', textAlign:'center', width:36, fontWeight:700 }}>ลำดับ</th>
          <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:700 }}>รายละเอียด</th>
          <th style={{ padding:'8px 10px', textAlign:'center', width:70, fontWeight:700 }}>จำนวน</th>
          <th style={{ padding:'8px 10px', textAlign:'right', width:90, fontWeight:700 }}>ราคา/หน่วย</th>
          <th style={{ padding:'8px 10px', textAlign:'right', width:100, fontWeight:700 }}>จำนวนเงิน (บาท)</th>
        </tr>
      </thead>
      <tbody>
        {(view.items&&view.items.length ? view.items : [{ desc:view.item_desc||'', qty:1, price:view.total||0, amount:view.total||0 }]).map((it,i) => (
          <tr key={i} style={{ borderBottom:'1px solid #f3f4f6', background: i%2===0?'#fff':'#fafafa' }}>
            <td style={{ padding:'7px 10px', textAlign:'center', color:'#666' }}>{i+1}</td>
            <td style={{ padding:'7px 10px' }}>{it.desc}</td>
            <td style={{ padding:'7px 10px', textAlign:'center' }}>{it.qty}</td>
            <td style={{ padding:'7px 10px', textAlign:'right' }}>{(it.price||0).toLocaleString()}</td>
            <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:600 }}>{(it.amount||0).toLocaleString()}</td>
          </tr>
        ))}
        {Array.from({ length: Math.max(0, 8-(view.items&&view.items.length?view.items.length:1)) }).map((_,i)=>(
          <tr key={`e${i}`} style={{ borderBottom:'1px solid #f3f4f6' }}>
            <td style={{ padding:'7px 10px' }}>&nbsp;</td>
            <td style={{ padding:'7px 10px' }}></td>
            <td></td><td></td><td></td>
          </tr>
        ))}
        <tr style={{ borderTop:'2px solid #e5e7eb', background:'#f9fafb' }}>
          <td colSpan={4} style={{ padding:'6px 10px', fontWeight:700, fontSize:11, color:'#666' }}>
            รวมยอดสุทธิ
          </td>
          <td style={{ padding:'6px 10px', textAlign:'right', fontWeight:700 }}>{(view.total||0).toLocaleString()}</td>
        </tr>
      </tbody>
    </table>
  </div>

  {/* Total Box */}
  <div style={{ display:'flex', justifyContent:'flex-end', padding:'12px 32px 8px' }}>
    <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 16px', fontSize:14, fontWeight:800, color:'#fff', background:'var(--primary)', borderRadius:6, minWidth:200 }}>
      <span>GRAND TOTAL</span><span>{(view.total||0).toLocaleString()} บาท</span>
    </div>
  </div>

  {/* Notes + Status */}
  <div style={{ padding:'0 32px 16px', fontSize:11, color:'#555' }}>
    {view.status && (
      <div style={{ marginBottom:8 }}>
        <span style={{ fontWeight:700 }}>สถานะ: </span>
        <span className={STATUS_BADGE[view.status]||'badge badge-gray'}>{view.status}</span>
      </div>
    )}
    <div style={{ fontSize:10, color:'#888', lineHeight:1.6 }}>
      ใบเสนอราคานี้มีอายุ 30 วัน นับจากวันที่ออกเอกสาร หากมีข้อสงสัยกรุณาติดต่อ Tel: {SHOP.tel}
    </div>
  </div>

  {/* Signature Row */}
  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:0, borderTop:'1px dashed #d1d5db', margin:'0 32px 24px', paddingTop:16 }}>
    {[
      { title:'ผู้รับใบเสนอราคา', lines:['ลงชื่อ_________________________','วันที่__________________________'] },
      { title:'', lines:['ผู้เสนอราคา_____________________','วันที่__________________________'] },
      { title:'ร้าน C-Screen', lines:['ผู้มีอำนาจลงนาม________________','วันที่__________________________'] },
    ].map((box,i) => (
      <div key={i} style={{ padding:'0 16px', borderRight: i<2?'1px dashed #d1d5db':'none', fontSize:11, color:'#555' }}>
        {box.title && <div style={{ fontWeight:700, marginBottom:8 }}>{box.title}</div>}
        {box.lines.map((l,j) => <div key={j} style={{ marginBottom:8, marginTop: j===0&&!box.title?24:0 }}>{l}</div>)}
      </div>
    ))}
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
