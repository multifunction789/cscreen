'use client'
import { useState, useEffect, useMemo } from 'react'
import { getJobOrders, updateJobStatus } from '@/lib/db'
import { fmtShort } from '@/lib/shop'
import { notify } from '@/lib/feedback'
import {
  JOB_STAGES, DONE_STATUS, STAGE_IDS,
  isJobOverdue, dueLabel, TONE_STYLE, byDueDate,
} from '@/lib/jobStatus'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

// คอลัมน์พิเศษ: งานที่สถานะไม่ตรงกับขั้นตอนใด (เช่น "เลยกำหนด" ที่ตั้งเองในหน้าใบงาน)
// เดิมงานพวกนี้หายไปจากบอร์ดเฉย ๆ
const UNSORTED = { id: '__unsorted__', label: 'ต้องจัดสถานะ', color: '#B91C1C', bg: '#FEE2E2' }
const BOARD_STAGES = JOB_STAGES.filter(c => c.id !== DONE_STATUS)

function matches(job, q) {
  if (!q) return true
  const hay = [job.code, job.customers?.name, job.item_desc].filter(Boolean).join(' ').toLowerCase()
  return hay.includes(q)
}

function DueChip({ job }) {
  const d = dueLabel(job)
  return (
    <span style={{ ...TONE_STYLE[d.tone], fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 20, whiteSpace: 'nowrap' }}
      title={job.due_date ? `กำหนดส่ง ${fmtShort(job.due_date)}` : undefined}>
      {d.text}
    </span>
  )
}

export default function ProductionPage() {
  const [jobs, setJobs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [view, setView]         = useState('kanban')
  const [query, setQuery]       = useState('')
  const [onlyUrgent, setOnlyUrgent] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [dragId, setDragId]     = useState(null)
  const [dragOver, setDragOver] = useState(null)

  useEffect(() => {
    let alive = true
    getJobOrders().then(({ data, error }) => {
      if (!alive) return
      if (error) notify.error('โหลดใบงานไม่สำเร็จ: ' + error.message)
      setJobs(data || [])
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  /** เปลี่ยนสถานะแบบ optimistic — ถ้าบันทึกไม่สำเร็จจะย้อนกลับ */
  async function moveJob(jobId, newStatus, { undoable = false } = {}) {
    const job = jobs.find(j => j.id === jobId)
    if (!job || job.status === newStatus) return
    const prevStatus = job.status
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j))

    const { error } = await updateJobStatus(jobId, newStatus)
    if (error) {
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: prevStatus } : j))
      notify.error(`ย้าย ${job.code} ไม่สำเร็จ: ${error.message}`)
      return
    }
    notify.success(`${job.code} → ${newStatus}`, undoable ? {
      action: { label: 'เลิกทำ', onClick: () => moveJob(jobId, prevStatus) },
    } : undefined)
  }

  function stepJob(job, dir) {
    const i = STAGE_IDS.indexOf(job.status)
    const next = i === -1 ? STAGE_IDS[0] : STAGE_IDS[i + dir]
    if (next) moveJob(job.id, next, { undoable: next === DONE_STATUS })
  }

  // ── drag & drop (desktop) ──
  function onDragStart(e, jobId) { setDragId(jobId); e.dataTransfer.effectAllowed = 'move' }
  function onDragOver(e, colId)  { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(colId) }
  function onDrop(e, colId) {
    e.preventDefault()
    if (dragId && colId && colId !== UNSORTED.id) moveJob(dragId, colId)
    setDragId(null); setDragOver(null)
  }
  function onDragEnd() { setDragId(null); setDragOver(null) }

  const q = query.trim().toLowerCase()
  const visible = useMemo(
    () => jobs.filter(j => matches(j, q) && (!onlyUrgent || (dueLabel(j).tone !== 'muted'))),
    [jobs, q, onlyUrgent],
  )
  const unsorted = visible.filter(j => !STAGE_IDS.includes(j.status))
  const columns  = unsorted.length ? [UNSORTED, ...BOARD_STAGES] : BOARD_STAGES
  const colJobsOf = col => (col.id === UNSORTED.id ? unsorted : visible.filter(j => j.status === col.id)).sort(byDueDate)

  const active      = jobs.filter(j => j.status !== DONE_STATUS)
  const overdueCnt  = active.filter(isJobOverdue).length
  const urgentCnt   = active.filter(j => dueLabel(j).tone === 'warning').length

  if (loading) return <LoadingSpinner />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', flex: '1 1 320px' }}>
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="🔍 ค้นหาเลขที่ / ลูกค้า / รายการ" aria-label="ค้นหางาน"
            style={{ flex: '1 1 220px', maxWidth: 340 }} />
          <button onClick={() => setOnlyUrgent(u => !u)}
            className={onlyUrgent ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
            title="แสดงเฉพาะงานที่เลยกำหนดหรือต้องส่งภายใน 3 วัน">
            ⏰ งานด่วน {overdueCnt + urgentCnt > 0 && `(${overdueCnt + urgentCnt})`}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['kanban', 'timeline'].map(v => (
            <button key={v} onClick={() => setView(v)}
              className={view === v ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}>
              {v === 'kanban' ? '📋 บอร์ด' : '📅 เรียงตามกำหนดส่ง'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>กำลังผลิต {active.length} งาน</span>
        {overdueCnt > 0 && (
          <span style={{ ...TONE_STYLE.danger, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
            เลยกำหนด {overdueCnt}
          </span>
        )}
        {urgentCnt > 0 && (
          <span style={{ ...TONE_STYLE.warning, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
            ใกล้กำหนด {urgentCnt}
          </span>
        )}
        {view === 'kanban' && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }} className="topbar-subtitle">
            ลากการ์ด หรือกด ◀ ▶ เพื่อเปลี่ยนขั้นตอน
          </span>
        )}
      </div>

      {/* KANBAN */}
      {view === 'kanban' && (
        <div className="board" style={unsorted.length ? { gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' } : undefined}>
          {columns.map(col => {
            const colJobs = colJobsOf(col)
            const isOver  = dragOver === col.id
            return (
              <section key={col.id} aria-label={col.label}
                onDragOver={e => onDragOver(e, col.id)}
                onDrop={e => onDrop(e, col.id)}
                onDragLeave={() => setDragOver(null)}
                style={{
                  minWidth: 0, display: 'flex', flexDirection: 'column',
                  borderRadius: 'var(--radius)', border: `2px solid ${isOver ? col.color : 'var(--border)'}`,
                  background: isOver ? col.bg : 'var(--card)', boxShadow: 'var(--shadow)',
                  transition: 'border-color .15s, background .15s',
                }}>
                <div style={{ padding: '9px 10px', borderBottom: `2px solid ${col.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: col.bg, borderRadius: 'var(--radius) var(--radius) 0 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: col.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{col.label}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, background: '#fff', color: col.color, padding: '1px 7px', borderRadius: 20, border: `1px solid ${col.color}40` }}>{colJobs.length}</span>
                </div>

                <div style={{ padding: 7, display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 80 }}>
                  {colJobs.map(j => {
                    const overdue = isJobOverdue(j)
                    const idx = STAGE_IDS.indexOf(j.status)
                    return (
                      <article key={j.id}
                        draggable
                        onDragStart={e => onDragStart(e, j.id)}
                        onDragEnd={onDragEnd}
                        style={{
                          padding: '8px 9px', background: '#fff', borderRadius: 7,
                          border: `1px solid ${overdue ? '#FECACA' : 'var(--border)'}`,
                          borderLeft: `3px solid ${overdue ? 'var(--danger)' : col.color}`,
                          boxShadow: '0 1px 3px rgba(0,0,0,.05)',
                          cursor: 'grab', userSelect: 'none',
                          opacity: dragId === j.id ? .4 : 1, transition: 'opacity .15s',
                        }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--primary)', fontFamily: 'monospace' }}>{j.code}</span>
                          <DueChip job={j} />
                        </div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3, marginBottom: 2 }}>{j.customers?.name || '—'}</div>
                        {col.id === UNSORTED.id && (
                          <div style={{ fontSize: 10.5, color: '#B91C1C', marginBottom: 2 }}>สถานะเดิม: {j.status || '—'}</div>
                        )}
                        {j.item_desc && (
                          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={j.item_desc}>{j.item_desc}</div>
                        )}
                        <div className="board-card-actions" style={{ justifyContent: 'flex-end' }}>
                          {idx > 0 && (
                            <button onClick={() => stepJob(j, -1)} title={`ย้อนไป ${STAGE_IDS[idx - 1]}`} aria-label={`ย้อน ${j.code} ไป ${STAGE_IDS[idx - 1]}`}>◀</button>
                          )}
                          {idx < STAGE_IDS.length - 2 && (
                            <button onClick={() => stepJob(j, +1)} title={`ไปขั้น ${STAGE_IDS[idx + 1] ?? STAGE_IDS[0]}`} aria-label={`ย้าย ${j.code} ไปขั้นถัดไป`}>▶</button>
                          )}
                          <button className="done-btn" onClick={() => moveJob(j.id, DONE_STATUS, { undoable: true })} title="ส่งงานแล้ว" aria-label={`${j.code} ส่งงานแล้ว`}>✓ ส่งแล้ว</button>
                        </div>
                      </article>
                    )
                  })}
                  {colJobs.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 11, opacity: .6 }}>
                      {q || onlyUrgent ? 'ไม่พบงาน' : 'ว่าง'}
                    </div>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* TIMELINE — เรียงตามกำหนดส่ง */}
      {view === 'timeline' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
            <label style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
              แสดงงานที่ส่งแล้ว
            </label>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>เลขที่</th><th>ลูกค้า</th><th>รายการ</th><th>กำหนดส่ง</th><th>สถานะ</th><th style={{ textAlign: 'right' }}>ยอด</th><th></th></tr>
              </thead>
              <tbody>
                {visible.filter(j => showDone || j.status !== DONE_STATUS).sort(byDueDate).map(j => {
                  const overdue = isJobOverdue(j)
                  const idx     = STAGE_IDS.indexOf(j.status)
                  const next    = idx === -1 ? STAGE_IDS[0] : STAGE_IDS[idx + 1]
                  return (
                    <tr key={j.id} style={{ background: overdue ? '#FFF5F5' : undefined }}>
                      <td style={{ color: 'var(--primary)', fontFamily: 'monospace', fontWeight: 700 }}>{j.code}</td>
                      <td style={{ fontWeight: 600 }}>{j.customers?.name || '—'}</td>
                      <td style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={j.item_desc}>{j.item_desc || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 6 }}>{fmtShort(j.due_date)}</span>
                        <DueChip job={j} />
                      </td>
                      <td>
                        <select value={STAGE_IDS.includes(j.status) ? j.status : ''} onChange={e => moveJob(j.id, e.target.value, { undoable: true })}
                          aria-label={`สถานะ ${j.code}`} style={{ fontSize: 12, padding: '3px 8px', width: 'auto' }}>
                          {!STAGE_IDS.includes(j.status) && <option value="" disabled>{j.status || 'เลือกสถานะ'}</option>}
                          {JOB_STAGES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                      </td>
                      <td style={{ fontWeight: 700, textAlign: 'right' }}>฿{(j.total || 0).toLocaleString()}</td>
                      <td>
                        {next && (
                          <button className="btn btn-outline btn-sm" onClick={() => moveJob(j.id, next, { undoable: next === DONE_STATUS })}>▶ {next}</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {visible.length === 0 && (
              <div className="empty-state"><div className="empty-icon">📭</div>ไม่พบงาน</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
