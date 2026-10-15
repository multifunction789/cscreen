// ลิงก์ไปยังเอกสารแต่ละประเภท — หน้าเอกสารจะเปิดใบนั้นให้อัตโนมัติจาก ?open=<id>
export const DOC_TYPES = {
  quotation: { path: '/quotation', label: 'ใบเสนอราคา', short: 'QT',  icon: '📋' },
  invoice:   { path: '/invoice',   label: 'ใบแจ้งหนี้', short: 'INV', icon: '📄' },
  joborder:  { path: '/joborder',  label: 'ใบงาน',      short: 'JO',  icon: '📝' },
  receipt:   { path: '/receipt',   label: 'ใบเสร็จ',    short: 'REC', icon: '🧾' },
  customer:  { path: '/customers', label: 'ลูกค้า',     short: 'CUS', icon: '👤' },
}

export function docHref(type, id) {
  const t = DOC_TYPES[type]
  if (!t) return '/'
  return id ? `${t.path}?open=${encodeURIComponent(id)}` : t.path
}

/**
 * ปิดมุมมองเอกสาร: ล้าง ?open= ออกจาก URL โดยไม่เพิ่มประวัติ
 * ใช้ History API ของเบราว์เซอร์ (Next.js sync กับ useSearchParams ให้เอง และไม่ต้องโหลดหน้าใหม่)
 */
export function clearOpenParam(pathname) {
  if (typeof window === 'undefined') return
  if (new URLSearchParams(window.location.search).has('open')) {
    window.history.replaceState(null, '', pathname)
  }
}

/** เปิดมุมมองเอกสาร: เพิ่ม ?open=<id> เป็นประวัติใหม่ (ปุ่ม Back จะกลับมาที่รายการ) */
export function pushOpenParam(pathname, id) {
  if (typeof window === 'undefined') return
  window.history.pushState(null, '', `${pathname}?open=${encodeURIComponent(id)}`)
}
