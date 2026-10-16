/** วันนี้ในรูป YYYY-MM-DD */
export const todayStr = () => new Date().toISOString().split('T')[0]

/**
 * Print เฉพาะ #print-area โดยโคลน element ขึ้นไปวางที่ body โดยตรง
 * แก้ปัญหา Next.js layout ซ้อนหลายชั้นทำให้ position:fixed ใน @media print ไม่ทำงาน
 */
export function printDoc(elementId = 'print-area', filename = '') {
  const el = document.getElementById(elementId)
  if (!el) { window.print(); return }

  const clone = el.cloneNode(true)
  clone.id = '__print_clone__'
  // ลบ no-print elements ออกจาก clone
  clone.querySelectorAll('.no-print').forEach(n => n.remove())
  // reset style ให้แน่ใจว่าไม่มี border/shadow ที่ไม่ต้องการ
  clone.style.cssText = 'position:absolute;top:0;left:0;width:100%;background:#fff;'

  // ตั้งชื่อ title → browser ใช้เป็นชื่อไฟล์ PDF
  const prevTitle = document.title
  if (filename) document.title = filename

  document.body.appendChild(clone)
  document.body.classList.add('is-printing')
  window.print()
  document.body.removeChild(clone)
  document.body.classList.remove('is-printing')

  // คืนค่า title เดิม
  if (filename) document.title = prevTitle
}

/**
 * Export element ออกเป็นไฟล์ JPEG
 * @param {string} elementId  - id ของ element
 * @param {string} filename   - ชื่อไฟล์ (ไม่รวมนามสกุล)
 */
export async function exportJpeg(elementId, filename = 'document') {
  const html2canvas = (await import('html2canvas')).default
  const el = document.getElementById(elementId)
  if (!el) return
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#fff', useCORS: true })
  const a = document.createElement('a')
  a.download = `${filename}.jpg`
  a.href = canvas.toDataURL('image/jpeg', 0.95)
  a.click()
}

/**
 * แชร์เอกสาร → Line / Messenger / ช่องทางอื่น
 * บน mobile ใช้ native share sheet, desktop fallback เป็น Line URL
 */
export function shareDoc({ title, text, fallbackUrl = window.location.href }) {
  const fullText = `${title}\n${text}`
  if (typeof navigator !== 'undefined' && navigator.share) {
    navigator.share({ title, text: fullText, url: fallbackUrl }).catch(() => openShareMenu(fullText))
  } else {
    openShareMenu(fullText)
  }
}

function openShareMenu(text) {
  const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(text)}`
  const fbUrl   = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}&quote=${encodeURIComponent(text)}`
  const menu = [
    { label: '💬 Line', url: lineUrl },
    { label: '📘 Facebook', url: fbUrl },
    { label: '📋 คัดลอกข้อความ', url: null },
  ]
  const choice = window.prompt(
    'แชร์ผ่านช่องทาง:\n1 = Line\n2 = Facebook\n3 = คัดลอกข้อความ\n\nพิมพ์ 1, 2 หรือ 3'
  )
  if (choice === '1') window.open(menu[0].url, '_blank')
  else if (choice === '2') window.open(menu[1].url, '_blank')
  else if (choice === '3') { navigator.clipboard?.writeText(text); alert('คัดลอกแล้ว') }
}

/** อัปโหลดไฟล์เป็น base64 สำหรับเก็บใน DB (< 1 MB) */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/** bucket ที่เป็นความลับ (ไม่มีลิงก์สาธารณะ) — เก็บเป็น storage://bucket/path แล้วเปิดด้วยลิงก์ชั่วคราว */
export const PRIVATE_BUCKETS = new Set(['wht-files', 'chat-media', 'payment-slips', 'documents'])
const STORAGE_REF = /^storage:\/\/([^/]+)\/(.+)$/

/** อัปโหลดไปยัง Supabase Storage, fallback เป็น base64 */
export async function uploadFile(supabase, bucket, file) {
  if (!file) return null
  try {
    const ext  = file.name.split('.').pop()
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
    if (!error) {
      if (PRIVATE_BUCKETS.has(bucket)) return `storage://${bucket}/${path}`
      const { data } = supabase.storage.from(bucket).getPublicUrl(path)
      return data?.publicUrl
    }
  } catch (_) {}
  // Fallback base64 (เฉพาะไฟล์ทั่วไป — ไฟล์ลับไม่เก็บลงฐานข้อมูลตรงๆ)
  if (PRIVATE_BUCKETS.has(bucket)) throw new Error('อัปโหลดไฟล์ไม่สำเร็จ')
  return fileToBase64(file)
}

/** เปิดไฟล์ที่เก็บไว้: storage://… → ขอลิงก์ชั่วคราว 5 นาที, อย่างอื่นเปิดตรง */
export async function openStoredFile(supabase, url) {
  if (!url) return
  const m = STORAGE_REF.exec(url)
  if (!m) { window.open(url, '_blank', 'noopener'); return }
  const tab = window.open('', '_blank')
  const { data, error } = await supabase.storage.from(m[1]).createSignedUrl(m[2], 300)
  if (error || !data?.signedUrl) { tab?.close(); throw new Error('เปิดไฟล์ไม่ได้ หรือไม่มีสิทธิ์ดูไฟล์นี้') }
  if (tab) tab.location.href = data.signedUrl
  else window.location.href = data.signedUrl
}
