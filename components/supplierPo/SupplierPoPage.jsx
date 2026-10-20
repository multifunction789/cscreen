'use client'
import { useEffect, useMemo, useState } from 'react'
import { getSupplierPos, getSupplierPo, getJobOrdersList, getSuppliers, insertSupplierPo, insertPoLines } from '@/lib/db'
import { PO_TYPES, PO_STATUSES, OPEN_STATUSES, poType, statusClass, baht, thMonthNow } from '@/lib/supplierPo'
import { thDate } from '@/lib/jobV2'
import { daysUntil } from '@/lib/jobStatus'
import { notify } from '@/lib/feedback'
import { useDocView } from '@/components/OpenDocParam'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import SupplierPoEditor, { newLineFor } from './SupplierPoEditor'

const poMonth = p => String(p.sent_date || p.created_at || '').slice(0, 7)
const qtyText = p => {
  const lines = p.supplier_po_lines || []
  if (p.unit === 'เมตร') return p.total_meters ? `${p.total_meters} เมตร` : `${lines.length} ลาย`
  return `${lines.reduce((s, l) => s + (Number(l.qty) || 0), 0)} ชิ้น`
}

export default function SupplierPoPage() {
  const [rows, setRows] = useState([])
  const [jobs, setJobs] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState(null)
  const [opening, setOpening] = useState(false)
  const [type, setType] = useState('')
  const [statusF, setStatusF] = useState('open')
  const [supplierF, setSupplierF] = useState('')
  const [month, setMonth] = useState(thMonthNow)
  const [creating, setCreating] = useState(null)   // { job_id, po_type, supplier_id }

  async function show(row) {
    if (!row) { setView(null); return }
    setOpening(true)
    const { data, error } = await getSupplierPo(row.id)
    setOpening(false)
    if (error) return notify.error('เปิด PO ไม่สำเร็จ: ' + error.message)
    setView(data)
  }
  const doc = useDocView(show)

  async function load() {
    const [p, j, s] = await Promise.all([getSupplierPos(), getJobOrdersList(), getSuppliers()])
    const err = p.error || j.error || s.error
    if (err) notify.error('โหลดข้อมูลไม่ครบ: ' + err.message)
    setRows(p.data || []); setJobs(j.data || []); setSuppliers(s.data || [])
    setLoading(false)
    doc.loaded(p.data || [])
    // จากหน้าใบงาน: /supplier-po?new=<jobId>
    const from = new URLSearchParams(window.location.search).get('new')
    if (from) {
      setCreating({ job_id: from === '1' ? '' : from, po_type: 'dft', supplier_id: '' })
      window.history.replaceState(null, '', window.location.pathname)
    }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect

  async function create() {
    const c = creating
    if (!c.supplier_id) return notify.warn('กรุณาเลือก Supplier')
    const { data: po, error } = await insertSupplierPo({ po_type: c.po_type, supplier_id: c.supplier_id })
    if (error) return notify.error('สร้าง PO ไม่สำเร็จ: ' + error.message)
    const job = jobs.find(j => j.id === c.job_id)
    if (job) {
      const { _key, ...line } = newLineFor(job, 1) // eslint-disable-line no-unused-vars
      const r = await insertPoLines([{ ...line, po_id: po.id }])
      if (r.error) notify.error('สร้าง PO แล้ว แต่เพิ่มแถวไม่สำเร็จ: ' + r.error.message)
    }
    setCreating(null)
    notify.success(`สร้าง ${po.code} แล้ว`)
    await load()
    doc.open(po)
  }

  const inMonth = useMemo(() => rows.filter(p => p.status !== 'ยกเลิก' && poMonth(p) === month), [rows, month])
  const byType = useMemo(() => PO_TYPES.map(t => {
    const list = inMonth.filter(p => p.po_type === t.key)
    return { ...t, count: list.length, amount: list.reduce((s, p) => s + Number(p.total_amount || 0), 0) }
  }).filter(t => t.count), [inMonth])
  const bySupplier = useMemo(() => {
    const m = new Map()
    for (const p of inMonth) {
      const k = p.supplier_id || '-'
      const cur = m.get(k) || { name: p.suppliers?.name || 'ไม่ระบุ', count: 0, amount: 0 }
      cur.count++; cur.amount += Number(p.total_amount || 0); m.set(k, cur)
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount)
  }, [inMonth])
  const monthTotal = inMonth.reduce((s, p) => s + Number(p.total_amount || 0), 0)

  const filtered = rows.filter(p =>
    (!type || p.po_type === type) &&
    (!supplierF || p.supplier_id === supplierF) &&
    (statusF === 'all' ? true : statusF === 'open' ? OPEN_STATUSES.has(p.status) : p.status === statusF))

  if (view) {
    return (
      <div>
        {doc.param}
        <SupplierPoEditor key={view.id} po={view} jobs={jobs} suppliers={suppliers} onBack={() => { doc.close(); load() }}
          onSaved={p => setRows(rs => rs.map(r => (r.id === p.id ? { ...r, ...p } : r)))}
          onDeleted={id => { setRows(rs => rs.filter(r => r.id !== id)); doc.close() }} />
      </div>
    )
  }

  const chip = on => ({ minHeight: 36, padding: '0 12px', borderRadius: 999, border: on ? '0' : '1px solid var(--border)', background: on ? 'var(--text)' : '#fff', color: on ? '#fff' : 'var(--text)', fontSize: 13, cursor: 'pointer' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {doc.param}
      {opening && <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(255,255,255,.6)', display: 'grid', placeItems: 'center' }}><LoadingSpinner text="กำลังเปิด PO..." /></div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>PO งานผลิต · ส่งงานให้ร้านภายนอก</div>
        <button type="button" className="btn btn-primary" onClick={() => setCreating({ job_id: '', po_type: 'dft', supplier_id: '' })}>+ สร้างใบงาน Supplier</button>
      </div>

      {creating && (
        <section className="card" style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, alignItems: 'end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)' }}>ประเภท
            <select value={creating.po_type} onChange={e => setCreating(c => ({ ...c, po_type: e.target.value }))}>{PO_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)' }}>Supplier
            <select value={creating.supplier_id} onChange={e => setCreating(c => ({ ...c, supplier_id: e.target.value }))}>
              <option value="">— เลือก —</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)' }}>ใบงาน (เพิ่มทีหลังได้)
            <select value={creating.job_id} onChange={e => setCreating(c => ({ ...c, job_id: e.target.value }))}>
              <option value="">— ยังไม่เลือก —</option>{jobs.map(j => <option key={j.id} value={j.id}>{j.code} · {j.customers?.name || ''}</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={create}>สร้าง</button>
            <button type="button" className="btn btn-outline" onClick={() => setCreating(null)}>ยกเลิก</button>
          </div>
        </section>
      )}

      {/* สรุปเดือน */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <section className="card" style={{ flex: '1 1 560px', minWidth: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>สั่งไปแล้วเดือนนี้ · {baht(monthTotal)}</h2>
            <input type="month" aria-label="เดือน" value={month} onChange={e => e.target.value && setMonth(e.target.value)} style={{ width: 'auto' }} />
          </div>
          {byType.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {byType.map(t => (
                <button type="button" key={t.key} onClick={() => setType(type === t.key ? '' : t.key)}
                  style={{ textAlign: 'left', border: `1px solid ${type === t.key ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 10, padding: 10, background: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{t.label}</span>
                  <b style={{ fontSize: 16 }}>{baht(t.amount)}</b>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.count} PO</span>
                </button>
              ))}
            </div>
          ) : <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>ยังไม่มี PO ในเดือนนี้</div>}
        </section>
        <section className="card" style={{ flex: '1 1 340px', minWidth: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>แยกตาม Supplier</h2>
          {bySupplier.length ? bySupplier.map(s => (
            <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
              <span>{s.name} <span style={{ color: 'var(--text-muted)' }}>· {s.count} PO</span></span><b>{baht(s.amount)}</b>
            </div>
          )) : <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>—</div>}
        </section>
      </div>

      {/* รายการ */}
      <section className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div role="group" aria-label="กรองตามประเภท" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button type="button" aria-pressed={!type} style={chip(!type)} onClick={() => setType('')}>ทั้งหมด</button>
          {PO_TYPES.map(t => <button type="button" key={t.key} aria-pressed={type === t.key} style={chip(type === t.key)} onClick={() => setType(t.key)}>{t.label}</button>)}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <select aria-label="สถานะ" value={statusF} onChange={e => setStatusF(e.target.value)} style={{ width: 'auto' }}>
            <option value="open">ยังไม่ปิด</option><option value="all">ทุกสถานะ</option>
            {PO_STATUSES.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
          </select>
          <select aria-label="Supplier" value={supplierF} onChange={e => setSupplierF(e.target.value)} style={{ width: 'auto' }}>
            <option value="">ทุก Supplier</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {loading ? <LoadingSpinner /> : (
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 900 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 12.5 }}>
                {['เลขที่', 'ประเภท', 'Supplier / ติดต่อ', 'ใบงาน', 'จำนวน', 'นัดรับ', 'ยอด', 'สถานะ'].map(h => <th key={h} style={{ padding: 8, textAlign: h === 'ยอด' ? 'right' : 'left' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {filtered.map(p => {
                  const d = daysUntil(p.due_date)
                  const late = d !== null && d < 0 && OPEN_STATUSES.has(p.status) && p.status !== 'รับของแล้ว'
                  const codes = [...new Set((p.supplier_po_lines || []).map(l => l.job_orders?.code).filter(Boolean))]
                  return (
                    <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: 8 }}><button type="button" className="btn btn-outline btn-sm" onClick={() => doc.open(p)}>{p.code}</button></td>
                      <td style={{ padding: 8 }}>{poType(p.po_type).label}</td>
                      <td style={{ padding: 8 }}>{p.suppliers?.name || '—'}<div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{[p.suppliers?.contact, p.suppliers?.phone].filter(Boolean).join(' · ')}</div></td>
                      <td style={{ padding: 8 }}>{codes.join(', ') || '—'}</td>
                      <td style={{ padding: 8 }}>{qtyText(p)}</td>
                      <td style={{ padding: 8, color: late ? 'var(--danger)' : undefined, fontWeight: late ? 700 : 400 }}>{thDate(p.due_date) || '—'}{late ? ' · เลยกำหนด' : ''}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{baht(p.total_amount)}</td>
                      <td style={{ padding: 8 }}><span className={`badge ${statusClass(p.status)}`}>{p.status}</span></td>
                    </tr>
                  )
                })}
                {!filtered.length && <tr><td colSpan={8} className="empty-state">ไม่มี PO ตามตัวกรองนี้</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
