import { NextResponse }                        from 'next/server'
import { uploadFileToDrive, isAllowedFolder } from '@/lib/drive'
import { requireUser }                        from '@/lib/supabaseServer'

const MAX_BYTES = 50 * 1024 * 1024   // 50 MB ต่อไฟล์ (ไฟล์ .ai/.psd ใหญ่ได้)
const DATA_URL  = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/

/**
 * POST /api/drive/upload  (ต้องล็อกอิน)
 * FormData:
 *   file     — File object
 *   dataUrl  — base64 dataURL ของรูป (จากกล้อง/วิดีโอ)
 *   folderId — โฟลเดอร์ปลายทาง (ต้องเป็นโฟลเดอร์ของระบบ)
 *   filename — ชื่อไฟล์ที่ต้องการ (ถ้าไม่ระบุใช้ชื่อจากไฟล์)
 *
 * Returns: { id, webViewLink, directUrl, downloadUrl }
 */
export async function POST(req) {
  const auth = await requireUser()
  if (auth.response) return auth.response
  try {
    const form     = await req.formData()
    const folderId = form.get('folderId')
    const filename = form.get('filename')
    const file     = form.get('file')
    const dataUrl  = form.get('dataUrl')

    if (typeof folderId !== 'string' || !/^[A-Za-z0-9_-]{10,100}$/.test(folderId)) {
      return NextResponse.json({ error: 'folderId required' }, { status: 400 })
    }
    if (!(await isAllowedFolder(folderId))) {
      return NextResponse.json({ error: 'ไม่อนุญาตให้อัปโหลดไปโฟลเดอร์นี้' }, { status: 403 })
    }

    let buffer, mimeType, finalName

    if (typeof dataUrl === 'string' && dataUrl) {
      const m = DATA_URL.exec(dataUrl)
      if (!m) return NextResponse.json({ error: 'รูปแบบรูปไม่ถูกต้อง' }, { status: 400 })
      mimeType  = m[1]
      buffer    = Buffer.from(m[2], 'base64')
      finalName = filename || `photo_${Date.now()}.jpg`
    } else if (file && typeof file === 'object' && 'arrayBuffer' in file) {
      if (file.size > MAX_BYTES) return NextResponse.json({ error: 'ไฟล์ใหญ่เกิน 50 MB' }, { status: 413 })
      buffer    = Buffer.from(await file.arrayBuffer())
      mimeType  = file.type || 'application/octet-stream'
      finalName = filename || file.name || `file_${Date.now()}`
    } else {
      return NextResponse.json({ error: 'file or dataUrl required' }, { status: 400 })
    }
    if (buffer.length > MAX_BYTES) return NextResponse.json({ error: 'ไฟล์ใหญ่เกิน 50 MB' }, { status: 413 })

    // ชื่อไฟล์: ตัดอักขระที่ใช้ไม่ได้ และจำกัดความยาว
    finalName = String(finalName).replace(/[/\\:*?"<>|\u0000-\u001f]/g, '').slice(0, 180) || `file_${Date.now()}`

    const result = await uploadFileToDrive(buffer, finalName, mimeType, folderId)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[drive/upload]', err)
    return NextResponse.json({ error: 'อัปโหลดไม่สำเร็จ' }, { status: 500 })
  }
}
