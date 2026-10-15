import { NextResponse }      from 'next/server'
import { getOrCreateFolder, isAllowedFolder } from '@/lib/drive'
import { requireUser } from '@/lib/supabaseServer'

/**
 * POST /api/drive/job-folder
 * Body: { parentId, name }  — สร้าง (หรือใช้ซ้ำ) โฟลเดอร์ของใบงานใต้โฟลเดอร์ลูกค้า
 * Returns: { folderId }
 * ต้องล็อกอิน · parentId ต้องเป็นโฟลเดอร์ของระบบ
 */
export async function POST(req) {
  const auth = await requireUser()
  if (auth.response) return auth.response
  try {
    const { parentId, name } = await req.json()
    if (typeof parentId !== 'string' || !/^[A-Za-z0-9_-]{10,100}$/.test(parentId)) {
      return NextResponse.json({ error: 'parentId required' }, { status: 400 })
    }
    if (typeof name !== 'string' || !name.trim() || name.length > 150) {
      return NextResponse.json({ error: 'name required' }, { status: 400 })
    }
    if (!(await isAllowedFolder(parentId))) {
      return NextResponse.json({ error: 'ไม่อนุญาตให้สร้างโฟลเดอร์ในตำแหน่งนี้' }, { status: 403 })
    }
    const safe = name.replace(/[/\\:*?"<>|']/g, '').trim()
    const folderId = await getOrCreateFolder(safe, parentId)
    return NextResponse.json({ folderId })
  } catch (err) {
    console.error('[drive/job-folder]', err)
    return NextResponse.json({ error: 'สร้างโฟลเดอร์ใบงานไม่สำเร็จ' }, { status: 500 })
  }
}
