'use client'
import { useState, useEffect } from 'react'
import { getInvoices, getReceipts, getJobOrders } from '@/lib/db'
import dynamic from 'next/dynamic'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const MonthlyReportChart = dynamic(
  () => import('@/components/charts/MonthlyReportChart'),
  { ssr: false, loading: () => <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>กำลังโหลดกราฟ...</div> }
)

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
const THAI_MONTHS_FULL = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']

export default function ReportPage() {
  const [invoices, setInvoices] = useState([])
  const [receipts, setReceipts] = useState([])
  const [jobs, setJobs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [year, setYear]         = useState(new Date().getFullYear())

  useEffect(() => { load() }, [])

  async function load() {
    const [invRes, recRes, jobRes] = await Promise.all([
      getInvoices(), getReceipts(), getJobOrders(),
    ])
    setInvoices(invRes.data || [])
    setReceipts(recRes.data || [])
    setJobs(jobRes.data     || [])
    setLoading(false)
  }

  /* ── Monthly data ─────────────────────────────────────────── */
  const monthlyData = THAI_MONTHS.map((label, idx) => {
    const filter = arr => arr.filter(r => {
      const d = new Date(r.document_date || r.created_at)
      return d.getFullYear() === year && d.getMonth() === idx
    })
    const mInv  = filter(invoices)
    const mRec  = filter(receipts).filter(r => r.paid)
    const mJobs = filter(jobs)

    const invTotal = mInv.reduce((s, r) => s + (r.total || 0), 0)
    const recTotal = mRec.reduce((s, r) => s + (r.total || 0), 0)

    return {
      name:       label,
      fullName:   THAI_MONTHS_FULL[idx],
      ใบแจ้งหนี้: invTotal,
      รับเงินแล้ว: recTotal,
      ใบงาน:      mJobs.length,
      invCount:   mInv.length,
      recCount:   mRec.length,
    }
  })

  /* ── Year totals ─────────────────────────────────────────── */
  const yearInvTotal  = monthlyData.reduce((s, m) => s + m.ใบแจ้งหนี้, 0)
  const yearRecTotal  = monthlyData.reduce((s, m) => s + m.รับเงินแล้ว, 0)
  const yearInvCount  = monthlyData.reduce((s, m) => s + m.invCount, 0)
  const yearJobCount  = monthlyData.reduce((s, m) => s + m.ใบงาน, 0)

  /* ── Top customers ────────────────────────────────────────── */
  const topCustomers = (() => {
    const map = {}
    invoices.filter(r => new Date(r.document_date || r.created_at).getFullYear() === year)
      .forEach(inv => {
        const name = inv.customers?.name || '—'
        if (!map[name]) map[name] = { name, total: 0, count: 0 }
        map[name].total += inv.total || 0
        map[name].count++
      })
    const list = Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5)
    const max  = list[0]?.total || 1
    return list.map(c => ({ ...c, pct: Math.round(c.total / max * 100) }))
  })()

  /* ── Best selling items ───────────────────────────────────── */
  const topItems = (() => {
    const map = {}
    invoices.filter(r => new Date(r.document_date || r.created_at).getFullYear() === year)
      .forEach(inv => {
        (inv.items || []).forEach(it => {
          const key = (it.desc || '').slice(0, 30)
          if (!key) return
          if (!map[key]) map[key] = { name: key, qty: 0, total: 0 }
          map[key].qty   += parseFloat(it.qty)   || 0
          map[key].total += parseFloat(it.amount) || 0
        })
      })
    const list = Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5)
    const max  = list[0]?.total || 1
    return list.map(c => ({ ...c, pct: Math.round(c.total / max * 100) }))
  })()

  /* ── Available years ──────────────────────────────────────── */
  const allYears = [...new Set([
    ...invoices.map(r => new Date(r.document_date || r.created_at).getFullYear()),
    new Date().getFullYear(),
  ])].filter(y => !isNaN(y)).sort((a, b) => b - a)

  /* ─────────────────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>📈 รายงานรายเดือน</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>วิเคราะห์ยอดขายและการรับเงินตามเดือน</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>ปี พ.ศ.</span>
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}
            style={{ padding: '6px 12px', fontSize: 14, fontWeight: 700 }}>
            {allYears.map(y => <option key={y} value={y}>{y + 543}</option>)}
          </select>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {[
          { label: `ใบแจ้งหนี้ (${yearInvCount} ใบ)`, value: `฿${yearInvTotal.toLocaleString()}`,           accent: 'var(--primary)', icon: '📄' },
          { label: 'รับเงินแล้ว',                      value: `฿${yearRecTotal.toLocaleString()}`,           accent: 'var(--success)', icon: '✅' },
          { label: 'ยังค้างชำระ',                      value: `฿${(yearInvTotal - yearRecTotal).toLocaleString()}`, accent: 'var(--warning)', icon: '⏳' },
          { label: `ใบงาน (${yearJobCount} ใบ)`,       value: `${yearJobCount} งาน`,                         accent: '#7C3AED',        icon: '📝' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--card)', borderRadius: 'var(--radius)', padding: '14px 16px', boxShadow: 'var(--shadow)', border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: k.accent, borderRadius: '10px 0 0 10px' }} />
            <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 26, opacity: .1 }}>{k.icon}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.accent, marginTop: 3 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700 }}>📊 ยอดรายเดือน ปี {year + 543}</h2>
          <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: '#B80F0B', display: 'inline-block' }} />ใบแจ้งหนี้</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: '#10B981', display: 'inline-block' }} />รับเงินแล้ว</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: '50%', background: '#7C3AED', display: 'inline-block' }} />ใบงาน (เส้น)</span>
          </div>
        </div>
        <div style={{ padding: '16px 20px 20px' }}>
          {loading ? <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LoadingSpinner /></div>
            : <MonthlyReportChart data={monthlyData} />}
        </div>
      </div>

      {/* Monthly table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700 }}>📋 ตารางสรุปรายเดือน ปี {year + 543}</h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>เดือน</th>
                <th style={{ textAlign: 'right' }}>IV (ใบ)</th>
                <th style={{ textAlign: 'right' }}>ยอด IV (฿)</th>
                <th style={{ textAlign: 'right' }}>รับเงิน (฿)</th>
                <th style={{ textAlign: 'right' }}>ค้างชำระ (฿)</th>
                <th style={{ textAlign: 'right' }}>ใบงาน</th>
                <th style={{ textAlign: 'right' }}>Collection %</th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((m, i) => {
                const pending  = m.ใบแจ้งหนี้ - m.รับเงินแล้ว
                const colRate  = m.ใบแจ้งหนี้ > 0 ? Math.round(m.รับเงินแล้ว / m.ใบแจ้งหนี้ * 100) : null
                const hasTx    = m.ใบแจ้งหนี้ > 0 || m.ใบงาน > 0
                return (
                  <tr key={i} style={{ opacity: hasTx ? 1 : 0.35 }}>
                    <td style={{ fontWeight: 600 }}>{m.fullName}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 13 }}>{m.invCount || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary)', fontFamily: 'monospace' }}>
                      {m.ใบแจ้งหนี้ > 0 ? `฿${m.ใบแจ้งหนี้.toLocaleString()}` : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success)', fontFamily: 'monospace' }}>
                      {m.รับเงินแล้ว > 0 ? `฿${m.รับเงินแล้ว.toLocaleString()}` : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', color: pending > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                      {pending > 0 ? `฿${pending.toLocaleString()}` : '—'}
                    </td>
                    <td style={{ textAlign: 'right', color: '#7C3AED', fontWeight: 600 }}>{m.ใบงาน || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      {colRate !== null ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                          <div style={{ width: 48, height: 6, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                            <div style={{ width: `${colRate}%`, height: '100%', background: colRate >= 80 ? 'var(--success)' : colRate >= 50 ? 'var(--warning)' : 'var(--danger)', borderRadius: 4 }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: colRate >= 80 ? 'var(--success)' : colRate >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
                            {colRate}%
                          </span>
                        </div>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 800, background: 'var(--bg)', borderTop: '2px solid var(--border)' }}>
                <td>รวมทั้งปี</td>
                <td style={{ textAlign: 'right' }}>{yearInvCount}</td>
                <td style={{ textAlign: 'right', color: 'var(--primary)', fontFamily: 'monospace' }}>฿{yearInvTotal.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: 'var(--success)', fontFamily: 'monospace' }}>฿{yearRecTotal.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: 'var(--warning)', fontFamily: 'monospace' }}>฿{(yearInvTotal - yearRecTotal).toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: '#7C3AED' }}>{yearJobCount}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: yearInvTotal > 0 ? (yearRecTotal / yearInvTotal >= .8 ? 'var(--success)' : 'var(--warning)') : 'var(--text-muted)' }}>
                  {yearInvTotal > 0 ? `${Math.round(yearRecTotal / yearInvTotal * 100)}%` : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Top customers + Top items */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Top customers */}
        <div className="card">
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: 14, fontWeight: 700 }}>🏆 Top ลูกค้า ปี {year + 543}</h2>
          </div>
          <div style={{ padding: '12px 20px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loading ? <LoadingSpinner /> : topCustomers.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>ยังไม่มีข้อมูล</div>
            ) : topCustomers.map((c, i) => (
              <div key={c.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: i === 0 ? '#FEF3C7' : 'var(--bg)', color: i === 0 ? '#D97706' : 'var(--text-muted)', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.count} ใบ</span>
                  </div>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)', fontSize: 13 }}>฿{c.total.toLocaleString()}</span>
                </div>
                <div style={{ height: 6, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{ width: `${c.pct}%`, height: '100%', background: 'linear-gradient(90deg,var(--primary),#E53935)', borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top items */}
        <div className="card">
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: 14, fontWeight: 700 }}>📦 สินค้าขายดี ปี {year + 543}</h2>
          </div>
          <div style={{ padding: '12px 20px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loading ? <LoadingSpinner /> : topItems.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>ยังไม่มีข้อมูล</div>
            ) : topItems.map((it, i) => (
              <div key={it.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: i === 0 ? '#D1FAE5' : 'var(--bg)', color: i === 0 ? '#065f46' : 'var(--text-muted)', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{it.name}</span>
                  </div>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--success)', fontSize: 13 }}>฿{it.total.toLocaleString()}</span>
                </div>
                <div style={{ height: 6, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{ width: `${it.pct}%`, height: '100%', background: 'linear-gradient(90deg,#10B981,#34D399)', borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}
