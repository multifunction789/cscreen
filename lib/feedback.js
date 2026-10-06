'use client'

/**
 * แจ้งเตือนแบบ toast + กล่องยืนยัน แทน alert()/confirm() ของเบราว์เซอร์
 *
 *   notify.success('บันทึกแล้ว')
 *   notify.error('บันทึกไม่สำเร็จ: ' + err.message)
 *   notify.success('ย้ายงานแล้ว', { action: { label: 'เลิกทำ', onClick: undo } })
 *   if (!(await ask({ title: 'ลบใบงาน?', message: '...', danger: true }))) return
 *
 * เรียกได้จากฟังก์ชันธรรมดา ไม่ต้องใช้ hook — <FeedbackHost /> ใน layout เป็นตัวแสดงผล
 */

let listeners = new Set()
let state = { toasts: [], dialog: null }
let seq = 0

function emit() { listeners.forEach(fn => fn(state)) }

export function subscribeFeedback(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const getFeedbackState = () => state
const EMPTY = { toasts: [], dialog: null }
export const getServerFeedbackState = () => EMPTY

export function dismissToast(id) {
  state = { ...state, toasts: state.toasts.filter(t => t.id !== id) }
  emit()
}

function push(type, message, opts = {}) {
  const id = ++seq
  const duration = opts.duration ?? (type === 'error' ? 6000 : opts.action ? 6000 : 3500)
  state = { ...state, toasts: [...state.toasts.slice(-3), { id, type, message, action: opts.action }] }
  emit()
  if (duration > 0) setTimeout(() => dismissToast(id), duration)
  return id
}

export const notify = {
  success: (msg, opts) => push('success', msg, opts),
  error:   (msg, opts) => push('error', msg, opts),
  warn:    (msg, opts) => push('warn', msg, opts),
  info:    (msg, opts) => push('info', msg, opts),
}

/** กล่องยืนยัน → Promise<boolean> */
export function ask({ title = 'ยืนยัน', message = '', confirmLabel = 'ยืนยัน', cancelLabel = 'ยกเลิก', danger = false } = {}) {
  return new Promise(resolve => {
    // ถ้ามีกล่องค้างอยู่ ให้ถือว่ายกเลิกอันเก่า
    state.dialog?.resolve(false)
    state = { ...state, dialog: { title, message, confirmLabel, cancelLabel, danger, resolve } }
    emit()
  })
}

export function closeDialog(result) {
  const d = state.dialog
  state = { ...state, dialog: null }
  emit()
  d?.resolve(result)
}
