'use client'
import { useMemo } from 'react'
import { computeOverall, pendingStepKeys, stepKey, QUICK_STEPS } from '@/lib/jobV2'

/**
 * ตัวกรองใบงานตามแผนการผลิต (ใช้กับใบงานแบบใหม่ที่มีแผนการผลิต)
 *  • ขั้นตอนตอนนี้  = ขั้นแรกที่ยังไม่เสร็จตามลำดับ (เช่น ออกแบบ, DTF) — ใบงานอยู่ที่ขั้นไหน
 *  • ยังไม่ได้ทำ    = ใบงานที่มีขั้นนี้ในแผนและขั้นนี้ยังไม่เสร็จ (ไม่ว่าจะถึงคิวหรือยัง)
 *
 *   const [stage, setStage] = useState(EMPTY_STAGE)
 *   <StageFilter jobs={v2Jobs} stepsBy={stepsBy} value={stage} onChange={setStage} />
 *   jobs.filter(j => matchStage(stage, stepsBy[j.id]))
 */
export const EMPTY_STAGE = { now: '', pending: '' }
export const NO_PLAN = '__none__'
export const ALL_DONE = '__done__'

/** ขั้นปัจจุบันของใบงาน: ชื่อขั้น, NO_PLAN หรือ ALL_DONE */
export function currentStage(steps = []) {
  const ov = computeOverall(steps)
  return ov.key === 'none' ? NO_PLAN : ov.key === 'done' ? ALL_DONE : ov.stage
}

/** ใบงานตรงกับตัวกรองหรือไม่ (ตัวกรองว่าง = ผ่านทุกใบ) */
export function matchStage(value, steps) {
  if (!value?.now && !value?.pending) return true
  if (!steps) return false   // ใบงานแบบเดิม / ยังโหลดแผนไม่เสร็จ
  if (value.now && currentStage(steps) !== value.now) return false
  if (value.pending && !pendingStepKeys(steps).has(value.pending)) return false
  return true
}

const order = k => { const i = QUICK_STEPS.indexOf(k); return i === -1 ? 99 : i }

export default function StageFilter({ jobs, stepsBy, value, onChange, showDone = false }) {
  const { nowCounts, pendingCounts } = useMemo(() => {
    const now = {}, pending = {}
    jobs.forEach(j => {
      const st = stepsBy[j.id]
      if (!st) return
      const c = currentStage(st)
      if (c !== ALL_DONE || showDone) now[c] = (now[c] || 0) + 1
      pendingStepKeys(st).forEach(k => { pending[k] = (pending[k] || 0) + 1 })
    })
    return { nowCounts: now, pendingCounts: pending }
  }, [jobs, stepsBy, showDone])

  const nowKeys = Object.keys(nowCounts).sort((a, b) =>
    (a === NO_PLAN ? -1 : b === NO_PLAN ? 1 : a === ALL_DONE ? 1 : b === ALL_DONE ? -1 : order(a) - order(b) || a.localeCompare(b, 'th')))
  const pendingKeys = Object.keys(pendingCounts).sort((a, b) => order(a) - order(b) || a.localeCompare(b, 'th'))
  const label = k => (k === NO_PLAN ? 'ยังไม่วางแผน' : k === ALL_DONE ? 'เสร็จครบทุกขั้น' : k)
  const chip = on => ({
    cursor: 'pointer', border: `1.5px solid ${on ? '#8A6500' : '#E9D9A6'}`, background: on ? '#8A6500' : '#fff',
    color: on ? '#fff' : '#5C4300', borderRadius: 99, padding: '3px 11px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
  })

  if (!nowKeys.length && !pendingKeys.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 14px', background: '#FDF6E3', border: '1px solid #E9D9A6', borderRadius: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <b style={{ fontSize: 12.5, color: '#8A6500', minWidth: 96 }}>ตอนนี้อยู่ขั้น</b>
        <button type="button" style={chip(!value.now)} onClick={() => onChange({ ...value, now: '' })}>ทั้งหมด</button>
        {nowKeys.map(k => (
          <button key={k} type="button" style={chip(value.now === k)} onClick={() => onChange({ ...value, now: value.now === k ? '' : k })}>
            {label(k)} · {nowCounts[k]}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <b style={{ fontSize: 12.5, color: '#8A6500', minWidth: 96 }}>ยังไม่ได้ทำขั้น</b>
        <select aria-label="ยังไม่ได้ทำขั้น" value={value.pending} onChange={e => onChange({ ...value, pending: e.target.value })}
          style={{ width: 'auto', fontSize: 13, padding: '3px 8px', borderColor: value.pending ? '#8A6500' : undefined }}>
          <option value="">— เลือกขั้นตอน —</option>
          {pendingKeys.map(k => <option key={k} value={k}>{k} ({pendingCounts[k]} ใบ)</option>)}
        </select>
        {(value.now || value.pending) && (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange(EMPTY_STAGE)}>✕ ล้างตัวกรอง</button>
        )}
        <span style={{ fontSize: 11.5, color: '#6B6250', marginLeft: 'auto' }}>สถานะใบงาน = ขั้นแรกที่ยังไม่เสร็จในแผนการผลิต</span>
      </div>
    </div>
  )
}

export { stepKey }
