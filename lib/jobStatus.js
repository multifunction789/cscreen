// ขั้นตอนงานผลิต — ใช้ร่วมกันระหว่างหน้า ติดตามงาน / Dashboard / ใบงาน
export const JOB_STAGES = [
  { id: 'รอมัดจำ',      label: 'รอมัดจำ',      color: '#6B7280', bg: '#F3F4F6' },
  { id: 'รอออกแบบ',     label: 'รอออกแบบ',     color: '#0891B2', bg: '#CFFAFE' },
  { id: 'รอทำไฟล์',     label: 'รอทำไฟล์',     color: '#7C3AED', bg: '#EDE9FE' },
  { id: 'สั่งของ',       label: 'สั่งของ',       color: '#B45309', bg: '#FEF3C7' },
  { id: 'กำลังสกรีน',   label: 'กำลังสกรีน',   color: '#2563EB', bg: '#DBEAFE' },
  { id: 'แพ็คพร้อมส่ง', label: 'แพ็คพร้อมส่ง', color: '#059669', bg: '#D1FAE5' },
  { id: 'ส่งงานแล้ว',   label: 'ส่งงานแล้ว',   color: '#4B5563', bg: '#F9FAFB' },
]
export const DONE_STATUS = 'ส่งงานแล้ว'
export const STAGE_IDS = JOB_STAGES.map(s => s.id)

/** เริ่มต้นวัน (เวลาท้องถิ่น) — ใช้เทียบวันที่โดยไม่สนเวลา */
function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** จำนวนวันจากวันนี้ถึงวันกำหนดส่ง (ลบ = เลยกำหนด) หรือ null ถ้าไม่มีวันกำหนดส่ง */
export function daysUntil(due) {
  if (!due) return null
  // due_date จากฐานข้อมูลเป็น 'YYYY-MM-DD' → แปลงเป็นเวลาท้องถิ่น ไม่ใช่ UTC
  const d = typeof due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(due + 'T00:00:00') : new Date(due)
  if (isNaN(d)) return null
  return Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000)
}

/** เลยกำหนดส่งแล้ว และยังไม่ได้ส่งงาน (วันกำหนดส่ง = วันนี้ ยังไม่นับว่าเลย) */
export function isJobOverdue(job) {
  const n = daysUntil(job?.due_date)
  return n !== null && n < 0 && job.status !== DONE_STATUS
}

/** ข้อความ + โทนสีสำหรับป้ายกำหนดส่ง */
export function dueLabel(job) {
  const n = daysUntil(job?.due_date)
  if (n === null) return { text: 'ไม่มีกำหนดส่ง', tone: 'muted' }
  if (job.status === DONE_STATUS) return { text: 'ส่งแล้ว', tone: 'muted' }
  if (n < 0)  return { text: `เลย ${-n} วัน`, tone: 'danger' }
  if (n === 0) return { text: 'ส่งวันนี้', tone: 'warning' }
  if (n === 1) return { text: 'ส่งพรุ่งนี้', tone: 'warning' }
  if (n <= 3) return { text: `อีก ${n} วัน`, tone: 'warning' }
  return { text: `อีก ${n} วัน`, tone: 'muted' }
}

export const TONE_STYLE = {
  danger:  { color: '#B91C1C', background: '#FEE2E2' },
  warning: { color: '#92400E', background: '#FEF3C7' },
  muted:   { color: 'var(--text-muted)', background: '#F3F4F6' },
}

/** เรียงตามกำหนดส่ง (ใกล้สุดก่อน ไม่มีกำหนดอยู่ท้าย) */
export function byDueDate(a, b) {
  const da = daysUntil(a.due_date), db = daysUntil(b.due_date)
  if (da === null && db === null) return 0
  if (da === null) return 1
  if (db === null) return -1
  return da - db
}
