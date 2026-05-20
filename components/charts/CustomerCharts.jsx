'use client'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts'

const PIE_COLORS = ['#B80F0B','#3B82F6','#10B981','#F59E0B','#8B5CF6']

export default function CustomerCharts({ customers }) {
  const now = new Date()
  const thisMonth = customers.filter(c => {
    const d = new Date(c.created_at)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  })
  const platformData = Object.entries(
    customers.reduce((acc, c) => { const p = c.platform || 'อื่น ๆ'; acc[p] = (acc[p] || 0) + 1; return acc }, {})
  ).map(([name, value]) => ({ name, value }))
  const typeData = Object.entries(
    customers.reduce((acc, c) => { const t = c.type || 'บุคคลธรรมดา'; acc[t] = (acc[t] || 0) + 1; return acc }, {})
  ).map(([name, value]) => ({ name, value }))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <div className="card">
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700 }}>👥 ภาพรวมลูกค้า</h2>
        </div>
        <div style={{ padding: 16, display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#B80F0B' }}>{customers.length}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>ลูกค้าทั้งหมด</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#10B981' }}>+{thisMonth.length}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>เดือนนี้</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={typeData} dataKey="value" nameKey="name" outerRadius={60}
                label={({ name, value }) => `${name} ${value}`} labelLine={false} fontSize={10}>
                {typeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card">
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700 }}>📱 ลูกค้าตาม Platform</h2>
        </div>
        <div style={{ padding: 16 }}>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={platformData} layout="vertical" margin={{ left: 10 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
              <Tooltip />
              <Bar dataKey="value" name="จำนวน" fill="#B80F0B" radius={[0,4,4,0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
