'use client'
import { useState, useEffect } from 'react'
import { getReceipts, updateReceipt, insertTransaction } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { fmtDate, SHOP } from '@/lib/shop'
import { todayStr, exportJpeg, shareDoc, uploadFile, printDoc } from '@/lib/docUtils'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function ReceiptPage() {
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [filterPaid, setFilter] = useState('')
  const [view, setView]         = useState(null)
  const [payMethod, setPayMethod] = useState('โอน')
  const [fileInput, setFileInput] = useState(null)
  const [fileUploading, setFileUploading] = useState(false)

  useEffect(()=>{ load() },[])

  async function load() {
    const { data } = await getReceipts()
    setRows(data||[])
    setLoading(false)
  }

  async function handlePay(r) {
    await updateReceipt(r.id, { paid:true, payment_method:payMethod })
    // บันทึกเป็น transaction รายรับ
    await insertTransaction({
      description:`รับชำระ ${r.code} – ${r.customers?.name||''}`,
      type:'รายรับ', amount:r.total, transaction_date:todayStr(),
      invoice_id: r.invoice_id || null,
    })
    load()
  }

  async function handleFileAttach(r, file) {
    if (!file) return
    setFileUploading(true)
    const url = await uploadFile(supabase, 'wht-files', file)
    await updateReceipt(r.id, { file_url: url })
    setFileUploading(false)
    setFileInput(null)
    load()
  }

  const filtered = rows.filter(r => {
    const ms = r.code?.includes(search)||r.customers?.name?.includes(search)||r.invoices?.code?.includes(search)
    const mf = filterPaid===''||( filterPaid==='paid'?r.paid:!r.paid)
    return ms && mf
  })

  const totalPaid    = rows.filter(r=>r.paid).reduce((s,r)=>s+(r.total||0),0)
  const totalPending = rows.filter(r=>!r.paid).reduce((s,r)=>s+(r.total||0),0)

  if (view) {
    const cust = view.customers || {}
    const inv  = view.invoices  || {}
    return (
      <div style={{ maxWidth:794, margin:'0 auto', padding:24 }}>
        <div className="no-print" style={{ display:'flex', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:8 }}>
          <button className="btn btn-outline" onClick={()=>setView(null)}>← กลับ</button>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            {!view.paid && (
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <select value={payMethod} onChange={e=>setPayMethod(e.target.value)} style={{ width:120 }}>
                  {['โอน','เงินสด','บัตรเครดิต','QR Code'].map(m=><option key={m}>{m}</option>)}
                </select>
                <button className="btn btn-primary" onClick={()=>{handlePay(view);setView(null)}}>✓ รับชำระเงิน</button>
              </div>
            )}
            {/* File attach */}
            <label className="btn btn-outline" style={{ cursor:'pointer', position:'relative' }}>
              📎 {fileUploading?'กำลังอัปโหลด...':view.file_url?'ดูเอกสาร':'แนบไฟล์'}
              {!view.file_url && !fileUploading && (
                <input type="file" style={{ position:'absolute', inset:0, opacity:0, cursor:'pointer' }}
                  onChange={e=>{ const f=e.target.files?.[0]; if(f) handleFileAttach(view,f) }} />
              )}
            </label>
            {view.file_url && (
              <a href={view.file_url} target="_blank" rel="noreferrer" className="btn btn-outline">🔗 เปิดไฟล์</a>
            )}
            <button className="btn btn-outline" onClick={()=>shareDoc({
              title:`ใบเสร็จ ${view.code}`,
              text:`ลูกค้า: ${cust.name||''}\nยอดชำระ: ฿${(view.total||0).toLocaleString()}\nสถานะ: ${view.paid?'ชำระแล้ว':'รอชำระ'}\n— C-Screen ${SHOP.tel}`
            })}>🔗 แชร์</button>
            <button className="btn btn-outline" onClick={()=>exportJpeg('print-area',`RC-${view.code}`)}>📷 JPEG</button>
            <button className="btn btn-outline" onClick={()=>printDoc()}>🖨️ พิมพ์</button>
          </div>
        </div>
        <div id="print-area" style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:8, padding:40, maxWidth:794 }}>
          {/* Header */}
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:24 }}>
            <div>
              <div style={{ fontSize:22, fontWeight:900, color:'var(--primary)' }}>C-SCREEN</div>
              <div style={{ fontSize:11, color:'#666', maxWidth:260, lineHeight:1.6 }}>
                {SHOP.address}<br/>Tel: {SHOP.tel} | Line: {SHOP.line}<br/>
                เลขประจำตัวผู้เสียภาษี: {SHOP.taxId}
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:24, fontWeight:900 }}>ใบเสร็จรับเงิน</div>
              <div style={{ color:'var(--primary)', fontFamily:'monospace', fontWeight:700 }}>{view.code}</div>
              <div style={{ fontSize:12, color:'#666' }}>วันที่: {fmtDate(view.created_at)}</div>
              {view.invoices?.code && <div style={{ fontSize:12, color:'#666' }}>อ้างอิง INV: {view.invoices.code}</div>}
            </div>
          </div>

          {/* Customer */}
          <div style={{ background:'#F9FAFB', borderRadius:8, padding:'12px 16px', marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#888', marginBottom:6 }}>ลูกค้า / BILL TO</div>
            <div style={{ fontSize:14, fontWeight:700 }}>{cust.name||'—'}</div>
            {cust.address && <div style={{ fontSize:12, color:'#666' }}>{cust.address}</div>}
            {cust.tax_id  && <div style={{ fontSize:12, color:'#666' }}>เลขผู้เสียภาษี: {cust.tax_id}</div>}
            {cust.phone   && <div style={{ fontSize:12, color:'#666' }}>Tel: {cust.phone}</div>}
          </div>

          {/* Items */}
          <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:16 }}>
            <thead>
              <tr style={{ background:'var(--primary)', color:'#fff' }}>
                <th style={{ padding:'8px 12px', textAlign:'left', fontSize:12 }}>รายการ</th>
                <th style={{ padding:'8px 12px', textAlign:'center', fontSize:12, width:60 }}>จำนวน</th>
                <th style={{ padding:'8px 12px', textAlign:'right', fontSize:12, width:110 }}>ราคา/หน่วย</th>
                <th style={{ padding:'8px 12px', textAlign:'right', fontSize:12, width:120 }}>จำนวนเงิน</th>
              </tr>
            </thead>
            <tbody>
              {(inv.items||[]).length > 0 ? inv.items.map((it,i) => (
                <tr key={i} style={{ borderBottom:'1px solid #eee' }}>
                  <td style={{ padding:'8px 12px', fontSize:13 }}>{it.desc}</td>
                  <td style={{ padding:'8px 12px', textAlign:'center', fontSize:13 }}>{it.qty}</td>
                  <td style={{ padding:'8px 12px', textAlign:'right', fontSize:13 }}>฿{(it.price||0).toLocaleString()}</td>
                  <td style={{ padding:'8px 12px', textAlign:'right', fontWeight:600, fontSize:13 }}>฿{(it.amount||0).toLocaleString()}</td>
                </tr>
              )) : (
                <tr style={{ borderBottom:'1px solid #eee' }}>
                  <td style={{ padding:'10px 12px', fontSize:13 }}>ค่าบริการ/สินค้า</td>
                  <td colSpan={2}></td>
                  <td style={{ padding:'10px 12px', textAlign:'right', fontWeight:700, fontSize:14 }}>฿{(view.total||0).toLocaleString()}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Summary */}
          <div style={{ display:'flex', justifyContent:'flex-end' }}>
            <div style={{ minWidth:220, fontSize:13 }}>
              {inv.subtotal > 0 && <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid #eee' }}>
                <span>ยอดรวม</span><span>฿{(inv.subtotal||0).toLocaleString()}</span>
              </div>}
              {(inv.discount||0) > 0 && <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid #eee', color:'var(--danger)' }}>
                <span>ส่วนลด</span><span>-฿{(inv.discount||0).toLocaleString()}</span>
              </div>}
              {(inv.vat_pct||0) > 0 && <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid #eee' }}>
                <span>VAT {inv.vat_pct}%</span><span>฿{(inv.vat_amount||0).toLocaleString()}</span>
              </div>}
              {(inv.wht_pct||0) > 0 && <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid #eee', color:'var(--danger)' }}>
                <span>หัก ณ ที่จ่าย {inv.wht_pct}%</span><span>-฿{(inv.wht_amount||0).toLocaleString()}</span>
              </div>}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', fontSize:16, fontWeight:800, color:'var(--primary)', borderTop:'2px solid var(--primary)', marginTop:4 }}>
                <span>ยอดสุทธิ</span><span>฿{(view.total||0).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop:20, display:'flex', gap:16, alignItems:'center', fontSize:13 }}>
            <span>วิธีชำระ: <strong>{view.payment_method||'—'}</strong></span>
            <span className={view.paid?'badge badge-green':'badge badge-yellow'}>{view.paid?'✓ ชำระแล้ว':'รอชำระ'}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
        {[
          { label:'ใบเสร็จทั้งหมด', value:rows.length+' ใบ', accent:'var(--primary)', icon:'🧾' },
          { label:'ชำระแล้ว', value:`฿${totalPaid.toLocaleString()}`, accent:'var(--success)', icon:'✅' },
          { label:'รอชำระ', value:`฿${totalPending.toLocaleString()}`, accent:'var(--warning)', icon:'⏳' },
          { label:'ค้างชำระ (ใบ)', value:rows.filter(r=>!r.paid).length+' ใบ', accent:'var(--danger)', icon:'⚠️' },
        ].map(k=>(
          <div key={k.label} style={{ background:'var(--card)', borderRadius:'var(--radius)', padding:'16px 18px', boxShadow:'var(--shadow)', border:'1px solid var(--border)', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, width:4, height:'100%', background:k.accent, borderRadius:'10px 0 0 10px' }} />
            <div style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', fontSize:28, opacity:.1 }}>{k.icon}</div>
            <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase' }}>{k.label}</div>
            <div style={{ fontSize:22, fontWeight:800, color:k.accent, marginTop:4 }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:8 }}>
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }}>🔍</span>
            <input type="text" placeholder="ค้นหาใบเสร็จ..." value={search}
              onChange={e=>setSearch(e.target.value)} style={{ paddingLeft:36, width:220 }} />
          </div>
          {[['','ทั้งหมด'],['paid','ชำระแล้ว'],['unpaid','รอชำระ']].map(([v,l])=>(
            <button key={v} onClick={()=>setFilter(v)}
              className={filterPaid===v?'btn btn-primary btn-sm':'btn btn-outline btn-sm'}>{l}</button>
          ))}
        </div>
      </div>

      <div className="card" style={{ overflow:'hidden' }}>
        {loading ? <LoadingSpinner /> : (
          <>
            <div style={{ overflowX:'auto' }}>
              <table>
                <thead>
                  <tr><th>เลขที่</th><th>วันที่</th><th>ลูกค้า</th><th>อ้างอิง Invoice</th><th>มูลค่า</th><th>วิธีชำระ</th><th>สถานะ</th><th></th></tr>
                </thead>
                <tbody>
                  {filtered.map(r=>(
                    <tr key={r.id} className="row-link">
                      <td style={{ color:'var(--primary)', fontFamily:'monospace', fontWeight:700 }}>{r.code}</td>
                      <td style={{ fontSize:12, color:'var(--text-muted)' }}>{fmtDate(r.created_at)}</td>
                      <td style={{ fontWeight:600 }}>{r.customers?.name||'—'}</td>
                      <td style={{ color:'var(--info)', fontWeight:600, fontSize:13 }}>{r.invoices?.code||'—'}</td>
                      <td style={{ fontWeight:800, fontSize:14 }}>฿{(r.total||0).toLocaleString()}</td>
                      <td>{r.paid?<span className="badge badge-gray">{r.payment_method||'โอน'}</span>:<span style={{ color:'var(--text-muted)', fontSize:12 }}>—</span>}</td>
                      <td><span className={r.paid?'badge badge-green':'badge badge-yellow'}>{r.paid?'✓ ชำระแล้ว':'รอชำระ'}</span></td>
                      <td style={{ display:'flex', gap:4 }}>
                        <button className="btn btn-outline btn-sm" onClick={()=>setView(r)}>ดู</button>
                        {!r.paid && <button className="btn btn-primary btn-sm" onClick={()=>{setView(r)}}>รับชำระ</button>}
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
