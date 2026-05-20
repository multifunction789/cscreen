'use client'
import { useState, useEffect } from 'react'
import { getCostItems, insertCostItem, deleteCostItem, getSuppliers } from '@/lib/db'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const ITEM_TYPES = ['เสื้อโปโล','เสื้อยืด','เสื้อพิมพ์ลาย','เสื้อคนงาน','ถุงผ้า','หมึก / สี','อุปกรณ์','อื่น ๆ']
const emptyForm = { item_name: '', item_type: '', supplier_id: '', buy_price: '', sell_price: '' }

export default function CostPage() {
  const [items, setItems]       = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState(null)
  const [filterType, setFilterType] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(emptyForm)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [ciRes, supRes] = await Promise.all([getCostItems(), getSuppliers()])
    const rows = ciRes.data || []
    setItems(rows)
    setSuppliers(supRes.data || [])
    // auto-select first item group
    const names = [...new Set(rows.map(r => r.item_name))]
    if (names.length > 0 && !selected) setSelected(names[0])
    setLoading(false)
  }

  async function handleSave() {
    if (!form.item_name.trim() || !form.supplier_id || !form.buy_price || !form.sell_price)
      return setError('กรุณากรอกข้อมูลให้ครบ')
    setSaving(true); setError('')
    await insertCostItem({
      item_name:   form.item_name.trim(),
      item_type:   form.item_type,
      supplier_id: form.supplier_id,
      buy_price:   parseFloat(form.buy_price),
      sell_price:  parseFloat(form.sell_price),
      is_best:     false,
    })
    setForm(emptyForm); setShowForm(false); setSaving(false)
    load()
  }

  async function handleDelete(id) {
    await deleteCostItem(id)
    load()
  }

  const filteredItems = filterType ? items.filter(r=>r.item_type===filterType) : items

  // group items by item_name
  const grouped = filteredItems.reduce((acc, r) => {
    if (!acc[r.item_name]) acc[r.item_name] = []
    acc[r.item_name].push(r)
    return acc
  }, {})
  const itemNames = Object.keys(grouped)

  const currentGroup = grouped[selected] || []
  const maxMargin = currentGroup.length
    ? Math.max(...currentGroup.map(s => s.sell_price - s.buy_price))
    : 0

  if (loading) return <LoadingSpinner />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
        {[
          { label: 'รายการสินค้า',    value: itemNames.length + ' รายการ', accent: 'var(--primary)', icon: '📦' },
          { label: 'ซัพพลายเออร์',    value: [...new Set(items.map(r => r.supplier_id).filter(Boolean))].length + ' ราย', accent: 'var(--info)', icon: '🏢' },
          { label: 'Margin เฉลี่ย',   value: items.length ? (items.reduce((s, r) => s + ((r.sell_price - r.buy_price) / r.sell_price * 100), 0) / items.length).toFixed(1) + '%' : '—', accent: 'var(--success)', icon: '📈' },
        ].map(k => (
          <div key={k.label} style={{
            background: 'var(--card)', borderRadius: 'var(--radius)',
            padding: '16px 18px', boxShadow: 'var(--shadow)',
            border: '1px solid var(--border)', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: k.accent, borderRadius: '10px 0 0 10px' }} />
            <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 28, opacity: .1 }}>{k.icon}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.accent, marginTop: 4 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Type filter */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
        <span style={{ fontSize:12, fontWeight:600, color:'var(--text-muted)' }}>ประเภท:</span>
        <button onClick={()=>setFilterType('')} className={!filterType?'btn btn-primary btn-sm':'btn btn-outline btn-sm'}>ทั้งหมด</button>
        {ITEM_TYPES.map(t=>(
          <button key={t} onClick={()=>setFilterType(filterType===t?'':t)}
            className={filterType===t?'btn btn-primary btn-sm':'btn btn-outline btn-sm'}>{t}</button>
        ))}
      </div>

      {/* Item selector */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {itemNames.map(name => (
          <button key={name} onClick={() => setSelected(name)}
            className={selected === name ? 'btn btn-primary' : 'btn btn-outline'}>
            {name}
          </button>
        ))}
        <button className="btn btn-outline" style={{ borderStyle: 'dashed' }}
          onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ ปิดฟอร์ม' : '+ เพิ่มรายการ'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>➕ เพิ่มรายการเปรียบเทียบราคา</div>
          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>⚠️ {error}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label>ชื่อสินค้า / วัตถุดิบ *</label>
              <input type="text" placeholder="เช่น เสื้อโปโล Size M"
                value={form.item_name} onChange={e => setForm({ ...form, item_name: e.target.value })} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label>ประเภท</label>
              <select value={form.item_type} onChange={e=>setForm({...form,item_type:e.target.value})}>
                <option value="">— เลือกประเภท —</option>
                {ITEM_TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label>ซัพพลายเออร์ *</label>
              <select value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
                <option value="">— เลือกซัพพลายเออร์ —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label>ราคาซื้อ (฿/หน่วย) *</label>
              <input type="number" placeholder="0"
                value={form.buy_price} onChange={e => setForm({ ...form, buy_price: e.target.value })} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label>ราคาขาย (฿/หน่วย) *</label>
              <input type="number" placeholder="0"
                value={form.sell_price} onChange={e => setForm({ ...form, sell_price: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? 'กำลังบันทึก...' : '💾 บันทึก'}
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => { setShowForm(false); setError('') }}>ยกเลิก</button>
          </div>
        </div>
      )}

      {/* Comparison table */}
      {selected && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>📊 {selected}</h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>เปรียบเทียบราคาซัพพลายเออร์ · ⭐ = ราคาดีที่สุด</p>
            </div>
          </div>

          {currentGroup.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>ไม่มีข้อมูล</div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>ซัพพลายเออร์</th>
                      <th>ราคาซื้อ (฿)</th>
                      <th>ราคาขาย (฿)</th>
                      <th>Margin (฿)</th>
                      <th>Margin (%)</th>
                      <th style={{ minWidth: 160 }}>Margin Bar</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...currentGroup].sort((a, b) => a.buy_price - b.buy_price).map((s, idx) => {
                      const margin = s.sell_price - s.buy_price
                      const pct = ((margin / s.sell_price) * 100).toFixed(1)
                      const barPct = maxMargin > 0 ? Math.round(margin / maxMargin * 100) : 0
                      const isBest = idx === 0 // sorted by buy_price, lowest = best
                      return (
                        <tr key={s.id} style={{ background: isBest ? '#FFFBEB' : undefined }}>
                          <td style={{ fontWeight: 600 }}>
                            {isBest && <span style={{ marginRight: 6 }}>⭐</span>}
                            {s.suppliers?.name || '—'}
                            {isBest && <span className="badge badge-yellow" style={{ marginLeft: 8 }}>ราคาดีที่สุด</span>}
                          </td>
                          <td style={{ fontWeight: 700, color: 'var(--danger)' }}>฿{s.buy_price.toLocaleString()}</td>
                          <td style={{ fontWeight: 700, color: 'var(--success)' }}>฿{s.sell_price.toLocaleString()}</td>
                          <td style={{ fontWeight: 700, color: 'var(--info)' }}>฿{margin.toLocaleString()}</td>
                          <td>
                            <span className={parseFloat(pct) >= 40 ? 'badge badge-green' : 'badge badge-yellow'}>{pct}%</span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div className="progress-wrap" style={{ flex: 1, margin: 0 }}>
                                <div className="progress-bar" style={{
                                  width: `${barPct}%`,
                                  background: isBest ? 'var(--success)' : 'var(--info)',
                                  height: '100%', borderRadius: 4,
                                }} />
                              </div>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 28, textAlign: 'right' }}>{barPct}%</span>
                            </div>
                          </td>
                          <td>
                            <button className="btn btn-outline btn-sm"
                              style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                              onClick={() => handleDelete(s.id)}>ลบ</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', gap: 24, fontSize: 13 }}>
                {(() => {
                  const best = [...currentGroup].sort((a, b) => a.buy_price - b.buy_price)[0]
                  const worst = [...currentGroup].sort((a, b) => b.buy_price - a.buy_price)[0]
                  if (!best || best.id === worst.id) return <span>มีซัพพลายเออร์เพียงรายเดียว</span>
                  const saving = worst.buy_price - best.buy_price
                  return (
                    <>
                      <span>⭐ <strong>{best.suppliers?.name}</strong> ราคาดีที่สุด</span>
                      <span style={{ color: 'var(--success)', fontWeight: 700 }}>ประหยัดได้ ฿{saving}/หน่วย เทียบกับราคาแพงสุด</span>
                    </>
                  )
                })()}
              </div>
            </>
          )}
        </div>
      )}

      {itemNames.length === 0 && !showForm && (
        <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
          <div style={{ fontWeight: 700 }}>ยังไม่มีรายการเปรียบเทียบราคา</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>กดปุ่ม "เพิ่มรายการ" เพื่อเริ่มต้น</div>
        </div>
      )}
    </div>
  )
}
