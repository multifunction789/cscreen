'use client'
import { useState, useEffect } from 'react'
import { getJobOrders, updateJobStatus } from '@/lib/db'
import { fmtShort } from '@/lib/shop'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const columns = [
  { id:'รอมัดจำ',      label:'รอมัดจำ',      color:'#9CA3AF', bg:'#F3F4F6' },
  { id:'รอออกแบบ',     label:'รอออกแบบ',     color:'#0891B2', bg:'#CFFAFE' },
  { id:'รอทำไฟล์',     label:'รอทำไฟล์',     color:'#8B5CF6', bg:'#EDE9FE' },
  { id:'สั่งของ',       label:'สั่งของ',       color:'#F59E0B', bg:'#FEF3C7' },
  { id:'กำลังสกรีน',   label:'กำลังสกรีน',   color:'#3B82F6', bg:'#DBEAFE' },
  { id:'แพ็คพร้อมส่ง', label:'แพ็คพร้อมส่ง', color:'#10B981', bg:'#D1FAE5' },
  { id:'ส่งงานแล้ว',   label:'ส่งงานแล้ว',   color:'#6B7280', bg:'#F9FAFB' },
]
const KANBAN_COLUMNS = columns.filter(c => c.id !== 'ส่งงานแล้ว')

export default function ProductionPage() {
  const [jobs, setJobs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView]       = useState('kanban')
  const [dragId, setDragId]   = useState(null)
  const [dragOver, setDragOver] = useState(null)

  useEffect(()=>{ load() },[])

  async function load() {
    const { data } = await getJobOrders()
    setJobs(data||[])
    setLoading(false)
  }

  async function moveJob(jobId, newStatus) {
    setJobs(prev=>prev.map(j=>j.id===jobId?{...j,status:newStatus}:j))
    await updateJobStatus(jobId, newStatus)
  }

  function onDragStart(e, jobId) {
    setDragId(jobId)
    e.dataTransfer.effectAllowed = 'move'
  }
  function onDragOver(e, colId) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(colId)
  }
  function onDrop(e, colId) {
    e.preventDefault()
    if (dragId && colId) moveJob(dragId, colId)
    setDragId(null); setDragOver(null)
  }
  function onDragEnd() { setDragId(null); setDragOver(null) }

  if (loading) return <LoadingSpinner />

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <p style={{ fontSize:13, color:'var(--text-muted)' }}>
          {view==='kanban' ? '🖱️ ลากการ์ดข้ามคอลัมน์เพื่อเปลี่ยนสถานะ' : '📅 Timeline'}
        </p>
        <div style={{ display:'flex', gap:8 }}>
          {['kanban','timeline'].map(v=>(
            <button key={v} onClick={()=>setView(v)}
              className={view===v?'btn btn-primary btn-sm':'btn btn-outline btn-sm'}>
              {v==='kanban'?'📋 Kanban':'📅 Timeline'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary chips */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {columns.map(col=>{
          const count = jobs.filter(j=>j.status===col.id).length
          return count>0 && (
            <span key={col.id} style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:col.bg, color:col.color, border:`1px solid ${col.color}40` }}>
              {col.label} · {count}
            </span>
          )
        })}
      </div>

      {/* KANBAN */}
      {view==='kanban' && (
        <div style={{ display:'flex', gap:12, overflowX:'auto', paddingBottom:8 }}>
          {KANBAN_COLUMNS.map(col=>{
            const colJobs = jobs.filter(j=>j.status===col.id)
            const isOver  = dragOver===col.id
            return (
              <div key={col.id}
                onDragOver={e=>onDragOver(e,col.id)}
                onDrop={e=>onDrop(e,col.id)}
                onDragLeave={()=>setDragOver(null)}
                style={{
                  minWidth:190, flex:'0 0 190px', display:'flex', flexDirection:'column',
                  borderRadius:'var(--radius)', border:`2px solid ${isOver?col.color:'var(--border)'}`,
                  background: isOver?col.bg:'var(--card)', boxShadow:'var(--shadow)',
                  transition:'border-color .15s, background .15s',
                }}>
                {/* Column header */}
                <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:col.color, flexShrink:0 }} />
                    <span style={{ fontSize:12, fontWeight:700, color:col.color }}>{col.label}</span>
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, background:col.bg, color:col.color, padding:'1px 7px', borderRadius:20 }}>{colJobs.length}</span>
                </div>

                {/* Cards */}
                <div style={{ padding:8, display:'flex', flexDirection:'column', gap:6, flex:1, minHeight:60 }}>
                  {colJobs.map(j=>{
                    const overdue = j.due_date && new Date(j.due_date)<new Date()
                    return (
                      <div key={j.id}
                        draggable
                        onDragStart={e=>onDragStart(e,j.id)}
                        onDragEnd={onDragEnd}
                        style={{
                          padding:'10px 10px 8px',
                          background:'#fff', borderRadius:8,
                          border:`1px solid ${overdue?'var(--danger)':'var(--border)'}`,
                          boxShadow:'0 1px 3px rgba(0,0,0,.06)',
                          cursor:'grab', userSelect:'none',
                          opacity: dragId===j.id ? .5 : 1,
                          transition:'opacity .15s',
                        }}>
                        <div style={{ fontSize:11, fontWeight:700, color:'var(--primary)', fontFamily:'monospace' }}>{j.code}</div>
                        <div style={{ fontSize:12, fontWeight:600, color:'var(--text)', margin:'2px 0' }}>{j.customers?.name||'—'}</div>
                        <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{j.item_desc}</div>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <span style={{ fontSize:11, fontWeight:700, color: overdue?'var(--danger)':'var(--text-muted)' }}>
                            {j.due_date ? fmtShort(j.due_date) : '—'}
                            {overdue && ' ⚠️'}
                          </span>
                          <button
                            title="ส่งงานแล้ว"
                            onMouseDown={e => { e.stopPropagation(); moveJob(j.id, 'ส่งงานแล้ว') }}
                            style={{ background:'none', border:'1px solid #10B981', borderRadius:6, color:'#10B981', fontSize:11, padding:'2px 7px', cursor:'pointer', fontWeight:700 }}>
                            ✅ ส่งแล้ว
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  {colJobs.length===0 && (
                    <div style={{ textAlign:'center', padding:'16px 0', color:'var(--text-muted)', fontSize:11 }}>ว่าง</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* TIMELINE */}
      {view==='timeline' && (
        <div className="card" style={{ overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table>
              <thead>
                <tr><th>เลขที่</th><th>ลูกค้า</th><th>รายการ</th><th>กำหนดส่ง</th><th>สถานะ</th><th>ยอด</th><th></th></tr>
              </thead>
              <tbody>
                {[...jobs].filter(j=>j.status!=='ส่งงานแล้ว').sort((a,b)=>new Date(a.due_date||'9999')-new Date(b.due_date||'9999')).map(j=>{
                  const overdue = j.due_date && new Date(j.due_date)<new Date()
                  const nextCol = columns[columns.findIndex(c=>c.id===j.status)+1]
                  return (
                    <tr key={j.id} style={{ background:overdue?'#FFF5F5':undefined }}>
                      <td style={{ color:'var(--primary)', fontFamily:'monospace', fontWeight:700 }}>{j.code}</td>
                      <td style={{ fontWeight:600 }}>{j.customers?.name||'—'}</td>
                      <td style={{ fontSize:13, color:'var(--text-muted)' }}>{(j.item_desc||'').slice(0,25)}</td>
                      <td style={{ fontSize:12, color:overdue?'var(--danger)':'var(--text-muted)', fontWeight:overdue?700:400 }}>
                        {fmtShort(j.due_date)}{overdue?' ⚠️':''}
                      </td>
                      <td>
                        <select value={j.status} onChange={e=>moveJob(j.id,e.target.value)}
                          style={{ fontSize:12, padding:'3px 8px', width:'auto' }}>
                          {columns.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                      </td>
                      <td style={{ fontWeight:700 }}>฿{(j.total||0).toLocaleString()}</td>
                      <td>
                        {nextCol && (
                          <button className="btn btn-outline btn-sm" onClick={()=>moveJob(j.id,nextCol.id)}>▶ {nextCol.label}</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
