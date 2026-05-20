'use client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export default function RevenueChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barSize={14}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}
          tickFormatter={v => v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v} />
        <Tooltip
          contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
          formatter={(v, name) => [`฿${v.toLocaleString()}`, name]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="รายรับ"  fill="#B80F0B" radius={[4,4,0,0]} />
        <Bar dataKey="รายจ่าย" fill="#3B82F6" radius={[4,4,0,0]} />
        <Bar dataKey="กำไร"    fill="#10B981" radius={[4,4,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
