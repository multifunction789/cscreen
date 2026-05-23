'use client'
import { useState, useEffect } from 'react'
import { getReceipts, updateReceipt, insertTransaction } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { fmtDate, SHOP } from '@/lib/shop'
import { todayStr, exportJpeg, shareDoc, uploadFile, printDoc } from '@/lib/docUtils'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

/* ── Green theme ──────────────────────────────────────────── */
const C = {
  primary : '#065f46',
  dark    : '#064E3B',
  light   : '#D1FAE5',
  medium  : '#A7F3D0',
  stripe  : 'linear-gradient(90deg,#064E3B,#065f46,#10B981)',
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

export default function ReceiptPage() {
  const [rows, setRows]               = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [filterPaid, setFilter]       = useState('')
  const [view, setView]               = useState(null)
  const [payMethod, setPayMethod]     = useState('โอน')
  const [fileUploading, setFileUploading] = useState(false)
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7))

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await getReceipts()
    setRows(data || [])
    setLoading(false)
  }

  async function handlePay(r) {
    await updateReceipt(r.id, { paid: true, payment_method: payMethod })
    await insertTransaction({
      description: `รับชำระ ${r.code} – ${r.customers?.name || ''}`,
      type: 'รายรับ', amount: r.total, transaction_date: todayStr(),
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
    load()
  }

  const filtered = rows.filter(r => {
    const ms = r.code?.includes(search) || r.customers?.name?.includes(search) || r.invoices?.code?.includes(search)
    const mf = filterPaid === '' || (filterPaid === 'paid' ? r.paid : !r.paid)
    const dm = !monthFilter || (r.document_date || r.created_at || '').startsWith(monthFilter)
    return ms && mf && dm
  })

  const totalPaid    = rows.filter(r => r.paid).reduce((s, r) => s + (r.total || 0), 0)
  const totalPending = rows.filter(r => !r.paid).reduce((s, r) => s + (r.total || 0), 0)
  const monthPaid    = filtered.filter(r => r.paid).reduce((s, r) => s + (r.total || 0), 0)
  const monthPending = filtered.filter(r => !r.paid).reduce((s, r) => s + (r.total || 0), 0)

  /* ════════════════════════════════════════════════════════════
     DETAIL / PRINT VIEW
  ════════════════════════════════════════════════════════════ */
  if (view) {
    const cust = view.customers || {}
    const inv  = view.invoices  || {}

    return (
      <div style={{ maxWidth: 794, margin: '0 auto', padding: 24 }}>

        {/* ── TOOLBAR ── */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => setView(null)}>← กลับ</button>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {!view.paid && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)} style={{ width: 120 }}>
                  {['โอน', 'เงินสด', 'บัตรเครดิต', 'QR Code'].map(m => <option key={m}>{m}</option>)}
                </select>
                <button className="btn btn-primary"
                  style={{ background: C.primary, borderColor: C.primary }}
                  onClick={() => { handlePay(view); setView(null) }}>
                  ✓ รับชำระเงิน
                </button>
              </div>
            )}
            {/* File attach */}
            <label className="btn btn-outline" style={{ cursor: 'pointer', position: 'relative' }}>
              📎 {fileUploading ? 'กำลังอัปโหลด...' : view.file_url ? 'ดูเอกสาร' : 'แนบไฟล์'}
              {!view.file_url && !fileUploading && (
                <input type="file" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileAttach(view, f) }} />
              )}
            </label>
            {view.file_url && (
              <a href={view.file_url} target="_blank" rel="noreferrer" className="btn btn-outline">🔗 เปิดไฟล์</a>
            )}
            <button className="btn btn-outline" onClick={() => shareDoc({
              title: `ใบเสร็จ ${view.code}`,
              text: `ลูกค้า: ${cust.name || ''}\nยอดชำระ: ฿${(view.total || 0).toLocaleString()}\nสถานะ: ${view.paid ? 'ชำระแล้ว' : 'รอชำระ'}\n— C-Screen ${SHOP.tel}`,
            })}>🔗 แชร์</button>
            <button className="btn btn-outline" onClick={() => exportJpeg('print-area', `RC-${view.code}`)}>📷 JPEG</button>
            <button className="btn btn-primary" style={{ background: C.primary, borderColor: C.primary }} onClick={() => printDoc()}>🖨️ พิมพ์</button>
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
            color: 'rgba(6,95,70,.04)', letterSpacing: 3, transform: 'rotate(-90deg)',
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
                        border: '1px solid rgba(6,95,70,.2)',
                      }}>{t}</span>
                    ))}
                  </div>
                </div>
              </div>
              {/* Doc badge */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 26, fontWeight: 900, color: C.primary, lineHeight: 1 }}>ใบเสร็จรับเงิน</div>
                <div style={{ fontSize: 10, letterSpacing: 2, color: '#6b7280', fontWeight: 700, marginTop: 2 }}>RECEIPT</div>
                <div style={{
                  display: 'inline-block', marginTop: 6, padding: '3px 10px', borderRadius: 99,
                  background: view.paid ? C.light : '#FFF7ED',
                  color: view.paid ? C.dark : '#92400E',
                  fontSize: 10.5, fontWeight: 800,
                  border: `1px solid ${view.paid ? C.medium : '#FED7AA'}`,
                }}>
                  {view.paid ? '✓ ชำระแล้ว' : 'รอชำระเงิน'}
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
                    { l: 'ชื่อ / บริษัท', v: cust.name || '—', bold: true },
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
                    { l: 'เลขที่ REC', v: view.code,                                     green: true },
                    { l: 'วันที่ออก', v: fmtDate(view.document_date || view.created_at) },
                    inv.code && { l: 'อ้างอิง INV', v: inv.code },
                    view.paid && view.payment_method && { l: 'วิธีชำระ', v: view.payment_method },
                  ].filter(Boolean).map(r => (
                    <div key={r.l} style={{ display: 'grid', gridTemplateColumns: '76px 1fr', gap: 6, margin: '1px 0' }}>
                      <span style={{ color: '#6b7280' }}>{r.l}</span>
                      <span style={{ fontWeight: 700, textAlign: 'right', color: r.green ? C.primary : '#111' }}>{r.v}</span>
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
                {(inv.items || []).length > 0 ? inv.items.map((it, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 1 ? '#f0fdf4' : '#fff' }}>
                    <td style={{ padding: '6px 9px', textAlign: 'center', color: '#9ca3af', borderRight: '1px solid #f0f0f0' }}>{i + 1}</td>
                    <td style={{ padding: '6px 9px', fontWeight: 600, borderRight: '1px solid #f0f0f0' }}>
                      {it.desc}
                      {it.sizes && Object.values(it.sizes).some(v => parseInt(v) > 0) && (
                        <div style={{ fontSize:9.5, color:'#6b7280', fontWeight:400, marginTop:2, letterSpacing:.3 }}>
                          {Object.entries(it.sizes).filter(([,v])=>parseInt(v)>0).map(([s,v])=>`${s}:${v}`).join(' · ')}
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
                )) : (
                  <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '6px 9px', textAlign: 'center', color: '#9ca3af', borderRight: '1px solid #f0f0f0' }}>1</td>
                    <td style={{ padding: '6px 9px', fontWeight: 600, borderRight: '1px solid #f0f0f0' }}>ค่าบริการ / สินค้า</td>
                    <td style={{ padding: '6px 9px', textAlign: 'center', borderRight: '1px solid #f0f0f0' }}>1</td>
                    <td style={{ padding: '6px 9px', textAlign: 'right', fontFamily: 'monospace', borderRight: '1px solid #f0f0f0' }}>
                      {(view.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '6px 9px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                      {(view.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}
                {(inv.items || []).length > 0 && Array.from({ length: Math.max(0, 5 - (inv.items || []).length) }).map((_, i) => (
                  <tr key={`f${i}`} style={{ borderBottom: '1px solid #f0f9f5', height: 22 }}>
                    <td style={{ borderRight: '1px solid #f0f0f0' }} /><td style={{ borderRight: '1px solid #f0f0f0' }} />
                    <td style={{ borderRight: '1px solid #f0f0f0' }} /><td style={{ borderRight: '1px solid #f0f0f0' }} />
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ── AMOUNT IN WORDS ── */}
            <div style={{
              marginTop: 8, border: '1px solid rgba(6,95,70,.2)', background: C.light,
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
                <div style={{ fontWeight: 900, color: C.dark, marginBottom: 4, fontSize: 11 }}>หมายเหตุ / เงื่อนไขการรับเงิน</div>
                <>
                  1) ใบเสร็จฉบับนี้ออกให้ ณ วันที่ชำระเงินจริง<br />
                  2) กรุณาเก็บใบเสร็จนี้ไว้เป็นหลักฐานการชำระเงิน<br />
                  3) ขอบคุณที่ใช้บริการ C-SCREEN
                </>
              </div>
              {/* Totals */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', fontSize: 12 }}>
                {[
                  (inv.subtotal > 0) && { l: 'ยอดก่อนส่วนลด', v: (inv.subtotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) },
                  (inv.discount > 0) && { l: 'ส่วนลด', v: `-${(inv.discount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, red: true },
                  ((inv.vat_pct || 0) > 0) && { l: `VAT ${inv.vat_pct}%`, v: (inv.vat_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) },
                  ((inv.wht_pct || 0) > 0) && { l: `หัก ณ ที่จ่าย ${inv.wht_pct}%`, v: `-${(inv.wht_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, red: true },
                ].filter(Boolean).map(r => (
                  <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 11px', borderBottom: '1px solid #f0f0f0' }}>
                    <span style={{ color: '#6b7280' }}>{r.l}</span>
                    <strong style={{ fontFamily: 'monospace', color: r.red ? '#dc2626' : '#111' }}>{r.v}</strong>
                  </div>
                ))}
                {/* Grand total — green */}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 11px', background: `linear-gradient(90deg,${C.light},${C.medium})`, color: C.dark, fontSize: 15, fontWeight: 900 }}>
                  <span>ยอดสุทธิ</span>
                  <span style={{ fontFamily: 'monospace' }}>{(view.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                {/* Payment status */}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 11px', borderTop: '1px solid #f0f0f0', background: view.paid ? '#F0FDF4' : '#FFF7ED' }}>
                  <span style={{ color: view.paid ? C.primary : '#92400E', fontSize: 11.5, fontWeight: 700 }}>
                    {view.paid ? '✓ ชำระแล้ว' : 'รอชำระเงิน'}
                  </span>
                  {view.paid && view.payment_method && (
                    <span style={{ fontSize: 11, color: C.primary }}>วิธี: {view.payment_method}</span>
                  )}
                </div>
                <div style={{ padding: '3px 11px 5px', textAlign: 'right', fontSize: 9.5, color: '#9ca3af' }}>บาท (THB)</div>
              </div>
            </div>

            {/* ── PAYMENT ── */}
            <div style={{
              marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 84px', gap: 10,
              alignItems: 'center', border: '1px solid rgba(6,95,70,.2)',
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
              <div style={{ width: 84, height: 84, borderRadius: 8, border: '1px solid rgba(6,95,70,.3)', background: '#fff', overflow: 'hidden', flexShrink: 0 }}>
                <img src="/qr-payment.jpg" alt="QR" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
            </div>

            {/* ── SIGNATURE ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8, fontSize: 11 }}>
              {['ผู้รับเงิน / C-SCREEN', 'ผู้ชำระเงิน / ลูกค้า'].map(t => (
                <div key={t} style={{ border: '1px solid #e5e7eb', borderRadius: 9, padding: '7px 11px', minHeight: 52 }}>
                  <div style={{ fontWeight: 900, color: '#374151' }}>{t}</div>
                  <div style={{ marginTop: 18, borderTop: '1px solid #d1d5db', paddingTop: 3, textAlign: 'center', color: '#9ca3af', fontSize: 10 }}>ลงชื่อ / วันที่</div>
                </div>
              ))}
            </div>

            {/* ── FOOTER ── */}
            <div style={{ marginTop: 8, textAlign: 'center', color: '#9ca3af', fontSize: 10 }}>
              เอกสารนี้จัดทำโดยระบบ C-SCREEN · ใบเสร็จรับเงินฉบับนี้ใช้สำหรับยืนยันการชำระเงิน
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
          { label: 'ใบเสร็จทั้งหมด',              value: rows.length + ' ใบ',               accent: 'var(--primary)', icon: '🧾' },
          { label: 'ชำระแล้ว (รวม)',               value: `฿${totalPaid.toLocaleString()}`,   accent: 'var(--success)', icon: '✅' },
          { label: `รับเงินเดือน ${monthFilter}`,  value: `฿${monthPaid.toLocaleString()}`,   accent: '#7C3AED',        icon: '📅' },
          { label: 'รอชำระ',                       value: `฿${totalPending.toLocaleString()}`, accent: 'var(--warning)', icon: '⏳' },
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>🔍</span>
          <input type="text" placeholder="ค้นหาใบเสร็จ..." value={search}
            onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36, width: 200 }} />
        </div>
        {[['', 'ทั้งหมด'], ['paid', 'ชำระแล้ว'], ['unpaid', 'รอชำระ']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={filterPaid === v ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}>{l}</button>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>📅 เดือน</span>
          <input type="month" value={monthFilter}
            onChange={e => setMonthFilter(e.target.value)}
            style={{ fontSize: 13, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)' }} />
          {monthFilter && (
            <button className="btn btn-outline btn-sm" onClick={() => setMonthFilter('')}>ทั้งหมด</button>
          )}
        </div>
      </div>

      {/* ── TABLE ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? <LoadingSpinner /> : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>เลขที่</th><th>วันที่</th><th>ลูกค้า</th>
                    <th>อ้างอิง Invoice</th><th>มูลค่า</th><th>วิธีชำระ</th><th>สถานะ</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className="row-link">
                      <td style={{ color: 'var(--primary)', fontFamily: 'monospace', fontWeight: 700 }}>{r.code}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(r.document_date || r.created_at)}</td>
                      <td style={{ fontWeight: 600 }}>{r.customers?.name || '—'}</td>
                      <td style={{ color: 'var(--info)', fontWeight: 600, fontSize: 13 }}>{r.invoices?.code || '—'}</td>
                      <td style={{ fontWeight: 800, fontSize: 14 }}>฿{(r.total || 0).toLocaleString()}</td>
                      <td>{r.paid
                        ? <span className="badge badge-gray">{r.payment_method || 'โอน'}</span>
                        : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                      </td>
                      <td>
                        <span className={r.paid ? 'badge badge-green' : 'badge badge-yellow'}>
                          {r.paid ? '✓ ชำระแล้ว' : 'รอชำระ'}
                        </span>
                      </td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-outline btn-sm" onClick={() => setView(r)}>ดู</button>
                        {!r.paid && (
                          <button className="btn btn-primary btn-sm"
                            style={{ background: C.primary, borderColor: C.primary }}
                            onClick={() => setView(r)}>รับชำระ</button>
                        )}
                      </td>
                    </tr>
                  ))}
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
