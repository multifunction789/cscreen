import { NextResponse }          from 'next/server'
import { createCustomerFolder } from '@/lib/drive'
import { requireUser }          from '@/lib/supabaseServer'

/**
 * POST /api/drive/customer-folder  (ต้องล็อกอิน)
 * Body: { code, name }
 * Returns: { folderId }
 */
export async function POST(req) {
  const auth = await requireUser()
  if (auth.response) return auth.response
  try {
    const { code, name } = await req.json()
    if (typeof code !== 'string' || typeof name !== 'string' || !code.trim() || !name.trim()) {
      return NextResponse.json({ error: 'code and name required' }, { status: 400 })
    }
    if (code.length > 40 || name.length > 200) {
      return NextResponse.json({ error: 'ชื่อยาวเกินไป' }, { status: 400 })
    }
    const folderId = await createCustomerFolder(code.trim(), name.trim())
    return NextResponse.json({ folderId })
  } catch (err) {
    console.error('[drive/customer-folder]', err)
    return NextResponse.json({ error: 'สร้างโฟลเดอร์ไม่สำเร็จ' }, { status: 500 })
  }
}
