'use client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Line, ComposedChart, Area,
} from 'recharts'

export default function MonthlyReportChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}
          tickFormatter={v => v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v}
        />
        <Tooltip
          contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
          formatter={(v, name) => name === 'ใบงาน' ? [`${v} ใบ`, name] : [`฿${v.toLocaleString()}`, name]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="ใบแจ้งหนี้" fill="#B80F0B" radius={[4, 4, 0, 0]} barSize={16} />
        <Bar dataKey="รับเงินแล้ว" fill="#10B981" radius={[4, 4, 0, 0]} barSize={16} />
        <Line type="monotone" dataKey="ใบงาน" stroke="#7C3AED" strokeWidth={2} dot={{ r: 3, fill: '#7C3AED' }} yAxisId={0} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
