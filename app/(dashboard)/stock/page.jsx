'use client'
import { useState, useEffect } from 'react'
import { getMaterials } from '@/lib/db'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function StockPage() {
  const [tab, setTab]         = useState('current')
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')

  useEffect(() => {
    getMaterials().then(({ data }) => {
      setRows(data || [])
      setLoading(false)
    })
  }, [])

  const lowStock = rows.filter(s => s.qty <= s.min_qty)
  const filtered = rows.filter(s => s.name?.includes(search) || s.code?.includes(search))
  const sorted   = [...rows].sort((a, b) => (b.qty * b.cost_per_unit) - (a.qty * a.cost_per_unit))
  const grandTotal = rows.reduce((s, m) => s + m.qty * m.cost_per_unit, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {lowStock.length > 0 && (
        <div style={{
          background: '#FEF2F2', border: '1px solid #FECACA',
          borderRadius: 'var(--radius)', padding: '12px 16px',
          fontSize: 13, fontWeight: 600, color: 'var(--danger)',
        }}>
          ⚠️ มี {lowStock.length} รายการสต๊อกต่ำกว่าขั้นต่ำ: {lowStock.map(s => s.name).join(', ')}
        </div>
      )}

      <div className="tabs">
        {[['current','📦 สต๊อกปัจจุบัน'],['moving','📊 Fast/Slow Moving'],['cost','🧮 ต้นทุนต่อ Lot']].map(([v,l]) => (
          <div key={v} className={`tab${tab===v?' active':''}`} onClick={() => setTab(v)}>{l}</div>
        ))}
      </div>

      {/* ── สต๊อกปัจจุบัน ── */}
      {tab === 'current' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>🔍</span>
              <input type="text" placeholder="ค้นหาวัตถุดิบ..." value={search}
                onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36, width: 260 }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <a href="/stock-in" className="btn btn-outline">+ รับเข้าสต๊อก</a>
              <button className="btn btn-primary">+ เพิ่มรายการ</button>
            </div>
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            {loading ? <LoadingSpinner /> : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr><th>รหัส</th><th>ชื่อวัตถุดิบ</th><th>หมวด</th><th>คงเหลือ</th><th>หน่วย</th><th>ขั้นต่ำ</th><th>ราคาทุน</th><th>สถานะ</th></tr>
                  </thead>
                  <tbody>
                    {filtered.map(s => {
                      const low = s.qty <= s.min_qty
                      return (
                        <tr key={s.id} className="row-link">
                          <td style={{ color: 'var(--primary)', fontFamily: 'monospace', fontWeight: 700 }}>{s.code}</td>
                          <td style={{ fontWeight: 600 }}>{s.name}</td>
                          <td><span className="badge badge-gray">{s.category}</span></td>
                          <td style={{ fontWeight: 800, fontSize: 16, color: low ? 'var(--danger)' : 'var(--success)' }}>{s.qty}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{s.unit}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{s.min_qty}</td>
                          <td style={{ fontWeight: 600 }}>฿{s.cost_per_unit}</td>
                          <td><span className={low ? 'badge badge-red' : 'badge badge-green'}>{low ? '⚠️ ต่ำ' : '✓ ปกติ'}</span></td>
                        </tr>
                      )
                    })}
                    {filtered.length === 0 && !loading && (
                      <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>ไม่พบรายการ</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Fast/Slow Moving ── */}
      {tab === 'moving' && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>📊 Fast/Slow Moving — เรียงตามมูลค่าสต๊อกรวม</div>
          {loading ? <LoadingSpinner /> : sorted.map((s, i) => {
            const val  = s.qty * s.cost_per_unit
            const maxV = sorted[0].qty * sorted[0].cost_per_unit
            const pct  = maxV > 0 ? Math.round(val / maxV * 100) : 0
            const fast = i < 2
            return (
              <div key={s.code} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--primary)', fontWeight: 700 }}>{s.code}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                    <span className={fast ? 'badge badge-green' : 'badge badge-gray'}>{fast ? '🔥 Fast' : 'Slow'}</span>
                  </div>
                  <span style={{ fontWeight: 800, fontSize: 13 }}>฿{val.toLocaleString()}</span>
                </div>
                <div className="progress-wrap">
                  <div className="progress-bar blue" style={{ width: `${pct}%`, background: fast ? 'var(--success)' : 'var(--text-muted)' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── ต้นทุนต่อ Lot ── */}
      {tab === 'cost' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>🧮 ต้นทุนต่อ Lot</span>
          </div>
          {loading ? <LoadingSpinner /> : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr><th>รหัส</th><th>ชื่อ</th><th>หน่วย</th><th>ราคาทุน/หน่วย</th><th>คงเหลือ</th><th>ต้นทุนรวม</th><th>% รวม</th></tr></thead>
                <tbody>
                  {rows.map(s => {
                    const total = s.qty * s.cost_per_unit
                    const pct   = grandTotal > 0 ? (total / grandTotal * 100).toFixed(1) : '0.0'
                    return (
                      <tr key={s.code}>
                        <td style={{ fontFamily: 'monospace', color: 'var(--primary)', fontWeight: 700 }}>{s.code}</td>
                        <td style={{ fontWeight: 600 }}>{s.name}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{s.unit}</td>
                        <td>฿{s.cost_per_unit}</td>
                        <td style={{ fontWeight: 700 }}>{s.qty}</td>
                        <td style={{ fontWeight: 800, color: 'var(--primary)' }}>฿{total.toLocaleString()}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 6, borderRadius: 4, background: 'var(--bg)', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: 'var(--primary)', borderRadius: 4 }} />
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 34 }}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--bg)', fontWeight: 800 }}>
                    <td colSpan={5} style={{ textAlign: 'right', padding: '10px 14px' }}>รวมทั้งหมด</td>
                    <td style={{ color: 'var(--primary)', fontSize: 15, padding: '10px 14px' }}>฿{grandTotal.toLocaleString()}</td>
                    <td style={{ padding: '10px 14px' }}>100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
