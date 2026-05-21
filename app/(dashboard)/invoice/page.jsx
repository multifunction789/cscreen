'use client'
import { useState, useEffect } from 'react'
import {
  getInvoices, insertInvoice, updateInvoice, deleteInvoice,
  getCustomers, insertJobOrder, getJobOrders,
  getMaterials, deductMaterial,
} from '@/lib/db'
import { fmtDate, SHOP } from '@/lib/shop'
import { todayStr, exportJpeg, shareDoc, printDoc } from '@/lib/docUtils'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const emptyItem = { desc: '', qty: 1, price: 0, amount: 0, material_id: null }

/* ── Thai Baht → Words ─────────────────────────────────── */
function thaiAmountToWords(amount) {
  const ones = ['','หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า']
  const pos  = ['','สิบ','ร้อย','พัน','หมื่น','แสน']
  function chunk(n) {
    if (n === 0) return ''
    const s = String(n); let out = ''
    for (let i = 0; i < s.length; i++) {
      const d = parseInt(s[i]), p = s.length - i - 1
      if (d === 0) continue
      if (p === 1 && d === 1) { out += 'สิบ'; continue }
      if (p === 1 && d === 2) { out += 'ยี่สิบ'; continue }
      out += ones[d] + pos[p]
    }
    return out
  }
  const fixed = parseFloat(amount || 0).toFixed(2)
  const [bStr, sStr] = fixed.split('.')
  const baht = parseInt(bStr), satang = parseInt(sStr)
  let result = baht === 0 ? 'ศูนย์'
    : baht >= 1000000 ? chunk(Math.floor(baht/1000000)) + 'ล้าน' + chunk(baht % 1000000)
    : chunk(baht)
  result += 'บาท'
  if (satang > 0) result += chunk(satang) + 'สตางค์'
  return result + 'ถ้วน'
}

function calcItems(items) {
  return items.map(it => ({ ...it, amount: (parseFloat(it.qty)||0) * (parseFloat(it.price)||0) }))
}
const emptyForm = () => ({
  customer_id:'', due_date:'', document_date:todayStr(), notes:'', vat_pct:0, discount:0, wht_pct:0,
  items:[{ ...emptyItem }],
})

export default function InvoicePage() {
  const [rows, setRows]           = useState([])
  const [customers, setCustomers] = useState([])
  const [jobs, setJobs]           = useState([])
  const [materials, setMaterials] = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [showForm, setShowForm]   = useState(false)
  const [view, setView]           = useState(null)
  const [saving, setSaving]       = useState(false)
  const [editId, setEditId]       = useState(null)
  const [form, setForm]           = useState(emptyForm())

  useEffect(() => { load() }, [])

  async function load() {
    const [invRes, cusRes, jobRes, matRes] = await Promise.all([
      getInvoices(), getCustomers(), getJobOrders(), getMaterials(),
    ])
    setRows(invRes.data    || [])
    setCustomers(cusRes.data  || [])
    setJobs(jobRes.data   || [])
    setMaterials(matRes.data  || [])
    setLoading(false)
  }

  function updateItem(idx, key, val) {
    setForm(f => {
      const items = [...f.items]
      items[idx] = { ...items[idx], [key]: val }
      return { ...f, items: calcItems(items) }
    })
  }
  const addItem    = () => setForm(f => ({ ...f, items: [...f.items, { ...emptyItem }] }))
  const removeItem = i  => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))
  function addItemFromStock(mat) {
    setForm(f => ({ ...f, items: calcItems([...f.items, { desc:mat.name, qty:1, price:0, amount:0, material_id:mat.id }]) }))
  }

  const subtotal = form.items.reduce((s, it) => s + (it.amount||0), 0)
  const discAmt  = parseFloat(form.discount) || 0
  const vatAmt   = ((subtotal - discAmt) * (parseFloat(form.vat_pct)||0)) / 100
  const whtAmt   = ((subtotal - discAmt) * (parseFloat(form.wht_pct)||0)) / 100
  const total    = subtotal - discAmt + vatAmt - whtAmt

  async function handleSave() {
    if (!form.customer_id) return alert('กรุณาเลือกลูกค้า')
    if (form.items.length === 0) return alert('กรุณาเพิ่มรายการสินค้า')
    setSaving(true)
    const items = calcItems(form.items)
    const payload = {
      customer_id: form.customer_id, items, subtotal, discount: discAmt,
      vat_pct: parseFloat(form.vat_pct)||0, vat_amount: vatAmt,
      wht_pct: parseFloat(form.wht_pct)||0, wht_amount: whtAmt,
      total, due_date: form.due_date||null,
      document_date: form.document_date||todayStr(), notes: form.notes,
    }
    if (editId) {
      await updateInvoice(editId, payload)
      setEditId(null)
    } else {
      const maxNum = rows.reduce((max, r) => {
        const n = parseInt(r.code?.replace('INV-','')||'0'); return n > max ? n : max
      }, 0)
      const code = 'INV-' + String(maxNum + 1).padStart(4,'0')
      await insertInvoice({ ...payload, code })
      for (const it of items) {
        if (it.material_id && it.qty > 0) await deductMaterial(it.material_id, parseFloat(it.qty))
      }
    }
    setForm(emptyForm()); setShowForm(false); setSaving(false)
    load()
  }

  async function handleDelete(inv) {
    if (!confirm(`ลบ ${inv.code} ใช่ไหม?`)) return
    await deleteInvoice(inv.id); load()
  }

  function startEdit(inv) {
    setEditId(inv.id)
    setForm({
      customer_id: inv.customer_id, due_date: inv.due_date||'',
      document_date: inv.document_date||todayStr(), notes: inv.notes||'',
      vat_pct: inv.vat_pct||0, discount: inv.discount||0, wht_pct: inv.wht_pct||0,
      items: inv.items||[{...emptyItem}],
    })
    setShowForm(true)
    window.scrollTo({ top:0, behavior:'smooth' })
  }

  async function handleConvertToJO(inv) {
    const existJO = jobs.find(j => j.invoice_id === inv.id)
    if (existJO) return alert(`มีใบงาน ${existJO.code} อยู่แล้ว`)
    const maxJO = jobs.reduce((max, j) => {
      const n = parseInt(j.code?.replace('JO-','')||'0'); return n > max ? n : max
    }, 0)
    const code    = 'JO-' + String(maxJO + 1).padStart(4,'0')
    const defSizes = ['S','M','L','XL','XXL']
    await insertJobOrder({
      code, customer_id: inv.customer_id, invoice_id: inv.id,
      item_desc: (inv.items||[]).map(it => it.desc).join(', '),
      status: 'รอออกแบบ',
      items: {
        type: 'size_matrix', sizes: defSizes,
        rows: (inv.items||[]).map(it => ({
          style: it.desc||'',
          qtys: Object.fromEntries(defSizes.map(s => [s,''])),
        })),
      },
    })
    await updateInvoice(inv.id, { jo_created: true })
    alert(`✅ สร้างใบงาน ${code} แล้ว`)
    load()
    setView(v => v ? { ...v, jo_created: true } : v)
  }

  const filtered = rows.filter(r =>
    r.code?.includes(search) || r.customers?.name?.includes(search)
  )
  const totalAmount = rows.reduce((s,r) => s+(r.total||0), 0)
  const withJO      = rows.filter(r => jobs.some(j => j.invoice_id===r.id)).length

  // ──── DETAIL / PRINT VIEW ────────────────────────────────────
  if (view) {
    const cust  = customers.find(c => c.id===view.customer_id) || view.customers || {}
    const relJO = jobs.find(j => j.invoice_id===view.id)

    return (
      <div style={{ maxWidth:794, margin:'0 auto', padding:24 }}>
        <div className="no-print" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, gap:8, flexWrap:'wrap' }}>
          <button className="btn btn-outline" onClick={() => setView(null)}>← กลับ</button>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button className="btn btn-outline" onClick={() => { startEdit(view); setView(null) }}>✏️ แก้ไข</button>
            {!relJO && (
              <button className="btn btn-outline" onClick={() => handleConvertToJO(view)}>📝 สร้างใบงาน</button>
            )}
            <button className="btn btn-outline" onClick={() => shareDoc({
              title:`ใบแจ้งหนี้ ${view.code}`,
              text:`ลูกค้า: ${cust.name||''}\nยอดสุทธิ: ฿${(view.total||0).toLocaleString()}\nครบกำหนด: ${view.due_date?fmtDate(view.due_date):'-'}\n— C-Screen ${SHOP.tel}`
            })}>🔗 แชร์</button>
            <button className="btn btn-outline" onClick={() => exportJpeg('print-area',`INV-${view.code}`)}>📷 JPEG</button>
            <button className="btn btn-primary" onClick={() => printDoc()}>🖨️ พิมพ์</button>
          </div>
        </div>

        {relJO && (
          <div className="no-print" style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, padding:'8px 14px', background:'#EFF6FF', borderRadius:8, fontSize:13 }}>
            <span style={{ color:'#666' }}>ใบงาน:</span>
            <span style={{ fontFamily:'monospace', fontWeight:700, color:'var(--primary)' }}>{relJO.code}</span>
            <span className={relJO.status==='ส่งงานแล้ว'?'badge badge-green':'badge badge-blue'}>{relJO.status}</span>
            {relJO.due_date && <span style={{ fontSize:12, color:'#888' }}>กำหนดส่ง: {fmtDate(relJO.due_date)}</span>}
          </div>
        )}

        {/* INVOICE PRINT AREA — A4 Portrait */}
        <div id="print-area" style={{
          position:'relative', background:'#fff', width:754, margin:'0 auto',
          fontFamily:'"Sarabun", Arial, Tahoma, sans-serif',
          fontSize:11, color:'#111827', lineHeight:1.5, overflow:'hidden',
          border:'1px solid #e5e7eb', borderRadius:4,
        }}>
          {/* Top stripe */}
          <div style={{ height:7, background:'linear-gradient(90deg,#6D0000,#B80F0B,#E53935)' }} />

          {/* Watermark */}
          <div style={{
            position:'absolute', right:-30, top:110, fontSize:96, fontWeight:900,
            color:'rgba(184,15,11,.04)', letterSpacing:3, transform:'rotate(-90deg)',
            pointerEvents:'none', userSelect:'none',
          }}>C-SCREEN</div>

          <div style={{ padding:'18px 26px 22px' }}>

            {/* ── HEADER ── */}
            <div style={{
              display:'grid', gridTemplateColumns:'1.35fr .65fr', gap:16,
              paddingBottom:14, borderBottom:'1px solid #e5e7eb',
            }}>
              {/* Brand */}
              <div style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                <img src="/logo.jpg" alt="C-Screen"
                  style={{ height:64, width:64, objectFit:'contain', borderRadius:10, flexShrink:0 }} />
                <div style={{ lineHeight:1.7 }}>
                  <div style={{ fontWeight:900, fontSize:13, color:'#111' }}>
                    ร้าน C-Screen สกรีนเสื้อ-ตัด-เย็บ-ปัก ครบวงจร - หนองจอก
                  </div>
                  <div style={{ fontSize:9.5, color:'#374151' }}>
                    68/148 หมู่บ้านอมรทรัพย์ ซอยอยู่วิทยา 18 ถนนสุวินทวงศ์ แขวงกระทุ่มราย
                  </div>
                  <div style={{ fontSize:9.5, color:'#374151' }}>
                    เขตหนองจอก กรุงเทพมหานคร 10530 &nbsp;เลขประจำตัวผู้เสียภาษี {SHOP.taxId}
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:5 }}>
                    {[`Tel: ${SHOP.tel}`, `LINE: ${SHOP.line}`, `FB: ${SHOP.fb}`, 'TT: ซีสกรีน'].map(t => (
                      <span key={t} style={{
                        padding:'2px 7px', borderRadius:99, background:'#FEF2F2',
                        color:'#8B0000', fontSize:9.5, fontWeight:700,
                        border:'1px solid rgba(184,15,11,.15)',
                      }}>{t}</span>
                    ))}
                  </div>
                </div>
              </div>
              {/* Doc badge */}
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:28, fontWeight:900, color:'#B80F0B', lineHeight:1 }}>ใบแจ้งหนี้</div>
                <div style={{ fontSize:11, letterSpacing:2, color:'#6b7280', fontWeight:700, marginTop:3 }}>INVOICE</div>
                <div style={{
                  display:'inline-block', marginTop:8,
                  padding:'4px 10px', borderRadius:99, background:'#fff7ed',
                  color:'#9a3412', fontSize:11, fontWeight:800, border:'1px solid #fed7aa',
                }}>รอชำระเงิน</div>
                <div style={{ fontSize:10, lineHeight:2, marginTop:6, color:'#6b7280' }}>
                  <div><span style={{ color:'#aaa' }}>เลขที่ </span>
                    <strong style={{ fontFamily:'monospace', fontSize:12, color:'#B80F0B' }}>{view.code}</strong>
                  </div>
                  <div><span style={{ color:'#aaa' }}>วันที่ </span>
                    <strong>{fmtDate(view.document_date||view.created_at)}</strong>
                  </div>
                  {view.due_date && <div><span style={{ color:'#aaa' }}>ครบกำหนด </span>
                    <strong style={{ color:'#B80F0B' }}>{fmtDate(view.due_date)}</strong>
                  </div>}
                </div>
              </div>
            </div>

            {/* ── INFO GRID ── */}
            <div style={{ display:'grid', gridTemplateColumns:'1.1fr .9fr', gap:12, marginTop:12 }}>
              {/* Customer */}
              <div style={{ border:'1px solid #e5e7eb', borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'7px 12px', background:'linear-gradient(90deg,#FEF2F2,#fff)', borderBottom:'1px solid #e5e7eb', fontSize:11, color:'#8B0000', fontWeight:900, letterSpacing:.2 }}>
                  ข้อมูลลูกค้า / BILL TO
                </div>
                <div style={{ padding:'10px 12px', fontSize:12, lineHeight:1.9 }}>
                  {[
                    { l:'ชื่อ / บริษัท', v:cust.name||view.customers?.name||'—', bold:true },
                    cust.phone   && { l:'โทรศัพท์', v:cust.phone },
                    cust.address && { l:'ที่อยู่',   v:cust.address },
                    cust.tax_id  && { l:'Tax ID',    v:cust.tax_id },
                  ].filter(Boolean).map(r => (
                    <div key={r.l} style={{ display:'grid', gridTemplateColumns:'80px 1fr', gap:8, margin:'2px 0' }}>
                      <span style={{ color:'#6b7280' }}>{r.l}</span>
                      <span style={{ fontWeight: r.bold ? 800 : 600, color:'#111' }}>{r.v}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Doc meta */}
              <div style={{ border:'1px solid #e5e7eb', borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'7px 12px', background:'linear-gradient(90deg,#FEF2F2,#fff)', borderBottom:'1px solid #e5e7eb', fontSize:11, color:'#8B0000', fontWeight:900, letterSpacing:.2 }}>
                  รายละเอียดเอกสาร / DOCUMENT
                </div>
                <div style={{ padding:'10px 12px', fontSize:12, lineHeight:1.9 }}>
                  {[
                    { l:'เลขที่ IV',   v:view.code,                                red:true },
                    { l:'วันที่ออก',  v:fmtDate(view.document_date||view.created_at) },
                    view.due_date && { l:'ครบกำหนด', v:fmtDate(view.due_date),     red:true },
                    { l:'เงื่อนไข',  v:'มัดจำ 50% ก่อนผลิต' },
                  ].filter(Boolean).map(r => (
                    <div key={r.l} style={{ display:'grid', gridTemplateColumns:'80px 1fr', gap:8, margin:'2px 0' }}>
                      <span style={{ color:'#6b7280' }}>{r.l}</span>
                      <span style={{ fontWeight:700, textAlign:'right', color: r.red?'#B80F0B':'#111' }}>{r.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── ITEMS TABLE ── */}
            <table style={{
              width:'100%', borderCollapse:'separate', borderSpacing:0,
              marginTop:14, fontSize:12,
              border:'1px solid #e5e7eb', borderRadius:12, overflow:'hidden',
            }}>
              <thead>
                <tr style={{ background:'#B80F0B', color:'#fff' }}>
                  {[
                    { h:'#',                            w:36,  a:'center' },
                    { h:'รายการสินค้า / รายละเอียดงาน', w:null, a:'left'   },
                    { h:'จำนวน',                        w:62,  a:'center' },
                    { h:'ราคา/หน่วย',                   w:90,  a:'right'  },
                    { h:'จำนวนเงิน',                    w:100, a:'right'  },
                  ].map((c,i) => (
                    <th key={i} style={{ padding:'8px 10px', fontWeight:900, fontSize:11.5,
                      textAlign:c.a, width:c.w||undefined,
                      borderRight: i<4 ? '1px solid rgba(255,255,255,.18)' : 'none',
                    }}>{c.h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(view.items||[]).map((it,i) => (
                  <tr key={i} style={{ borderBottom:'1px solid #f0f0f0', background:i%2===1?'#fffafa':'#fff' }}>
                    <td style={{ padding:'8px 10px', textAlign:'center', color:'#9ca3af', borderRight:'1px solid #f0f0f0' }}>{i+1}</td>
                    <td style={{ padding:'8px 10px', fontWeight:600, borderRight:'1px solid #f0f0f0' }}>{it.desc}</td>
                    <td style={{ padding:'8px 10px', textAlign:'center', borderRight:'1px solid #f0f0f0' }}>{it.qty}</td>
                    <td style={{ padding:'8px 10px', textAlign:'right', fontFamily:'monospace', borderRight:'1px solid #f0f0f0' }}>
                      {(it.price||0).toLocaleString(undefined,{minimumFractionDigits:2})}
                    </td>
                    <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, fontFamily:'monospace' }}>
                      {(it.amount||0).toLocaleString(undefined,{minimumFractionDigits:2})}
                    </td>
                  </tr>
                ))}
                {Array.from({ length: Math.max(0, 6-(view.items||[]).length) }).map((_,i) => (
                  <tr key={`f${i}`} style={{ borderBottom:'1px solid #f5eded', height:26 }}>
                    <td style={{ borderRight:'1px solid #f0f0f0' }} />
                    <td style={{ borderRight:'1px solid #f0f0f0' }} />
                    <td style={{ borderRight:'1px solid #f0f0f0' }} />
                    <td style={{ borderRight:'1px solid #f0f0f0' }} />
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ── AMOUNT IN WORDS ── */}
            <div style={{
              marginTop:10, border:'1px solid rgba(184,15,11,.18)', background:'#FEF2F2',
              borderRadius:12, padding:'9px 14px',
              display:'grid', gridTemplateColumns:'120px 1fr', gap:10, alignItems:'center', fontSize:12,
            }}>
              <strong style={{ color:'#8B0000' }}>รวมจำนวนเงิน</strong>
              <div style={{ color:'#5B0000', fontWeight:600 }}>{thaiAmountToWords(view.total||0)}</div>
            </div>

            {/* ── SUMMARY SECTION: Notes + Totals ── */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 290px', gap:14, marginTop:12, alignItems:'start' }}>
              {/* Notes */}
              <div style={{
                border:'1px dashed #cbd5e1', borderRadius:12, padding:12,
                background:'#fcfcfc', minHeight:148, fontSize:11.5, color:'#374151', lineHeight:1.85,
              }}>
                <div style={{ fontWeight:900, color:'#8B0000', marginBottom:6 }}>หมายเหตุ / เงื่อนไขการผลิต</div>
                {view.notes
                  ? <span>{view.notes}</span>
                  : <>
                      1) เริ่มผลิตหลังได้รับมัดจำและลูกค้ายืนยันแบบ Artwork เท่านั้น<br/>
                      2) ระยะเวลาผลิตประมาณ 5–7 วันทำการ หลังยืนยันแบบ<br/>
                      3) สีจริงอาจแตกต่างจากหน้าจอเล็กน้อย ขึ้นอยู่กับเนื้อผ้าและระบบพิมพ์<br/>
                      4) งานสั่งผลิตเฉพาะ ไม่รับยกเลิกหลังเริ่มผลิต<br/>
                      5) กรุณาตรวจสอบรายการและจำนวนก่อนชำระเงิน
                    </>
                }
              </div>
              {/* Totals */}
              <div style={{ border:'1px solid #e5e7eb', borderRadius:12, overflow:'hidden', fontSize:12.5, boxShadow:'0 4px 12px rgba(17,24,39,.05)' }}>
                {[
                  { l:'ยอดก่อนส่วนลด', v:(view.subtotal||0).toLocaleString(undefined,{minimumFractionDigits:2}) },
                  ...(view.discount>0      ? [{ l:'ส่วนลด',                 v:`-${(view.discount||0).toLocaleString(undefined,{minimumFractionDigits:2})}`, red:true }]:[]),
                  ...(view.vat_pct>0      ? [{ l:`VAT ${view.vat_pct}%`,    v:(view.vat_amount||0).toLocaleString(undefined,{minimumFractionDigits:2}) }]:[]),
                  ...((view.wht_pct||0)>0 ? [{ l:`หัก ณ ที่จ่าย ${view.wht_pct}%`, v:`-${(view.wht_amount||0).toLocaleString(undefined,{minimumFractionDigits:2})}`, red:true }]:[]),
                ].map(r => (
                  <div key={r.l} style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'8px 12px', borderBottom:'1px solid #f0f0f0' }}>
                    <span style={{ color:'#6b7280' }}>{r.l}</span>
                    <strong style={{ fontFamily:'monospace', color: r.red?'#dc2626':'#111' }}>{r.v}</strong>
                  </div>
                ))}
                {/* Grand total */}
                <div style={{ display:'flex', justifyContent:'space-between', padding:'11px 12px', background:'linear-gradient(90deg,#B80F0B,#8B0000)', color:'#fff', fontSize:17, fontWeight:900 }}>
                  <span>ยอดสุทธิ</span>
                  <span style={{ fontFamily:'monospace' }}>{(view.total||0).toLocaleString(undefined,{minimumFractionDigits:2})}</span>
                </div>
                <div style={{ padding:'4px 12px 6px', textAlign:'right', fontSize:10, color:'#9ca3af' }}>บาท (THB)</div>
              </div>
            </div>

            {/* ── PAYMENT ── */}
            <div style={{
              marginTop:12, display:'grid', gridTemplateColumns:'1fr 132px', gap:14,
              alignItems:'center', border:'1px solid rgba(184,15,11,.18)',
              borderRadius:12, padding:13, background:'linear-gradient(135deg,#fff,#FEF2F2)',
            }}>
              <div>
                <div style={{ fontSize:12, color:'#8B0000', fontWeight:900, marginBottom:7 }}>
                  ช่องทางชำระเงิน / PAYMENT METHOD
                </div>
                <div style={{ fontSize:16, fontWeight:900, letterSpacing:.4, color:'#111', marginBottom:3 }}>
                  {SHOP.bankAccount} ธนาคารกสิกรไทย
                </div>
                <div style={{ fontSize:12, color:'#374151', margin:'2px 0' }}>
                  ชื่อบัญชี: {SHOP.bankName}
                </div>
                <div style={{ fontSize:10.5, color:'#555', marginTop:5 }}>
                  หลังโอนเงิน กรุณาส่งสลิปพร้อมแจ้งเลขที่ใบแจ้งหนี้&nbsp;
                  <strong>{view.code}</strong>&nbsp;ทาง LINE:&nbsp;<strong>{SHOP.line}</strong>
                </div>
              </div>
              <div style={{
                width:126, height:126, borderRadius:12,
                border:'2px dashed rgba(184,15,11,.4)', background:'#fff',
                overflow:'hidden', flexShrink:0,
              }}>
                <img src="/invoice-sample.jpg" alt="QR PromptPay"
                  style={{ width:'100%', height:'100%', objectFit:'contain' }} />
              </div>
            </div>

            {/* ── SIGNATURE ── */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginTop:14, fontSize:12 }}>
              {['ผู้รับเอกสาร / ลูกค้า', 'ผู้ออกเอกสาร / C-SCREEN'].map(t => (
                <div key={t} style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:12, minHeight:88 }}>
                  <div style={{ fontWeight:900, color:'#374151' }}>{t}</div>
                  <div style={{ marginTop:44, borderTop:'1px solid #9ca3af', paddingTop:6, textAlign:'center', color:'#6b7280' }}>
                    ลงชื่อ / วันที่
                  </div>
                </div>
              ))}
            </div>

            {/* ── PRINT HINT ── */}
            <div style={{ marginTop:10, textAlign:'center', color:'#9ca3af', fontSize:10.5 }}>
              เอกสารนี้จัดทำโดยระบบ C-SCREEN · ใช้สำหรับแจ้งยอดชำระค่าสินค้าและบริการ
            </div>
          </div>{/* /inner pad */}
        </div>
      </div>
    )
  }

  // ──── LIST VIEW ──────────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* KPI */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
        {[
          { label:'ใบแจ้งหนี้ทั้งหมด', value:rows.length+' ใบ',               accent:'var(--primary)', icon:'📄' },
          { label:'มูลค่ารวม',          value:`฿${totalAmount.toLocaleString()}`, accent:'var(--info)',    icon:'💰' },
          { label:'มีใบงานแล้ว',        value:withJO+' ใบ',                    accent:'var(--success)', icon:'✅' },
        ].map(k => (
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
        <div style={{ position:'relative' }}>
          <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }}>🔍</span>
          <input type="text" placeholder="ค้นหาใบแจ้งหนี้..." value={search}
            onChange={e => setSearch(e.target.value)} style={{ paddingLeft:36, width:240 }} />
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ ปิด' : '+ สร้างใบแจ้งหนี้'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card" style={{ padding:20 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:16 }}>{editId ? '✏️ แก้ไขใบแจ้งหนี้' : '➕ ใบแจ้งหนี้ใหม่'}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label>ลูกค้า *</label>
              <select value={form.customer_id} onChange={e => setForm({...form, customer_id:e.target.value})}>
                <option value="">— เลือกลูกค้า —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label>วันที่เอกสาร</label>
              <input type="date" value={form.document_date} onChange={e => setForm({...form, document_date:e.target.value})} />
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label>ครบกำหนดชำระ</label>
              <input type="date" value={form.due_date} onChange={e => setForm({...form, due_date:e.target.value})} />
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label>VAT (%)</label>
              <select value={form.vat_pct} onChange={e => setForm({...form, vat_pct:e.target.value})}>
                <option value={0}>ไม่มี VAT</option>
                <option value={7}>7%</option>
              </select>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label>หัก ณ ที่จ่าย (%)</label>
              <select value={form.wht_pct} onChange={e => setForm({...form, wht_pct:e.target.value})}>
                <option value={0}>ไม่มี</option>
                <option value={3}>3%</option>
                <option value={5}>5%</option>
              </select>
            </div>
          </div>

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
                {form.items.map((it,i) => (
                  <tr key={i}>
                    <td style={{ padding:'4px 6px' }}>
                      <input type="text" placeholder="รายละเอียด" value={it.desc}
                        onChange={e => updateItem(i,'desc',e.target.value)} style={{ width:'100%' }} />
                    </td>
                    <td style={{ padding:'4px 6px' }}>
                      <input type="number" min="1" value={it.qty} onChange={e => updateItem(i,'qty',e.target.value)} />
                    </td>
                    <td style={{ padding:'4px 6px' }}>
                      <input type="number" min="0" value={it.price} onChange={e => updateItem(i,'price',e.target.value)} />
                    </td>
                    <td style={{ padding:'4px 10px', textAlign:'right', fontWeight:700, fontSize:13 }}>฿{(it.amount||0).toLocaleString()}</td>
                    <td style={{ padding:'4px 6px', textAlign:'center' }}>
                      {form.items.length > 1 && (
                        <button onClick={() => removeItem(i)} style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer', fontSize:16 }}>×</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap', alignItems:'center' }}>
              <button className="btn btn-outline btn-sm" onClick={addItem}>+ เพิ่มรายการ</button>
              <select style={{ fontSize:12, padding:'5px 10px' }} defaultValue="" onChange={e => {
                const mat = materials.find(m => m.id===e.target.value)
                if (mat) { addItemFromStock(mat); e.target.value='' }
              }}>
                <option value="">📦 เพิ่มจากสต๊อก...</option>
                {materials.map(m => <option key={m.id} value={m.id}>{m.name} (เหลือ: {m.qty} {m.unit})</option>)}
              </select>
            </div>
          </div>

          <div style={{ display:'flex', justifyContent:'flex-end', gap:20, alignItems:'flex-start' }}>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label style={{ fontSize:12 }}>ส่วนลด (฿)</label>
              <input type="number" min="0" value={form.discount} style={{ width:120 }}
                onChange={e => setForm({...form, discount:e.target.value})} />
            </div>
            <div style={{ minWidth:200, fontSize:13 }}>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 0' }}><span>ยอดรวม</span><span>฿{subtotal.toLocaleString()}</span></div>
              {discAmt>0 && <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', color:'var(--danger)' }}><span>ส่วนลด</span><span>-฿{discAmt.toLocaleString()}</span></div>}
              {vatAmt>0  && <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 0' }}><span>VAT {form.vat_pct}%</span><span>฿{vatAmt.toFixed(2)}</span></div>}
              {whtAmt>0  && <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', color:'var(--danger)' }}><span>หัก ณ ที่จ่าย {form.wht_pct}%</span><span>-฿{whtAmt.toFixed(2)}</span></div>}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', fontWeight:800, fontSize:15, color:'var(--primary)', borderTop:'2px solid var(--primary)', marginTop:4 }}>
                <span>ยอดสุทธิ</span><span>฿{total.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:4, marginTop:8 }}>
            <label style={{ fontSize:12 }}>หมายเหตุ</label>
            <input type="text" placeholder="หมายเหตุ / เงื่อนไขการชำระเงิน"
              value={form.notes} onChange={e => setForm({...form, notes:e.target.value})} />
          </div>

          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'กำลังบันทึก...' : '💾 บันทึกใบแจ้งหนี้'}
            </button>
            <button className="btn btn-outline" onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm()) }}>ยกเลิก</button>
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
                  <tr>
                    <th>เลขที่</th><th>ใบงาน</th><th>วันที่</th>
                    <th>ลูกค้า</th><th>รายการ</th><th>ยอดรวม</th><th>ครบกำหนด</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const relJO = jobs.find(j => j.invoice_id===r.id)
                    return (
                      <tr key={r.id} className="row-link">
                        <td style={{ color:'var(--primary)', fontFamily:'monospace', fontWeight:700 }}>{r.code}</td>
                        <td style={{ fontSize:12, fontFamily:'monospace' }}>
                          {relJO
                            ? <span style={{ color:'var(--info)', fontWeight:600 }}>{relJO.code}</span>
                            : <span style={{ color:'var(--text-muted)' }}>—</span>}
                        </td>
                        <td style={{ fontSize:12, color:'var(--text-muted)' }}>{fmtDate(r.document_date||r.created_at)}</td>
                        <td style={{ fontWeight:600 }}>{r.customers?.name||'—'}</td>
                        <td style={{ fontSize:12, color:'var(--text-muted)' }}>{(r.items||[]).map(i=>i.desc).join(', ').slice(0,30)||'—'}</td>
                        <td style={{ fontWeight:800, color:'var(--primary)' }}>฿{(r.total||0).toLocaleString()}</td>
                        <td style={{ fontSize:12, color:'var(--text-muted)' }}>{fmtDate(r.due_date)}</td>
                        <td style={{ display:'flex', gap:4 }}>
                          <button className="btn btn-outline btn-sm" onClick={() => setView(r)}>ดู</button>
                          <button className="btn btn-outline btn-sm" onClick={() => startEdit(r)}>✏️</button>
                          {!relJO && (
                            <button className="btn btn-outline btn-sm" onClick={() => handleConvertToJO(r)}>→ JO</button>
                          )}
                          {!relJO && (
                            <button className="btn btn-outline btn-sm" style={{ color:'var(--danger)' }} onClick={() => handleDelete(r)}>ลบ</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
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
