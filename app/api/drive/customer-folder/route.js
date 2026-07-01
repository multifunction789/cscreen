import { NextResponse }          from 'next/server'
import { createCustomerFolder } from '@/lib/drive'

/**
 * POST /api/drive/customer-folder
 * Body: { code, name }
 * Returns: { folderId }
 */
export async function POST(req) {
  try {
    const { code, name } = await req.json()
    if (!code || !name) {
      return NextResponse.json({ error: 'code and name required' }, { status: 400 })
    }
    const folderId = await createCustomerFolder(code, name)
    return NextResponse.json({ folderId })
  } catch (err) {
    console.error('[drive/customer-folder]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
