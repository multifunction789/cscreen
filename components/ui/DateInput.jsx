'use client'
import { useRef, useState } from 'react'

/**
 * ช่องวันที่แบบ DD/MM/YYYY (ปี พ.ศ.) — ใช้แทน <input type="date"> ที่แสดงรูปแบบตามภาษาเบราว์เซอร์ (มักเป็น MM/DD/YYYY)
 * ค่า value / onChange ยังเป็น ISO "YYYY-MM-DD" เหมือนเดิม → เปลี่ยนแค่ชื่อแท็ก:
 *   <DateInput value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
 * พิมพ์เองได้ (ใส่ / ให้อัตโนมัติ) ปีพิมพ์เป็น พ.ศ. หรือ ค.ศ. ก็ได้ · กด 📅 เพื่อเลือกจากปฏิทิน
 */
const pad = n => String(n).padStart(2, '0')

/** "2026-11-19" → "19/11/2569" */
export function isoToThai(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  return m ? `${m[3]}/${m[2]}/${+m[1] + 543}` : ''
}

/** "19/11/2569" หรือ "19/11/2026" → "2026-11-19" (ไม่ถูกต้อง → null) */
export function thaiToIso(text) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(text || '').trim())
  if (!m) return null
  let y = +m[3]
  if (y > 2400) y -= 543
  const mo = +m[2], d = +m[1]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${pad(mo)}-${pad(d)}`
}

/** ใส่ / ให้อัตโนมัติขณะพิมพ์ตัวเลข */
function autoSlash(raw) {
  const digits = raw.replace(/[^\d]/g, '').slice(0, 8)
  if (raw.includes('/')) return raw.replace(/[^\d/]/g, '').slice(0, 10)
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/')
}

export default function DateInput({ value, onChange, name, style, className, disabled, required, min, max, id, ...rest }) {
  const picker = useRef(null)
  const [draft, setDraft] = useState(null)   // ข้อความที่กำลังพิมพ์ (null = แสดงจาก value)
  const shown = draft ?? isoToThai(value)
  const emit = iso => onChange?.({ target: { value: iso, name } })

  function commit() {
    if (draft === null) return
    const t = draft.trim()
    if (!t) emit('')
    else { const iso = thaiToIso(t); if (iso) emit(iso) }
    setDraft(null)
  }

  function openPicker() {
    const el = picker.current
    if (!el || disabled) return
    try { el.showPicker() } catch { el.focus(); el.click() }
  }

  const bad = draft !== null && draft.trim() && draft.length >= 8 && !thaiToIso(draft)
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', width: style?.width || '100%', maxWidth: '100%' }}>
      <input
        {...rest}
        id={id} name={name} type="text" inputMode="numeric" placeholder="วว/ดด/ปปปป" autoComplete="off"
        className={className} disabled={disabled} required={required}
        value={shown}
        onChange={e => setDraft(autoSlash(e.target.value))}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
        style={{ ...style, width: '100%', paddingRight: 34, borderColor: bad ? '#DC2626' : style?.borderColor }}
        aria-invalid={bad || undefined}
        title={bad ? 'วันที่ไม่ถูกต้อง — ใช้รูปแบบ วว/ดด/ปปปป' : undefined}
      />
      <button type="button" tabIndex={-1} aria-label="เลือกจากปฏิทิน" disabled={disabled} onClick={openPicker}
        style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', padding: '2px 4px', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>📅</button>
      <input ref={picker} type="date" tabIndex={-1} aria-hidden="true" value={value || ''} min={min} max={max}
        onChange={e => { setDraft(null); emit(e.target.value) }}
        style={{ position: 'absolute', right: 0, bottom: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none', border: 0, padding: 0 }} />
    </span>
  )
}
