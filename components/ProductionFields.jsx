'use client'
import { PRODUCTION_FIELDS } from '@/lib/jobProduction.mjs'

export default function ProductionFields({ value = {}, onChange, prefix }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8, marginTop: 10 }}>
    {PRODUCTION_FIELDS.map(([key, label, placeholder]) => <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
      {label}
      <input aria-label={`${prefix} ${label}`} placeholder={placeholder} value={value[key] || ''}
        onChange={e => onChange({ ...value, [key]: e.target.value })} style={{ width: '100%' }} />
    </label>)}
  </div>
}
