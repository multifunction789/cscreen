'use client'

/** สร้าง folder ลูกค้าใน Drive → return { folderId } */
export async function createCustomerFolderClient(code, name) {
  const res = await fetch('/api/drive/customer-folder', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ code, name }),
  })
  if (!res.ok) throw new Error((await res.json()).error || 'สร้าง folder ไม่สำเร็จ')
  return res.json()
}

/**
 * อัปโหลด File object ไปยัง Drive
 * @param {File}   file
 * @param {string} folderId
 * @param {string} filename  — ชื่อไฟล์ที่ต้องการ
 */
export async function uploadFileClient(file, folderId, filename) {
  const form = new FormData()
  form.append('file',     file)
  form.append('folderId', folderId)
  if (filename) form.append('filename', filename)
  const res = await fetch('/api/drive/upload', { method: 'POST', body: form })
  if (!res.ok) throw new Error((await res.json()).error || 'อัปโหลดไม่สำเร็จ')
  return res.json()
}

/**
 * อัปโหลด dataURL (รูปจากกล้อง/วิดีโอ) ไปยัง Drive
 * @param {string} dataUrl
 * @param {string} folderId
 * @param {string} filename
 */
export async function uploadDataUrlClient(dataUrl, folderId, filename) {
  const form = new FormData()
  form.append('dataUrl',  dataUrl)
  form.append('folderId', folderId)
  form.append('filename', filename)
  const res = await fetch('/api/drive/upload', { method: 'POST', body: form })
  if (!res.ok) throw new Error((await res.json()).error || 'อัปโหลดไม่สำเร็จ')
  return res.json()
}

// ── legacy exports (ใช้ใน joborder เดิม) ──────────────────
export async function createJobFoldersClient(jobCode, customerName) {
  return { jobFolderId: null, artworkFolderId: null, mockupFolderId: null, finishFolderId: null }
}
