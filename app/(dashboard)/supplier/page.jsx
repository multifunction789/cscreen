'use client'
import { useState, useEffect } from 'react'
import { getSuppliers, insertSupplier, updateSupplier, getTransactions, getSetting, upsertSetting } from '@/lib/db'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const DEFAULT_CATS = ['เสื้อผ้า','หมึก / สี','อุปกรณ์','ถุงผ้า','อื่น ๆ']
const emptyForm = { name:'', category:'เสื้อผ้า', contact:'', phone:'', email:'', address:'', tax_id:'', notes:'' }


export default function SupplierPage() {
  const [rows, setRows]         = useState([])
  const [cats, setCats]         = useState(DEFAULT_CATS)
  const [newCat, setNewCat]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [form, setForm]         = useState(emptyForm)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [editId, setEditId]     = useState(null)
  const [showCatEditor, setShowCatEditor] = useState(false)
  const [spendMap, setSpendMap] = useState({}) // supplier_id → total spend

  useEffect(()=>{ load() },[])

  async function load() {
    const [{ data }, catRes, txRes] = await Promise.all([
      getSuppliers(),
      getSetting('supplier_categories'),
      getTransactions(),
    ])
    setRows(data||[])
    if (catRes.data?.value) setCats(catRes.data.value)
    // aggregate spend per supplier from รายจ่าย transactions
    const map = {}
    for (const t of (txRes.data||[])) {
      if (t.type === 'รายจ่าย' && t.supplier_id) {
        map[t.supplier_id] = (map[t.supplier_id] || 0) + (t.amount || 0)
      }
    }
    setSpendMap(map)
    setLoading(false)
  }

  function startEdit(s) {
    setEditId(s.id)
    setForm({ name:s.name||'', category:s.category||'เสื้อผ้า', contact:s.contact||'', phone:s.phone||'', email:s.email||'', address:s.address||'', tax_id:s.tax_id||'', notes:s.notes||'' })
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditId(null)
    setForm(emptyForm)
    setError('')
  }

  async function handleSave() {
    if (!form.name.trim()) return setError('กรุณาระบุชื่อบริษัท')
    setSaving(true); setError('')
    if (editId) {
      const { error:err } = await updateSupplier(editId, { ...form })
      if (err) { setError(err.message); setSaving(false); return }
      setEditId(null)
    } else {
      const code = 'SUP-'+String((rows.length||0)+1).padStart(3,'0')
      const { error:err } = await insertSupplier({ ...form, code, rating:3 })
      if (err) { setError(err.message); setSaving(false); return }
    }
    setForm(emptyForm); setSaving(false)
    load()
  }

  async function addCategory() {
    if (!newCat.trim()||cats.includes(newCat.trim())) return
    const updated = [...cats, newCat.trim()]
    setCats(updated); setNewCat('')
    await upsertSetting('supplier_categories', updated)
  }

  async function removeCategory(cat) {
    const updated = cats.filter(c=>c!==cat)
    setCats(updated)
    await upsertSetting('supplier_categories', updated)
    if (form.category===cat) setForm(f=>({...f, category:updated[0]||''}))
  }

  const filtered = rows.filter(s=>s.name?.includes(search)||s.category?.includes(search)||s.contact?.includes(search))

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {/* KPI */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
        {[
          { label:'ซัพพลายเออร์ทั้งหมด', value:rows.length+' ราย', accent:'var(--primary)', icon:'🏢' },
          { label:'หมวดหมู่', value:cats.length+' หมวด', accent:'var(--info)', icon:'🗂️' },
          { label:'ยอดรายจ่ายรวม', value: Object.values(spendMap).length ? '฿'+Object.values(spendMap).reduce((a,b)=>a+b,0).toLocaleString() : '฿0', accent:'var(--warning)', icon:'💸' },
        ].map(k=>(
          <div key={k.label} style={{ background:'var(--card)', borderRadius:'var(--radius)', padding:'16px 18px', boxShadow:'var(--shadow)', border:'1px solid var(--border)', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, width:4, height:'100%', background:k.accent, borderRadius:'10px 0 0 10px' }} />
            <div style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', fontSize:28, opacity:.1 }}>{k.icon}</div>
            <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase' }}>{k.label}</div>
            <div style={{ fontSize:22, fontWeight:800, color:k.accent, marginTop:4 }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        {/* Add form */}
        <div className="card" style={{ padding:20 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:14, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span>{editId ? '✏️ แก้ไขซัพพลายเออร์' : '➕ เพิ่มซัพพลายเออร์ใหม่'}</span>
            {editId && (
              <button onClick={cancelEdit}
                style={{ background:'none', border:'none', fontSize:12, color:'var(--text-muted)', cursor:'pointer', fontWeight:600 }}>
                ✕ ยกเลิก
              </button>
            )}
          </div>
          {error && <div style={{ color:'var(--danger)', fontSize:13, marginBottom:10 }}>⚠️ {error}</div>}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {[
              { label:'ชื่อบริษัท *', key:'name', type:'text', placeholder:'บริษัท ผ้าไทย จำกัด' },
              { label:'ชื่อผู้ติดต่อ', key:'contact', type:'text', placeholder:'คุณ...' },
              { label:'เบอร์โทร', key:'phone', type:'tel', placeholder:'08x-xxx-xxxx' },
              { label:'อีเมล', key:'email', type:'email', placeholder:'email@example.com' },
              { label:'เลขประจำตัวผู้เสียภาษี', key:'tax_id', type:'text', placeholder:'13 หลัก' },
              { label:'ที่อยู่', key:'address', type:'text', placeholder:'ที่อยู่สำหรับออกเอกสาร' },
              { label:'หมายเหตุ', key:'notes', type:'text', placeholder:'เงื่อนไข, ระยะเวลาส่งของ...' },
            ].map(f=>(
              <div key={f.key} style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <label style={{ fontSize:12 }}>{f.label}</label>
                <input type={f.type} placeholder={f.placeholder}
                  value={form[f.key]} onChange={e=>setForm({...form,[f.key]:e.target.value})} />
              </div>
            ))}
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <label style={{ fontSize:12 }}>หมวดหมู่สินค้า</label>
                <button onClick={()=>setShowCatEditor(!showCatEditor)}
                  style={{ background:'none', border:'none', fontSize:11, color:'var(--primary)', cursor:'pointer', fontWeight:600 }}>
                  {showCatEditor?'ปิด':'⚙️ จัดการ'}
                </button>
              </div>
              <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
                {cats.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>

            {/* Category editor */}
            {showCatEditor && (
              <div style={{ background:'var(--bg)', borderRadius:8, padding:12, border:'1px solid var(--border)' }}>
                <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>จัดการหมวดหมู่</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                  {cats.map(c=>(
                    <span key={c} style={{ display:'flex', alignItems:'center', gap:4, background:'var(--card)', border:'1px solid var(--border)', borderRadius:20, padding:'3px 10px', fontSize:12 }}>
                      {c}
                      <button onClick={()=>removeCategory(c)}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--danger)', fontSize:14, lineHeight:1, padding:0 }}>×</button>
                    </span>
                  ))}
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <input type="text" placeholder="หมวดหมู่ใหม่..." value={newCat}
                    onChange={e=>setNewCat(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&addCategory()}
                    style={{ flex:1 }} />
                  <button className="btn btn-primary btn-sm" onClick={addCategory}>+ เพิ่ม</button>
                </div>
              </div>
            )}

            <button className="btn btn-primary" style={{ marginTop:4, justifyContent:'center' }}
              onClick={handleSave} disabled={saving}>
              {saving ? 'กำลังบันทึก...' : editId ? '💾 บันทึกการแก้ไข' : '💾 บันทึกซัพพลายเออร์'}
            </button>
          </div>
        </div>

        {/* Spend bar chart */}
        <div className="card">
          <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)' }}>
            <h2 style={{ fontSize:14, fontWeight:700 }}>📊 ยอดซื้อสูงสุด (รายจ่ายจริง)</h2>
          </div>
          <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:12 }}>
            {loading ? <LoadingSpinner /> : (() => {
              const ranked = rows
                .map(s => ({ ...s, spend: spendMap[s.id] || 0 }))
                .filter(s => s.spend > 0)
                .sort((a,b) => b.spend - a.spend)
                .slice(0, 6)
              const maxSpend = ranked[0]?.spend || 1
              const BAR_COLORS = ['#6366F1','#8B5CF6','#EC4899','#F59E0B','#10B981','#3B82F6']
              if (ranked.length === 0) return (
                <div style={{ textAlign:'center', padding:'24px 0', color:'var(--text-muted)', fontSize:13 }}>
                  ยังไม่มีข้อมูลรายจ่ายที่ระบุซัพพลายเออร์
                </div>
              )
              return ranked.map((s, i) => (
                <div key={s.id}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ width:18, height:18, borderRadius:'50%', background:BAR_COLORS[i]||'#94A3B8', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, flexShrink:0 }}>{i+1}</div>
                      <span style={{ fontSize:12, fontWeight:700 }}>{s.name}</span>
                      <span style={{ fontSize:10, color:'var(--text-muted)' }}>{s.category}</span>
                    </div>
                    <span style={{ fontSize:12, fontWeight:800, color:BAR_COLORS[i]||'#94A3B8' }}>฿{s.spend.toLocaleString()}</span>
                  </div>
                  <div style={{ height:8, borderRadius:99, background:'var(--border)', overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${(s.spend/maxSpend)*100}%`, background:BAR_COLORS[i]||'#94A3B8', borderRadius:99, transition:'width .5s ease' }} />
                  </div>
                </div>
              ))
            })()}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow:'hidden' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h2 style={{ fontSize:14, fontWeight:700 }}>🏢 ซัพพลายเออร์ทั้งหมด</h2>
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:13 }}>🔍</span>
            <input type="text" placeholder="ค้นหา..." value={search}
              onChange={e=>setSearch(e.target.value)} style={{ paddingLeft:32, width:200, height:32, fontSize:13 }} />
          </div>
        </div>
        {loading ? <LoadingSpinner /> : (
          <div style={{ overflowX:'auto' }}>
            <table>
              <thead>
                <tr><th>รหัส</th><th>ชื่อบริษัท</th><th>หมวดหมู่</th><th>ผู้ติดต่อ</th><th>เบอร์โทร</th><th>เลขภาษี</th><th>ยอดซื้อ (฿)</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map(s=>(
                  <tr key={s.id} style={{ background: editId===s.id ? 'var(--primary-light, #eff6ff)' : undefined }}>
                    <td style={{ color:'var(--primary)', fontFamily:'monospace', fontWeight:700 }}>{s.code}</td>
                    <td style={{ fontWeight:700 }}>{s.name}</td>
                    <td><span className="badge badge-gray">{s.category}</span></td>
                    <td style={{ color:'var(--text-muted)' }}>{s.contact||'—'}</td>
                    <td style={{ fontFamily:'monospace', fontSize:12 }}>{s.phone||'—'}</td>
                    <td style={{ fontFamily:'monospace', fontSize:11, color:'var(--text-muted)' }}>{s.tax_id||'—'}</td>
                    <td style={{ fontFamily:'monospace', fontSize:12, fontWeight:700, color: spendMap[s.id] ? 'var(--primary)' : 'var(--text-muted)' }}>
                      {spendMap[s.id] ? '฿'+spendMap[s.id].toLocaleString() : '—'}
                    </td>
                    <td>
                      <button onClick={()=>startEdit(s)}
                        style={{ background:'none', border:'none', cursor:'pointer', fontSize:14, padding:'2px 6px', color:'var(--primary)', borderRadius:4 }}
                        title="แก้ไข">✏️</button>
                    </td>
                  </tr>
                ))}
                {filtered.length===0 && (
                  <tr><td colSpan={8} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>ไม่พบรายการ</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding:'10px 14px', borderTop:'1px solid var(--border)', fontSize:12, color:'var(--text-muted)' }}>
          ทั้งหมด {filtered.length} ราย
        </div>
      </div>
    </div>
  )
}
