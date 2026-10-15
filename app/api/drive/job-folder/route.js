import { NextResponse }      from 'next/server'
import { getOrCreateFolder } from '@/lib/drive'

/**
 * POST /api/drive/job-folder
 * Body: { parentId, name }  — สร้าง (หรือใช้ซ้ำ) โฟลเดอร์ของใบงานใต้โฟลเดอร์ลูกค้า
 * Returns: { folderId }
 * (หลัง merge PR ความปลอดภัย ทุก /api ต้องล็อกอินผ่าน proxy)
 */
export async function POST(req) {
  try {
    const { parentId, name } = await req.json()
    if (typeof parentId !== 'string' || !/^[A-Za-z0-9_-]{10,100}$/.test(parentId)) {
      return NextResponse.json({ error: 'parentId required' }, { status: 400 })
    }
    if (typeof name !== 'string' || !name.trim() || name.length > 150) {
      return NextResponse.json({ error: 'name required' }, { status: 400 })
    }
    const safe = name.replace(/[/\\:*?"<>|']/g, '').trim()
    const folderId = await getOrCreateFolder(safe, parentId)
    return NextResponse.json({ folderId })
  } catch (err) {
    console.error('[drive/job-folder]', err)
    return NextResponse.json({ error: 'สร้างโฟลเดอร์ใบงานไม่สำเร็จ' }, { status: 500 })
  }
}
