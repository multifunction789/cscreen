'use client'
import { useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { insertPurchase, updatePurchase, receiveMaterial, insertStockIn, upsertSetting } from '@/lib/db'
import { uploadJobImage } from '@/lib/jobProduction.mjs'
import { PURPOSES, STATUSES, PAID, PAY_METHODS, calcTotals } from '@/lib/purchases.mjs'
import { todayStr } from '@/lib/docUtils'
import { notify } from '@/lib/feedback'
import DateInput from '@/components/ui/DateInput'

const emptyLine = () => ({ desc: '', qty: '1', unit: '', price: '', material_id: '' })
const money = n => (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * ฟอร์มบันทึกการซื้อ / ค่าใช้จ่าย (สร้าง + แก้ไข)
 * purpose='stock' + สถานะ รับของแล้ว/จ่ายแล้ว → รับของเข้าสต๊อก 1 ครั้ง (ต่อจากนั้นแก้รายการไม่ได้)
 */
export default function PurchaseForm({ initial: initialRow, suppliers, invoices, jobs, materials, categories, budgets, onClose, onSaved }) {
  const [initial, setInitial] = useState(initialRow)   // หลังบันทึกครั้งแรก = แถวที่บันทึกแล้ว (กดบันทึกซ้ำ = แก้ไข ไม่สร้างใหม่)
  const editing = !!initial?.id
  const [f, setF] = useState(() => ({
    purpose: initial?.purpose || 'job',
    supplier_id: initial?.supplier_id || '',
    category: initial?.category || '',
    invoice_id: initial?.invoice_id || '',
    job_order_id: initial?.job_order_id || '',
    lot_number: initial?.lot_number || '',
    items: (initial?.items?.length ? initial.items : [emptyLine()]).map(it => ({ ...emptyLine(), ...it, qty: String(it.qty ?? ''), price: String(it.price ?? '') })),
    shipping: String(initial?.shipping ?? '0'),
    vat_pct: String(initial?.vat_pct ?? '0'),
    status: initial?.status || 'สั่งแล้ว',
    paid_at: initial?.paid_at || '',
    payment_method: initial?.payment_method || 'โอน',
    image_url: initial?.image_url || '',
    note: initial?.note || '',
  }))
  const [busy, setBusy] = useState(false)
  const [upBusy, setUpBusy] = useState(false)
  const fileRef = useRef(null)
  const locked = !!initial?.stock_done   // รับเข้าสต๊อกแล้ว → แก้รายการ/ประเภทไม่ได้
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const setLine = (i, k, v) => setF(x => ({ ...x, items: x.items.map((it, j) => j === i ? { ...it, [k]: v } : it) }))
  const totals = useMemo(() => calcTotals(f), [f])

  const catList = f.purpose === 'general' ? budgets.map(b => b.name) : (categories[f.purpose] || [])
  const jobList = f.invoice_id ? jobs.filter(j => j.invoice_id === f.invoice_id) : jobs
  const invLabel = i => `${i.code}${i.customers?.name ? ` · ${i.customers.name}` : ''}`

  function pickJob(id) {
    const j = jobs.find(x => x.id === id)
    setF(x => ({ ...x, job_order_id: id, invoice_id: j?.invoice_id || x.invoice_id }))
  }
  function setStatus(s) {
    setF(x => ({ ...x, status: s, paid_at: s === PAID ? (x.paid_at || todayStr()) : x.paid_at }))
  }
  async function pickImage(file) {
    if (!file) return
    setUpBusy(true)
    try { set('image_url', await uploadJobImage(supabase, 'job-images', file)) }
    catch (e) { notify.error(e.message) } finally { setUpBusy(false) }
  }

  /** รับของเข้าสต๊อก: วัตถุดิบที่เลือก → ผ่าน receive_material (เพิ่มจำนวน + ต้นทุนเฉลี่ย) · ไม่เลือก → บันทึกแบบเดิม */
  async function receiveStock(items, supplierId, date, out = []) {
    for (const it of items.slice(out.length)) {
      if (it.stock_in_id) { out.push(it); continue }
      const qty = parseFloat(it.qty) || 0, cost = parseFloat(it.price) || 0
      if (qty <= 0) { out.push(it); continue }
      if (it.material_id) {
        const { data, error } = await receiveMaterial({ request_id: crypto.randomUUID(), material_id: it.material_id, qty, cost, supplier_id: supplierId, received_at: date, note: f.note, image_url: f.image_url, vat: parseFloat(f.vat_pct) || 0 })
        if (error) throw new Error(`รับ "${it.desc}" เข้าสต๊อกไม่สำเร็จ: ${error.message}`)
        out.push({ ...it, stock_in_id: data })
      } else {
        const { data, error } = await insertStockIn({
          code: 'SI-' + crypto.randomUUID().slice(0, 8).toUpperCase(), lot_number: f.lot_number || null, received_at: date,
          supplier_id: supplierId, item_name: it.desc, qty, cost_per_unit: cost, vat_pct: parseFloat(f.vat_pct) || 0,
          total: Math.round(qty * cost * (1 + (parseFloat(f.vat_pct) || 0) / 100) * 100) / 100, note: f.note || null,
          image_url: f.image_url || null, material_id: null, shipping_cost: 0, category: f.category || null,
        })
        if (error) throw new Error(`บันทึก "${it.desc}" เข้าสต๊อกไม่สำเร็จ: ${error.message}`)
        out.push({ ...it, stock_in_id: data.id })
      }
    }
    return out
  }

  async function save() {
    const lines = totals.items.filter(it => String(it.desc || '').trim() || it.amount)
    if (!lines.length) return notify.warn('กรุณาใส่อย่างน้อย 1 รายการ')
    if (lines.some(it => !String(it.desc || '').trim())) return notify.warn('กรุณาใส่ชื่อรายการให้ครบ')
    if (f.purpose === 'general' && !f.category) return notify.warn('กรุณาเลือกประเภทค่าใช้จ่าย')
    if (f.status === PAID && !f.paid_at) return notify.warn('กรุณาใส่วันที่จ่ายเงินจริง')
    setBusy(true)
    try {
      let items = lines.map(({ desc, qty, unit, price, amount, material_id, stock_in_id }) => ({
        desc: String(desc).trim(), qty: parseFloat(qty) || 0, unit: unit || '', price: parseFloat(price) || 0, amount,
        ...(material_id ? { material_id } : {}), ...(stock_in_id ? { stock_in_id } : {}),
      }))
      const needStock = f.purpose === 'stock' && !initial?.stock_done && f.status !== 'สั่งแล้ว'
      const payload = {
        purpose: f.purpose, category: f.category || null, supplier_id: f.supplier_id || null,
        invoice_id: f.purpose === 'job' ? (f.invoice_id || null) : null,
        job_order_id: f.purpose === 'job' ? (f.job_order_id || null) : null,
        lot_number: f.purpose === 'stock' ? (f.lot_number || null) : null,
        items, subtotal: totals.subtotal, shipping: parseFloat(f.shipping) || 0, vat_pct: parseFloat(f.vat_pct) || 0,
        vat_amount: totals.vat_amount, total: totals.total, status: f.status,
        paid_at: f.status === PAID ? f.paid_at : (f.paid_at || null), payment_method: f.status === PAID ? f.payment_method : null,
        image_url: f.image_url || null, note: f.note || null, stock_done: !!initial?.stock_done,
      }
      // บันทึกใบจัดซื้อก่อน แล้วค่อยรับเข้าสต๊อก — ถ้ารับไม่ครบ บรรทัดที่รับแล้วจะถูกจำไว้ กดบันทึกซ้ำจะไม่รับซ้ำ
      let { data, error } = editing ? await updatePurchase(initial.id, payload) : await insertPurchase(payload)
      if (error) throw new Error(error.message)
      if (needStock) {
        const done = []
        let stockErr = null
        try { await receiveStock(items, f.supplier_id || null, f.paid_at || todayStr(), done) } catch (e) { stockErr = e }
        const merged = items.map((it, i) => done[i] || it)
        const res = await updatePurchase(data.id, { items: merged, stock_done: !stockErr && done.length === items.length })
        if (res.data) data = res.data
        if (stockErr) { setInitial(data); onSaved(data, { keepOpen: true }); throw stockErr }
      }
      // หมวดใหม่ที่พิมพ์เอง → จำไว้ใช้ครั้งต่อไป
      if (f.category && f.purpose !== 'general' && !(categories[f.purpose] || []).includes(f.category)) {
        await upsertSetting('purchase_categories', { ...categories, [f.purpose]: [...(categories[f.purpose] || []), f.category] })
      }
      notify.success(`${editing ? 'บันทึก' : 'สร้าง'} ${data.code} แล้ว${data.stock_done && !initial?.stock_done ? ' · รับเข้าสต๊อกแล้ว' : ''}`)
      onSaved(data)
    } catch (e) {
      notify.error(e.message)
    } finally { setBusy(false) }
  }

  const seg = on => ({ border: `2px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'var(--primary-light)' : '#fff', borderRadius: 10, padding: '8px 10px', textAlign: 'left', cursor: locked ? 'not-allowed' : 'pointer', opacity: locked && !on ? .5 : 1 })
  const lbl = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, fontWeight: 700, color: '#374151' }

  return (
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="บันทึกการซื้อ / ค่าใช้จ่าย" style={{ maxWidth: 780, width: '100%', padding: 0, gap: 0, overflow: 'hidden', maxHeight: '94vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: 'var(--primary)', color: '#fff', padding: '12px 18px', fontWeight: 800, fontSize: 16, display: 'flex', justifyContent: 'space-between' }}>
          <span>{editing ? '✏️ แก้ไขการซื้อ / ค่าใช้จ่าย' : '+ บันทึกการซื้อ / ค่าใช้จ่าย'}</span>
          <span style={{ fontFamily: 'monospace' }}>{initial?.code || 'PO-ใหม่'}</span>
        </div>
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <div>
            <div style={{ ...lbl, marginBottom: 5 }}>ซื้อเพื่ออะไร {locked && <span style={{ fontWeight: 400, color: '#B45309' }}>— รับเข้าสต๊อกแล้ว แก้ประเภท/รายการไม่ได้</span>}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
              {PURPOSES.map(p => (
                <button key={p.id} type="button" disabled={locked} style={seg(f.purpose === p.id)} onClick={() => setF(x => ({ ...x, purpose: p.id, category: '' }))}>
                  <b style={{ display: 'block', fontSize: 13.5 }}>{p.icon} {p.label}</b><span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{p.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: f.purpose === 'general' ? '1fr 1fr' : '1fr 1fr 1.3fr', gap: 10 }}>
            <label style={lbl}>{f.purpose === 'general' ? 'จ่ายให้ (ไม่บังคับ)' : 'Supplier'}
              <select value={f.supplier_id} onChange={e => set('supplier_id', e.target.value)}>
                <option value="">— ไม่ระบุ —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label style={lbl}>{f.purpose === 'general' ? 'ประเภทค่าใช้จ่าย (งบ) *' : 'หมวด'}
              {f.purpose === 'general' ? (
                <select value={f.category} onChange={e => set('category', e.target.value)}>
                  <option value="">— เลือก —</option>
                  {[...new Set([...catList, f.category].filter(Boolean))].map(c => <option key={c}>{c}</option>)}
                </select>
              ) : (
                <>
                  <input type="text" list={`pc-${f.purpose}`} value={f.category} onChange={e => set('category', e.target.value)} placeholder="เลือก / พิมพ์หมวดใหม่" />
                  <datalist id={`pc-${f.purpose}`}>{catList.map(c => <option key={c} value={c} />)}</datalist>
                </>
              )}
            </label>
            {f.purpose === 'job' && (
              <label style={lbl}>อ้างอิง INV / ใบงาน
                <div style={{ display: 'flex', gap: 6 }}>
                  <select value={f.invoice_id} onChange={e => setF(x => ({ ...x, invoice_id: e.target.value, job_order_id: '' }))} style={{ flex: 1, minWidth: 0 }}>
                    <option value="">— INV —</option>
                    {invoices.map(i => <option key={i.id} value={i.id}>{invLabel(i)}</option>)}
                  </select>
                  <select value={f.job_order_id} onChange={e => pickJob(e.target.value)} style={{ width: 130 }} aria-label="ใบงาน">
                    <option value="">— ใบงาน —</option>
                    {jobList.map(j => <option key={j.id} value={j.id}>{j.code}</option>)}
                  </select>
                </div>
              </label>
            )}
            {f.purpose === 'stock' && (
              <label style={lbl}>เลข LOT<input type="text" value={f.lot_number} onChange={e => set('lot_number', e.target.value)} placeholder="เช่น LOT-20261119-001" disabled={locked} /></label>
            )}
          </div>

          <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 10 }}>
            <table style={{ minWidth: 640, width: '100%', tableLayout: 'fixed' }}>
              <thead><tr>
                <th style={{ width: 28 }}>#</th><th>{f.purpose === 'stock' ? 'รายการ / วัตถุดิบในสต๊อก' : 'รายการ'}</th>
                <th style={{ width: 76 }}>จำนวน</th><th style={{ width: 76 }}>หน่วย</th><th style={{ width: 100 }}>ราคา/หน่วย</th><th style={{ width: 96, textAlign: 'right' }}>รวม</th><th style={{ width: 30 }}></th>
              </tr></thead>
              <tbody>
                {f.items.map((it, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>
                      <input type="text" style={{ width: '100%', padding: '6px 8px' }} aria-label={`รายการ ${i + 1}`} value={it.desc} disabled={locked} onChange={e => setLine(i, 'desc', e.target.value)} placeholder="เช่น ฟิล์ม DFT โลโก้หน้าอก" />
                      {f.purpose === 'stock' && (
                        <select aria-label={`วัตถุดิบ ${i + 1}`} value={it.material_id || ''} disabled={locked} style={{ marginTop: 4, fontSize: 12.5, width: '100%', padding: '5px 8px' }}
                          onChange={e => { const m = materials.find(x => x.id === e.target.value); setF(x => ({ ...x, items: x.items.map((l, j) => j === i ? { ...l, material_id: e.target.value, desc: l.desc || m?.name || '', unit: l.unit || m?.unit || '' } : l) })) }}>
                          <option value="">— ไม่ผูกวัตถุดิบ (บันทึกอย่างเดียว ไม่เพิ่มจำนวนสต๊อก) —</option>
                          {materials.map(m => <option key={m.id} value={m.id}>{m.code} · {m.name} (คงเหลือ {m.qty ?? 0} {m.unit || ''})</option>)}
                        </select>
                      )}
                    </td>
                    <td><input type="text" style={{ width: '100%', padding: '6px 8px' }} aria-label={`จำนวน ${i + 1}`} inputMode="decimal" value={it.qty} disabled={locked} onChange={e => setLine(i, 'qty', e.target.value.replace(/[^\d.]/g, ''))} /></td>
                    <td><input type="text" style={{ width: '100%', padding: '6px 8px' }} aria-label={`หน่วย ${i + 1}`} value={it.unit} disabled={locked} onChange={e => setLine(i, 'unit', e.target.value)} placeholder="ตัว" /></td>
                    <td><input type="text" style={{ width: '100%', padding: '6px 8px' }} aria-label={`ราคาต่อหน่วย ${i + 1}`} inputMode="decimal" value={it.price} disabled={locked} onChange={e => setLine(i, 'price', e.target.value.replace(/[^\d.]/g, ''))} /></td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(totals.items[i]?.amount)}</td>
                    <td>{!locked && f.items.length > 1 && <button type="button" aria-label="ลบรายการ" onClick={() => set('items', f.items.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: '#B91C1C', fontSize: 16 }}>×</button>}</td>
                  </tr>
                ))}
                {!locked && <tr><td></td><td colSpan={6}><button type="button" className="btn btn-outline btn-sm" onClick={() => set('items', [...f.items, emptyLine()])}>+ เพิ่มรายการ</button></td></tr>}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 230px', gap: 12, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ ...lbl, marginBottom: 5 }}>สถานะ</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {STATUSES.map(s => (
                    <button key={s} type="button" onClick={() => setStatus(s)} style={{ flex: 1, borderRadius: 8, padding: '6px 0', fontWeight: 700, fontSize: 12.5, border: `1.5px solid ${f.status === s ? (s === PAID ? '#166534' : 'var(--primary)') : 'var(--border)'}`, background: f.status === s ? (s === PAID ? '#DCFCE7' : 'var(--primary-light)') : '#fff', color: f.status === s ? (s === PAID ? '#166534' : 'var(--primary)') : 'inherit' }}>
                      {f.status === s ? '✓ ' : ''}{s === PAID ? 'จ่ายเงินแล้ว' : s}
                    </button>
                  ))}
                </div>
                {f.purpose === 'stock' && !initial?.stock_done && f.status !== 'สั่งแล้ว' && <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 4 }}>บันทึกแล้วจะรับของเข้าสต๊อกทันที (ทำครั้งเดียว)</div>}
              </div>
              {f.status === PAID && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <label style={lbl}>วันที่จ่ายเงินจริง *<DateInput value={f.paid_at} onChange={e => set('paid_at', e.target.value)} /></label>
                  <label style={lbl}>วิธีจ่าย<select value={f.payment_method} onChange={e => set('payment_method', e.target.value)}>{PAY_METHODS.map(m => <option key={m}>{m}</option>)}</select></label>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', border: '1.5px dashed #D1D5DB', borderRadius: 10, padding: 8 }}>
                {f.image_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <a href={f.image_url} target="_blank" rel="noreferrer"><img src={f.image_url} alt="บิล" style={{ height: 52, width: 52, objectFit: 'cover', borderRadius: 6 }} /></a>
                  : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>📎 แนบบิล / สลิปโอน (1 รูป)</span>}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { pickImage(e.target.files?.[0]); e.target.value = '' }} />
                <button type="button" className="btn btn-outline btn-sm" disabled={upBusy} onClick={() => fileRef.current?.click()} style={{ marginLeft: 'auto' }}>{upBusy ? 'กำลังอัปโหลด…' : f.image_url ? 'เปลี่ยนรูป' : 'เลือกรูป'}</button>
                {f.image_url && <button type="button" className="btn btn-outline btn-sm" style={{ color: '#B91C1C' }} onClick={() => set('image_url', '')}>ลบ</button>}
              </div>
              <label style={lbl}>หมายเหตุ<input type="text" value={f.note} onChange={e => set('note', e.target.value)} placeholder="เช่น สั่งด่วน รับวันศุกร์" /></label>
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 6, alignItems: 'center', fontSize: 13 }}>
              <span>รวมรายการ</span><b style={{ textAlign: 'right' }}>{money(totals.subtotal)}</b>
              <span>VAT %</span><input type="text" aria-label="VAT %" inputMode="decimal" value={f.vat_pct} disabled={locked} onChange={e => set('vat_pct', e.target.value.replace(/[^\d.]/g, ''))} style={{ width: 80, textAlign: 'right' }} />
              {totals.vat_amount > 0 && <><span style={{ color: 'var(--text-muted)' }}>VAT</span><span style={{ textAlign: 'right' }}>{money(totals.vat_amount)}</span></>}
              <span>ค่าส่ง</span><input type="text" aria-label="ค่าส่ง" inputMode="decimal" value={f.shipping} onChange={e => set('shipping', e.target.value.replace(/[^\d.]/g, ''))} style={{ width: 80, textAlign: 'right' }} />
              <span style={{ borderTop: '1px solid var(--border)', paddingTop: 6, fontWeight: 800 }}>ยอดสุทธิ</span>
              <span style={{ borderTop: '1px solid var(--border)', paddingTop: 6, textAlign: 'right', fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>฿{money(totals.total)}</span>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', background: '#F9FAFB', borderRadius: 8, padding: '6px 10px' }}>
            นับเป็นรายจ่ายตาม <b>วันที่จ่ายเงินจริง</b> · ยังไม่จ่าย = แสดงใน “ค้างจ่าย Supplier”
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-outline" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || upBusy}>{busy ? 'กำลังบันทึก…' : '💾 บันทึก'}</button>
        </div>
      </div>
    </div>
  )
}
