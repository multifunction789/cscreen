'use client'
import { useState, useEffect } from 'react'
import { getCustomers, insertCustomer, updateCustomer, getInvoices } from '@/lib/db'
import { fmtDate } from '@/lib/shop'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const PLATFORMS = ['Walk-in','Line','Facebook','Instagram','Referral','อื่น ๆ']
const TYPES     = ['บุคคลธรรมดา','นิติบุคคล','หน่วยงานราชการ','Dealer']
const emptyForm = { name:'', type:'บุคคลธรรมดา', phone:'', email:'', line:'', address:'', tax_id:'', platform:'Walk-in', notes:'', contact_person:'' }

export default function CustomersPage() {
  const [rows, setRows]         = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [filterType, setFilterType] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(emptyForm)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [detail, setDetail]     = useState(null)
  const [editing, setEditing]   = useState(null) // customer being edited
  const [editForm, setEditForm] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    const [cusRes, invRes] = await Promise.all([getCustomers(), getInvoices()])
    setRows(cusRes.data || [])
    setInvoices(invRes.data || [])
    setLoading(false)
  }

  async function handleUpdate() {
    if (!editForm.name?.trim()) return
    await updateCustomer(editing, editForm)
    setEditing(null)
    load()
  }

  async function handleSave() {
    if (!form.name.trim()) return setError('กรุณาระบุชื่อลูกค้า')
    setSaving(true); setError('')
    const code = 'C-' + String((rows.length || 0) + 1).padStart(3, '0')
    const { error: err } = await insertCustomer({ ...form, code })
    if (err) { setError(err.message); setSaving(false); return }
    setForm(emptyForm); setShowForm(false); setSaving(false)
    load()
  }

  const filtered = rows.filter(r => {
    const ms = r.name?.includes(search)||r.phone?.includes(search)||r.code?.includes(search)||r.email?.includes(search)
    const mt = !filterType || r.type===filterType
    return ms && mt
  })

  const now = new Date()
  const newThisMonth = rows.filter(c => {
    const d = new Date(c.created_at)
    return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth()
  })

  const F = ({ label, val }) => (
    <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
      <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600 }}>{label}</span>
      <span style={{ fontSize:13, color:'var(--text)' }}>{val || '—'}</span>
    </div>
  )

  return (
    <div style={{ display:'flex', gap:20 }}>
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:20, minWidth:0 }}>
        {/* KPI */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
          {[
            { label:'ลูกค้าทั้งหมด', value:rows.length+' ราย', accent:'var(--primary)', icon:'👥' },
            { label:'ลูกค้าใหม่เดือนนี้', value:'+'+newThisMonth.length+' ราย', accent:'var(--success)', icon:'✨' },
            { label:'ใบแจ้งหนี้รวม', value:invoices.length+' ใบ', accent:'var(--info)', icon:'📄' },
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
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <div style={{ position:'relative' }}>
              <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }}>🔍</span>
              <input type="text" placeholder="ค้นหาลูกค้า..." value={search}
                onChange={e=>setSearch(e.target.value)} style={{ paddingLeft:36, width:220 }} />
            </div>
            {['','บุคคลธรรมดา','นิติบุคคล','หน่วยงานราชการ','Dealer'].map(t=>(
              <button key={t} onClick={()=>setFilterType(t)}
                className={filterType===t?'btn btn-primary btn-sm':'btn btn-outline btn-sm'}>
                {t||'ทั้งหมด'}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={()=>setShowForm(!showForm)}>
            {showForm ? '✕ ปิด' : '+ เพิ่มลูกค้า'}
          </button>
        </div>

        {/* Add form */}
        {showForm && (
          <div className="card" style={{ padding:20 }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>➕ เพิ่มลูกค้าใหม่</div>
            {error && <div style={{ color:'var(--danger)', fontSize:13, marginBottom:10 }}>⚠️ {error}</div>}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
              {[
                { label:'ชื่อลูกค้า / บริษัท *', key:'name', type:'text', placeholder:'ชื่อลูกค้า' },
                { label:'เบอร์โทร', key:'phone', type:'tel', placeholder:'0xx-xxx-xxxx' },
                { label:'อีเมล', key:'email', type:'email', placeholder:'email@example.com' },
                { label:'Line ID', key:'line', type:'text', placeholder:'@line' },
                { label:'เลขประจำตัวผู้เสียภาษี', key:'tax_id', type:'text', placeholder:'13 หลัก' },
                { label:'ชื่อผู้ประสานงาน', key:'contact_person', type:'text', placeholder:'ชื่อ-นามสกุล' },
              ].map(f => (
                <div key={f.key} style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  <label style={{ fontSize:12 }}>{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder}
                    value={form[f.key]} onChange={e=>setForm({...form,[f.key]:e.target.value})} />
                </div>
              ))}
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <label style={{ fontSize:12 }}>ประเภทลูกค้า</label>
                <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
                  {TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <label style={{ fontSize:12 }}>รู้จักจาก</label>
                <select value={form.platform} onChange={e=>setForm({...form,platform:e.target.value})}>
                  {PLATFORMS.map(p=><option key={p}>{p}</option>)}
                </select>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:4, gridColumn:'1 / -1' }}>
                <label style={{ fontSize:12 }}>ที่อยู่</label>
                <input type="text" placeholder="ที่อยู่สำหรับออกเอกสาร"
                  value={form.address} onChange={e=>setForm({...form,address:e.target.value})} />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:4, gridColumn:'1 / -1' }}>
                <label style={{ fontSize:12 }}>หมายเหตุ</label>
                <input type="text" placeholder="หมายเหตุ..."
                  value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} />
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:14 }}>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                {saving ? 'กำลังบันทึก...' : '💾 บันทึก'}
              </button>
              <button className="btn btn-outline btn-sm" onClick={()=>{setShowForm(false);setError('')}}>ยกเลิก</button>
            </div>
          </div>
        )}

        {/* Edit form */}
        {editing && (
          <div className="card" style={{ padding:20, border:'2px solid var(--primary)', background:'#FFF8F8' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--primary)' }}>✏️ แก้ไขข้อมูลลูกค้า</div>
              <button className="btn btn-outline btn-sm" onClick={()=>setEditing(null)}>✕ ปิด</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
              {[
                { label:'ชื่อลูกค้า / บริษัท *', key:'name' },
                { label:'เบอร์โทร', key:'phone' },
                { label:'อีเมล', key:'email' },
                { label:'Line ID', key:'line' },
                { label:'เลขประจำตัวผู้เสียภาษี', key:'tax_id' },
                { label:'ชื่อผู้ประสานงาน', key:'contact_person' },
              ].map(({label,key}) => (
                <div key={key} style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  <label style={{ fontSize:12, fontWeight:600, color:'var(--text-muted)' }}>{label}</label>
                  <input value={editForm[key]||''} onChange={e=>setEditForm({...editForm,[key]:e.target.value})}
                    style={{ background:'#fff' }} />
                </div>
              ))}
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <label style={{ fontSize:12, fontWeight:600, color:'var(--text-muted)' }}>ประเภทลูกค้า</label>
                <select value={editForm.type||''} onChange={e=>setEditForm({...editForm,type:e.target.value})} style={{ background:'#fff' }}>
                  {TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <label style={{ fontSize:12, fontWeight:600, color:'var(--text-muted)' }}>รู้จักจาก</label>
                <select value={editForm.platform||''} onChange={e=>setEditForm({...editForm,platform:e.target.value})} style={{ background:'#fff' }}>
                  {PLATFORMS.map(p=><option key={p}>{p}</option>)}
                </select>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:4, gridColumn:'1 / -1' }}>
                <label style={{ fontSize:12, fontWeight:600, color:'var(--text-muted)' }}>ที่อยู่</label>
                <input value={editForm.address||''} onChange={e=>setEditForm({...editForm,address:e.target.value})} style={{ background:'#fff' }} />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:4, gridColumn:'1 / -1' }}>
                <label style={{ fontSize:12, fontWeight:600, color:'var(--text-muted)' }}>หมายเหตุ</label>
                <input value={editForm.notes||''} onChange={e=>setEditForm({...editForm,notes:e.target.value})} style={{ background:'#fff' }} />
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:14 }}>
              <button className="btn btn-primary btn-sm" onClick={handleUpdate}>💾 บันทึกการแก้ไข</button>
              <button className="btn btn-outline btn-sm" onClick={()=>setEditing(null)}>ยกเลิก</button>
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
                    <tr><th>รหัส</th><th>ชื่อ</th><th>ประเภท</th><th>Platform</th><th>เบอร์โทร</th><th>Invoice</th><th>วันที่เพิ่ม</th><th></th></tr>
                  </thead>
                  <tbody>
                    {filtered.map(c => {
                      const invCount = invoices.filter(i=>i.customer_id===c.id).length
                      return (
                        <tr key={c.id} className="row-link">
                          <td style={{ color:'var(--primary)', fontFamily:'monospace', fontWeight:700 }}>{c.code}</td>
                          <td style={{ fontWeight:700 }}>{c.name}</td>
                          <td><span className="badge badge-gray">{c.type||'บุคคลธรรมดา'}</span></td>
                          <td style={{ fontSize:12, color:'var(--text-muted)' }}>{c.platform||'—'}</td>
                          <td style={{ fontFamily:'monospace', fontSize:12 }}>{c.phone||'—'}</td>
                          <td><span className="badge badge-blue">{invCount} ใบ</span></td>
                          <td style={{ fontSize:12, color:'var(--text-muted)' }}>{fmtDate(c.created_at)}</td>
                          <td style={{ display:'flex', gap:4 }}>
                            <button className="btn btn-outline btn-sm" onClick={()=>setDetail(detail?.id===c.id?null:c)}>ดู</button>
                            <button className="btn btn-outline btn-sm" onClick={()=>{setEditing(c.id);setEditForm({...c});window.scrollTo({top:0,behavior:'smooth'})}}>✏️</button>
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
                แสดง {filtered.length} จาก {rows.length} ราย
              </div>
            </>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {detail && (
        <div style={{ width:300, flexShrink:0, background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', boxShadow:'var(--shadow)', height:'fit-content', position:'sticky', top:80 }}>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <h2 style={{ fontSize:14, fontWeight:700 }}>👤 {detail.name}</h2>
            <button onClick={()=>setDetail(null)} style={{ background:'none', border:'none', fontSize:16, cursor:'pointer', color:'var(--text-muted)' }}>✕</button>
          </div>
          <div style={{ padding:16, display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <F label="รหัส"       val={detail.code} />
              <F label="ประเภท"     val={detail.type} />
              <F label="เบอร์โทร"   val={detail.phone} />
              <F label="Line"       val={detail.line} />
              <F label="Platform"   val={detail.platform} />
              <F label="วันที่สร้าง" val={fmtDate(detail.created_at)} />
            </div>
            {detail.email   && <F label="อีเมล"           val={detail.email} />}
            {detail.tax_id  && <F label="เลขผู้เสียภาษี" val={detail.tax_id} />}
            {detail.address && <F label="ที่อยู่"          val={detail.address} />}
            {detail.notes   && <F label="หมายเหตุ"        val={detail.notes} />}

            <div style={{ borderTop:'1px solid var(--border)', paddingTop:10 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', marginBottom:8 }}>ใบแจ้งหนี้ล่าสุด</div>
              {invoices.filter(i=>i.customer_id===detail.id).slice(0,5).map(i => (
                <div key={i.id} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:700, color:'var(--primary)' }}>{i.code}</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)' }}>฿{(i.total||0).toLocaleString()}</div>
                  </div>
                  <span className={i.status==='ชำระแล้ว'?'badge badge-green':'badge badge-yellow'} style={{ fontSize:10 }}>{i.status}</span>
                </div>
              ))}
              {invoices.filter(i=>i.customer_id===detail.id).length===0 && (
                <div style={{ fontSize:12, color:'var(--text-muted)' }}>ยังไม่มีใบแจ้งหนี้</div>
              )}
            </div>
            <div style={{ display:'flex', gap:6, marginTop:4 }}>
              <a href="/invoice" className="btn btn-primary btn-sm" style={{ flex:1, justifyContent:'center', textDecoration:'none', textAlign:'center' }}>+ Invoice</a>
              <a href="/joborder" className="btn btn-outline btn-sm" style={{ flex:1, justifyContent:'center', textDecoration:'none', textAlign:'center' }}>+ ใบงาน</a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
