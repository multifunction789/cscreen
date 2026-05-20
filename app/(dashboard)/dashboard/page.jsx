'use client'
import { useState, useEffect } from 'react'
import { getDashboardStats, getJobOrders, getTransactions, getCustomers } from '@/lib/db'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'


const bestSellers = [
  { icon: '👕', name: 'เสื้อยืด', count: '142 ตัว', val: '฿28,400', pct: 100 },
  { icon: '🏌️', name: 'เสื้อโปโล', count: '98 ตัว', val: '฿22,540', pct: 69 },
  { icon: '🦺', name: 'เสื้อคนงาน', count: '74 ตัว', val: '฿18,500', pct: 65 },
  { icon: '🖨️', name: 'งานสกรีน', count: '85 งาน', val: '฿17,000', pct: 60 },
  { icon: '🎨', name: 'เสื้อพิมพ์ลาย', count: '61 ตัว', val: '฿12,200', pct: 43 },
]


const statusBadge = { 'กำลังสกรีน':'badge badge-blue','สั่งของ':'badge badge-yellow','แพ็คพร้อมส่ง':'badge badge-green','เลยกำหนด':'badge badge-red','ส่งงานแล้ว':'badge badge-green','รอมัดจำ':'badge badge-gray','รอออกแบบ':'badge badge-cyan','รอทำไฟล์':'badge badge-purple','สั่งผลิต':'badge badge-cyan' }

export default function DashboardPage() {
  const [stats, setStats]   = useState({ totalIn: 0, totalOut: 0, profit: 0, activeJobs: 0, overdue: 0 })
  const [jobs, setJobs]     = useState([])
  const [txs, setTxs]       = useState([])
  const [customers, setCusts] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    Promise.all([getDashboardStats(), getJobOrders(), getTransactions(), getCustomers()]).then(([s, jRes, tRes, cRes]) => {
      setStats(s)
      setJobs(jRes.data || [])
      setTxs(tRes.data || [])
      setCusts(cRes.data || [])
      setLoaded(true)
    })
  }, [])

  // สร้าง chart data — รายรับ/รายจ่ายรายเดือน 6 เดือนล่าสุด
  const monthlyData = (() => {
    const thMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
    const now = new Date()
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({ year: d.getFullYear(), month: d.getMonth(), label: thMonths[d.getMonth()] })
    }
    return months.map(m => {
      const monthTx = txs.filter(t => {
        const d = new Date(t.transaction_date)
        return d.getFullYear() === m.year && d.getMonth() === m.month
      })
      const income  = monthTx.filter(t => t.type === 'รายรับ').reduce((s, t) => s + t.amount, 0)
      const expense = monthTx.filter(t => t.type === 'รายจ่าย').reduce((s, t) => s + t.amount, 0)
      return { name: m.label, รายรับ: income, รายจ่าย: expense, กำไร: income - expense }
    })
  })()

  const urgentFromDB = jobs
    .filter(j => j.status !== 'ส่งงานแล้ว')
    .filter(j => j.due_date)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 3)

  const recentJobsFromDB  = jobs.slice(0, 4)
  const recentTxFromDB    = txs.slice(0, 4)

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('th-TH', { day:'2-digit', month:'2-digit' }) : '—'
  const daysLeft = (d) => {
    if (!d) return null
    const diff = Math.ceil((new Date(d) - new Date()) / 86400000)
    if (diff < 0) return { text: `เลยกำหนด ${Math.abs(diff)} วัน`, color: 'var(--danger)' }
    if (diff === 0) return { text: 'ส่งวันนี้!', color: 'var(--danger)' }
    if (diff === 1) return { text: 'ส่งพรุ่งนี้', color: 'var(--warning)' }
    return { text: `อีก ${diff} วัน`, color: 'var(--success)' }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>📊 Dashboard</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>ภาพรวมธุรกิจ — วันนี้ 20 พ.ค. 2569</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline btn-sm">📅 เดือนนี้ ▾</button>
          <a href="/joborder" className="btn btn-primary btn-sm">+ สร้างงาน</a>
        </div>
      </div>

      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
        {[
          { label: 'ยอดขาย / Revenue',    value: loaded ? `฿${stats.totalIn.toLocaleString()}`  : '…', sub: 'รายรับทั้งหมด',          subColor: 'var(--success)', icon: '💰', accent: 'var(--primary)' },
          { label: 'ใบงานทั้งหมด / Jobs', value: loaded ? stats.activeJobs                       : '…', sub: 'งานที่ยังดำเนินการ',     subColor: 'var(--info)',    icon: '📋', accent: 'var(--info)' },
          { label: 'กำไรสุทธิ / Profit',  value: loaded ? `฿${stats.profit.toLocaleString()}`   : '…', sub: 'รายรับ - รายจ่าย',       subColor: 'var(--success)', icon: '📈', accent: 'var(--success)' },
          { label: 'งานค้างส่ง / Overdue', value: loaded ? stats.overdue                          : '…', sub: stats.overdue > 0 ? '⚠️ ต้องดำเนินการ' : '✓ ไม่มีงานค้าง', subColor: stats.overdue > 0 ? 'var(--danger)' : 'var(--success)', icon: '⏰', accent: 'var(--warning)' },
        ].map(k => (
          <div key={k.label} style={{
            background: 'var(--card)', borderRadius: 'var(--radius)',
            padding: '18px 20px', boxShadow: 'var(--shadow)',
            border: '1px solid var(--border)', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: k.accent, borderRadius: '10px 0 0 10px' }} />
            <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 32, opacity: .1 }}>{k.icon}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5 }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', margin: '4px 0 2px' }}>{k.value}</div>
            <div style={{ fontSize: 12, color: k.subColor, fontWeight: 600 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Chart + งานใกล้ส่ง */}
      <div style={{ display: 'grid', gridTemplateColumns: '6fr 4fr', gap: 20 }}>
        {/* Chart placeholder */}
        <div className="card">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>📈 ยอดขายรายเดือน (6 เดือนล่าสุด)</h2>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ข้อมูลจริงจาก Supabase</span>
          </div>
          <div style={{ padding: '16px 20px 20px' }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? (v/1000).toFixed(0)+'K' : v} />
                <Tooltip
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(v, name) => [`฿${v.toLocaleString()}`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="รายรับ"  fill="var(--primary)" radius={[4,4,0,0]} />
                <Bar dataKey="รายจ่าย" fill="var(--info)"    radius={[4,4,0,0]} />
                <Bar dataKey="กำไร"    fill="var(--success)" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* งานใกล้ส่ง */}
        <div className="card">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>⏰ งานใกล้ส่ง</h2>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {urgentFromDB.length === 0 && loaded && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>✓ ไม่มีงานเร่งด่วน</div>
            )}
            {urgentFromDB.map(j => {
              const dl = daysLeft(j.due_date)
              const overdue = dl && dl.text.includes('เลย')
              const color = overdue ? 'var(--danger)' : dl?.text.includes('วันนี้') || dl?.text.includes('พรุ่งนี้') ? 'var(--warning)' : 'var(--success)'
              const bg    = overdue ? '#FEE2E2' : dl?.text.includes('วันนี้') || dl?.text.includes('พรุ่งนี้') ? '#FEF3C7' : '#F0FDF4'
              return (
                <div key={j.id} style={{ padding: 10, background: bg, borderRadius: 8, borderLeft: `3px solid ${color}` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{j.code} · {j.customers?.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{j.item_desc}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color }}>{dl?.text}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Customer Charts */}
      {loaded && (() => {
        const now = new Date()
        const thisMonth = customers.filter(c => {
          const d = new Date(c.created_at)
          return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth()
        })
        const platformData = Object.entries(
          customers.reduce((acc,c)=>{ const p=c.platform||'อื่น ๆ'; acc[p]=(acc[p]||0)+1; return acc }, {})
        ).map(([name,value])=>({name,value}))
        const typeData = Object.entries(
          customers.reduce((acc,c)=>{ const t=c.type||'บุคคลธรรมดา'; acc[t]=(acc[t]||0)+1; return acc }, {})
        ).map(([name,value])=>({name,value}))
        const PIE_COLORS = ['var(--primary)','var(--info)','var(--success)','var(--warning)','#8B5CF6']
        return (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
            <div className="card">
              <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)' }}>
                <h2 style={{ fontSize:14, fontWeight:700 }}>👥 ภาพรวมลูกค้า</h2>
              </div>
              <div style={{ padding:16, display:'flex', gap:20, alignItems:'center' }}>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontSize:28, fontWeight:900, color:'var(--primary)' }}>{customers.length}</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)' }}>ลูกค้าทั้งหมด</div>
                  </div>
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontSize:22, fontWeight:800, color:'var(--success)' }}>+{thisMonth.length}</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)' }}>เดือนนี้</div>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={typeData} dataKey="value" nameKey="name" outerRadius={60} label={({name,value})=>`${name} ${value}`} labelLine={false} fontSize={10}>
                      {typeData.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card">
              <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)' }}>
                <h2 style={{ fontSize:14, fontWeight:700 }}>📱 ลูกค้าตาม Platform</h2>
              </div>
              <div style={{ padding:16 }}>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={platformData} layout="vertical" margin={{left:10}}>
                    <XAxis type="number" tick={{fontSize:11}} />
                    <YAxis type="category" dataKey="name" tick={{fontSize:11}} width={80} />
                    <Tooltip />
                    <Bar dataKey="value" name="จำนวน" fill="var(--primary)" radius={[0,4,4,0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Best Sellers */}
      <div className="card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>🏆 สินค้าขายดี / Best Sellers</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }}><option>เดือนนี้</option><option>ไตรมาสนี้</option><option>ปีนี้</option></select>
            <button className="btn btn-outline btn-sm">ดูรายงาน →</button>
          </div>
        </div>
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
          {bestSellers.map(b => (
            <div key={b.name} style={{
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
              padding: '14px 12px', textAlign: 'center', boxShadow: 'var(--shadow)',
              cursor: 'pointer', transition: 'border-color .15s, transform .15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none' }}
            >
              <div style={{ fontSize: 26, marginBottom: 6 }}>{b.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{b.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{b.count}</div>
              <div style={{ height: 4, borderRadius: 4, background: 'var(--primary)', margin: '6px 0 2px', width: `${b.pct}%`, opacity: .7 }} />
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)' }}>{b.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Jobs + Recent Finance */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>📋 ใบงานล่าสุด</h2>
            <a href="/joborder" className="btn btn-outline btn-sm">ดูทั้งหมด →</a>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>เลขที่</th><th>ลูกค้า</th><th>สถานะ</th><th>ยอด</th></tr></thead>
              <tbody>
                {recentJobsFromDB.map(j => (
                  <tr key={j.id} className="row-link">
                    <td style={{ fontWeight: 700, color: 'var(--primary)', fontFamily: 'monospace' }}>{j.code}</td>
                    <td>{j.customers?.name || '—'}</td>
                    <td><span className={statusBadge[j.status] || 'badge badge-gray'}>{j.status}</span></td>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>฿{(j.total || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>💰 รายรับ-จ่ายล่าสุด</h2>
            <a href="/finance" className="btn btn-outline btn-sm">ดูทั้งหมด →</a>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>วันที่</th><th>รายการ</th><th>ประเภท</th><th>จำนวน</th></tr></thead>
              <tbody>
                {recentTxFromDB.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(t.transaction_date)}</td>
                    <td style={{ fontSize: 13 }}>{t.description}</td>
                    <td><span className={t.type === 'รายรับ' ? 'badge badge-green' : 'badge badge-red'}>{t.type}</span></td>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace', color: t.type === 'รายรับ' ? 'var(--success)' : 'var(--danger)' }}>
                      {t.type === 'รายรับ' ? '+' : '-'}฿{(t.amount || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  )
}
