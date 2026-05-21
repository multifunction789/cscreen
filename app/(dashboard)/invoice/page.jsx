'use client'
import { useState, useEffect } from 'react'
import {
  getInvoices, insertInvoice, updateInvoice, deleteInvoice,
  getCustomers, insertJobOrder, getJobOrders,
  insertReceipt, getReceipts,
  getMaterials, deductMaterial,
  getPayments, insertPayment, deletePayment,
} from '@/lib/db'
import { fmtDate, SHOP } from '@/lib/shop'
import { todayStr, exportJpeg, shareDoc, printDoc } from '@/lib/docUtils'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

// ── Status ──────────────────────────────────────────────────
const INV_PIPELINE = ['รอมัดจำ', 'มัดจำแล้ว', 'กำลังผลิต', 'รอชำระส่วนที่เหลือ', 'ปิดงาน']
const STATUS_BADGE = {
  'รอมัดจำ':              'badge badge-yellow',
  'มัดจำแล้ว':            'badge badge-cyan',
  'กำลังผลิต':            'badge badge-blue',
  'รอชำระส่วนที่เหลือ':  'badge badge-purple',
  'ปิดงาน':               'badge badge-green',
  'ยกเลิก':               'badge badge-red',
  'รอชำระ':               'badge badge-yellow', // legacy
  'ชำระแล้ว':             'badge badge-green',  // legacy
}

// ── Status Pipeline visual ───────────────────────────────────
function StatusPipeline({ current }) {
  const ci = INV_PIPELINE.indexOf(current)
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 4 }}>
      {INV_PIPELINE.map((s, i) => {
        const done   = i < ci
        const active = i === ci
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              padding: '5px 12px', borderRadius: 99, fontSize: 12, fontWeight: active ? 700 : 500,
              background:  done ? '#dcfce7' : active ? 'var(--primary)' : 'var(--bg)',
              color:       done ? '#166534' : active ? '#fff' : 'var(--text-muted)',
              border:      `1px solid ${done ? '#86efac' : active ? 'var(--primary)' : 'var(--border)'}`,
              whiteSpace: 'nowrap',
            }}>{done ? '✓ ' : ''}{s}</div>
            {i < INV_PIPELINE.length - 1 && (
              <div style={{ width: 20, height: 2, background: done ? '#86efac' : 'var(--border)' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Form helpers ─────────────────────────────────────────────
const emptyItem = { desc: '', qty: 1, price: 0, amount: 0, material_id: null }
function calcItems(items) {
  return items.map(it => ({ ...it, amount: (parseFloat(it.qty) || 0) * (parseFloat(it.price) || 0) }))
}
const emptyForm = () => ({
  customer_id: '', due_date: '', document_date: todayStr(), notes: '', vat_pct: 0, discount: 0, wht_pct: 0,
  items: [{ ...emptyItem }],
})
const emptyPayForm = () => ({
  amount: '', payment_type: 'มัดจำ', payment_method: 'โอน', note: '', payment_date: todayStr(),
})

export default function InvoicePage() {
  const [rows, setRows]           = useState([])
  const [customers, setCustomers] = useState([])
  const [jobs, setJobs]           = useState([])
  const [materials, setMaterials] = useState([])
  const [receipts, setReceipts]   = useState([])
  const [payments, setPayments]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [filterStatus, setFilter] = useState('')
  const [showForm, setShowForm]   = useState(false)
  const [view, setView]           = useState(null)       // invoice object being viewed
  const [viewTab, setViewTab]     = useState('เอกสาร')
  const [saving, setSaving]       = useState(false)
  const [savingPay, setSavingPay] = useState(false)
  const [editId, setEditId]       = useState(null)
  const [form, setForm]           = useState(emptyForm())
  const [payForm, setPayForm]     = useState(emptyPayForm())

  useEffect(() => { load() }, [])

  async function load() {
    const [invRes, cusRes, jobRes, rcRes, matRes, payRes] = await Promise.all([
      getInvoices(), getCustomers(), getJobOrders(), getReceipts(), getMaterials(), getPayments(),
    ])
    setRows(invRes.data   || [])
    setCustomers(cusRes.data  || [])
    setJobs(jobRes.data   || [])
    setReceipts(rcRes.data    || [])
    setMaterials(matRes.data  || [])
    setPayments(payRes.data   || [])
    setLoading(false)
  }

  // ── Form helpers ──────────────────────────────────────────
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
    setForm(f => ({ ...f, items: calcItems([...f.items, { desc: mat.name, qty: 1, price: 0, amount: 0, material_id: mat.id }]) }))
  }

  const subtotal = form.items.reduce((s, it) => s + (it.amount || 0), 0)
  const discAmt  = parseFloat(form.discount) || 0
  const vatAmt   = ((subtotal - discAmt) * (parseFloat(form.vat_pct) || 0)) / 100
  const whtAmt   = ((subtotal - discAmt) * (parseFloat(form.wht_pct) || 0)) / 100
  const total    = subtotal - discAmt + vatAmt - whtAmt

  // ── Save Invoice ──────────────────────────────────────────
  async function handleSave() {
    if (!form.customer_id) return alert('กรุณาเลือกลูกค้า')
    if (form.items.length === 0) return alert('กรุณาเพิ่มรายการสินค้า')
    setSaving(true)
    const items = calcItems(form.items)
    const payload = {
      customer_id:    form.customer_id,
      items,
      subtotal,
      discount:       discAmt,
      vat_pct:        parseFloat(form.vat_pct) || 0,
      vat_amount:     vatAmt,
      wht_pct:        parseFloat(form.wht_pct) || 0,
      wht_amount:     whtAmt,
      total,
      due_date:       form.due_date || null,
      document_date:  form.document_date || todayStr(),
      notes:          form.notes,
      status:         'รอมัดจำ',
    }
    if (editId) {
      await updateInvoice(editId, { ...payload, status: undefined }) // keep existing status on edit
      setEditId(null)
    } else {
      const maxNum = rows.reduce((max, r) => {
        const n = parseInt(r.code?.replace('INV-', '') || '0')
        return n > max ? n : max
      }, 0)
      const code = 'INV-' + String(maxNum + 1).padStart(4, '0')
      await insertInvoice({ ...payload, code })
      for (const it of items) {
        if (it.material_id && it.qty > 0) await deductMaterial(it.material_id, parseFloat(it.qty))
      }
    }
    setForm(emptyForm()); setShowForm(false); setSaving(false)
    load()
  }

  // ── Delete Invoice ────────────────────────────────────────
  async function handleDelete(inv) {
    if (!confirm(`ลบ ${inv.code} ใช่ไหม?`)) return
    await deleteInvoice(inv.id)
    load()
  }

  // ── Edit Invoice ──────────────────────────────────────────
  function startEdit(inv) {
    setEditId(inv.id)
    setForm({
      customer_id:   inv.customer_id,
      due_date:      inv.due_date || '',
      document_date: inv.document_date || todayStr(),
      notes:         inv.notes || '',
      vat_pct:       inv.vat_pct || 0,
      discount:      inv.discount || 0,
      wht_pct:       inv.wht_pct || 0,
      items:         inv.items || [{ ...emptyItem }],
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Add Payment ───────────────────────────────────────────
  async function handleAddPayment() {
    if (!payForm.amount || !view) return
    setSavingPay(true)
    const invPayments = payments.filter(p => p.invoice_id === view.id)
    const paidSoFar   = invPayments.reduce((s, p) => s + (p.amount || 0), 0)
    const newPaidTotal = paidSoFar + parseFloat(payForm.amount)
    // Generate PAY code
    const maxPay = payments.reduce((max, p) => {
      const n = parseInt(p.code?.replace('PAY-', '') || '0'); return n > max ? n : max
    }, 0)
    await insertPayment({
      code:           'PAY-' + String(maxPay + 1).padStart(4, '0'),
      invoice_id:     view.id,
      amount:         parseFloat(payForm.amount),
      payment_date:   payForm.payment_date || todayStr(),
      payment_type:   payForm.payment_type,
      payment_method: payForm.payment_method,
      note:           payForm.note,
    })
    // Auto-advance invoice status
    let newStatus = view.status
    const invTotal = view.total || 0
    if (newPaidTotal >= invTotal) {
      newStatus = 'ปิดงาน'
      // Auto-create receipt if none
      const existRC = receipts.find(r => r.invoice_id === view.id)
      if (!existRC) {
        const maxRC = receipts.reduce((max, r) => {
          const n = parseInt(r.code?.replace('RC-', '') || '0'); return n > max ? n : max
        }, 0)
        await insertReceipt({
          code: 'RC-' + String(maxRC + 1).padStart(4, '0'),
          customer_id:    view.customer_id,
          invoice_id:     view.id,
          total:          invTotal,
          paid:           true,
          payment_method: payForm.payment_method,
        })
      }
    } else if (['รอมัดจำ', 'รอชำระ'].includes(view.status) && newPaidTotal > 0) {
      newStatus = 'มัดจำแล้ว'
    } else if (view.status === 'กำลังผลิต' && newPaidTotal > 0 && newPaidTotal < invTotal) {
      newStatus = 'รอชำระส่วนที่เหลือ'
    }
    if (newStatus !== view.status) await updateInvoice(view.id, { status: newStatus })
    setPayForm(emptyPayForm())
    setSavingPay(false)
    await load()
    // refresh the view object
    setView(v => ({ ...v, status: newStatus }))
  }

  // ── Delete Payment ────────────────────────────────────────
  async function handleDeletePayment(p) {
    if (!confirm(`ลบการชำระ ${p.code} ฿${p.amount?.toLocaleString()} ใช่ไหม?`)) return
    await deletePayment(p.id)
    load()
  }

  // ── Convert to Job Order ──────────────────────────────────
  async function handleConvertToJO(inv) {
    const existJO = jobs.find(j => j.invoice_id === inv.id)
    if (existJO) return alert(`มีใบงาน ${existJO.code} อยู่แล้ว`)
    const maxJO = jobs.reduce((max, j) => {
      const n = parseInt(j.code?.replace('JO-', '') || '0'); return n > max ? n : max
    }, 0)
    const code = 'JO-' + String(maxJO + 1).padStart(4, '0')
    const defSizes = ['S', 'M', 'L', 'XL', 'XXL']
    await insertJobOrder({
      code,
      customer_id: inv.customer_id,
      invoice_id:  inv.id,
      item_desc:   (inv.items || []).map(it => it.desc).join(', '),
      status:      'รอออกแบบ',
      sizes:       defSizes,
      prod_items:  [{ style: '', color: '', qtys: Object.fromEntries(defSizes.map(s => [s, ''])) }],
    })
    const newStatus = ['รอมัดจำ', 'มัดจำแล้ว'].includes(inv.status) ? 'กำลังผลิต' : inv.status
    await updateInvoice(inv.id, { jo_created: true, status: newStatus })
    alert(`✅ สร้างใบงาน ${code} แล้ว — ไปแก้รายละเอียดการผลิตในหน้าใบงาน`)
    load()
    setView(v => v ? { ...v, jo_created: true, status: newStatus } : v)
  }

  // ── Filters ───────────────────────────────────────────────
  const filtered = rows.filter(r => {
    const ms = r.code?.includes(search) || r.customers?.name?.includes(search)
    const mf = !filterStatus || r.status === filterStatus
    return ms && mf
  })
  const totalAll  = rows.reduce((s, r) => s + (r.total || 0), 0)
  const totalOpen = rows.filter(r => !['ปิดงาน','ชำระแล้ว'].includes(r.status)).reduce((s, r) => s + (r.total || 0), 0)
  const totalClosed = rows.filter(r => ['ปิดงาน','ชำระแล้ว'].includes(r.status)).reduce((s, r) => s + (r.total || 0), 0)

  // ──────────────────────────────────────────────────────────
  // INVOICE DETAIL VIEW
  // ──────────────────────────────────────────────────────────
  if (view) {
    const cust      = customers.find(c => c.id === view.customer_id) || view.customers || {}
    const invPay    = payments.filter(p => p.invoice_id === view.id)
    const paidTotal = invPay.reduce((s, p) => s + (p.amount || 0), 0)
    const remaining = (view.total || 0) - paidTotal
    const relatedJO = jobs.find(j => j.invoice_id === view.id)
    const relatedRC = receipts.find(r => r.invoice_id === view.id)
    const tabs      = ['เอกสาร', 'ชำระเงิน', 'เอกสารที่เกี่ยวข้อง']

    return (
      <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
        {/* Top bar */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <button className="btn btn-outline" onClick={() => setView(null)}>← กลับ</button>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!['ปิดงาน','ยกเลิก','ชำระแล้ว'].includes(view.status) && (
              <button className="btn btn-outline" onClick={() => { startEdit(view); setView(null) }}>✏️ แก้ไข</button>
            )}
            {!view.jo_created && (
              <button className="btn btn-outline" onClick={() => handleConvertToJO(view)}>📝 สร้างใบงาน</button>
            )}
            <button className="btn btn-outline" onClick={() => shareDoc({
              title: `ใบแจ้งหนี้ ${view.code}`,
              text:  `ลูกค้า: ${cust.name || ''}\nยอดสุทธิ: ฿${(view.total || 0).toLocaleString()}\nครบกำหนด: ${view.due_date ? fmtDate(view.due_date) : '-'}\n— C-Screen ${SHOP.tel}`
            })}>🔗 แชร์</button>
            <button className="btn btn-outline" onClick={() => exportJpeg('print-area', `INV-${view.code}`)}>📷 JPEG</button>
            <button className="btn btn-primary" onClick={() => printDoc()}>🖨️ พิมพ์</button>
          </div>
        </div>

        {/* Status Pipeline */}
        <div className="no-print">
          <StatusPipeline current={view.status} />
        </div>

        {/* Tabs */}
        <div className="no-print" style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
          {tabs.map(t => (
            <button key={t}
              className={viewTab === t ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
              style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
              onClick={() => setViewTab(t)}>{t}</button>
          ))}
        </div>

        {/* ── Tab: เอกสาร ── */}
        {viewTab === 'เอกสาร' && (
          <div id="print-area" style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 40 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--primary)', letterSpacing: -1 }}>C-SCREEN</div>
                <div style={{ fontSize: 11, color: '#666', maxWidth: 260, lineHeight: 1.6 }}>
                  {SHOP.address}<br />Tel: {SHOP.tel} | Line: {SHOP.line}<br />
                  เลขประจำตัวผู้เสียภาษี: {SHOP.taxId}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--text)', marginBottom: 4 }}>ใบแจ้งหนี้</div>
                <div style={{ fontSize: 13, color: 'var(--primary)', fontFamily: 'monospace', fontWeight: 700 }}>{view.code}</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>วันที่: {fmtDate(view.document_date || view.created_at)}</div>
                {view.due_date && <div style={{ fontSize: 12, color: '#666' }}>ครบกำหนด: {fmtDate(view.due_date)}</div>}
                <div style={{ marginTop: 6 }}>
                  <span className={STATUS_BADGE[view.status] || 'badge badge-gray'}>{view.status}</span>
                </div>
              </div>
            </div>
            {/* Customer */}
            <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 4 }}>ลูกค้า / BILL TO</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{cust.name || view.customers?.name}</div>
              {cust.address && <div style={{ fontSize: 12, color: '#666' }}>{cust.address}</div>}
              {cust.tax_id  && <div style={{ fontSize: 12, color: '#666' }}>เลขผู้เสียภาษี: {cust.tax_id}</div>}
              {cust.phone   && <div style={{ fontSize: 12, color: '#666' }}>Tel: {cust.phone}</div>}
            </div>
            {/* Items */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
              <thead>
                <tr style={{ background: 'var(--primary)', color: '#fff' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12 }}>รายการ</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, width: 60 }}>จำนวน</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, width: 100 }}>ราคา/หน่วย</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, width: 110 }}>จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                {(view.items || []).map((it, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px 12px', fontSize: 13 }}>{it.desc}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 13 }}>{it.qty}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 13 }}>฿{(it.price || 0).toLocaleString()}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 13, fontWeight: 600 }}>฿{(it.amount || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Summary */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ minWidth: 220 }}>
                {[
                  { label: 'ยอดรวม',                                  val: `฿${(view.subtotal || 0).toLocaleString()}` },
                  ...(view.discount > 0  ? [{ label: 'ส่วนลด',                val: `-฿${(view.discount || 0).toLocaleString()}` }] : []),
                  ...(view.vat_pct > 0   ? [{ label: `VAT ${view.vat_pct}%`, val: `฿${(view.vat_amount || 0).toLocaleString()}` }] : []),
                  ...((view.wht_pct||0)>0? [{ label: `หัก ณ ที่จ่าย ${view.wht_pct}%`, val: `-฿${(view.wht_amount || 0).toLocaleString()}` }] : []),
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, borderBottom: '1px solid #eee' }}>
                    <span>{r.label}</span><span>{r.val}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 16, fontWeight: 800, color: 'var(--primary)', borderTop: '2px solid var(--primary)', marginTop: 4 }}>
                  <span>ยอดสุทธิ</span><span>฿{(view.total || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
            {view.notes && <div style={{ marginTop: 16, padding: '10px 14px', background: '#FFFBEB', borderRadius: 6, fontSize: 12 }}>หมายเหตุ: {view.notes}</div>}
          </div>
        )}

        {/* ── Tab: ชำระเงิน ── */}
        {viewTab === 'ชำระเงิน' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              {[
                { label: 'ยอดรวม Invoice',    value: `฿${(view.total || 0).toLocaleString()}`,  accent: 'var(--primary)' },
                { label: 'ชำระแล้ว',           value: `฿${paidTotal.toLocaleString()}`,           accent: 'var(--success)' },
                { label: 'คงเหลือ',            value: `฿${Math.max(0, remaining).toLocaleString()}`, accent: remaining > 0 ? 'var(--danger)' : 'var(--success)' },
              ].map(k => (
                <div key={k.label} style={{ background: 'var(--card)', borderRadius: 'var(--radius)', padding: '14px 16px', border: '1px solid var(--border)', borderLeft: `4px solid ${k.accent}` }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{k.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: k.accent, marginTop: 4 }}>{k.value}</div>
                </div>
              ))}
            </div>

            {/* Add payment form */}
            {view.status !== 'ปิดงาน' && view.status !== 'ยกเลิก' && (
              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>💰 บันทึกรับเงิน</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label>จำนวนเงิน (฿) *</label>
                    <input type="number" min="0" placeholder={`คงเหลือ ฿${Math.max(0,remaining).toLocaleString()}`}
                      value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label>ประเภทการชำระ</label>
                    <select value={payForm.payment_type} onChange={e => setPayForm({ ...payForm, payment_type: e.target.value })}>
                      <option>มัดจำ</option>
                      <option>ชำระส่วนที่เหลือ</option>
                      <option>ชำระเต็มจำนวน</option>
                      <option>อื่นๆ</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label>ช่องทาง</label>
                    <select value={payForm.payment_method} onChange={e => setPayForm({ ...payForm, payment_method: e.target.value })}>
                      <option>โอน</option>
                      <option>เงินสด</option>
                      <option>เช็ค</option>
                      <option>QR Code</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label>วันที่รับเงิน</label>
                    <input type="date" value={payForm.payment_date} onChange={e => setPayForm({ ...payForm, payment_date: e.target.value })} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: 'span 2' }}>
                    <label>หมายเหตุ</label>
                    <input type="text" placeholder="หมายเหตุ..." value={payForm.note} onChange={e => setPayForm({ ...payForm, note: e.target.value })} />
                  </div>
                </div>
                <button className="btn btn-primary" onClick={handleAddPayment} disabled={savingPay || !payForm.amount}>
                  {savingPay ? 'กำลังบันทึก...' : '💾 บันทึกรับเงิน'}
                </button>
              </div>
            )}

            {/* Payment history */}
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', fontWeight: 700, fontSize: 13, borderBottom: '1px solid var(--border)' }}>ประวัติการชำระเงิน</div>
              {invPay.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>ยังไม่มีการชำระเงิน</div>
              ) : (
                <table style={{ width: '100%' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12 }}>รหัส</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12 }}>วันที่</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12 }}>ประเภท</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12 }}>ช่องทาง</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12 }}>จำนวนเงิน</th>
                      <th style={{ padding: '8px 12px', fontSize: 12 }}>หมายเหตุ</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invPay.map(p => (
                      <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12, color: 'var(--primary)' }}>{p.code}</td>
                        <td style={{ padding: '8px 12px', fontSize: 12 }}>{fmtDate(p.payment_date)}</td>
                        <td style={{ padding: '8px 12px', fontSize: 12 }}>{p.payment_type}</td>
                        <td style={{ padding: '8px 12px', fontSize: 12 }}>{p.payment_method}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>฿{(p.amount || 0).toLocaleString()}</td>
                        <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>{p.note || '—'}</td>
                        <td style={{ padding: '8px 8px' }}>
                          <button style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }} onClick={() => handleDeletePayment(p)}>🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: เอกสารที่เกี่ยวข้อง ── */}
        {viewTab === 'เอกสารที่เกี่ยวข้อง' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Job Order card */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>📝 ใบงานการผลิต</span>
                {!view.jo_created && (
                  <button className="btn btn-primary btn-sm" onClick={() => handleConvertToJO(view)}>+ สร้างใบงาน</button>
                )}
              </div>
              {relatedJO ? (
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 14 }}>
                  <div style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--primary)', fontWeight: 700, marginBottom: 8 }}>{relatedJO.code}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{relatedJO.item_desc || '—'}</div>
                  <span className={relatedJO.status === 'ส่งงานแล้ว' ? 'badge badge-green' : 'badge badge-blue'}>{relatedJO.status}</span>
                  {relatedJO.due_date && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>กำหนดส่ง: {fmtDate(relatedJO.due_date)}</div>}
                </div>
              ) : (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  ยังไม่มีใบงาน<br />
                  <span style={{ fontSize: 11 }}>กด "+ สร้างใบงาน" เพื่อสร้าง</span>
                </div>
              )}
            </div>

            {/* Receipt card */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>🧾 ใบเสร็จรับเงิน</div>
              {relatedRC ? (
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 14 }}>
                  <div style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--primary)', fontWeight: 700, marginBottom: 8 }}>{relatedRC.code}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--success)' }}>฿{(relatedRC.total || 0).toLocaleString()}</div>
                  <span className="badge badge-green" style={{ marginTop: 8, display: 'inline-block' }}>ออกแล้ว</span>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{fmtDate(relatedRC.created_at)}</div>
                </div>
              ) : (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  ยังไม่มีใบเสร็จ<br />
                  <span style={{ fontSize: 11 }}>สร้างอัตโนมัติเมื่อชำระครบ</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────
  // LIST VIEW
  // ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
        {[
          { label: 'ใบแจ้งหนี้ทั้งหมด', value: rows.length + ' ใบ',              accent: 'var(--primary)', icon: '📄' },
          { label: 'มูลค่ารวม',          value: `฿${totalAll.toLocaleString()}`,  accent: 'var(--info)',    icon: '💰' },
          { label: 'ปิดงานแล้ว',         value: `฿${totalClosed.toLocaleString()}`, accent: 'var(--success)', icon: '✅' },
          { label: 'ค้างชำระ',           value: `฿${totalOpen.toLocaleString()}`, accent: 'var(--danger)',  icon: '⏳' },
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
            <input type="text" placeholder="ค้นหา..." value={search}
              onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36, width: 220 }} />
          </div>
          {['', ...INV_PIPELINE, 'ยกเลิก'].map(s => {
            const count = s ? rows.filter(r => r.status === s).length : rows.length
            return (
              <button key={s} onClick={() => setFilter(s)}
                className={filterStatus === s ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}>
                {s || 'ทั้งหมด'}{s ? ` (${count})` : ''}
              </button>
            )
          })}
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ ปิด' : '+ สร้างใบแจ้งหนี้'}
        </button>
      </div>

      {/* ── Create/Edit Form ── */}
      {showForm && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>{editId ? '✏️ แก้ไขใบแจ้งหนี้' : '➕ ใบแจ้งหนี้ใหม่'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>ลูกค้า *</label>
              <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}>
                <option value="">— เลือกลูกค้า —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>วันที่เอกสาร</label>
              <input type="date" value={form.document_date} onChange={e => setForm({ ...form, document_date: e.target.value })} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>ครบกำหนดชำระ</label>
              <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>VAT (%)</label>
              <select value={form.vat_pct} onChange={e => setForm({ ...form, vat_pct: e.target.value })}>
                <option value={0}>ไม่มี VAT</option>
                <option value={7}>7%</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label>หัก ณ ที่จ่าย (%)</label>
              <select value={form.wht_pct} onChange={e => setForm({ ...form, wht_pct: e.target.value })}>
                <option value={0}>ไม่มี</option>
                <option value={3}>3%</option>
                <option value={5}>5%</option>
              </select>
            </div>
          </div>

          {/* Items */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>รายการสินค้า / บริการ</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 12 }}>รายการ</th>
                  <th style={{ padding: '6px 10px', fontSize: 12, width: 80 }}>จำนวน</th>
                  <th style={{ padding: '6px 10px', fontSize: 12, width: 120 }}>ราคา/หน่วย</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12, width: 120 }}>รวม</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {form.items.map((it, i) => (
                  <tr key={i}>
                    <td style={{ padding: '4px 6px' }}>
                      <input type="text" placeholder="รายละเอียด" value={it.desc} onChange={e => updateItem(i, 'desc', e.target.value)} style={{ width: '100%' }} />
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <input type="number" min="1" value={it.qty} onChange={e => updateItem(i, 'qty', e.target.value)} />
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <input type="number" min="0" value={it.price} onChange={e => updateItem(i, 'price', e.target.value)} />
                    </td>
                    <td style={{ padding: '4px 10px', textAlign: 'right', fontWeight: 700, fontSize: 13 }}>฿{(it.amount || 0).toLocaleString()}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                      {form.items.length > 1 && (
                        <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16 }}>×</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn btn-outline btn-sm" onClick={addItem}>+ เพิ่มรายการ</button>
              <select style={{ fontSize: 12, padding: '5px 10px' }} defaultValue="" onChange={e => {
                const mat = materials.find(m => m.id === e.target.value)
                if (mat) { addItemFromStock(mat); e.target.value = '' }
              }}>
                <option value="">📦 เพิ่มจากสต๊อก...</option>
                {materials.map(m => <option key={m.id} value={m.id}>{m.name} (เหลือ: {m.qty} {m.unit})</option>)}
              </select>
            </div>
          </div>

          {/* Summary */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12 }}>ส่วนลด (฿)</label>
              <input type="number" min="0" value={form.discount} style={{ width: 120 }} onChange={e => setForm({ ...form, discount: e.target.value })} />
            </div>
            <div style={{ minWidth: 200, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span>ยอดรวม</span><span>฿{subtotal.toLocaleString()}</span></div>
              {discAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: 'var(--danger)' }}><span>ส่วนลด</span><span>-฿{discAmt.toLocaleString()}</span></div>}
              {vatAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span>VAT {form.vat_pct}%</span><span>฿{vatAmt.toFixed(2)}</span></div>}
              {whtAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: 'var(--danger)' }}><span>หัก ณ ที่จ่าย {form.wht_pct}%</span><span>-฿{whtAmt.toFixed(2)}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontWeight: 800, fontSize: 15, color: 'var(--primary)', borderTop: '2px solid var(--primary)', marginTop: 4 }}>
                <span>ยอดสุทธิ</span><span>฿{total.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            <label style={{ fontSize: 12 }}>หมายเหตุ</label>
            <input type="text" placeholder="หมายเหตุ / เงื่อนไขการชำระเงิน" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'กำลังบันทึก...' : '💾 บันทึกใบแจ้งหนี้'}</button>
            <button className="btn btn-outline" onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm()) }}>ยกเลิก</button>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? <LoadingSpinner /> : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>เลขที่</th><th>วันที่</th><th>ลูกค้า</th>
                    <th>รายการ</th><th>ยอดรวม</th><th>ชำระแล้ว</th>
                    <th>ครบกำหนด</th><th>สถานะ</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const invPaidAmt = payments.filter(p => p.invoice_id === r.id).reduce((s, p) => s + (p.amount || 0), 0)
                    return (
                      <tr key={r.id} className="row-link">
                        <td style={{ color: 'var(--primary)', fontFamily: 'monospace', fontWeight: 700 }}>{r.code}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(r.document_date || r.created_at)}</td>
                        <td style={{ fontWeight: 600 }}>{r.customers?.name || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{(r.items || []).map(i => i.desc).join(', ').slice(0, 28) || '—'}</td>
                        <td style={{ fontWeight: 800, color: 'var(--primary)' }}>฿{(r.total || 0).toLocaleString()}</td>
                        <td style={{ fontSize: 12, color: invPaidAmt > 0 ? 'var(--success)' : 'var(--text-muted)', fontWeight: invPaidAmt > 0 ? 600 : 400 }}>
                          {invPaidAmt > 0 ? `฿${invPaidAmt.toLocaleString()}` : '—'}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(r.due_date)}</td>
                        <td><span className={STATUS_BADGE[r.status] || 'badge badge-gray'}>{r.status}</span></td>
                        <td style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
                          <button className="btn btn-outline btn-sm" onClick={() => { setView(r); setViewTab('เอกสาร') }}>ดู</button>
                          <button className="btn btn-outline btn-sm" onClick={() => { setView(r); setViewTab('ชำระเงิน') }}>💰</button>
                          {!r.jo_created && (
                            <button className="btn btn-outline btn-sm" onClick={() => handleConvertToJO(r)}>→ JO</button>
                          )}
                          {!['ปิดงาน','ชำระแล้ว','ยกเลิก'].includes(r.status) && (
                            <button className="btn btn-outline btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(r)}>🗑️</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>ไม่พบรายการ</td></tr>
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
