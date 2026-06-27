'use client'

/**
 * driveClient.js — ฝั่ง browser เรียก API route ของเรา
 */

/** สร้าง folder ใน Drive และ return folder IDs */
export async function createJobFoldersClient(jobCode, customerName) {
  const res = await fetch('/api/drive/folder', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ jobCode, customerName }),
  })
  if (!res.ok) throw new Error((await res.json()).error || 'สร้าง folder ไม่สำเร็จ')
  return res.json()
}

/**
 * อัปโหลด File object ไปยัง Drive folder
 * @param {File}   file
 * @param {string} folderId
 * @param {string} [filename]
 * @returns {{ id, webViewLink, directUrl }}
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
 * อัปโหลด dataURL (รูปจากกล้อง) ไปยัง Drive folder
 * @param {string} dataUrl   — base64 dataURL
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
