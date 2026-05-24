'use client'
import { useState, useEffect } from 'react'
import {
  getQuotations, insertQuotation, updateQuotation, deleteQuotation,
  getCustomers, insertInvoice, getInvoices,
} from '@/lib/db'
import { fmtDate, SHOP } from '@/lib/shop'
import { todayStr, exportJpeg, shareDoc, printDoc } from '@/lib/docUtils'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

/* ── Blue theme ───────────────────────────────────────────── */
const C = {
  primary : '#1D4ED8',
  dark    : '#1e3a8a',
  light   : '#EFF6FF',
  medium  : '#DBEAFE',
  stripe  : 'linear-gradient(90deg,#1e3a8a,#1D4ED8,#3B82F6)',
}

const STATUS_BADGE = {
  'รออนุมัติ'       : 'badge badge-yellow',
  'อนุมัติแล้ว'     : 'badge badge-green',
  'แปลงเป็น Invoice': 'badge badge-blue',
  'ปฏิเสธ'          : 'badge badge-red',
}

/* ── Thai Baht → Words ────────────────────────────────────── */
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
    : baht >= 1000000 ? chunk(Math.floor(baht / 1000000)) + 'ล้าน' + chunk(baht % 1000000)
    : chunk(baht)
  result += 'บาท'
  if (satang > 0) result += chunk(satang) + 'สตางค์'
  return result + 'ถ้วน'
}

const emptyItem = { desc: '', qty: 1, price: 0, amount: 0, sizes: {} }
function calcItems(items) {
  return items.map(it => ({ ...it, amount: (parseFloat(it.qty) || 0) * (parseFloat(it.price) || 0) }))
}
const emptyForm = () => ({
  customer_id: '', valid_until: '', document_date: todayStr(),
  notes: '', vat_pct: 0, discount: 0,
  items: [{ ...emptyItem }],
})

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

  useEffect(() => { load() }, [])

  async function load() {
    const [qtRes, cusRes, invRes] = await Promise.all([getQuotations(), getCustomers(), getInvoices()])
    setRows(qtRes.data    || [])
    setCustomers(cusRes.data  || [])
    setInvoices(invRes.data   || [])
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

  const subtotal = form.items.reduce((s, it) => s + (it.amount || 0), 0)
  const discAmt  = parseFloat(form.discount) || 0
  const vatAmt   = ((subtotal - discAmt) * (parseFloat(form.vat_pct) || 0)) / 100
  const total    = subtotal - discAmt + vatAmt

  async function handleSave() {
    if (!form.customer_id || form.items.length === 0) return alert('กรุณาเลือกลูกค้าและเพิ่มรายการ')
    setSaving(true)
    const items   = calcItems(form.items)
    const payload = {
      customer_id: form.customer_id, valid_until: form.valid_until || null,
      document_date: form.document_date || todayStr(),
      items, subtotal, discount: discAmt,
      vat_pct: parseFloat(form.vat_pct) || 0, vat_amount: vatAmt,
      total, notes: form.notes, status: 'รออนุมัติ',
    }
    if (editId) {
      await updateQuotation(editId, payload)
      setEditId(null)
    } else {
      const maxNum = rows.reduce((max, r) => {
        const n = parseInt(r.code?.replace('QT-', '') || '0'); return n > max ? n : max
      }, 0)
      const code = 'QT-' + String(Math.max(maxNum + 1, 1001)).padStart(4, '0')
      await insertQuotation({ ...payload, code })
    }
    setForm(emptyForm()); setShowForm(false); setSaving(false)
    load()
  }

  async function handleDelete(qt) {
    if (!confirm(`ลบ ${qt.code} ใช่ไหม?`)) return
    await deleteQuotation(qt.id); load()
  }

  function startEdit(qt) {
    setEditId(qt.id)
    setForm({
      customer_id: qt.customer_id, valid_until: qt.valid_until || '',
      document_date: qt.document_date || todayStr(),
      notes: qt.notes || '', vat_pct: qt.vat_pct || 0, discount: qt.discount || 0,
      items: (qt.items && qt.items.length ? qt.items : [{ desc: qt.item_desc || '', qty: 1, price: qt.total, amount: qt.total }]).map(it => ({ ...it, sizes: it.sizes || {} })),
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleConvertToInvoice(qt) {
    const existInv = invoices.find(i => i.quotation_id === qt.id)
    if (existInv) return alert(`มี Invoice ${existInv.code} อยู่แล้ว`)
    const maxNum = invoices.reduce((max, r) => {
      const n = parseInt(r.code?.replace('INV-', '') || '0'); return n > max ? n : max
    }, 0)
    const code  = 'INV-' + String(Math.max(maxNum + 1, 1001)).padStart(4, '0')
    const items = qt.items && qt.items.length ? qt.items
      : [{ desc: qt.item_desc || '', qty: 1, price: qt.total || 0, amount: qt.total || 0 }]
    const sub = items.reduce((s, it) => s + (it.amount || 0), 0)
    await insertInvoice({
      code, customer_id: qt.customer_id, quotation_id: qt.id,
      items, subtotal: sub, discount: qt.discount || 0,
      vat_pct: qt.vat_pct || 0, vat_amount: qt.vat_amount || 0,
      total: qt.total, status: 'รอชำระ',
    })
    await updateQuotation(qt.id, { status: 'แปลงเป็น Invoice' })
    alert(`✅ สร้าง Invoice ${code} แล้ว`)
    load()
    setView(v => v ? { ...v, status: 'แปลงเป็น Invoice' } : v)
  }

  const filtered = rows.filter(q => {
    const ms = q.code?.includes(search) || q.customers?.name?.includes(search)
    return ms && (!filterStatus || q.status === filterStatus)
  })
  const totalVal = rows.reduce((s, q) => s + (q.total || 0), 0)

  /* ════════════════════════════════════════════════════════════
     DETAIL / PRINT VIEW
  ════════════════════════════════════════════════════════════ */
  if (view) {
    const cust    = customers.find(c => c.id === view.customer_id) || view.customers || {}
    const existInv = invoices.find(i => i.quotation_id === view.id)

    return (
      <div style={{ maxWidth: 794, margin: '0 auto', padding: 24 }}>

        {/* ── TOOLBAR ── */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={() => setView(null)}>← กลับ</button>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-outline" onClick={() => { startEdit(view); setView(null) }}>✏️ แก้ไข</button>

            {/* → Invoice */}
            {view.status !== 'แปลงเป็น Invoice' ? (
              <button className="btn btn-outline" style={{ borderColor: C.primary, color: C.primary }}
                onClick={() => handleConvertToInvoice(view)}>
                📄 สร้าง Invoice
              </button>
            ) : existInv ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, background: C.medium, fontSize: 13, color: C.primary, fontWeight: 600 }}>
                📄 {existInv.code}
              </span>
            ) : null}

            <button className="btn btn-outline" onClick={() => shareDoc({
              title: `ใบเสนอราคา ${view.code}`,
              text: `ลูกค้า: ${cust.name || ''}\nยอดรวม: ฿${(view.total || 0).toLocaleString()}\nใช้ได้ถึง: ${view.valid_until ? fmtDate(view.valid_until) : '-'}\n— C-Screen ${SHOP.tel}`,
            })}>🔗 แชร์</button>
            <button className="btn btn-outline" onClick={() => exportJpeg('print-area', `QT-${view.code}`)}>📷 JPEG</button>
            <button className="btn btn-primary" onClick={() => printDoc()}>🖨️ พิมพ์</button>
          </div>
        </div>

        {/* ── PRINT AREA ── */}
        <div id="print-area" style={{
          position: 'relative', background: '#fff', width: 754, margin: '0 auto',
          fontFamily: '"Sarabun", Arial, Tahoma, sans-serif',
          fontSize: 11, color: '#111827', lineHeight: 1.5, overflow: 'hidden',
          border: '1px solid #e5e7eb', borderRadius: 4,
        }}>
          {/* Top stripe */}
          <div style={{ height: 6, background: C.stripe }} />

          {/* Watermark */}
          <div style={{
            position: 'absolute', right: -30, top: 110, fontSize: 90, fontWeight: 900,
            color: 'rgba(29,78,216,.04)', letterSpacing: 3, transform: 'rotate(-90deg)',
            pointerEvents: 'none', userSelect: 'none',
          }}>C-SCREEN</div>

          <div style={{ padding: '14px 24px 18px' }}>

            {/* ── HEADER ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.35fr .65fr', gap: 14, paddingBottom: 12, borderBottom: '1.5px solid #e5e7eb' }}>
              {/* Brand */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <img src="/cscreen-logo.png" alt="C-Screen"
                  style={{ height: 66, width: 66, objectFit: 'contain', flexShrink: 0 }} />
                <div style={{ lineHeight: 1.65 }}>
                  <div style={{ fontWeight: 900, fontSize: 12.5, color: '#111' }}>
                    ร้าน C-Screen สกรีนเสื้อ-ตัด-เย็บ-ปัก ครบวงจร - หนองจอก
                  </div>
                  <div style={{ fontSize: 9.5, color: '#374151' }}>
                    68/148 หมู่บ้านอมรทรัพย์ ซอยอยู่วิทยา 18 ถนนสุวินทวงศ์ แขวงกระทุ่มราย เขตหนองจอก กรุงเทพมหานคร 10530
                  </div>
                  <div style={{ fontSize: 9.5, color: '#374151' }}>เลขประจำตัวผู้เสียภาษี {SHOP.taxId}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    {[`Tel: ${SHOP.tel}`, `LINE: ${SHOP.line}`, `FB: ${SHOP.fb}`].map(t => (
                      <span key={t} style={{
                        padding: '1px 6px', borderRadius: 99, background: C.light,
                        color: C.dark, fontSize: 9, fontWeight: 700,
                        border: '1px solid rgba(29,78,216,.15)',
                      }}>{t}</span>
                    ))}
                  </div>
                </div>
              </div>
              {/* Doc badge */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 26, fontWeight: 900, color: C.primary, lineHeight: 1 }}>ใบเสนอราคา</div>
                <div style={{ fontSize: 10, letterSpacing: 2, color: '#6b7280', fontWeight: 700, marginTop: 2 }}>QUOTATION</div>
                <div style={{ display: 'inline-block', marginTop: 6, padding: '3px 10px', borderRadius: 99, background: C.light, color: C.dark, fontSize: 10.5, fontWeight: 800, border: `1px solid ${C.medium}` }}>
                  {view.status || 'รออนุมัติ'}
                </div>
              </div>
            </div>

            {/* ── INFO GRID ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 10, marginTop: 10 }}>
              {/* Customer */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '5px 11px', background: `linear-gradient(90deg,${C.light},#fff)`, borderBottom: '1px solid #e5e7eb', fontSize: 10.5, color: C.dark, fontWeight: 900 }}>
                  ข้อมูลลูกค้า / BILL TO
                </div>
                <div style={{ padding: '8px 11px', fontSize: 11.5, lineHeight: 1.75 }}>
                  {[
                    { l: 'ชื่อ / บริษัท', v: cust.name || view.customers?.name || '—', bold: true },
                    cust.phone   && { l: 'โทรศัพท์', v: cust.phone },
                    cust.address && { l: 'ที่อยู่',   v: cust.address },
                    cust.tax_id  && { l: 'Tax ID',    v: cust.tax_id },
                  ].filter(Boolean).map(r => (
                    <div key={r.l} style={{ display: 'grid', gridTemplateColumns: '76px 1fr', gap: 6, margin: '1px 0' }}>
                      <span style={{ color: '#6b7280' }}>{r.l}</span>
                      <span style={{ fontWeight: r.bold ? 800 : 600, color: '#111' }}>{r.v}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Doc meta */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '5px 11px', background: `linear-gradient(90deg,${C.light},#fff)`, borderBottom: '1px solid #e5e7eb', fontSize: 10.5, color: C.dark, fontWeight: 900 }}>
                  รายละเอียดเอกสาร / DOCUMENT
                </div>
                <div style={{ padding: '8px 11px', fontSize: 11.5, lineHeight: 1.75 }}>
                  {[
                    { l: 'เลขที่ QT',  v: view.code,                                    blue: true },
                    { l: 'วันที่ออก', v: fmtDate(view.document_date || view.created_at) },
                    view.valid_until && { l: 'ใช้ได้ถึง', v: fmtDate(view.valid_until),  blue: true },
                    existInv && { l: 'Invoice', v: existInv.code },
                  ].filter(Boolean).map(r => (
                    <div key={r.l} style={{ display: 'grid', gridTemplateColumns: '76px 1fr', gap: 6, margin: '1px 0' }}>
                      <span style={{ color: '#6b7280' }}>{r.l}</span>
                      <span style={{ fontWeight: 700, textAlign: 'right', color: r.blue ? C.primary : '#111' }}>{r.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── ITEMS TABLE ── */}
            <table style={{
              width: '100%', borderCollapse: 'separate', borderSpacing: 0,
              marginTop: 10, fontSize: 11.5,
              border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden',
            }}>
              <thead>
                <tr style={{ background: C.primary, color: '#fff' }}>
                  {[
                    { h: '#',                             w: 32,  a: 'center' },
                    { h: 'รายการสินค้า / รายละเอียดงาน', w: null, a: 'left'   },
                    { h: 'จำนวน',                         w: 56,  a: 'center' },
                    { h: 'ราคา/หน่วย',                    w: 86,  a: 'right'  },
                    { h: 'จำนวนเงิน',                     w: 96,  a: 'right'  },
                  ].map((c, i) => (
                    <th key={i} style={{ padding: '7px 9px', fontWeight: 900, fontSize: 11, textAlign: c.a, width: c.w || undefined, borderRight: i < 4 ? '1px solid rgba(255,255,255,.18)' : 'none' }}>{c.h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(view.items || []).map((it, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 1 ? '#f5f8ff' : '#fff' }}>
                    <td style={{ padding: '6px 9px', textAlign: 'center', color: '#9ca3af', borderRight: '1px solid #f0f0f0' }}>{i + 1}</td>
                    <td style={{ padding: '6px 9px', fontWeight: 600, borderRight: '1px solid #f0f0f0' }}>
                      {it.desc}
                      {it.sizes && Object.entries(it.sizes).some(([s,v]) => s !== 'XXL' && parseInt(v) > 0) && (
                        <div style={{ fontSize:9.5, color:'#6b7280', fontWeight:400, marginTop:2, letterSpacing:.3 }}>
                          {Object.entries(it.sizes).filter(([s,v]) => s !== 'XXL' && parseInt(v)>0).map(([s,v])=>`${s}:${v}`).join(' · ')}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '6px 9px', textAlign: 'center', borderRight: '1px solid #f0f0f0' }}>{it.qty}</td>
                    <td style={{ padding: '6px 9px', textAlign: 'right', fontFamily: 'monospace', borderRight: '1px solid #f0f0f0' }}>
                      {(it.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '6px 9px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                      {(it.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
                {Array.from({ length: Math.max(0, 5 - (view.items || []).length) }).map((_, i) => (
                  <tr key={`f${i}`} style={{ borderBottom: '1px solid #f0f0ff', height: 22 }}>
                    <td style={{ borderRight: '1px solid #f0f0f0' }} /><td style={{ borderRight: '1px solid #f0f0f0' }} />
                    <td style={{ borderRight: '1px solid #f0f0f0' }} /><td style={{ borderRight: '1px solid #f0f0f0' }} />
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ── AMOUNT IN WORDS ── */}
            <div style={{
              marginTop: 8, border: '1px solid rgba(29,78,216,.18)', background: C.light,
              borderRadius: 10, padding: '7px 12px',
              display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8, alignItems: 'center', fontSize: 11.5,
            }}>
              <strong style={{ color: C.dark }}>รวมจำนวนเงิน</strong>
              <div style={{ color: C.dark, fontWeight: 600 }}>{thaiAmountToWords(view.total || 0)}</div>
            </div>

            {/* ── SUMMARY + NOTES ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 272px', gap: 10, marginTop: 8, alignItems: 'start' }}>
              {/* Notes */}
              <div style={{ border: '1px dashed #cbd5e1', borderRadius: 10, padding: 10, background: '#fcfcfc', fontSize: 11, color: '#374151', lineHeight: 1.8 }}>
                <div style={{ fontWeight: 900, color: C.dark, marginBottom: 4, fontSize: 11 }}>หมายเหตุ / เงื่อนไข</div>
                {view.notes
                  ? <span>{view.notes}</span>
                  : <>
                      1) ราคานี้มีผลถึงวันที่ {view.valid_until ? fmtDate(view.valid_until) : 'ตามที่ระบุ'}<br />
                      2) ราคาอาจเปลี่ยนแปลงตามวัสดุและปริมาณสั่งผลิต<br />
                      3) กรุณายืนยันการสั่งซื้อก่อนเริ่มผลิต
                    </>
                }
              </div>
              {/* Totals */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', fontSize: 12 }}>
                {[
                  { l: 'ยอดก่อนส่วนลด', v: (view.subtotal || view.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) },
                  (view.discount > 0) && { l: 'ส่วนลด', v: `-${(view.discount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, red: true },
                  (view.vat_pct > 0)  && { l: `VAT ${view.vat_pct}%`, v: (view.vat_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) },
                ].filter(Boolean).map(r => (
                  <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 11px', borderBottom: '1px solid #f0f0f0' }}>
                    <span style={{ color: '#6b7280' }}>{r.l}</span>
                    <strong style={{ fontFamily: 'monospace', color: r.red ? '#dc2626' : '#111' }}>{r.v}</strong>
                  </div>
                ))}
                {/* Grand total — blue */}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 11px', background: `linear-gradient(90deg,${C.medium},#BFDBFE)`, color: C.dark, fontSize: 15, fontWeight: 900 }}>
                  <span>ยอดสุทธิ</span>
                  <span style={{ fontFamily: 'monospace' }}>{(view.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div style={{ padding: '3px 11px 5px', textAlign: 'right', fontSize: 9.5, color: '#9ca3af' }}>บาท (THB)</div>
              </div>
            </div>

            {/* ── PAYMENT ── */}
            <div style={{
              marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 84px', gap: 10,
              alignItems: 'center', border: '1px solid rgba(29,78,216,.18)',
              borderRadius: 10, padding: '8px 11px', background: `linear-gradient(135deg,#fff,${C.light})`,
            }}>
              <div>
                <div style={{ fontSize: 11, color: C.dark, fontWeight: 900, marginBottom: 3 }}>
                  ช่องทางชำระเงิน / PAYMENT METHOD
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 900, letterSpacing: .4, color: '#111', marginBottom: 1 }}>
                  {SHOP.bankAccount} ธนาคารกสิกรไทย
                </div>
                <div style={{ fontSize: 11, color: '#374151' }}>ชื่อบัญชี: {SHOP.bankName}</div>
                <div style={{ fontSize: 9.5, color: '#555', marginTop: 2 }}>
                  โอนแล้วส่งสลิปพร้อมแจ้งเลขที่&nbsp;<strong>{view.code}</strong>&nbsp;ทาง LINE:&nbsp;<strong>{SHOP.line}</strong>
                </div>
              </div>
              <div style={{ width: 84, height: 84, borderRadius: 8, border: '1px solid rgba(29,78,216,.3)', background: '#fff', overflow: 'hidden', flexShrink: 0 }}>
                <img src="/qr-payment.jpg" alt="QR" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
            </div>

            {/* ── SIGNATURE ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8, fontSize: 11 }}>
              {['ผู้รับใบเสนอราคา / ลูกค้า', 'ผู้เสนอราคา / C-SCREEN'].map(t => (
                <div key={t} style={{ border: '1px solid #e5e7eb', borderRadius: 9, padding: '7px 11px', minHeight: 52 }}>
                  <div style={{ fontWeight: 900, color: '#374151' }}>{t}</div>
                  <div style={{ marginTop: 18, borderTop: '1px solid #d1d5db', paddingTop: 3, textAlign: 'center', color: '#9ca3af', fontSize: 10 }}>ลงชื่อ / วันที่</div>
                </div>
              ))}
            </div>

            {/* ── FOOTER ── */}
            <div style={{ marginTop: 8, textAlign: 'center', color: '#9ca3af', fontSize: 10 }}>
              เอกสารนี้จัดทำโดยระบบ C-SCREEN · ใบเสนอราคาฉบับนี้มีผลถึง {view.valid_until ? fmtDate(view.valid_until) : '—'}
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ════════════════════════════════════════════════════════════
     LIST VIEW
  ════════════════════════════════════════════════════════════ */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {[
          { label: 'มูลค่าทั้งหมด',      value: `฿${totalVal.toLocaleString()}`,                              accent: 'var(--primary)', icon: '💰' },
          { label: 'รออนุมัติ',          value: rows.filter(q => q.status === 'รออนุมัติ').length + ' ใบ',    accent: 'var(--warning)', icon: '⏳' },
          { label: 'อนุมัติแล้ว',        value: rows.filter(q => q.status === 'อนุมัติแล้ว').length + ' ใบ',  accent: 'var(--success)', icon: '✅' },
          { label: 'แปลงเป็น Invoice',   value: rows.filter(q => q.status === 'แปลงเป็น Invoice').length + ' ใบ', accent: 'var(--info)', icon: '📄' },
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>🔍</span>
            <input type="text" placeholder="ค้นหาใบเสนอราคา..." value={search}
              onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36, width: 240 }} />
          </div>
          <button onClick={() => setFilter('')} className={!filterStatus ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}>ทั้งหมด</button>
          {Object.keys(STATUS_BADGE).map(s => (
            <button key={s} onClick={() => setFilter(filterStatus === s ? '' : s)}
              className={filterStatus === s ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}>{s}</button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ ปิด' : '+ สร้างใบเสนอราคา'}
        </button>
      </div>

      {/* ── FORM ── */}
      {showForm && (
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>{editId ? '✏️ แก้ไขใบเสนอราคา' : '➕ ใบเสนอราคาใหม่'}</div>

          {/* Row 1 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <label>ลูกค้า *</label>
              <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}>
                <option value="">— เลือกลูกค้า —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <label>วันที่เอกสาร</label>
              <input type="date" value={form.document_date} onChange={e => setForm({ ...form, document_date: e.target.value })} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <label>ใบเสนอราคาใช้ได้ถึง</label>
              <input type="date" value={form.valid_until} onChange={e => setForm({ ...form, valid_until: e.target.value })} />
            </div>
          </div>

          {/* Row 2 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <label>VAT (%)</label>
              <select value={form.vat_pct} onChange={e => setForm({ ...form, vat_pct: e.target.value })}>
                <option value={0}>ไม่มี VAT</option>
                <option value={7}>7%</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <label>ส่วนลด (฿)</label>
              <input type="number" min="0" value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })} />
            </div>
          </div>

          {/* Items */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 7 }}>รายการสินค้า / บริการ</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  <th style={{ padding: '5px 8px', textAlign: 'left', fontSize: 12 }}>รายการ</th>
                  <th style={{ padding: '5px 8px', fontSize: 12, width: 72 }}>จำนวน</th>
                  <th style={{ padding: '5px 8px', fontSize: 12, width: 110 }}>ราคา/หน่วย</th>
                  <th style={{ padding: '5px 8px', textAlign: 'right', fontSize: 12, width: 110 }}>รวม</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {form.items.map((it, i) => (
                  <tr key={i}>
                    <td style={{ padding: '3px 5px' }}>
                      <input type="text" placeholder="รายละเอียด" value={it.desc}
                        onChange={e => updateItem(i, 'desc', e.target.value)} style={{ width: '100%' }} />
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
                    <td style={{ padding: '3px 5px' }}>
                      {Object.entries(it.sizes||{}).some(([s,v]) => s !== 'XXL' && parseInt(v)>0) ? (
                        <div style={{ textAlign:'center', fontWeight:800, color:C.primary, padding:'6px 2px', fontSize:14 }}>
                          {Object.entries(it.sizes||{}).filter(([s])=>s!=='XXL').reduce((sum,[,v])=>sum+(parseInt(v)||0),0)}
                        </div>
                      ) : (
                        <input type="number" min="1" value={it.qty} onChange={e => updateItem(i, 'qty', e.target.value)} />
                      )}
                    </td>
                    <td style={{ padding: '3px 5px' }}>
                      <input type="number" min="0" value={it.price} onChange={e => updateItem(i, 'price', e.target.value)} />
                    </td>
                    <td style={{ padding: '3px 8px', textAlign: 'right', fontWeight: 700 }}>฿{(it.amount || 0).toLocaleString()}</td>
                    <td style={{ padding: '3px 5px', textAlign: 'center' }}>
                      {form.items.length > 1 && (
                        <button onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))}
                          style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16 }}>×</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn btn-outline btn-sm" style={{ marginTop: 7 }}
              onClick={() => setForm(f => ({ ...f, items: [...f.items, { ...emptyItem }] }))}>+ เพิ่มรายการ</button>
          </div>

          {/* Summary preview */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ minWidth: 220, fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {[
                { l: 'ยอดรวม', v: `฿${subtotal.toLocaleString()}` },
                discAmt > 0 && { l: 'ส่วนลด', v: `-฿${discAmt.toLocaleString()}`, red: true },
                vatAmt  > 0 && { l: `VAT ${form.vat_pct}%`, v: `฿${vatAmt.toFixed(2)}` },
              ].filter(Boolean).map(r => (
                <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', borderBottom: '1px solid var(--border)', color: r.red ? 'var(--danger)' : undefined }}>
                  <span>{r.l}</span><span>{r.v}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', fontWeight: 800, fontSize: 14, background: C.medium, color: C.dark }}>
                <span>ยอดสุทธิ</span><span>฿{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 10 }}>
            <label style={{ fontSize: 12 }}>หมายเหตุ</label>
            <input type="text" placeholder="หมายเหตุ / เงื่อนไข"
              value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'กำลังบันทึก...' : '💾 บันทึกใบเสนอราคา'}
            </button>
            <button className="btn btn-outline" onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm()) }}>ยกเลิก</button>
          </div>
        </div>
      )}

      {/* ── TABLE ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? <LoadingSpinner /> : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>เลขที่</th><th>Invoice</th><th>วันที่</th>
                    <th>ลูกค้า</th><th>มูลค่า</th><th>ใช้ได้ถึง</th><th>สถานะ</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(q => {
                    const relInv = invoices.find(i => i.quotation_id === q.id)
                    return (
                      <tr key={q.id} className="row-link">
                        <td style={{ color: 'var(--primary)', fontFamily: 'monospace', fontWeight: 700 }}>{q.code}</td>
                        <td style={{ fontSize: 12, fontFamily: 'monospace' }}>
                          {relInv ? <span style={{ color: 'var(--info)', fontWeight: 600 }}>{relInv.code}</span>
                                  : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(q.document_date || q.created_at)}</td>
                        <td style={{ fontWeight: 600 }}>{q.customers?.name || '—'}</td>
                        <td style={{ fontWeight: 800, color: 'var(--primary)' }}>฿{(q.total || 0).toLocaleString()}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(q.valid_until)}</td>
                        <td><span className={STATUS_BADGE[q.status] || 'badge badge-gray'}>{q.status}</span></td>
                        <td style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button className="btn btn-outline btn-sm" onClick={() => setView(q)}>ดู</button>
                          {q.status !== 'แปลงเป็น Invoice' && (<>
                            <button className="btn btn-outline btn-sm" onClick={() => startEdit(q)}>✏️</button>
                            <button className="btn btn-outline btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(q)}>ลบ</button>
                            <button className="btn btn-primary btn-sm" onClick={() => handleConvertToInvoice(q)}>→ INV</button>
                          </>)}
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>ไม่พบรายการ</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
              แสดง {filtered.length} จาก {rows.length} รายการ
            </div>
          </>
        )}
      </div>
    </div>
  )
}
