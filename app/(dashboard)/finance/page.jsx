'use client'
import { useState, useEffect } from 'react'
import { getTransactions, insertTransaction, updateTransaction, deleteTransaction, getInvoices, getSuppliers, getSetting, upsertSetting } from '@/lib/db'
import { fmtDate } from '@/lib/shop'
import { todayStr, exportJpeg, uploadFile } from '@/lib/docUtils'
import { supabase } from '@/lib/supabase'
import dynamic from 'next/dynamic'
const ExpenseChart = dynamic(() => import('@/components/charts/ExpenseChart'), { ssr: false, loading: () => <div style={{height:280}} /> })
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const DEFAULT_EXP_TYPES = ['ค่าผลิต','ค่าแรง','ค่าส่ง','ค่าผ้า','ค่าเสื้อยืด','ค่าเสื้อคนงาน','ค่าหมึก','ค่าอุปกรณ์','อื่น ๆ']
const DEFAULT_INC_TYPES = ['เสื้อยืด','เสื้อโปโล','เสื้อคนงาน','ผ้ากีฬา','งานสกรีน','เสื้อพิมพ์ลาย','อื่น ๆ']
const emptyForm = { description:'', type:'รายรับ', category:'', amount:'', transaction_date:todayStr(), invoice_id:'', supplier_id:'', note:'' }

export default function FinancePage() {
  const [txs, setTxs]               = useState([])
  const [invoices, setInvoices]     = useState([])
  const [suppliers, setSuppliers]   = useState([])
  const [expTypes, setExpTypes]     = useState(DEFAULT_EXP_TYPES)
  const [newType, setNewType]   = useState('')
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(emptyForm)
  const [saving, setSaving]     = useState(false)
  const [editId, setEditId]     = useState(null)
  // WHT tab
  const [whtFile, setWhtFile]   = useState({}) // {invId: File}
  const [whtUploading, setWhtUploading] = useState(null)

  useEffect(()=>{ load() },[])

  async function load() {
    const [tRes, iRes, sRes, etRes] = await Promise.all([getTransactions(), getInvoices(), getSuppliers(), getSetting('expense_types')])
    setTxs(tRes.data||[])
    setInvoices(iRes.data||[])
    setSuppliers(sRes.data||[])
    if (etRes.data?.value) setExpTypes(etRes.data.value)
    setLoading(false)
  }

  async function handleSave() {
    if (!form.description || !form.amount) return
    setSaving(true)
    const payload = {
      description:      form.description,
      type:             form.type,
      category:         form.category      || null,
      amount:           parseFloat(form.amount),
      transaction_date: form.transaction_date,
      invoice_id:       form.invoice_id    || null,
      supplier_id:      form.supplier_id   || null,
      note:             form.note          || null,
    }
    if (editId) {
      await updateTransaction(editId, payload)
      setEditId(null)
    } else {
      const { error } = await insertTransaction({ ...payload, code: 'TX-' + Date.now() })
      if (error) console.error('insertTransaction error:', error)
    }
    setForm(emptyForm); setShowForm(false); setSaving(false)
    load()
  }

  function startEdit(t) {
    setEditId(t.id)
    setForm({
      description:      t.description      || '',
      type:             t.type             || 'รายรับ',
      category:         t.category         || '',
      amount:           t.amount           || '',
      transaction_date: t.transaction_date || todayStr(),
      invoice_id:       t.invoice_id       || '',
      supplier_id:      t.supplier_id      || '',
      note:             t.note             || '',
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(t) {
    if (!confirm(`ลบรายการ "${t.description}" ใช่ไหม?`)) return
    await deleteTransaction(t.id)
    load()
  }

  async function addExpType() {
    if (!newType.trim() || expTypes.includes(newType.trim())) return
    const updated = [...expTypes, newType.trim()]
    setExpTypes(updated); setNewType('')
    await upsertSetting('expense_types', updated)
  }

  async function handleWhtUpload(inv) {
    const file = whtFile[inv.id]
    if (!file) return
    setWhtUploading(inv.id)
    const { updateInvoice } = await import('@/lib/db')
    const url = await uploadFile(supabase, 'wht-files', file)
    await updateInvoice(inv.id, { wht_file_url: url })
    setWhtFile(f => ({ ...f, [inv.id]: null }))
    setWhtUploading(null)
    load()
  }

  const income  = txs.filter(t=>t.type==='รายรับ')
  const expense = txs.filter(t=>t.type==='รายจ่าย')
  const totalIn  = income.reduce((s,t)=>s+t.amount,0)
  const totalOut = expense.reduce((s,t)=>s+t.amount,0)
  const profit   = totalIn - totalOut

  const filtered = tab==='income' ? income : tab==='expense' ? expense : txs

  // Chart: expenses by category
  const expByType = expTypes.map(cat => ({
    name: cat,
    total: expense.filter(t=>t.category===cat).reduce((s,t)=>s+t.amount,0),
  })).filter(d=>d.total>0)

  // Cost per invoice
  const costPerInv = invoices.map(inv => ({
    ...inv,
    revenue: inv.total || 0,
    cost:    txs.filter(t=>t.invoice_id===inv.id && t.type==='รายจ่าย').reduce((s,t)=>s+t.amount,0),
  })).filter(inv=>inv.revenue>0||inv.cost>0)

  // WHT invoices
  const whtInvoices = invoices.filter(i=>(i.wht_pct||0)>0)
  const totalWht    = whtInvoices.reduce((s,i)=>s+(i.wht_amount||0),0)

  const CHART_COLORS = ['var(--primary)','var(--info)','var(--success)','var(--warning)','#8B5CF6','#EC4899','#14B8A6','#F97316']

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* KPI */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
        {[
          { label:'รายรับรวม',   value:`฿${totalIn.toLocaleString()}`,  accent:'var(--success)', icon:'💰' },
          { label:'รายจ่ายรวม',  value:`฿${totalOut.toLocaleString()}`, accent:'var(--danger)',  icon:'💸' },
          { label:'กำไรสุทธิ',   value:`฿${profit.toLocaleString()}`,   accent:profit>=0?'var(--primary)':'var(--danger)', icon:'📈' },
          { label:'รายการทั้งหมด', value:txs.length+' รายการ',           accent:'var(--info)', icon:'📋' },
        ].map(k=>(
          <div key={k.label} style={{ background:'var(--card)', borderRadius:'var(--radius)', padding:'16px 18px', boxShadow:'var(--shadow)', border:'1px solid var(--border)', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, width:4, height:'100%', background:k.accent, borderRadius:'10px 0 0 10px' }} />
            <div style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', fontSize:28, opacity:.1 }}>{k.icon}</div>
            <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase' }}>{k.label}</div>
            <div style={{ fontSize:22, fontWeight:800, color:k.accent, marginTop:4 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {[['all','ทั้งหมด'],['income','รายรับ'],['expense','รายจ่าย'],['chart','กราฟรายจ่าย'],['cost','ต้นทุนต่อ Invoice']].map(([v,l])=>(
            <button key={v} onClick={()=>setTab(v)}
              className={tab===v?'btn btn-primary btn-sm':'btn btn-outline btn-sm'}>{l}</button>
          ))}
        </div>
        {['all','income','expense'].includes(tab) && (
          <button className="btn btn-primary" onClick={()=>{ setShowForm(!showForm); if (showForm) { setEditId(null); setForm(emptyForm) } }}>
            {showForm ? '✕ ปิด' : '+ เพิ่มรายการ'}
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && ['all','income','expense'].includes(tab) && (
        <div className="card" style={{ padding:20 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>{editId ? '✏️ แก้ไขรายการ' : '➕ เพิ่มรายการ'}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
            <div style={{ display:'flex', flexDirection:'column', gap:4, gridColumn:'1 / -1' }}>
              <label>รายการ *</label>
              <input type="text" placeholder="รายละเอียด..." value={form.description}
                onChange={e=>setForm({...form,description:e.target.value})} />
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label>ประเภท</label>
              <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
                <option>รายรับ</option><option>รายจ่าย</option>
              </select>
            </div>
            {form.type==='รายรับ' && (
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <label>ประเภทรายรับ</label>
                <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
                  <option value="">— เลือกประเภท —</option>
                  {DEFAULT_INC_TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
            )}
            {form.type==='รายจ่าย' && (
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <label>หมวดหมู่รายจ่าย</label>
                <div style={{ display:'flex', gap:6 }}>
                  <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} style={{ flex:1 }}>
                    <option value="">— เลือกหมวด —</option>
                    {expTypes.map(t=><option key={t}>{t}</option>)}
                  </select>
                  <button className="btn btn-outline btn-sm" title="เพิ่มหมวดหมู่"
                    onClick={()=>{const n=prompt('ชื่อหมวดหมู่ใหม่');if(n&&n.trim()&&!expTypes.includes(n.trim())){const u=[...expTypes,n.trim()];setExpTypes(u);upsertSetting('expense_types',u)}}}>+</button>
                </div>
              </div>
            )}
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label>จำนวน (฿) *</label>
              <input type="number" min="0" placeholder="0" value={form.amount}
                onChange={e=>setForm({...form,amount:e.target.value})} />
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label>วันที่</label>
              <input type="date" value={form.transaction_date}
                onChange={e=>setForm({...form,transaction_date:e.target.value})} />
            </div>
            {form.type==='รายจ่าย' && (
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <label>Supplier (ถ้ามี)</label>
                <select value={form.supplier_id} onChange={e=>setForm({...form,supplier_id:e.target.value})}>
                  <option value="">— ไม่ระบุ —</option>
                  {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label>ผูก Invoice (ถ้ามี)</label>
              <select value={form.invoice_id} onChange={e=>setForm({...form,invoice_id:e.target.value})}>
                <option value="">— ไม่ผูก —</option>
                {invoices.map(i=><option key={i.id} value={i.id}>{i.code} – {i.customers?.name}</option>)}
              </select>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4, gridColumn:'1 / -1' }}>
              <label>หมายเหตุ</label>
              <input type="text" placeholder="หมายเหตุ..." value={form.note}
                onChange={e=>setForm({...form,note:e.target.value})} />
            </div>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? 'กำลังบันทึก...' : editId ? '💾 บันทึกการแก้ไข' : '💾 บันทึก'}
            </button>
            <button className="btn btn-outline btn-sm" onClick={()=>{ setShowForm(false); setEditId(null); setForm(emptyForm) }}>ยกเลิก</button>
          </div>
        </div>
      )}

      {/* Chart tab */}
      {tab==='chart' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          <div className="card">
            <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)' }}>
              <h2 style={{ fontSize:14, fontWeight:700 }}>📊 ค่าใช้จ่ายแยกตามหมวดหมู่</h2>
            </div>
            <div style={{ padding:16 }}>
              <ExpenseChart data={expByType} />
            </div>
          </div>
          <div className="card">
            <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)' }}>
              <h2 style={{ fontSize:14, fontWeight:700 }}>📋 สรุปค่าใช้จ่ายตามหมวด</h2>
            </div>
            <div style={{ padding:16, display:'flex', flexDirection:'column', gap:8 }}>
              {expByType.sort((a,b)=>b.total-a.total).map((d,i)=>(
                <div key={d.name} style={{ display:'flex', justifyContent:'space-between', padding:'6px 10px', background:'var(--bg)', borderRadius:6 }}>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <div style={{ width:10, height:10, borderRadius:2, background:CHART_COLORS[i%CHART_COLORS.length], flexShrink:0 }} />
                    <span style={{ fontSize:13 }}>{d.name}</span>
                  </div>
                  <span style={{ fontWeight:700, fontSize:13 }}>฿{d.total.toLocaleString()}</span>
                </div>
              ))}
              {expByType.length===0 && <div style={{ color:'var(--text-muted)', fontSize:13 }}>ไม่มีข้อมูล</div>}
              <div style={{ borderTop:'1px solid var(--border)', paddingTop:8, display:'flex', justifyContent:'space-between', fontWeight:800 }}>
                <span>รวมทั้งหมด</span>
                <span style={{ color:'var(--danger)' }}>฿{totalOut.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cost per Invoice */}
      {tab==='cost' && (
        <div className="card" style={{ overflow:'hidden' }}>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)' }}>
            <h2 style={{ fontSize:14, fontWeight:700 }}>💹 ต้นทุนและกำไรต่อ Invoice</h2>
          </div>
          {loading ? <LoadingSpinner /> : (
            <div style={{ overflowX:'auto' }}>
              <table>
                <thead>
                  <tr><th>Invoice</th><th>ลูกค้า</th><th>รายรับ</th><th>ต้นทุน</th><th>กำไร</th><th>Margin</th></tr>
                </thead>
                <tbody>
                  {costPerInv.length===0 && (
                    <tr><td colSpan={6} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>ยังไม่มีข้อมูล — ผูกรายการกับ Invoice ก่อน</td></tr>
                  )}
                  {costPerInv.map(inv=>{
                    const g = inv.revenue - inv.cost
                    const m = inv.revenue>0?((g/inv.revenue)*100).toFixed(1):0
                    return (
                      <tr key={inv.id}>
                        <td style={{ color:'var(--primary)', fontFamily:'monospace', fontWeight:700 }}>{inv.code}</td>
                        <td>{inv.customers?.name||'—'}</td>
                        <td style={{ color:'var(--success)', fontWeight:700 }}>฿{inv.revenue.toLocaleString()}</td>
                        <td style={{ color:'var(--danger)', fontWeight:700 }}>฿{inv.cost.toLocaleString()}</td>
                        <td style={{ color:g>=0?'var(--success)':'var(--danger)', fontWeight:800 }}>฿{g.toLocaleString()}</td>
                        <td><span className={parseFloat(m)>=30?'badge badge-green':'badge badge-yellow'}>{m}%</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Transactions table */}
      {['all','income','expense'].includes(tab) && (
        <div className="card" style={{ overflow:'hidden' }}>
          {loading ? <LoadingSpinner /> : (
            <>
              <div style={{ overflowX:'auto' }}>
                <table>
                  <thead>
                    <tr><th>วันที่</th><th>รายการ</th><th>หมวด</th><th>ประเภท</th><th>จำนวน</th><th>Invoice</th><th>Supplier</th><th>หมายเหตุ</th><th></th></tr>
                  </thead>
                  <tbody>
                    {filtered.map(t=>(
                      <tr key={t.id}>
                        <td style={{ fontSize:12, color:'var(--text-muted)', whiteSpace:'nowrap' }}>{fmtDate(t.transaction_date)}</td>
                        <td style={{ fontSize:13 }}>{t.description}</td>
                        <td style={{ fontSize:12 }}>{t.category ? <span className="badge badge-gray">{t.category}</span> : '—'}</td>
                        <td><span className={t.type==='รายรับ'?'badge badge-green':'badge badge-red'}>{t.type}</span></td>
                        <td style={{ fontWeight:700, fontFamily:'monospace', color:t.type==='รายรับ'?'var(--success)':'var(--danger)' }}>
                          {t.type==='รายรับ'?'+':'-'}฿{(t.amount||0).toLocaleString()}
                        </td>
                        <td style={{ fontSize:12, color:'var(--info)' }}>{t.invoices?.code||'—'}</td>
                        <td style={{ fontSize:12, color:'var(--text-muted)' }}>{t.suppliers?.name||'—'}</td>
                        <td style={{ fontSize:12, color:'var(--text-muted)' }}>{t.note||'—'}</td>
                        <td style={{ whiteSpace:'nowrap' }}>
                          <button className="btn btn-outline btn-sm" style={{ marginRight:4 }}
                            onClick={()=>startEdit(t)}>✏️</button>
                          <button className="btn btn-outline btn-sm" style={{ color:'var(--danger)', borderColor:'var(--danger)' }}
                            onClick={()=>handleDelete(t)}>ลบ</button>
                        </td>
                      </tr>
                    ))}
                    {filtered.length===0 && (
                      <tr><td colSpan={7} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>ไม่พบรายการ</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{ padding:'10px 14px', borderTop:'1px solid var(--border)', fontSize:12, color:'var(--text-muted)' }}>
                แสดง {filtered.length} จาก {txs.length} รายการ
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
