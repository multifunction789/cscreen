'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const baht = n => '฿' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
const monthNow = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7)
function range(m) {
  const [y, mo] = m.split('-').map(Number)
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  return [`${m}-01`, `${m}-${String(last).padStart(2, '0')}`]
}

/** ยอดขายตามประเภทสินค้า — นับใบแจ้งหนี้ที่รับเงินครบในเดือนที่เลือก */
export default function SalesByCategory() {
  const [month, setMonth] = useState(monthNow)
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    const [from, to] = range(month)
    supabase.rpc('sales_by_category', { p_from: from, p_to: to }).then(({ data, error }) => {
      if (!live) return
      setError(error ? error.message : '')
      setRows(error ? [] : data || [])
    })
    return () => { live = false }
  }, [month])

  const total = (rows || []).reduce((s, r) => s + Number(r.amount || 0), 0)
  return (
    <div className="card">
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>ยอดขายตามประเภท</h2>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>นับเมื่อรับเงินครบ · รวม {baht(total)}</div>
        </div>
        <input type="month" aria-label="เดือน" value={month} onChange={e => e.target.value && setMonth(e.target.value)} style={{ width: 'auto' }} />
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows === null ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>กำลังโหลด…</div>
          : error ? <div style={{ color: 'var(--danger)', fontSize: 13 }}>โหลดไม่สำเร็จ: {error}</div>
          : rows.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>ยังไม่มีใบแจ้งหนี้ที่รับเงินครบในเดือนนี้</div>
          : rows.map(r => (
            <div key={r.category} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 110px', alignItems: 'center', gap: 12, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{r.category}</span>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--bg)' }}>
                <div style={{ height: 8, borderRadius: 4, background: 'var(--primary)', width: `${total ? Math.max(2, (r.amount / total) * 100) : 0}%` }} />
              </div>
              <span style={{ textAlign: 'right', fontWeight: 700 }}>{baht(r.amount)} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {r.invoices} ใบ</span></span>
            </div>
          ))}
      </div>
    </div>
  )
}
