import { NextResponse }          from 'next/server'
import { uploadFileToDrive }     from '@/lib/drive'

/**
 * POST /api/drive/upload
 * FormData:
 *   file     — File object
 *   dataUrl  — base64 dataURL (จากกล้อง/วิดีโอ)
 *   folderId — destination folder ID
 *   filename — ชื่อไฟล์ที่ต้องการ (ถ้าไม่ระบุใช้ชื่อจากไฟล์)
 *
 * Returns: { id, webViewLink, directUrl, downloadUrl }
 */
export async function POST(req) {
  try {
    const form     = await req.formData()
    const folderId = form.get('folderId')
    const filename = form.get('filename')
    const file     = form.get('file')
    const dataUrl  = form.get('dataUrl')

    if (!folderId) {
      return NextResponse.json({ error: 'folderId required' }, { status: 400 })
    }

    let buffer, mimeType, finalName

    if (dataUrl) {
      const [meta, b64] = dataUrl.split(',')
      mimeType  = meta.match(/:(.*?);/)[1]
      buffer    = Buffer.from(b64, 'base64')
      finalName = filename || `photo_${Date.now()}.jpg`
    } else if (file) {
      const ab  = await file.arrayBuffer()
      buffer    = Buffer.from(ab)
      mimeType  = file.type || 'application/octet-stream'
      finalName = filename || file.name || `file_${Date.now()}`
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
