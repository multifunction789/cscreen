'use client'
import { useState, useEffect } from 'react'
import { getStockIn, getSuppliers, insertStockIn } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { todayStr } from '@/lib/docUtils'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const fmt = (d) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

function genLot(count) {
  const d = todayStr().replace(/-/g, '')
  return `LOT-${d}-${String(count + 1).padStart(3, '0')}`
}

const emptyForm = (count = 0) => ({
  received_at: todayStr(),
  supplier_id: '',
  item_name: '',
  qty: '',
  cost_per_unit: '',
  vat_pct: '',
  note: '',
  image_url: '',
  lot_number: genLot(count),
})

export default function StockInPage() {
  const [rows, setRows]             = useState([])
  const [suppliers, setSuppliers]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [form, setForm]             = useState(emptyForm(0))
  const [saving, setSaving]         = useState(false)
  const [imgPreview, setImgPreview] = useState(null)
  const [imgFile, setImgFile]       = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const [siRes, supRes] = await Promise.all([getStockIn(), getSuppliers()])
    const r = siRes.data || []
    setRows(r)
    setSuppliers(supRes.data || [])
    setForm(emptyForm(r.length))
    setLoading(false)
  }

  function handleImgChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImgFile(file)
    const reader = new FileReader()
    reader.onload = ev => setImgPreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  async function uploadImage() {
    if (!imgFile) return null
    const ext  = imgFile.name.split('.').pop()
    const path = `${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('stock-images').upload(path, imgFile, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('stock-images').getPublicUrl(path)
      return data?.publicUrl || imgPreview
    }
    return imgPreview
  }

  async function handleSave() {
    if (!form.item_name || !form.qty || !form.cost_per_unit) return alert('กรุณากรอก รายการ / จำนวน / ต้นทุนต่อหน่วย')
    setSaving(true)
    const code      = 'SI-' + String(Math.max((rows.length || 0) + 1, 1001)).padStart(4, '0')
    const subtotal  = parseFloat(form.qty) * parseFloat(form.cost_per_unit)
    const vatAmt    = subtotal * (parseFloat(form.vat_pct) || 0) / 100
    const total     = subtotal + vatAmt
    let image_url   = form.image_url
    if (imgFile) image_url = await uploadImage()
    await insertStockIn({
      code,
      lot_number:    form.lot_number,
      received_at:   form.received_at,
      supplier_id:   form.supplier_id || null,
      item_name:     form.item_name,
      qty:           parseFloat(form.qty),
      cost_per_unit: parseFloat(form.cost_per_unit),
      vat_pct:       parseFloat(form.vat_pct) || 0,
      total,
      note:          form.note,
      image_url:     image_url || null,
      material_id:   null,
      shipping_cost: 0,
    })
    setImgFile(null); setImgPreview(null); setSaving(false)
    load()
  }

  const subtotal = form.qty && form.cost_per_unit
    ? parseFloat(form.qty) * parseFloat(form.cost_per_unit) : 0
  const vatAmt   = subtotal * (parseFloat(form.vat_pct) || 0) / 100
  const computed = subtotal + vatAmt

  const totalAll = rows.reduce((s, h) => s + (h.total || 0), 0)

  if (loading) return <LoadingSpinner />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
        {[
          { label: 'รับสินค้าทั้งหมด', value: rows.length + ' ครั้ง',            accent: 'var(--info)',    icon: '📥' },
          { label: 'มูลค่ารวม',         value: `฿${totalAll.toLocaleString()}`,    accent: 'var(--primary)', icon: '💰' },
          { label: 'ซัพพลายเออร์',      value: [...new Set(rows.map(h => h.supplier_id).filter(Boolean))].length + ' ราย', accent: 'var(--success)', icon: '🏢' },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--card)', borderRadius:'var(--radius)', padding:'16px 18px', boxShadow:'var(--shadow)', border:'1px solid var(--border)', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, width:4, height:'100%', background:k.accent, borderRadius:'10px 0 0 10px' }} />
            <div style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', fontSize:28, opacity:.1 }}>{k.icon}</div>
            <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:.5 }}>{k.label}</div>
            <div style={{ fontSize:22, fontWeight:800, color:k.accent, marginTop:4 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Form — A4 width */}
      <div className="card" style={{ maxWidth: 794, margin: '0 auto', width: '100%', padding: 32 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h2 style={{ fontSize:16, fontWeight:800, color:'var(--text)' }}>📥 รับสินค้าเข้า</h2>
          <div style={{ background:'var(--primary-light)', border:'1px solid var(--primary)', borderRadius:8, padding:'6px 14px', fontSize:13, fontWeight:700, color:'var(--primary)', fontFamily:'monospace' }}>
            {form.lot_number}
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          {/* วันที่ซื้อ */}
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <label style={{ fontSize:13, fontWeight:600 }}>📅 วันที่ซื้อ *</label>
            <input type="date" value={form.received_at}
              onChange={e => setForm({ ...form, received_at: e.target.value })} />
          </div>

          {/* Supplier */}
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <label style={{ fontSize:13, fontWeight:600 }}>🏢 Supplier</label>
            <select value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
              <option value="">— เลือกซัพพลายเออร์ —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {/* รายการ */}
          <div style={{ display:'flex', flexDirection:'column', gap:6, gridColumn:'1 / -1' }}>
            <label style={{ fontSize:13, fontWeight:600 }}>📦 รายการสินค้า *</label>
            <input type="text" placeholder="เช่น เสื้อโปโล Size M สีขาว, หมึกซิลค์สกรีน..."
              value={form.item_name} onChange={e => setForm({ ...form, item_name: e.target.value })} />
          </div>

          {/* จำนวน */}
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <label style={{ fontSize:13, fontWeight:600 }}>🔢 จำนวน *</label>
            <input type="number" placeholder="0" min="1"
              value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} />
          </div>

          {/* ต้นทุนต่อหน่วย */}
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <label style={{ fontSize:13, fontWeight:600 }}>💵 ต้นทุนต่อหน่วย (฿) *</label>
            <input type="number" placeholder="0.00" min="0" step="0.01"
              value={form.cost_per_unit} onChange={e => setForm({ ...form, cost_per_unit: e.target.value })} />
          </div>

          {/* VAT */}
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <label style={{ fontSize:13, fontWeight:600 }}>🧾 VAT (%) — ถ้ามี</label>
            <input type="number" placeholder="7" min="0" max="100" step="0.01"
              value={form.vat_pct} onChange={e => setForm({ ...form, vat_pct: e.target.value })} />
          </div>

          {/* ยอดรวม */}
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <label style={{ fontSize:13, fontWeight:600 }}>💰 ยอดรวม (฿)</label>
            <div style={{ display:'flex', alignItems:'center', gap:8, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, padding:'0 14px', height:40 }}>
              {computed > 0 ? (
                <>
                  <span style={{ color:'var(--text-muted)', fontSize:12 }}>฿{subtotal.toLocaleString()}</span>
                  {vatAmt > 0 && <span style={{ color:'var(--text-muted)', fontSize:12 }}>+ VAT ฿{vatAmt.toLocaleString()}</span>}
                  <span style={{ marginLeft:'auto', fontWeight:800, color:'var(--success)', fontSize:15 }}>฿{computed.toLocaleString()}</span>
                </>
              ) : (
                <span style={{ color:'var(--text-muted)', fontSize:13 }}>คำนวณอัตโนมัติ</span>
              )}
            </div>
          </div>

          {/* แนบบิล / ใบเสร็จ */}
          <div style={{ display:'flex', flexDirection:'column', gap:6, gridColumn:'1 / -1' }}>
            <label style={{ fontSize:13, fontWeight:600 }}>📎 แนบบิล / รูปใบเสร็จ</label>
            <div style={{ display:'flex', gap:10, alignItems:'flex-start', flexWrap:'wrap' }}>
              <label style={{ cursor:'pointer' }}>
                <input type="file" accept="image/*,.pdf" onChange={handleImgChange} style={{ display:'none' }} />
                <span className="btn btn-outline" style={{ fontSize:13 }}>📂 เลือกไฟล์</span>
              </label>
              <input type="text" placeholder="หรือวาง URL รูปภาพ" value={form.image_url}
                onChange={e => { setForm({ ...form, image_url: e.target.value }); setImgPreview(e.target.value); setImgFile(null) }}
                style={{ flex:1, minWidth:180 }} />
            </div>
            {imgPreview && (
              <div style={{ marginTop:6, position:'relative', display:'inline-block' }}>
                <img src={imgPreview} alt="preview" style={{ maxHeight:100, maxWidth:200, borderRadius:8, border:'1px solid var(--border)', objectFit:'cover' }} />
                <button onClick={() => { setImgPreview(null); setImgFile(null); setForm(f => ({ ...f, image_url:'' })) }}
                  style={{ position:'absolute', top:-8, right:-8, background:'var(--danger)', border:'none', borderRadius:'50%', width:22, height:22, color:'#fff', cursor:'pointer', fontSize:13, lineHeight:1 }}>×</button>
              </div>
            )}
          </div>

          {/* หมายเหตุ */}
          <div style={{ display:'flex', flexDirection:'column', gap:6, gridColumn:'1 / -1' }}>
            <label style={{ fontSize:13, fontWeight:600 }}>📝 หมายเหตุ</label>
            <input type="text" placeholder="ระบุหมายเหตุเพิ่มเติม..." value={form.note}
              onChange={e => setForm({ ...form, note: e.target.value })} />
          </div>

          {/* LOT */}
          <div style={{ display:'flex', flexDirection:'column', gap:6, gridColumn:'1 / -1' }}>
            <label style={{ fontSize:13, fontWeight:600 }}>🏷️ เลข LOT</label>
            <div style={{ display:'flex', gap:8 }}>
              <input readOnly value={form.lot_number}
                style={{ flex:1, background:'var(--bg)', fontFamily:'monospace', fontWeight:700, color:'var(--primary)', letterSpacing:1 }} />
              <button className="btn btn-outline" style={{ fontSize:13 }}
                onClick={() => setForm(f => ({ ...f, lot_number: genLot(rows.length) }))}>
                🔄 สุ่มใหม่
              </button>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display:'flex', gap:10, marginTop:24, justifyContent:'flex-end' }}>
          <button className="btn btn-outline"
            style={{ minWidth:100 }}
            onClick={() => { setForm(emptyForm(rows.length)); setImgPreview(null); setImgFile(null) }}>
            ล้างฟอร์ม
          </button>
          <button className="btn btn-primary"
            style={{ minWidth:140, fontSize:14, padding:'10px 20px' }}
            onClick={handleSave} disabled={saving}>
            {saving ? '⏳ กำลังบันทึก...' : '✅ บันทึกรับสินค้าเข้า'}
          </button>
        </div>
      </div>

      {/* History table */}
      <div className="card" style={{ overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)' }}>
          <h2 style={{ fontSize:14, fontWeight:700 }}>📋 ประวัติการรับสินค้า</h2>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table>
            <thead>
              <tr>
                <th>LOT</th>
                <th>วันที่</th>
                <th>รายการสินค้า</th>
                <th>Supplier</th>
                <th>จำนวน</th>
                <th>ต้นทุน/หน่วย</th>
                <th>VAT%</th>
                <th>รวม</th>
                <th>บิล</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(h => (
                <tr key={h.id}>
                  <td style={{ fontFamily:'monospace', fontWeight:700, color:'var(--primary)', fontSize:12 }}>{h.lot_number || h.code}</td>
                  <td style={{ color:'var(--text-muted)', fontSize:12 }}>{fmt(h.received_at)}</td>
                  <td style={{ fontWeight:600 }}>{h.item_name || h.category || h.materials?.name || '—'}</td>
                  <td style={{ color:'var(--text-muted)', fontSize:12 }}>{h.suppliers?.name || '—'}</td>
                  <td style={{ fontWeight:700, color:'var(--info)' }}>+{h.qty}</td>
                  <td>฿{(h.cost_per_unit||0).toLocaleString()}</td>
                  <td>{h.vat_pct > 0 ? <span className="badge badge-yellow">{h.vat_pct}%</span> : '—'}</td>
                  <td style={{ fontWeight:800, color:'var(--success)' }}>฿{(h.total||0).toLocaleString()}</td>
                  <td>
                    {h.image_url && (
                      <img src={h.image_url} alt="" style={{ height:32, width:32, objectFit:'cover', borderRadius:4, cursor:'pointer' }}
                        onClick={() => window.open(h.image_url, '_blank')} />
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>ยังไม่มีประวัติ</td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ background:'var(--bg)', fontWeight:800 }}>
                  <td colSpan={7} style={{ textAlign:'right', padding:'10px 14px' }}>รวมมูลค่าทั้งหมด</td>
                  <td style={{ color:'var(--primary)', fontSize:15, padding:'10px 14px' }}>฿{totalAll.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
