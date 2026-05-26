'use client'
import { useState, useEffect } from 'react'
import {
  getInvoices, insertInvoice, updateInvoice, deleteInvoice,
  getCustomers, insertJobOrder, getJobOrders,
  getMaterials, deductMaterial,
  getReceipts, insertReceipt,
} from '@/lib/db'
import { fmtDate, SHOP } from '@/lib/shop'
import { todayStr, exportJpeg, shareDoc, printDoc } from '@/lib/docUtils'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const emptyItem = { desc: '', qty: 1, price: 0, amount: 0, material_id: null, sizes: {} }

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
  customer_id:'', due_date:'', document_date:todayStr(),
  notes:'', vat_pct:0, discount:0, wht_pct:0,
  deposit_amount: '',
  items:[{ ...emptyItem }],
})

export default function InvoicePage() {
  const [rows, setRows]           = useState([])
  const [customers, setCustomers] = useState([])
  const [jobs, setJobs]           = useState([])
  const [materials, setMaterials] = useState([])
  const [receipts, setReceipts]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [showForm, setShowForm]   = useState(false)
  const [view, setView]           = useState(null)
  const [saving, setSaving]       = useState(false)
  const [editId, setEditId]       = useState(null)
  const [form, setForm]           = useState(emptyForm())
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7))

  useEffect(() => { load() }, [])

  async function load() {
    const [invRes, cusRes, jobRes, matRes, recRes] = await Promise.all([
      getInvoices(), getCustomers(), getJobOrders(), getMaterials(), getReceipts(),
    ])
    setRows(invRes.data    || [])
    setCustomers(cusRes.data  || [])
    setJobs(jobRes.data   || [])
    setMaterials(matRes.data  || [])
    setReceipts(recRes.data   || [])
    setLoading(false)
  }

  function updateItem(idx, key, val) {
    setForm(f => {
      const items = [...f.items]
      if (key === 'sizes') {
        const clean = Object.fromEntries(Object.entries(val).filter(([s]) => s !== 'XXL'))
        const sizeTotal = Object.values(clean).reduce((s, v) => s + (parseInt(v) || 0), 0)
        items[idx] = { ...items[idx], sizes: clean, ...(sizeTotal > 0 ? { qty: sizeTotal } : {}) }
      } else {
        items[idx] = { ...items[idx], [key]: val }
      }
      return { ...f, items: calcItems(items) }
    })
  }
  const addItem    = () => setForm(f => ({ ...f, items: [...f.items, { ...emptyItem }] }))
  const removeItem = i  => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))
  function addItemFromStock(mat) {
    setForm(f => ({ ...f, items: calcItems([...f.items, { desc:mat.name, qty:1, price:0, amount:0, material_id:mat.id, sizes:{} }]) }))
  }

  const subtotal   = form.items.reduce((s, it) => s + (it.amount||0), 0)
  const discAmt    = parseFloat(form.discount) || 0
  const vatAmt     = ((subtotal - discAmt) * (parseFloat(form.vat_pct)||0)) / 100
  const whtAmt     = ((subtotal - discAmt) * (parseFloat(form.wht_pct)||0)) / 100
  const total      = subtotal - discAmt + vatAmt - whtAmt
  const depositAmt = parseFloat(form.deposit_amount) || 0
  const depositPct = total > 0 && depositAmt > 0 ? Math.round(depositAmt / total * 1000) / 10 : 0
  const balance    = total - depositAmt

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
      deposit_pct: depositPct, deposit_amount: depositAmt,
    }
    if (editId) {
      const { error } = await updateInvoice(editId, payload)
      if (error) { setSaving(false); return alert('❌ บันทึกไม่สำเร็จ: ' + error.message) }
      setEditId(null)
    } else {
      const maxNum = rows.reduce((max, r) => {
        const n = parseInt(r.code?.replace('INV-','')||'0'); return n > max ? n : max
      }, 0)
      const code = 'INV-' + String(Math.max(maxNum + 1, 1001)).padStart(4,'0')
      const { error } = await insertInvoice({ ...payload, code })
      if (error) { setSaving(false); return alert('❌ บันทึกไม่สำเร็จ: ' + error.message) }
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
      deposit_amount: inv.deposit_amount != null && inv.deposit_amount > 0
        ? inv.deposit_amount
        : (inv.deposit_pct > 0 ? Math.round((inv.total||0) * (inv.deposit_pct||0) / 100) : ''),
      items: (inv.items||[{...emptyItem}]).map(it => ({ ...it, sizes: it.sizes || {} })),
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
    const code = 'JO-' + String(Math.max(maxJO + 1, 1001)).padStart(4,'0')
    // Build size columns — use sizes that have qtys in the invoice items, fall back to defaults
    const defSizes = ['SS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL']
    const usedSizesSet = new Set()
    ;(inv.items||[]).forEach(it => {
      Object.entries(it.sizes||{}).forEach(([s,v]) => { if (parseInt(v) > 0) usedSizesSet.add(s) })
    })
    const joSizes = usedSizesSet.size > 0
      ? [...defSizes.filter(s => usedSizesSet.has(s)), ...[...usedSizesSet].filter(s => !defSizes.includes(s))]
      : defSizes
    await insertJobOrder({
      code, customer_id: inv.customer_id, invoice_id: inv.id,
      item_desc: (inv.items||[]).map(it => it.desc).join(', '),
      status: 'รอออกแบบ',
      items: {
        type: 'size_matrix', sizes: joSizes,
        rows: (inv.items||[]).map(it => ({
          style: it.desc||'',
          qtys: Object.fromEntries(joSizes.map(s => [s, it.sizes?.[s] ? String(it.sizes[s]) : ''])),
        })),
      },
    })
    await updateInvoice(inv.id, { jo_created: true })
    alert(`✅ สร้างใบงาน ${code} แล้ว`)
    load()
    setView(v => v ? { ...v, jo_created: true } : v)
  }

  /* ── Convert Invoice → Receipt ── */
  async function handleConvertToReceipt(inv) {
    const existRec = receipts.find(r => r.invoice_id === inv.id)
    if (existRec) return alert(`มีใบเสร็จ ${existRec.code} อยู่แล้ว`)
    const maxRec = receipts.reduce((max, r) => {
      const n = parseInt(r.code?.replace('REC-','')||'0'); return n > max ? n : max
    }, 0)
    const code = 'REC-' + String(Math.max(maxRec + 1, 1001)).padStart(4,'0')
    const { data, error } = await insertReceipt({
      code,
      invoice_id:   inv.id,
      customer_id:  inv.customer_id,
      total:        inv.total,
      document_date: todayStr(),
      paid:         false,
    })
    if (error) return alert('เกิดข้อผิดพลาด: ' + error.message)
    alert(`✅ สร้างใบเสร็จ ${code} แล้ว — ไปที่เมนู "ใบเสร็จ" เพื่อยืนยันการรับเงิน`)
    load()
    setView(v => v ? { ...v, receipt_created: true } : v)
  }

  const filtered    = rows.filter(r => {
    const ms = r.code?.includes(search) || r.customers?.name?.includes(search)
    const dm = !monthFilter || (r.document_date || r.created_at || '').startsWith(monthFilter)
    return ms && dm
  })
  const totalAmount  = rows.reduce((s, r) => s + (r.total || 0), 0)
  const monthTotal   = filtered.reduce((s, r) => s + (r.total || 0), 0)
  const withJO       = rows.filter(r => jobs.some(j => j.invoice_id === r.id)).length

  // ──── DETAIL / PRINT VIEW ──────────────────────────────────
  if (view) {
    const cust   = customers.find(c => c.id===view.customer_id) || view.customers || {}
    const relJO  = jobs.find(j => j.invoice_id===view.id)
    const relRec = receipts.find(r => r.invoice_id===view.id)
    const vDepAmt = view.deposit_amount != null && view.deposit_amount > 0
      ? view.deposit_amount
      : (view.total||0) * (view.deposit_pct || 0) / 100
    const vDepPct = view.deposit_pct || 0
    const vBalance = (view.total||0) - vDepAmt

    return (
      <div style={{ maxWidth:794, margin:'0 auto', padding:24 }}>

        {/* ── TOOLBAR ── */}
        <div className="no-print" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, gap:8, flexWrap:'wrap' }}>
          <button className="btn btn-outline" onClick={() => setView(null)}>← กลับ</button>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button className="btn btn-outline" onClick={() => { startEdit(view); setView(null) }}>✏️ แก้ไข</button>

            {/* → ใบงาน */}
            {!relJO ? (
              <button className="btn btn-outline" onClick={() => handleConvertToJO(view)}>
                📝 สร้างใบงาน
              </button>
            ) : (
              <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:8, background:'#EFF6FF', fontSize:13, color:'#1D4ED8', fontWeight:600 }}>
                📝 {relJO.code}
                <span style={{ padding:'2px 6px', borderRadius:4, background:'#DBEAFE', fontSize:11 }}>{relJO.status}</span>
              </span>
            )}

            {/* → ใบเสร็จ */}
            {!relRec ? (
              <button
                className="btn btn-outline"
                style={{ borderColor:'#10B981', color:'#065F46' }}
                onClick={() => handleConvertToReceipt(view)}
              >
                🧾 สร้างใบเสร็จ
              </button>
            ) : (
              <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:8, background:'#D1FAE5', fontSize:13, color:'#065F46', fontWeight:600 }}>
                🧾 {relRec.code}
                <span style={{ padding:'2px 6px', borderRadius:4, background:'#A7F3D0', fontSize:11 }}>{relRec.paid ? '✅ ชำระแล้ว' : 'รอรับเงิน'}</span>
              </span>
            )}

            <button className="btn btn-outline" onClick={() => shareDoc({
              title:`ใบแจ้งหนี้ ${view.code}`,
              text:`ลูกค้า: ${cust.name||''}\nยอดสุทธิ: ฿${(view.total||0).toLocaleString()}\nมัดจำ: ฿${vDepAmt.toLocaleString()}\nยอดคงเหลือ: ฿${vBalance.toLocaleString()}\nครบกำหนด: ${view.due_date?fmtDate(view.due_date):'-'}\n— C-Screen ${SHOP.tel}`
            })}>🔗 แชร์</button>
            <button className="btn btn-outline" onClick={() => exportJpeg('print-area', `${(cust.name||'').replace(/\s+/g,'_').replace(/[\/\\:*?"<>|]/g,'')}_${view.code}`)}>📷 JPEG</button>
            <button className="btn btn-primary" onClick={() => printDoc('print-area', `${(cust.name||'').replace(/\s+/g,'_').replace(/[\/\\:*?"<>|]/g,'')}_${view.code}`)}>🖨️ พิมพ์</button>
          </div>
        </div>

        {/* ── PRINT AREA ── */}
        <div id="print-area" style={{
          position:'relative', background:'#fff', width:754, margin:'0 auto',
          fontFamily:'"Sarabun", Arial, Tahoma, sans-serif',
          fontSize:11, color:'#111827', lineHeight:1.5, overflow:'hidden',
          border:'1px solid #e5e7eb', borderRadius:4,
        }}>
          {/* Top stripe */}
          <div style={{ height:6, background:'linear-gradient(90deg,#6D0000,#B80F0B,#E53935)' }} />

          {/* Watermark */}
          <div style={{
            position:'absolute', right:-30, top:110, fontSize:90, fontWeight:900,
            color:'rgba(184,15,11,.04)', letterSpacing:3, transform:'rotate(-90deg)',
            pointerEvents:'none', userSelect:'none',
          }}>C-SCREEN</div>

          <div style={{ padding:'14px 24px 18px' }}>

            {/* ── HEADER ── */}
            <div style={{
              display:'grid', gridTemplateColumns:'1.35fr .65fr', gap:14,
              paddingBottom:12, borderBottom:'1.5px solid #e5e7eb',
            }}>
              {/* Brand */}
              <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                <img src="/cscreen-logo.png" alt="C-Screen"
                  style={{ height:66, width:66, objectFit:'contain', flexShrink:0 }} />
                <div style={{ lineHeight:1.65 }}>
                  <div style={{ fontWeight:900, fontSize:12.5, color:'#111' }}>
                    ร้าน C-Screen สกรีนเสื้อ-ตัด-เย็บ-ปัก ครบวงจร - หนองจอก
                  </div>
                  <div style={{ fontSize:9.5, color:'#374151' }}>
                    68/148 หมู่บ้านอมรทรัพย์ ซอยอยู่วิทยา 18 ถนนสุวินทวงศ์ แขวงกระทุ่มราย
                    เขตหนองจอก กรุงเทพมหานคร 10530
                  </div>
                  <div style={{ fontSize:9.5, color:'#374151' }}>
                    เลขประจำตัวผู้เสียภาษี {SHOP.taxId}
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:4 }}>
                    {[`Tel: ${SHOP.tel}`, `LINE: ${SHOP.line}`, `FB: ${SHOP.fb}`].map(t => (
                      <span key={t} style={{
                        padding:'1px 6px', borderRadius:99, background:'#FEF2F2',
                        color:'#8B0000', fontSize:9, fontWeight:700,
                        border:'1px solid rgba(184,15,11,.15)',
                      }}>{t}</span>
                    ))}
                  </div>
                </div>
              </div>
              {/* Doc badge */}
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:26, fontWeight:900, color:'#B80F0B', lineHeight:1 }}>ใบแจ้งหนี้</div>
                <div style={{ fontSize:10, letterSpacing:2, color:'#6b7280', fontWeight:700, marginTop:2 }}>INVOICE</div>
                <div style={{
                  display:'inline-block', marginTop:6,
                  padding:'3px 10px', borderRadius:99, background:'#fff7ed',
                  color:'#9a3412', fontSize:10.5, fontWeight:800, border:'1px solid #fed7aa',
                }}>รอชำระเงิน</div>
              </div>
            </div>

            {/* ── INFO GRID ── */}
            <div style={{ display:'grid', gridTemplateColumns:'1.1fr .9fr', gap:10, marginTop:10 }}>
              {/* Customer */}
              <div style={{ border:'1px solid #e5e7eb', borderRadius:10, overflow:'hidden' }}>
                <div style={{ padding:'5px 11px', background:'linear-gradient(90deg,#FEF2F2,#fff)', borderBottom:'1px solid #e5e7eb', fontSize:10.5, color:'#8B0000', fontWeight:900 }}>
                  ข้อมูลลูกค้า / BILL TO
                </div>
                <div style={{ padding:'8px 11px', fontSize:11.5, lineHeight:1.75 }}>
                  {[
                    { l:'ชื่อ / บริษัท', v:cust.name||view.customers?.name||'—', bold:true },
                    cust.phone   && { l:'โทรศัพท์', v:cust.phone },
                    cust.address && { l:'ที่อยู่',   v:cust.address },
                    cust.tax_id  && { l:'Tax ID',    v:cust.tax_id },
                  ].filter(Boolean).map(r => (
                    <div key={r.l} style={{ display:'grid', gridTemplateColumns:'76px 1fr', gap:6, margin:'1px 0' }}>
                      <span style={{ color:'#6b7280' }}>{r.l}</span>
                      <span style={{ fontWeight: r.bold?800:600, color:'#111' }}>{r.v}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Doc meta */}
              <div style={{ border:'1px solid #e5e7eb', borderRadius:10, overflow:'hidden' }}>
                <div style={{ padding:'5px 11px', background:'linear-gradient(90deg,#FEF2F2,#fff)', borderBottom:'1px solid #e5e7eb', fontSize:10.5, color:'#8B0000', fontWeight:900 }}>
                  รายละเอียดเอกสาร / DOCUMENT
                </div>
                <div style={{ padding:'8px 11px', fontSize:11.5, lineHeight:1.75 }}>
                  {[
                    { l:'เลขที่ IV',  v:view.code,                                red:true },
                    { l:'วันที่ออก', v:fmtDate(view.document_date||view.created_at) },
                    view.due_date && { l:'ครบกำหนด', v:fmtDate(view.due_date),    red:true },
                    { l:'มัดจำ',     v:`${vDepPct}% ก่อนผลิต` },
                  ].filter(Boolean).map(r => (
                    <div key={r.l} style={{ display:'grid', gridTemplateColumns:'76px 1fr', gap:6, margin:'1px 0' }}>
                      <span style={{ color:'#6b7280' }}>{r.l}</span>
                      <span style={{ fontWeight:700, textAlign:'right', color:r.red?'#B80F0B':'#111' }}>{r.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── ITEMS TABLE ── */}
            <table style={{
              width:'100%', borderCollapse:'separate', borderSpacing:0,
              marginTop:10, fontSize:11.5,
              border:'1px solid #e5e7eb', borderRadius:10, overflow:'hidden',
            }}>
              <thead>
                <tr style={{ background:'#B80F0B', color:'#fff' }}>
                  {[
                    { h:'#',                            w:32,  a:'center' },
                    { h:'รายการสินค้า / รายละเอียดงาน', w:null, a:'left'   },
                    { h:'จำนวน',                        w:56,  a:'center' },
                    { h:'ราคา/หน่วย',                   w:86,  a:'right'  },
                    { h:'จำนวนเงิน',                    w:96,  a:'right'  },
                  ].map((c,i) => (
                    <th key={i} style={{ padding:'7px 9px', fontWeight:900, fontSize:11,
                      textAlign:c.a, width:c.w||undefined,
                      borderRight: i<4?'1px solid rgba(255,255,255,.18)':'none',
                    }}>{c.h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(view.items||[]).map((it,i) => (
                  <tr key={i} style={{ borderBottom:'1px solid #f0f0f0', background:i%2===1?'#fffafa':'#fff' }}>
                    <td style={{ padding:'6px 9px', textAlign:'center', color:'#9ca3af', borderRight:'1px solid #f0f0f0' }}>{i+1}</td>
                    <td style={{ padding:'6px 9px', fontWeight:600, borderRight:'1px solid #f0f0f0' }}>
                      {it.desc}
                      {it.sizes && Object.entries(it.sizes).some(([s,v]) => s !== 'XXL' && parseInt(v) > 0) && (
                        <div style={{ fontSize:9.5, color:'#6b7280', fontWeight:400, marginTop:2, letterSpacing:.3 }}>
                          {Object.entries(it.sizes).filter(([s,v]) => s !== 'XXL' && parseInt(v)>0).map(([s,v])=>`${s}:${v}`).join(' · ')}
                        </div>
                      )}
                    </td>
                    <td style={{ padding:'6px 9px', textAlign:'center', borderRight:'1px solid #f0f0f0' }}>{it.qty}</td>
                    <td style={{ padding:'6px 9px', textAlign:'right', fontFamily:'monospace', borderRight:'1px solid #f0f0f0' }}>
                      {(it.price||0).toLocaleString(undefined,{minimumFractionDigits:2})}
                    </td>
                    <td style={{ padding:'6px 9px', textAlign:'right', fontWeight:700, fontFamily:'monospace' }}>
                      {(it.amount||0).toLocaleString(undefined,{minimumFractionDigits:2})}
                    </td>
                  </tr>
                ))}
                {Array.from({ length: Math.max(0, 5-(view.items||[]).length) }).map((_,i) => (
                  <tr key={`f${i}`} style={{ borderBottom:'1px solid #f5eded', height:22 }}>
                    <td style={{ borderRight:'1px solid #f0f0f0' }} /><td style={{ borderRight:'1px solid #f0f0f0' }} />
                    <td style={{ borderRight:'1px solid #f0f0f0' }} /><td style={{ borderRight:'1px solid #f0f0f0' }} />
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ── AMOUNT IN WORDS ── */}
            <div style={{
              marginTop:8, border:'1px solid rgba(184,15,11,.18)', background:'#FEF2F2',
              borderRadius:10, padding:'7px 12px',
              display:'grid', gridTemplateColumns:'110px 1fr', gap:8, alignItems:'center', fontSize:11.5,
            }}>
              <strong style={{ color:'#8B0000' }}>รวมจำนวนเงิน</strong>
              <div style={{ color:'#5B0000', fontWeight:600 }}>{thaiAmountToWords(view.total||0)}</div>
            </div>

            {/* ── SUMMARY + NOTES ── */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 272px', gap:10, marginTop:8, alignItems:'start' }}>
              {/* Notes */}
              <div style={{
                border:'1px dashed #cbd5e1', borderRadius:10, padding:10,
                background:'#fcfcfc', fontSize:11, color:'#374151', lineHeight:1.8,
              }}>
                <div style={{ fontWeight:900, color:'#8B0000', marginBottom:4, fontSize:11 }}>หมายเหตุ / เงื่อนไขการผลิต</div>
                {view.notes
                  ? <span>{view.notes}</span>
                  : <>
                      1) กรุณาตรวจสอบรายการและจำนวนก่อนชำระเงิน<br/>
                      2) ระยะเวลาผลิตประมาณ 7–14 วันทำการ หลังยืนยันแบบ<br/>
                      3) สีจริงอาจแตกต่างจากหน้าจอเล็กน้อย ขึ้นอยู่กับเนื้อผ้า
                    </>
                }
              </div>
              {/* Totals */}
              <div style={{ border:'1px solid #e5e7eb', borderRadius:10, overflow:'hidden', fontSize:12 }}>
                {[
                  { l:'ยอดก่อนส่วนลด', v:(view.subtotal||0).toLocaleString(undefined,{minimumFractionDigits:2}) },
                  ...(view.discount>0      ?[{ l:'ส่วนลด', v:`-${(view.discount||0).toLocaleString(undefined,{minimumFractionDigits:2})}`, red:true }]:[]),
                  ...(view.vat_pct>0      ?[{ l:`VAT ${view.vat_pct}%`, v:(view.vat_amount||0).toLocaleString(undefined,{minimumFractionDigits:2}) }]:[]),
                  ...((view.wht_pct||0)>0 ?[{ l:`หัก ณ ที่จ่าย ${view.wht_pct}%`, v:`-${(view.wht_amount||0).toLocaleString(undefined,{minimumFractionDigits:2})}`, red:true }]:[]),
                ].map(r => (
                  <div key={r.l} style={{ display:'flex', justifyContent:'space-between', gap:10, padding:'6px 11px', borderBottom:'1px solid #f0f0f0' }}>
                    <span style={{ color:'#6b7280' }}>{r.l}</span>
                    <strong style={{ fontFamily:'monospace', color:r.red?'#dc2626':'#111' }}>{r.v}</strong>
                  </div>
                ))}
                {/* Grand total — green */}
                <div style={{ display:'flex', justifyContent:'space-between', padding:'9px 11px', background:'linear-gradient(90deg,#d1fae5,#a7f3d0)', color:'#065f46', fontSize:15, fontWeight:900 }}>
                  <span>ยอดสุทธิ</span>
                  <span style={{ fontFamily:'monospace' }}>{(view.total||0).toLocaleString(undefined,{minimumFractionDigits:2})}</span>
                </div>
                {/* Deposit row */}
                <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 11px', borderTop:'1px solid #f0f0f0', background:'#FFF7ED' }}>
                  <span style={{ color:'#92400E', fontSize:11.5 }}>มัดจำ{Number.isInteger(vDepPct) && vDepPct > 0 ? ` ${vDepPct}%` : ''}</span>
                  <strong style={{ fontFamily:'monospace', color:'#B45309' }}>
                    {vDepAmt.toLocaleString(undefined,{minimumFractionDigits:2})}
                  </strong>
                </div>
                {/* Balance row */}
                <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 11px', background:'#FEF2F2', borderTop:'1px solid #f0f0f0' }}>
                  <span style={{ color:'#B80F0B', fontWeight:700, fontSize:11.5 }}>ยอดคงเหลือ</span>
                  <strong style={{ fontFamily:'monospace', color:'#B80F0B', fontSize:13 }}>
                    {vBalance.toLocaleString(undefined,{minimumFractionDigits:2})}
                  </strong>
                </div>
                <div style={{ padding:'3px 11px 5px', textAlign:'right', fontSize:9.5, color:'#9ca3af' }}>บาท (THB)</div>
              </div>
            </div>

            {/* ── PAYMENT ── */}
            <div style={{
              marginTop:8, display:'grid', gridTemplateColumns:'1fr 84px', gap:10,
              alignItems:'center', border:'1px solid rgba(184,15,11,.18)',
              borderRadius:10, padding:'8px 11px', background:'linear-gradient(135deg,#fff,#FEF2F2)',
            }}>
              <div>
                <div style={{ fontSize:11, color:'#8B0000', fontWeight:900, marginBottom:3 }}>
                  ช่องทางชำระเงิน / PAYMENT METHOD
                </div>
                <div style={{ fontSize:13.5, fontWeight:900, letterSpacing:.4, color:'#111', marginBottom:1 }}>
                  {SHOP.bankAccount} ธนาคารกสิกรไทย
                </div>
                <div style={{ fontSize:11, color:'#374151' }}>ชื่อบัญชี: {SHOP.bankName}</div>
                <div style={{ fontSize:9.5, color:'#555', marginTop:2 }}>
                  โอนแล้วส่งสลิปพร้อมแจ้งเลขที่&nbsp;<strong>{view.code}</strong>&nbsp;ทาง LINE:&nbsp;<strong>{SHOP.line}</strong>
                </div>
              </div>
              <div style={{ width:84, height:84, borderRadius:8, border:'1px solid rgba(184,15,11,.3)', background:'#fff', overflow:'hidden', flexShrink:0 }}>
                <img src="/qr-payment.jpg" alt="QR" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
              </div>
            </div>

            {/* ── SIGNATURE ── */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:8, fontSize:11 }}>
              {['ผู้รับเอกสาร / ลูกค้า', 'ผู้ออกเอกสาร / C-SCREEN'].map(t => (
                <div key={t} style={{ border:'1px solid #e5e7eb', borderRadius:9, padding:'7px 11px', minHeight:52 }}>
                  <div style={{ fontWeight:900, color:'#374151' }}>{t}</div>
                  <div style={{ marginTop:18, borderTop:'1px solid #d1d5db', paddingTop:3, textAlign:'center', color:'#9ca3af', fontSize:10 }}>
                    ลงชื่อ / วันที่
                  </div>
                </div>
              ))}
            </div>

            {/* ── PRINT HINT ── */}
            <div style={{ marginTop:8, textAlign:'center', color:'#9ca3af', fontSize:10 }}>
              เอกสารนี้จัดทำโดยระบบ C-SCREEN · ใช้สำหรับแจ้งยอดชำระค่าสินค้าและบริการ
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ──── LIST VIEW ──────────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* KPI */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
        {[
          { label:'ใบแจ้งหนี้ทั้งหมด', value:rows.length+' ใบ',               accent:'var(--primary)', icon:'📄' },
          { label:'มูลค่ารวมทั้งหมด',  value:`฿${totalAmount.toLocaleString()}`, accent:'var(--info)',    icon:'💰' },
          { label:`ยอดเดือน ${monthFilter}`, value:`฿${monthTotal.toLocaleString()}`, accent:'#7C3AED', icon:'📅' },
          { label:'มีใบงานแล้ว',        value:withJO+' ใบ',                    accent:'var(--success)', icon:'✅' },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--card)', borderRadius:'var(--radius)', padding:'14px 16px', boxShadow:'var(--shadow)', border:'1px solid var(--border)', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, width:4, height:'100%', background:k.accent, borderRadius:'10px 0 0 10px' }} />
            <div style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontSize:26, opacity:.1 }}>{k.icon}</div>
            <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase' }}>{k.label}</div>
            <div style={{ fontSize:20, fontWeight:800, color:k.accent, marginTop:3 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }}>🔍</span>
            <input type="text" placeholder="ค้นหาใบแจ้งหนี้..." value={search}
              onChange={e => setSearch(e.target.value)} style={{ paddingLeft:36, width:200 }} />
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>📅 เดือน</span>
            <input type="month" value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
              style={{ fontSize:13, padding:'5px 8px', borderRadius:6, border:'1px solid var(--border)' }} />
            {monthFilter && (
              <button className="btn btn-outline btn-sm" onClick={() => setMonthFilter('')}>ทั้งหมด</button>
            )}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ ปิด' : '+ สร้างใบแจ้งหนี้'}
        </button>
      </div>

      {/* ── FORM ── */}
      {showForm && (
        <div className="card" style={{ padding:18 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>{editId ? '✏️ แก้ไขใบแจ้งหนี้' : '➕ ใบแจ้งหนี้ใหม่'}</div>

          {/* Row 1 */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:10 }}>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <label>ลูกค้า *</label>
              <select value={form.customer_id} onChange={e => setForm({...form, customer_id:e.target.value})}>
                <option value="">— เลือกลูกค้า —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <label>วันที่เอกสาร</label>
              <input type="date" value={form.document_date} onChange={e => setForm({...form, document_date:e.target.value})} />
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <label>ครบกำหนดชำระ</label>
              <input type="date" value={form.due_date} onChange={e => setForm({...form, due_date:e.target.value})} />
            </div>
          </div>

          {/* Row 2 */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:12 }}>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <label>VAT (%)</label>
              <select value={form.vat_pct} onChange={e => setForm({...form, vat_pct:e.target.value})}>
                <option value={0}>ไม่มี VAT</option>
                <option value={7}>7%</option>
              </select>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <label>หัก ณ ที่จ่าย (%)</label>
              <select value={form.wht_pct} onChange={e => setForm({...form, wht_pct:e.target.value})}>
                <option value={0}>ไม่มี</option>
                <option value={3}>3%</option>
                <option value={5}>5%</option>
              </select>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label>💰 มัดจำ (฿)</label>
              <input type="number" min="0" placeholder="0"
                value={form.deposit_amount}
                onChange={e => setForm({...form, deposit_amount: e.target.value})}
                style={{ fontSize:15, fontWeight:700 }} />
              {/* live balance preview */}
              {depositAmt > 0 && (
                <div style={{ fontSize:11, color:'#065f46', background:'#d1fae5', borderRadius:6, padding:'4px 8px', display:'flex', gap:6, flexWrap:'wrap' }}>
                  <span>ยอด <strong>{total.toLocaleString()}</strong></span>
                  <span>−</span>
                  <span>มัดจำ <strong>{depositAmt.toLocaleString()}</strong></span>
                  <span>=</span>
                  <span>คงเหลือ <strong style={{ color:'#B80F0B' }}>{balance.toLocaleString()}</strong> ฿</span>
                </div>
              )}
              {/* % quick-fill */}
              <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
                <span style={{ fontSize:10, color:'var(--text-muted)', alignSelf:'center' }}>ลัด:</span>
                {[30,50,70,100].map(pct => (
                  <button key={pct} type="button" className="btn btn-outline btn-sm"
                    style={{ fontSize:10, padding:'1px 7px' }}
                    onClick={() => setForm(f => ({ ...f, deposit_amount: Math.round(total * pct / 100) }))}>
                    {pct}%
                  </button>
                ))}
                <button type="button" className="btn btn-outline btn-sm"
                  style={{ fontSize:10, padding:'1px 7px', color:'var(--danger)' }}
                  onClick={() => setForm(f => ({ ...f, deposit_amount: '' }))}>ล้าง</button>
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <label>ส่วนลด (฿)</label>
              <input type="number" min="0" value={form.discount}
                onChange={e => setForm({...form, discount:e.target.value})} />
            </div>
          </div>

          {/* Items */}
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:7 }}>รายการสินค้า / บริการ</div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'var(--bg)' }}>
                  <th style={{ padding:'5px 8px', textAlign:'left', fontSize:12 }}>รายการ</th>
                  <th style={{ padding:'5px 8px', fontSize:12, width:72 }}>จำนวน</th>
                  <th style={{ padding:'5px 8px', fontSize:12, width:110 }}>ราคา/หน่วย</th>
                  <th style={{ padding:'5px 8px', textAlign:'right', fontSize:12, width:110 }}>รวม</th>
                  <th style={{ width:36 }}></th>
                </tr>
              </thead>
              <tbody>
                {form.items.map((it,i) => (
                  <tr key={i}>
                    <td style={{ padding:'3px 5px' }}>
                      <input type="text" placeholder="รายละเอียด" value={it.desc}
                        onChange={e => updateItem(i,'desc',e.target.value)} style={{ width:'100%' }} />
                      <div style={{ display:'flex', gap:4, marginTop:4, flexWrap:'wrap', alignItems:'center' }}>
                        <span style={{ fontSize:10, color:'var(--text-muted)', fontWeight:600 }}>ไซซ์:</span>
                        {['SS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'].map(s => (
                          <label key={s} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:1 }}>
                            <span style={{ fontSize:9, color:'var(--text-muted)', fontWeight:600 }}>{s}</span>
                            <input type="number" min="0" placeholder="0"
                              value={it.sizes?.[s] || ''}
                              onChange={e => updateItem(i,'sizes',{ ...(it.sizes||{}), [s]:e.target.value })}
                              style={{ width:38, textAlign:'center', fontSize:11, padding:'2px 3px' }} />
                          </label>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding:'3px 5px' }}>
                      {Object.entries(it.sizes||{}).some(([s,v]) => s !== 'XXL' && parseInt(v)>0) ? (
                        <div style={{ textAlign:'center', fontWeight:800, color:'var(--primary)', padding:'6px 2px', fontSize:14 }}>
                          {Object.entries(it.sizes||{}).filter(([s])=>s!=='XXL').reduce((sum,[,v])=>sum+(parseInt(v)||0),0)}
                        </div>
                      ) : (
                        <input type="number" min="1" value={it.qty} onChange={e => updateItem(i,'qty',e.target.value)} />
                      )}
                    </td>
                    <td style={{ padding:'3px 5px' }}>
                      <input type="number" min="0" value={it.price} onChange={e => updateItem(i,'price',e.target.value)} />
                    </td>
                    <td style={{ padding:'3px 8px', textAlign:'right', fontWeight:700 }}>฿{(it.amount||0).toLocaleString()}</td>
                    <td style={{ padding:'3px 5px', textAlign:'center' }}>
                      {form.items.length > 1 && (
                        <button onClick={() => removeItem(i)} style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer', fontSize:16 }}>×</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display:'flex', gap:8, marginTop:7, flexWrap:'wrap', alignItems:'center' }}>
              <button className="btn btn-outline btn-sm" onClick={addItem}>+ เพิ่มรายการ</button>
              <select style={{ fontSize:12, padding:'4px 9px' }} defaultValue="" onChange={e => {
                const mat = materials.find(m => m.id===e.target.value)
                if (mat) { addItemFromStock(mat); e.target.value='' }
              }}>
                <option value="">📦 เพิ่มจากสต๊อก...</option>
                {materials.map(m => <option key={m.id} value={m.id}>{m.name} (เหลือ: {m.qty} {m.unit})</option>)}
              </select>
            </div>
          </div>

          {/* Summary preview */}
          <div style={{ display:'flex', justifyContent:'flex-end' }}>
            <div style={{ minWidth:220, fontSize:13, border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
              {[
                { l:'ยอดรวม',   v:`฿${subtotal.toLocaleString()}` },
                discAmt>0 && { l:'ส่วนลด', v:`-฿${discAmt.toLocaleString()}`, red:true },
                vatAmt>0  && { l:`VAT ${form.vat_pct}%`, v:`฿${vatAmt.toFixed(2)}` },
                whtAmt>0  && { l:`WHT ${form.wht_pct}%`, v:`-฿${whtAmt.toFixed(2)}`, red:true },
              ].filter(Boolean).map(r => (
                <div key={r.l} style={{ display:'flex', justifyContent:'space-between', padding:'5px 10px', borderBottom:'1px solid var(--border)', color: r.red?'var(--danger)':undefined }}>
                  <span>{r.l}</span><span>{r.v}</span>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 10px', fontWeight:800, fontSize:14, background:'#d1fae5', color:'#065f46' }}>
                <span>ยอดสุทธิ</span><span>฿{total.toLocaleString(undefined,{minimumFractionDigits:2})}</span>
              </div>
              {depositAmt > 0 && <>
                <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 10px', background:'#FFF7ED', color:'#92400E', fontSize:12 }}>
                  <span>มัดจำ{depositPct > 0 ? ` (${depositPct}%)` : ''}</span>
                  <span>฿{depositAmt.toLocaleString(undefined,{minimumFractionDigits:2})}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 10px', background:'#FEF2F2', color:'#B80F0B', fontWeight:700, fontSize:12 }}>
                  <span>ยอดคงเหลือ</span><span>฿{balance.toLocaleString(undefined,{minimumFractionDigits:2})}</span>
                </div>
              </>}
            </div>
          </div>

          {/* Notes */}
          <div style={{ display:'flex', flexDirection:'column', gap:3, marginTop:10 }}>
            <label style={{ fontSize:12 }}>หมายเหตุ</label>
            <input type="text" placeholder="หมายเหตุ / เงื่อนไขการชำระเงิน"
              value={form.notes} onChange={e => setForm({...form, notes:e.target.value})} />
          </div>

          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'กำลังบันทึก...' : '💾 บันทึกใบแจ้งหนี้'}
            </button>
            <button className="btn btn-outline" onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm()) }}>ยกเลิก</button>
          </div>
        </div>
      )}

      {/* ── TABLE ── */}
      <div className="card" style={{ overflow:'hidden' }}>
        {loading ? <LoadingSpinner /> : (
          <>
            <div style={{ overflowX:'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>เลขที่</th><th>ใบงาน</th><th>ใบเสร็จ</th><th>วันที่</th>
                    <th>ลูกค้า</th><th>ยอดรวม</th><th>มัดจำ</th><th>ครบกำหนด</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const relJO  = jobs.find(j => j.invoice_id===r.id)
                    const relRec = receipts.find(rec => rec.invoice_id===r.id)
                    const dAmt   = r.deposit_amount != null && r.deposit_amount > 0
                      ? r.deposit_amount
                      : (r.total||0) * (r.deposit_pct || 0) / 100
                    return (
                      <tr key={r.id} className="row-link">
                        <td style={{ color:'var(--primary)', fontFamily:'monospace', fontWeight:700 }}>{r.code}</td>
                        <td style={{ fontSize:12, fontFamily:'monospace' }}>
                          {relJO ? <span style={{ color:'var(--info)', fontWeight:600 }}>{relJO.code}</span>
                                 : <span style={{ color:'var(--text-muted)' }}>—</span>}
                        </td>
                        <td style={{ fontSize:12, fontFamily:'monospace' }}>
                          {relRec ? <span style={{ color:'#065F46', fontWeight:600 }}>{relRec.code}
                            {relRec.paid && <span style={{ marginLeft:4, fontSize:10, background:'#D1FAE5', color:'#065F46', padding:'1px 5px', borderRadius:4 }}>✅</span>}
                          </span> : <span style={{ color:'var(--text-muted)' }}>—</span>}
                        </td>
                        <td style={{ fontSize:12, color:'var(--text-muted)' }}>{fmtDate(r.document_date||r.created_at)}</td>
                        <td style={{ fontWeight:600 }}>{r.customers?.name||'—'}</td>
                        <td style={{ fontWeight:800, color:'var(--primary)' }}>฿{(r.total||0).toLocaleString()}</td>
                        <td style={{ fontSize:12, color:'#B45309' }}>
                          {dAmt > 0 ? `฿${dAmt.toLocaleString(undefined,{minimumFractionDigits:0})}` : '—'}
                        </td>
                        <td style={{ fontSize:12, color:'var(--text-muted)' }}>{fmtDate(r.due_date)}</td>
                        <td style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                          <button className="btn btn-outline btn-sm" onClick={() => setView(r)}>ดู</button>
                          <button className="btn btn-outline btn-sm" onClick={() => startEdit(r)}>✏️</button>
                          {!relJO && (
                            <button className="btn btn-outline btn-sm" onClick={() => handleConvertToJO(r)} title="สร้างใบงาน">→ JO</button>
                          )}
                          {!relRec && (
                            <button className="btn btn-outline btn-sm" style={{ color:'#065F46', borderColor:'#10B981' }}
                              onClick={() => handleConvertToReceipt(r)} title="สร้างใบเสร็จ">→ REC</button>
                          )}
                          {!relJO && !relRec && (
                            <button className="btn btn-outline btn-sm" style={{ color:'var(--danger)' }} onClick={() => handleDelete(r)}>ลบ</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length===0 && (
                    <tr><td colSpan={9} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>ไม่พบรายการ</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ padding:'8px 14px', borderTop:'1px solid var(--border)', fontSize:12, color:'var(--text-muted)' }}>
              แสดง {filtered.length} จาก {rows.length} รายการ
            </div>
          </>
        )}
      </div>
    </div>
  )
}
