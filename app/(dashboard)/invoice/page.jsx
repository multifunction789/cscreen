'use client'
import { useState, useEffect } from 'react'
import { getInvoices, insertInvoice, updateInvoice, deleteInvoice, getCustomers, insertJobOrder, getJobOrders, insertReceipt, getReceipts, getMaterials, deductMaterial } from '@/lib/db'
import { fmtDate, SHOP } from '@/lib/shop'
import { todayStr, exportJpeg, shareDoc, printDoc } from '@/lib/docUtils'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const STATUS_BADGE = { 'รอชำระ':'badge badge-yellow', 'ชำระแล้ว':'badge badge-green', 'ยกเลิก':'badge badge-red' }
const emptyItem = { desc:'', qty:1, price:0, amount:0, material_id:null }

function calcItems(items) {
  return items.map(it => ({ ...it, amount: (parseFloat(it.qty)||0) * (parseFloat(it.price)||0) }))
}

const emptyForm = () => ({
  customer_id:'', due_date:'', document_date:todayStr(), notes:'', vat_pct:0, discount:0, wht_pct:0,
  items:[{ ...emptyItem }]
})

export default function InvoicePage() {
  const [rows, setRows]         = useState([])
  const [customers, setCustomers] = useState([])
  const [jobs, setJobs]         = useState([])
  const [materials, setMaterials] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [filterStatus, setFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [view, setView]         = useState(null)
  const [saving, setSaving]     = useState(false)
  const [receipts, setReceipts] = useState([])
  const [editId, setEditId]     = useState(null)
  const [form, setForm]         = useState(emptyForm())

  useEffect(() => { load() }, [])

  async function load() {
    const [invRes, cusRes, jobRes, rcRes, matRes] = await Promise.all([getInvoices(), getCustomers(), getJobOrders(), getReceipts(), getMaterials()])
    setRows(invRes.data || [])
    setCustomers(cusRes.data || [])
    setJobs(jobRes.data || [])
    setReceipts(rcRes.data || [])
    setMaterials(matRes.data || [])
    setLoading(false)
  }

  function updateItem(idx, key, val) {
    setForm(f => {
      const items = [...f.items]
      items[idx] = { ...items[idx], [key]: val }
      return { ...f, items: calcItems(items) }
    })
  }
  function addItem()    { setForm(f => ({ ...f, items: [...f.items, { ...emptyItem }] })) }
  function removeItem(i){ setForm(f => ({ ...f, items: f.items.filter((_,idx)=>idx!==i) })) }
  function addItemFromStock(mat) {
    setForm(f => ({ ...f, items: calcItems([...f.items, { desc:mat.name, qty:1, price:0, amount:0, material_id:mat.id }]) }))
  }

  const subtotal    = form.items.reduce((s,it)=>s+(it.amount||0), 0)
  const discAmt     = parseFloat(form.discount)||0
  const vatAmt      = ((subtotal - discAmt) * (parseFloat(form.vat_pct)||0)) / 100
  const whtAmt      = ((subtotal - discAmt) * (parseFloat(form.wht_pct)||0)) / 100
  const total       = subtotal - discAmt + vatAmt - whtAmt

  async function handleSave() {
    if (!form.customer_id) return alert('กรุณาเลือกลูกค้า')
    if (form.items.length === 0) return alert('กรุณาเพิ่มรายการสินค้า')
    setSaving(true)
    const items = calcItems(form.items)
    const payload = {
      customer_id:form.customer_id, items, subtotal, discount:discAmt,
      vat_pct:parseFloat(form.vat_pct)||0, vat_amount:vatAmt,
      wht_pct:parseFloat(form.wht_pct)||0, wht_amount:whtAmt,
      total, due_date:form.due_date||null, document_date:form.document_date||todayStr(),
      notes:form.notes, status:'รอชำระ',
    }
    if (editId) {
      await updateInvoice(editId, payload)
      setEditId(null)
    } else {
      const { data: allInv } = await getInvoices()
      const maxInvNum = (allInv || []).reduce((max, r) => {
        const n = parseInt(r.code?.replace('INV-', '') || '0')
        return n > max ? n : max
      }, 0)
      const code = 'INV-' + String(maxInvNum + 1).padStart(4, '0')
      await insertInvoice({ ...payload, code })
      // ตัดสต๊อกสำหรับรายการที่ผูกกับ Material
      for (const it of items) {
        if (it.material_id && it.qty > 0) await deductMaterial(it.material_id, parseFloat(it.qty))
      }
    }
    setForm(emptyForm())
    setShowForm(false); setSaving(false)
    load()
  }

  async function handleMarkPaid(inv) {
    await updateInvoice(inv.id, { status:'ชำระแล้ว' })
    // สร้างใบเสร็จอัตโนมัติ
    const code = 'RC-' + String((receipts.length||0)+1).padStart(4,'0')
    await insertReceipt({ code, customer_id:inv.customer_id, invoice_id:inv.id, total:inv.total, paid:true, payment_method:'โอน' })
    load()
  }

  async function handleDelete(inv) {
    if (!confirm(`ลบ ${inv.code} ใช่ไหม?`)) return
    await deleteInvoice(inv.id)
    load()
  }

  function startEdit(inv) {
    setEditId(inv.id)
    setForm({
      customer_id:inv.customer_id, due_date:inv.due_date||'', document_date:inv.document_date||todayStr(),
      notes:inv.notes||'', vat_pct:inv.vat_pct||0, discount:inv.discount||0, wht_pct:inv.wht_pct||0,
      items: inv.items||[{...emptyItem}],
    })
    setShowForm(true)
    window.scrollTo({top:0, behavior:'smooth'})
  }

  async function handleConvertToJO(inv) {
    if (inv.jo_created) return alert('สร้างใบงานไปแล้ว')
    const code = 'JO-' + String((jobs.length||0)+1).padStart(4,'0')
    const desc = (inv.items||[]).map(it=>it.desc).join(', ')
    await insertJobOrder({ code, customer_id:inv.customer_id, invoice_id:inv.id, item_desc:desc, total:inv.total, status:'รอมัดจำ' })
    await updateInvoice(inv.id, { jo_created:true })
    alert(`สร้างใบงาน ${code} แล้ว`)
    load()
  }

  const filtered = rows.filter(r => {
    const ms = r.code?.includes(search) || r.customers?.name?.includes(search)
    const mf = !filterStatus || r.status === filterStatus
    return ms && mf
  })

  const totalAll  = rows.reduce((s,r)=>s+(r.total||0),0)
  const totalPaid = rows.filter(r=>r.status==='ชำระแล้ว').reduce((s,r)=>s+(r.total||0),0)
  const totalWait = rows.filter(r=>r.status==='รอชำระ').reduce((s,r)=>s+(r.total||0),0)

  // Print view
  if (view) {
    const cust = customers.find(c=>c.id===view.customer_id) || view.customers || {}
    return (
      <div style={{ maxWidth:794, margin:'0 auto', padding:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
          <button className="btn btn-outline" onClick={()=>setView(null)}>← กลับ</button>
          <div style={{ display:'flex', gap:8 }}>
            {view.status==='รอชำระ' && <>
              <button className="btn btn-outline" onClick={()=>{startEdit(view);setView(null)}}>✏️ แก้ไข</button>
              <button className="btn btn-primary" onClick={()=>{handleMarkPaid(view);setView(null)}}>✓ รับชำระ → ใบเสร็จ</button>
            </>}
            <button className="btn btn-outline" onClick={()=>{handleConvertToJO(view);setView(null)}} disabled={view.jo_created}>
              {view.jo_created?'✓ สร้าง JO แล้ว':'📝 → ใบงาน'}
            </button>
            <button className="btn btn-outline" onClick={()=>shareDoc({
              title:`ใบแจ้งหนี้ ${view.code}`,
              text:`ลูกค้า: ${(customers.find(c=>c.id===view.customer_id)||view.customers||{}).name||''}\nยอดสุทธิ: ฿${(view.total||0).toLocaleString()}\nครบกำหนด: ${view.due_date?fmtDate(view.due_date):'-'}\n— C-Screen ${SHOP.tel}`
            })}>🔗 แชร์</button>
            <button className="btn btn-outline" onClick={()=>exportJpeg('print-area',`INV-${view.code}`)}>📷 JPEG</button>
            <button className="btn btn-primary" onClick={()=>printDoc()}>🖨️ พิมพ์</button>
          </div>
        </div>

        <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:8, maxWidth:794, margin:'0 auto', fontFamily:"'Sarabun','Noto Sans Thai',sans-serif" }} id="print-area">

  {/* Header */}
  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding:'24px 32px 20px', borderBottom:'3px solid var(--primary)' }}>
    {/* Logo + Shop Info */}
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
    {/* Document Title */}
    <div style={{ textAlign:'right' }}>
      <div style={{ display:'inline-block', border:'2px solid var(--primary)', borderRadius:8, padding:'8px 24px', marginBottom:8 }}>
        <div style={{ fontSize:18, fontWeight:900, color:'var(--primary)', letterSpacing:1 }}>ใบแจ้งหนี้</div>
        <div style={{ fontSize:12, fontWeight:600, color:'#666', letterSpacing:2 }}>INVOICE</div>
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
      {view.due_date && <div><span style={{ color:'#888', fontWeight:600 }}>ครบกำหนด: </span><span style={{ fontWeight:600, color:'#EF4444' }}>{fmtDate(view.due_date)}</span></div>}
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
        {(view.items||[]).map((it,i) => (
          <tr key={i} style={{ borderBottom:'1px solid #f3f4f6', background: i%2===0?'#fff':'#fafafa' }}>
            <td style={{ padding:'7px 10px', textAlign:'center', color:'#666' }}>{i+1}</td>
            <td style={{ padding:'7px 10px' }}>{it.desc}</td>
            <td style={{ padding:'7px 10px', textAlign:'center' }}>{it.qty}</td>
            <td style={{ padding:'7px 10px', textAlign:'right' }}>{(it.price||0).toLocaleString()}</td>
            <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:600 }}>{(it.amount||0).toLocaleString()}</td>
          </tr>
        ))}
        {/* Empty rows padding */}
        {Array.from({ length: Math.max(0, 8-(view.items||[]).length) }).map((_,i)=>(
          <tr key={`e${i}`} style={{ borderBottom:'1px solid #f3f4f6' }}>
            <td style={{ padding:'7px 10px' }}>&nbsp;</td>
            <td style={{ padding:'7px 10px' }}></td>
            <td></td><td></td><td></td>
          </tr>
        ))}
        <tr style={{ borderTop:'2px solid #e5e7eb', background:'#f9fafb' }}>
          <td colSpan={4} style={{ padding:'6px 10px', fontWeight:700, fontSize:11, color:'#666' }}>
            รวมยอดจำนวนรายการ {(view.items||[]).reduce((s,it)=>s+(parseFloat(it.qty)||0),0).toLocaleString()}
          </td>
          <td style={{ padding:'6px 10px', textAlign:'right', fontWeight:700 }}>{(view.subtotal||0).toLocaleString()}</td>
        </tr>
      </tbody>
    </table>
  </div>

  {/* Footer */}
  <div style={{ display:'grid', gridTemplateColumns:'1fr 200px', gap:24, padding:'16px 32px 24px', marginTop:8 }}>
    {/* Left: Payment + Notes */}
    <div>
      <div style={{ fontSize:11, fontWeight:700, color:'#888', marginBottom:6 }}>ชำระ</div>
      <div style={{ display:'flex', gap:20, marginBottom:10 }}>
        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
          <span style={{ width:14, height:14, border:'1.5px solid #999', borderRadius:3, display:'inline-block' }}></span> เงินสด
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
          <span style={{ width:14, height:14, border:'1.5px solid var(--primary)', borderRadius:3, display:'inline-block', background:'var(--primary)', position:'relative' }}>
            <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:10 }}>✓</span>
          </span> โอน
        </label>
      </div>
      <div style={{ fontSize:11, color:'#555', marginBottom:4 }}>
        <span style={{ fontWeight:700 }}>0148098700</span> ธนาคารกสิกรไทย สาขาหนองจอก<br/>
        ชื่อบัญชี: นางสาวสุพรรัตน์ พรมเชียงสาชูโชค
      </div>
      {view.notes && (
        <div style={{ marginTop:8, fontSize:11, color:'#555' }}>
          <span style={{ fontWeight:700 }}>หมายเหตุ: </span>{view.notes}
        </div>
      )}
      <div style={{ marginTop:10, fontSize:10, color:'#888', lineHeight:1.6 }}>
        1. ทุกช่องทางชำระเงินกรุณาสั่งจ่ายในนาม "นางสาวสุพรรัตน์ พรมเชียงสาชูโชค" เท่านั้น<br/>
        2. สินค้าตามรายการข้างต้นแม้จะได้ส่งมอบให้แก่ผู้ซื้อแล้วก็ยังคงเป็นทรัพย์สินของผู้ขายจนกว่าผู้ซื้อจะชำระเงินเรียบร้อยแล้ว
      </div>
    </div>
    {/* Right: Summary */}
    <div style={{ fontSize:12 }}>
      {[
        { label:'ยอดรวม', val:(view.subtotal||0).toLocaleString(), bold:false },
        ...(view.discount>0?[{ label:`ส่วนลด`, val:`-${(view.discount||0).toLocaleString()}`, bold:false, color:'var(--danger)' }]:[]),
        ...(view.vat_pct>0?[{ label:`VAT ${view.vat_pct}%`, val:(view.vat_amount||0).toLocaleString(), bold:false }]:[]),
        ...((view.wht_pct||0)>0?[{ label:`หัก ณ ที่จ่าย ${view.wht_pct}%`, val:`-${(view.wht_amount||0).toLocaleString()}`, bold:false, color:'var(--danger)' }]:[]),
      ].map(r => (
        <div key={r.label} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid #f3f4f6', color:r.color||'inherit' }}>
          <span>{r.label}</span><span>{r.val}</span>
        </div>
      ))}
      <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 10px', fontSize:14, fontWeight:800, color:'#fff', background:'var(--primary)', borderRadius:6, marginTop:6 }}>
        <span>GRAND TOTAL</span><span>{(view.total||0).toLocaleString()}</span>
      </div>
    </div>
  </div>

  {/* Signature Row */}
  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:0, borderTop:'1px dashed #d1d5db', margin:'0 32px 24px', paddingTop:16 }}>
    {[
      { title:'ได้รับสินค้าตามรายการข้างต้นเรียบร้อยแล้ว', lines:['ผู้รับสินค้า_____________________','วันที่รับสินค้า_________________'] },
      { title:'', lines:['ผู้จัดส่งสินค้า___________________','วันที่จัดส่งสินค้า______________'] },
      { title:'ร้าน C-Screen', lines:['ผู้มีอำนาจลงนาม________________','วันที่________________________________'] },
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

      {/* KPI */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
        {[
          { label:'ใบแจ้งหนี้ทั้งหมด', value:rows.length+' ใบ', accent:'var(--primary)', icon:'📄' },
          { label:'มูลค่ารวม', value:`฿${totalAll.toLocaleString()}`, accent:'var(--info)', icon:'💰' },
          { label:'ชำระแล้ว', value:`฿${totalPaid.toLocaleString()}`, accent:'var(--success)', icon:'✅' },
          { label:'รอชำระ', value:`฿${totalWait.toLocaleString()}`, accent:'var(--warning)', icon:'⏳' },
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
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }}>🔍</span>
            <input type="text" placeholder="ค้นหา..." value={search}
              onChange={e=>setSearch(e.target.value)} style={{ paddingLeft:36, width:220 }} />
          </div>
          {['','รอชำระ','ชำระแล้ว','ยกเลิก'].map(s=>(
            <button key={s} onClick={()=>setFilter(s)}
              className={filterStatus===s?'btn btn-primary btn-sm':'btn btn-outline btn-sm'}>
              {s||'ทั้งหมด'}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={()=>setShowForm(!showForm)}>
          {showForm?'✕ ปิด':'+ สร้างใบแจ้งหนี้'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="card" style={{ padding:20 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:16 }}>{editId?'✏️ แก้ไขใบแจ้งหนี้':'➕ ใบแจ้งหนี้ใหม่'}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label>ลูกค้า *</label>
              <select value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value})}>
                <option value="">— เลือกลูกค้า —</option>
                {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label>วันที่เอกสาร</label>
              <input type="date" value={form.document_date} onChange={e=>setForm({...form,document_date:e.target.value})} />
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label>ครบกำหนดชำระ</label>
              <input type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})} />
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label>VAT (%)</label>
              <select value={form.vat_pct} onChange={e=>setForm({...form,vat_pct:e.target.value})}>
                <option value={0}>ไม่มี VAT</option>
                <option value={7}>7%</option>
              </select>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label>หัก ณ ที่จ่าย (%)</label>
              <select value={form.wht_pct} onChange={e=>setForm({...form,wht_pct:e.target.value})}>
                <option value={0}>ไม่มี</option>
                <option value={3}>3%</option>
                <option value={5}>5%</option>
              </select>
            </div>
          </div>

          {/* Items */}
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>รายการสินค้า / บริการ</div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'var(--bg)' }}>
                  <th style={{ padding:'6px 10px', textAlign:'left', fontSize:12 }}>รายการ</th>
                  <th style={{ padding:'6px 10px', fontSize:12, width:80 }}>จำนวน</th>
                  <th style={{ padding:'6px 10px', fontSize:12, width:120 }}>ราคา/หน่วย</th>
                  <th style={{ padding:'6px 10px', textAlign:'right', fontSize:12, width:120 }}>รวม</th>
                  <th style={{ width:40 }}></th>
                </tr>
              </thead>
              <tbody>
                {form.items.map((it,i)=>(
                  <tr key={i}>
                    <td style={{ padding:'4px 6px' }}>
                      <input type="text" placeholder="รายละเอียดสินค้า/บริการ"
                        value={it.desc} onChange={e=>updateItem(i,'desc',e.target.value)} style={{ width:'100%' }} />
                    </td>
                    <td style={{ padding:'4px 6px' }}>
                      <input type="number" min="1" value={it.qty}
                        onChange={e=>updateItem(i,'qty',e.target.value)} />
                    </td>
                    <td style={{ padding:'4px 6px' }}>
                      <input type="number" min="0" value={it.price}
                        onChange={e=>updateItem(i,'price',e.target.value)} />
                    </td>
                    <td style={{ padding:'4px 10px', textAlign:'right', fontWeight:700, fontSize:13 }}>
                      ฿{(it.amount||0).toLocaleString()}
                    </td>
                    <td style={{ padding:'4px 6px', textAlign:'center' }}>
                      {form.items.length>1 && (
                        <button onClick={()=>removeItem(i)} style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer', fontSize:16 }}>×</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap', alignItems:'center' }}>
              <button className="btn btn-outline btn-sm" onClick={addItem}>+ เพิ่มรายการ</button>
              <select style={{ fontSize:12, padding:'5px 10px' }} defaultValue="" onChange={e=>{
                const mat = materials.find(m=>m.id===e.target.value); if(mat){addItemFromStock(mat);e.target.value=''}
              }}>
                <option value="">📦 เพิ่มจากสต๊อก...</option>
                {materials.map(m=><option key={m.id} value={m.id}>{m.name} (เหลือ: {m.qty} {m.unit})</option>)}
              </select>
            </div>
          </div>

          {/* Summary */}
          <div style={{ display:'flex', justifyContent:'flex-end', gap:20, alignItems:'flex-start' }}>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label style={{ fontSize:12 }}>ส่วนลด (฿)</label>
              <input type="number" min="0" value={form.discount} style={{ width:120 }}
                onChange={e=>setForm({...form,discount:e.target.value})} />
            </div>
            <div style={{ minWidth:200, fontSize:13 }}>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 0' }}>
                <span>ยอดรวม</span><span>฿{subtotal.toLocaleString()}</span>
              </div>
              {discAmt>0 && <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', color:'var(--danger)' }}>
                <span>ส่วนลด</span><span>-฿{discAmt.toLocaleString()}</span>
              </div>}
              {vatAmt>0 && <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 0' }}>
                <span>VAT {form.vat_pct}%</span><span>฿{vatAmt.toFixed(2)}</span>
              </div>}
              {whtAmt>0 && <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', color:'var(--danger)' }}>
                <span>หัก ณ ที่จ่าย {form.wht_pct}%</span><span>-฿{whtAmt.toFixed(2)}</span>
              </div>}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', fontWeight:800, fontSize:15, color:'var(--primary)', borderTop:'2px solid var(--primary)', marginTop:4 }}>
                <span>ยอดสุทธิ</span><span>฿{total.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:4, marginTop:8 }}>
            <label style={{ fontSize:12 }}>หมายเหตุ</label>
            <input type="text" placeholder="หมายเหตุ / เงื่อนไขการชำระเงิน"
              value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} />
          </div>

          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving?'กำลังบันทึก...':'💾 บันทึกใบแจ้งหนี้'}
            </button>
            <button className="btn btn-outline" onClick={()=>setShowForm(false)}>ยกเลิก</button>
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
                  <tr><th>เลขที่</th><th>วันที่</th><th>ลูกค้า</th><th>รายการ</th><th>ยอดรวม</th><th>ครบกำหนด</th><th>สถานะ</th><th></th></tr>
                </thead>
                <tbody>
                  {filtered.map(r=>(
                    <tr key={r.id} className="row-link">
                      <td style={{ color:'var(--primary)', fontFamily:'monospace', fontWeight:700 }}>{r.code}</td>
                      <td style={{ fontSize:12, color:'var(--text-muted)' }}>{fmtDate(r.created_at)}</td>
                      <td style={{ fontWeight:600 }}>{r.customers?.name||'—'}</td>
                      <td style={{ fontSize:12, color:'var(--text-muted)' }}>{(r.items||[]).map(i=>i.desc).join(', ').slice(0,30)||'—'}</td>
                      <td style={{ fontWeight:800, color:'var(--primary)' }}>฿{(r.total||0).toLocaleString()}</td>
                      <td style={{ fontSize:12, color:'var(--text-muted)' }}>{fmtDate(r.due_date)}</td>
                      <td><span className={STATUS_BADGE[r.status]||'badge badge-gray'}>{r.status}</span></td>
                      <td style={{ display:'flex', gap:4 }}>
                        <button className="btn btn-outline btn-sm" onClick={()=>setView(r)}>ดู</button>
                        {r.status==='รอชำระ' && <>
                          <button className="btn btn-outline btn-sm" onClick={()=>startEdit(r)}>✏️</button>
                          <button className="btn btn-primary btn-sm" onClick={()=>handleMarkPaid(r)}>รับเงิน</button>
                        </>}
                        {!r.jo_created && <button className="btn btn-outline btn-sm" onClick={()=>handleConvertToJO(r)}>→ JO</button>}
                        {r.status==='รอชำระ' && !r.jo_created && <button className="btn btn-outline btn-sm" style={{color:'var(--danger)'}} onClick={()=>handleDelete(r)}>ลบ</button>}
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
