import { NextResponse } from 'next/server'
import { uploadFileToDrive, getOrCreateFolder } from '@/lib/drive'

/**
 * POST /api/drive/upload
 * FormData fields:
 *   file      — ไฟล์ที่อัปโหลด (หรือ dataURL string สำหรับรูปจากกล้อง)
 *   folderId  — Google Drive folder ID ปลายทาง
 *   filename  — ชื่อไฟล์ (optional, ใช้ชื่อจากไฟล์ถ้าไม่ระบุ)
 *
 * Returns: { id, webViewLink, directUrl }
 */
export async function POST(req) {
  try {
    const form     = await req.formData()
    const folderId = form.get('folderId')
    const filename = form.get('filename')
    const file     = form.get('file')       // File object
    const dataUrl  = form.get('dataUrl')    // base64 dataURL จากกล้อง

    if (!folderId) {
      return NextResponse.json({ error: 'folderId required' }, { status: 400 })
    }

    let buffer, mimeType, finalName

    if (dataUrl) {
      // รูปจากกล้อง — แปลง dataURL → Buffer
      const [meta, b64] = dataUrl.split(',')
      mimeType   = meta.match(/:(.*?);/)[1]
      buffer     = Buffer.from(b64, 'base64')
      finalName  = filename || `photo_${Date.now()}.jpg`
    } else if (file) {
      const ab   = await file.arrayBuffer()
      buffer     = Buffer.from(ab)
      mimeType   = file.type || 'application/octet-stream'
      finalName  = filename || file.name || `file_${Date.now()}`
    } else {
      return NextResponse.json({ error: 'file or dataUrl required' }, { status: 400 })
    }

    const result = await uploadFileToDrive(buffer, finalName, mimeType, folderId)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[drive/upload]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// อนุญาต request ขนาดใหญ่ (รูป HD)
export const config = { api: { bodyParser: false } }
