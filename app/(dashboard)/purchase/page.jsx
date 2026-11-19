'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { getPurchases, deletePurchase, getSuppliers, getInvoicesLight, getMaterials, getPaidReceipts, getSetting, upsertSetting } from '@/lib/db'
import {
  PURPOSES, purposeOf, STATUSES, PAID, DEFAULT_JOB_CATEGORIES, DEFAULT_STOCK_CATEGORIES, DEFAULT_BUDGETS,
  monthKey, monthSummary, budgetUsage, costPerInvoice, monthlyExpense, expenseByCategory,
} from '@/lib/purchases.mjs'
import { fmtDate } from '@/lib/shop'
import { docHref } from '@/lib/docLinks'
import { notify, ask } from '@/lib/feedback'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import PurchaseForm from '@/components/purchase/PurchaseForm'
const ExpenseChart = dynamic(() => import('@/components/charts/ExpenseChart'), { ssr: false, loading: () => <div style={{ height: 280 }} /> })

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const monthLabel = k => { const [y, m] = k.split('-'); return `${TH_MONTHS[+m - 1]} ${+y + 543}` }
const baht = n => '฿' + Math.round(Number(n) || 0).toLocaleString()
const STATUS_TAG = { 'จ่ายแล้ว': ['#DCFCE7', '#166534'], 'รับของแล้ว': ['#DBEAFE', '#1E40AF'], 'สั่งแล้ว': ['#FEF3C7', '#B45309'] }
const PURPOSE_TAG = { job: ['#FDF6E3', '#8A6500'], stock: ['#DBEAFE', '#1E40AF'], general: ['#F3E8FF', '#6B21A8'] }
const tag = ([bg, fg]) => ({ display: 'inline-block', padding: '1px 9px', borderRadius: 99, fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap', background: bg, color: fg })
const thisMonth = () => monthKey(new Date().toISOString())

export default function PurchasePage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [suppliers, setSuppliers] = useState([])
  const [invoices, setInvoices] = useState([])
  const [jobs, setJobs] = useState([])
  const [materials, setMaterials] = useState([])
  const [receipts, setReceipts] = useState([])
  const [cats, setCats] = useState({ job: DEFAULT_JOB_CATEGORIES, stock: DEFAULT_STOCK_CATEGORIES })
  const [budgets, setBudgets] = useState(DEFAULT_BUDGETS)
  const [month, setMonth] = useState(thisMonth)
  const [view, setView] = useState('list')
  const [purpose, setPurpose] = useState('')
  const [status, setStatus] = useState('')
  const [supplier, setSupplier] = useState('')
  const [category, setCategory] = useState('')
  const [q, setQ] = useState('')
  const [allMonths, setAllMonths] = useState(false)
  const [form, setForm] = useState(null)        // null | {} (ใหม่) | row (แก้ไข)
  const [editBudget, setEditBudget] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      getPurchases(), getSuppliers(), getInvoicesLight(), getMaterials(), getPaidReceipts(),
      supabase.from('job_orders').select('id, code, invoice_id').order('created_at', { ascending: false }),
      getSetting('purchase_categories'), getSetting('expense_budgets'),
    ]).then(([p, s, i, m, r, j, c, b]) => {
      if (!alive) return
      const err = p.error || s.error || i.error || m.error || r.error || j.error
      if (err) notify.error('โหลดข้อมูลไม่ครบ: ' + err.message + (/purchases/.test(err.message) ? ' — ต้องรัน SQL หน้าจัดซื้อก่อน' : ''))
      setRows(p.data || []); setSuppliers(s.data || []); setInvoices(i.data || []); setMaterials(m.data || [])
      setReceipts(r.data || []); setJobs(j.data || [])
      if (c.data?.value) setCats(v => ({ ...v, ...c.data.value }))
      if (Array.isArray(b.data?.value) && b.data.value.length) setBudgets(b.data.value)
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  const summary = useMemo(() => monthSummary(rows, month), [rows, month])
  const usage = useMemo(() => budgetUsage(rows, month, budgets), [rows, month, budgets])
  const months = useMemo(() => {
    const set = new Set([thisMonth(), ...rows.map(r => monthKey(r.paid_at || r.ordered_at || r.created_at)).filter(Boolean)])
    return [...set].sort().reverse()
  }, [rows])

  // รายการ: เดือนที่เลือก = จ่ายในเดือนนั้น + ทุกใบที่ยังไม่จ่าย (ค้าง) · ติ๊ก "ทุกเดือน" = ทั้งหมด
  const inScope = r => allMonths || r.status !== PAID || monthKey(r.paid_at) === month
  const scoped = rows.filter(inScope)
  const listed = scoped.filter(r =>
    (!purpose || r.purpose === purpose) && (!status || r.status === status) && (!supplier || r.supplier_id === supplier) &&
    (!category || (r.category || '') === category) &&
    (!q || [r.code, r.category, r.note, r.suppliers?.name, r.invoices?.code, r.job_orders?.code, ...(r.items || []).map(i => i.desc)].filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase())))
  const catOptions = [...new Set(scoped.filter(r => !purpose || r.purpose === purpose).map(r => r.category).filter(Boolean))].sort()

  function onSaved(row, opt = {}) {
    setRows(list => (list.some(r => r.id === row.id) ? list.map(r => (r.id === row.id ? row : r)) : [row, ...list]))
    if (!opt.keepOpen) setForm(null)
  }
  async function remove(r) {
    if (!(await ask({ title: `ลบ ${r.code}?`, message: `${r.category || ''} · ${baht(r.total)}`, confirmLabel: 'ลบ', danger: true }))) return
    const { error } = await deletePurchase(r.id)
    if (error) return notify.error(error.message)
    setRows(list => list.filter(x => x.id !== r.id))
    notify.success(`ลบ ${r.code} แล้ว`)
  }
  async function saveBudgets(list) {
    const clean = list.map(b => ({ name: String(b.name || '').trim(), budget: parseFloat(b.budget) || 0 })).filter(b => b.name)
    const { error } = await upsertSetting('expense_budgets', clean)
    if (error) return notify.error('บันทึกงบไม่สำเร็จ: ' + error.message)
    setBudgets(clean); setEditBudget(null); notify.success('บันทึกงบแล้ว')
  }

  const costRows = useMemo(() => costPerInvoice(invoices, receipts, rows), [invoices, receipts, rows])
  const monthly = useMemo(() => monthlyExpense(rows, 6), [rows])
  const byCat = useMemo(() => expenseByCategory(rows, allMonths ? '' : month), [rows, month, allMonths])

  if (loading) return <LoadingSpinner />

  const kpis = [
    { label: 'จ่ายแล้วเดือนนี้ (ตามวันที่จ่ายจริง)', value: baht(summary.paidTotal), sub: `${summary.paidCount} รายการ`, c: 'var(--primary)' },
    { label: 'ต้นทุนงานลูกค้า', value: baht(summary.job), sub: `ผูกกับ ${summary.jobInvoices} INV`, c: '#8A6500' },
    { label: 'ซื้อเข้าสต๊อก', value: baht(summary.stock), sub: `${summary.stockCount} ครั้ง`, c: '#1E40AF' },
    { label: 'ค้างจ่าย Supplier', value: baht(summary.unpaidTotal), sub: `สั่งแล้ว / รับของแล้ว ยังไม่จ่าย ${summary.unpaidCount} รายการ`, c: '#B45309' },
  ]
  const chip = on => ({ padding: '5px 12px', borderRadius: 99, border: `1.5px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'var(--primary)' : '#fff', color: on ? '#fff' : 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['list', '📋 รายการ'], ['chart', '📊 กราฟรายจ่าย'], ['cost', '💹 ต้นทุน / กำไรต่อ Invoice']].map(([v, l]) => (
            <button key={v} type="button" className={view === v ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'} onClick={() => setView(v)}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select aria-label="เดือน" value={month} onChange={e => setMonth(e.target.value)} style={{ width: 'auto' }}>
            {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => setForm({})}>+ บันทึกการซื้อ / ค่าใช้จ่าย</button>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 16px', position: 'relative', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: k.c }} />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>{k.label}</div>
            <div style={{ fontSize: 21, fontWeight: 800, color: k.c }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Budgets */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <b>💼 ค่าใช้จ่ายทั่วไป เทียบงบ — {monthLabel(month)}</b>
          <button className="btn btn-outline btn-sm" onClick={() => setEditBudget(budgets.map(b => ({ ...b })))}>⚙️ ตั้งงบ / ประเภท</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, padding: '12px 14px' }}>
          {usage.map(u => {
            const color = u.over ? '#DC2626' : u.pct !== null && u.pct >= 90 ? '#D97706' : '#16A34A'
            return (
              <div key={u.name}>
                <b style={{ fontSize: 12.5 }}>{u.name}</b>
                <div style={{ height: 8, background: '#F3F4F6', borderRadius: 9, marginTop: 5, overflow: 'hidden' }}>
                  <i style={{ display: 'block', height: '100%', borderRadius: 9, background: color, width: `${u.budget > 0 ? Math.min(100, u.pct) : u.used > 0 ? 100 : 0}%`, opacity: u.budget > 0 ? 1 : .35 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: u.over ? '#DC2626' : 'var(--text-muted)', fontWeight: u.over ? 700 : 400, marginTop: 2 }}>
                  <span>{baht(u.used)}{u.budget > 0 ? ` / ${baht(u.budget)}` : ' · ไม่ได้ตั้งงบ'}</span>
                  <span>{u.budget > 0 ? (u.over ? `เกิน ${u.pct - 100}%` : `${u.pct}%`) : ''}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* LIST */}
      {view === 'list' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <button type="button" style={chip(!purpose)} onClick={() => { setPurpose(''); setCategory('') }}>ทั้งหมด · {scoped.length}</button>
            {PURPOSES.map(p => (
              <button key={p.id} type="button" style={chip(purpose === p.id)} onClick={() => { setPurpose(purpose === p.id ? '' : p.id); setCategory('') }}>
                {p.icon} {p.label} · {scoped.filter(r => r.purpose === p.id).length}
              </button>
            ))}
            <select aria-label="สถานะ" value={status} onChange={e => setStatus(e.target.value)} style={{ width: 'auto' }}><option value="">ทุกสถานะ</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
            <select aria-label="Supplier" value={supplier} onChange={e => setSupplier(e.target.value)} style={{ width: 'auto', maxWidth: 180 }}><option value="">ทุก Supplier</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <select aria-label="หมวด" value={category} onChange={e => setCategory(e.target.value)} style={{ width: 'auto', maxWidth: 160 }}><option value="">ทุกหมวด</option>{catOptions.map(c => <option key={c}>{c}</option>)}</select>
            <label style={{ fontSize: 12.5, display: 'flex', gap: 5, alignItems: 'center', color: 'var(--text-muted)' }}><input type="checkbox" checked={allMonths} onChange={e => setAllMonths(e.target.checked)} />ทุกเดือน</label>
            <input type="text" aria-label="ค้นหา" placeholder="🔍 ค้นหา เลขที่ / รายการ / INV" value={q} onChange={e => setQ(e.target.value)} style={{ marginLeft: 'auto', width: 230 }} />
          </div>
          <div className="table-wrap">
            <table style={{ minWidth: 980 }}>
              <thead><tr><th>วันที่จ่าย</th><th>เลขที่</th><th>ประเภท</th><th>หมวด · รายการ</th><th>Supplier</th><th>อ้างอิง</th><th style={{ textAlign: 'right' }}>ยอด</th><th>สถานะ</th><th></th></tr></thead>
              <tbody>
                {listed.map(r => {
                  const p = purposeOf(r.purpose)
                  const first = r.items?.[0]?.desc
                  const more = (r.items?.length || 0) > 1 ? ` + อีก ${r.items.length - 1} รายการ` : ''
                  return (
                    <tr key={r.id} className="row-link" onClick={() => setForm(r)} style={{ cursor: 'pointer' }}>
                      <td style={{ whiteSpace: 'nowrap', color: r.paid_at ? undefined : 'var(--text-muted)' }}>{r.status === PAID ? fmtDate(r.paid_at) : '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>{r.code}</td>
                      <td><span style={tag(PURPOSE_TAG[r.purpose] || PURPOSE_TAG.job)}>{p.icon} {p.short}</span></td>
                      <td><b>{r.category || '—'}</b><div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{first || ''}{more}</div></td>
                      <td>{r.suppliers?.name || '—'}</td>
                      <td style={{ fontSize: 12.5 }} onClick={e => e.stopPropagation()}>
                        {r.purpose === 'job' ? <>
                          {r.invoice_id && <Link href={docHref('invoice', r.invoice_id)} style={{ color: '#1E40AF', fontWeight: 700 }}>{r.invoices?.code || 'INV'}</Link>}
                          {r.invoice_id && r.job_order_id && ' · '}
                          {r.job_order_id && <Link href={docHref('joborder', r.job_order_id)} style={{ color: '#1E40AF', fontWeight: 700 }}>{r.job_orders?.code || 'ใบงาน'}</Link>}
                          {!r.invoice_id && !r.job_order_id && <span style={{ color: '#B45309' }}>ยังไม่ผูก INV</span>}
                        </> : r.purpose === 'stock'
                          ? <span style={{ color: 'var(--text-muted)' }}>{r.lot_number || 'สต๊อก'}{r.stock_done ? ' · รับเข้าแล้ว' : ''}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>งบ {r.category || '—'}</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>{baht(r.total)}</td>
                      <td><span style={tag(STATUS_TAG[r.status] || STATUS_TAG['สั่งแล้ว'])}>{r.status}</span></td>
                      <td onClick={e => e.stopPropagation()}>{!r.stock_done && <button className="btn btn-outline btn-sm" aria-label={`ลบ ${r.code}`} style={{ color: 'var(--danger)' }} onClick={() => remove(r)}>🗑️</button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!listed.length && <div className="empty-state"><div className="empty-icon">🛒</div>{rows.length ? 'ไม่พบรายการตามตัวกรอง' : 'ยังไม่มีการซื้อ — กด “+ บันทึกการซื้อ / ค่าใช้จ่าย”'}</div>}
          </div>
          <div style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
            <span>{allMonths ? 'ทุกเดือน' : `จ่ายใน ${monthLabel(month)} + รายการที่ยังไม่จ่ายทั้งหมด`} · {listed.length} รายการ</span>
            <b>รวม {baht(listed.reduce((t, r) => t + (Number(r.total) || 0), 0))}</b>
          </div>
        </div>
      )}

      {/* CHART */}
      {view === 'chart' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
          <div className="card">
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
              <b>📊 รายจ่ายแยกตามหมวด — {allMonths ? 'ทุกเดือน' : monthLabel(month)}</b>
              <label style={{ fontSize: 12.5, display: 'flex', gap: 5, alignItems: 'center', color: 'var(--text-muted)' }}><input type="checkbox" checked={allMonths} onChange={e => setAllMonths(e.target.checked)} />ทุกเดือน</label>
            </div>
            <div style={{ padding: 16 }}><ExpenseChart data={byCat.slice(0, 12)} /></div>
          </div>
          <div className="card">
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}><b>📅 รายจ่าย 6 เดือนล่าสุด (จ่ายแล้ว)</b></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>เดือน</th><th style={{ textAlign: 'right' }}>🧵 งานลูกค้า</th><th style={{ textAlign: 'right' }}>📦 สต๊อก</th><th style={{ textAlign: 'right' }}>💼 ทั่วไป</th><th style={{ textAlign: 'right' }}>รวม</th></tr></thead>
                <tbody>
                  {monthly.map(m => (
                    <tr key={m.key} style={m.key === month ? { background: 'var(--primary-light)' } : undefined}>
                      <td>{monthLabel(m.key)}</td>
                      <td style={{ textAlign: 'right' }}>{baht(m.job)}</td><td style={{ textAlign: 'right' }}>{baht(m.stock)}</td><td style={{ textAlign: 'right' }}>{baht(m.general)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>{baht(m.job + m.stock + m.general)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '8px 16px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {byCat.slice(0, 8).map(c => (
                <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 10px', background: 'var(--bg)', borderRadius: 6 }}><span>{c.name}</span><b>{baht(c.total)}</b></div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* COST PER INVOICE */}
      {view === 'cost' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <b>💹 ต้นทุนและกำไรต่อ Invoice</b>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>รายรับ = ใบเสร็จที่รับเงินแล้ว · ต้นทุน = ใบจัดซื้อที่ผูก INV หรือใบงานของ INV (รวมที่ยังไม่จ่าย)</span>
          </div>
          <div className="table-wrap">
            <table style={{ minWidth: 760 }}>
              <thead><tr><th>Invoice</th><th>ลูกค้า</th><th style={{ textAlign: 'right' }}>รับเงินแล้ว</th><th style={{ textAlign: 'right' }}>ต้นทุน</th><th style={{ textAlign: 'right' }}>กำไร</th><th>Margin</th><th>ใบจัดซื้อ</th></tr></thead>
              <tbody>
                {costRows.map(r => (
                  <tr key={r.id}>
                    <td><Link href={docHref('invoice', r.id)} style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>{r.code}</Link></td>
                    <td>{r.customers?.name || '—'}</td>
                    <td style={{ textAlign: 'right', color: 'var(--success)', fontWeight: 700 }}>{baht(r.revenue)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: 700 }}>{baht(r.cost)}{r.unpaid > 0 && <div style={{ fontSize: 11, color: '#B45309', fontWeight: 400 }}>ค้างจ่าย {baht(r.unpaid)}</div>}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: r.profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{baht(r.profit)}</td>
                    <td>{r.margin === null ? <span className="badge badge-gray">ยังไม่รับเงิน</span> : <span className={r.margin >= 30 ? 'badge badge-green' : 'badge badge-yellow'}>{r.margin}%</span>}</td>
                    <td>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => { setView('list'); setAllMonths(true); setPurpose('job'); setQ(r.code) }}>{r.count} ใบ</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!costRows.length && <div className="empty-state">ยังไม่มีข้อมูล — บันทึกการซื้อแบบ “งานลูกค้า” แล้วผูก INV</div>}
          </div>
        </div>
      )}

      {form && (
        <PurchaseForm initial={form.id ? form : null} suppliers={suppliers} invoices={invoices} jobs={jobs} materials={materials}
          categories={cats} budgets={budgets} onClose={() => setForm(null)} onSaved={onSaved} />
      )}

      {editBudget && (
        <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setEditBudget(null) }}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="ตั้งงบค่าใช้จ่าย" style={{ maxWidth: 460 }}>
            <div className="dialog-title">⚙️ ประเภทค่าใช้จ่ายทั่วไป และงบต่อเดือน</div>
            <div className="dialog-msg">ใส่ 0 = ไม่ตั้งงบ (ยังบันทึกค่าใช้จ่ายประเภทนั้นได้)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              {editBudget.map((b, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 28px', gap: 6 }}>
                  <input type="text" aria-label={`ประเภท ${i + 1}`} value={b.name} onChange={e => setEditBudget(l => l.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="เช่น ค่าโฆษณา" />
                  <input type="text" aria-label={`งบ ${i + 1}`} inputMode="decimal" value={b.budget} onChange={e => setEditBudget(l => l.map((x, j) => j === i ? { ...x, budget: e.target.value.replace(/[^\d.]/g, '') } : x))} style={{ textAlign: 'right' }} />
                  <button type="button" aria-label="ลบประเภท" onClick={() => setEditBudget(l => l.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: '#B91C1C', fontSize: 16 }}>×</button>
                </div>
              ))}
              <button type="button" className="btn btn-outline btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEditBudget(l => [...l, { name: '', budget: 0 }])}>+ เพิ่มประเภท</button>
            </div>
            <div className="dialog-actions">
              <button className="btn btn-outline" onClick={() => setEditBudget(null)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={() => saveBudgets(editBudget)}>บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
