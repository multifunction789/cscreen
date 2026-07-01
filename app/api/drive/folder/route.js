import { NextResponse }          from 'next/server'
import { createCustomerFolder } from '@/lib/drive'

/**
 * POST /api/drive/folder  (legacy — redirect to customer-folder logic)
 * Body: { jobCode, customerName }
 */
export async function POST(req) {
  try {
    const { jobCode, customerName } = await req.json()
    if (!customerName) {
      return NextResponse.json({ error: 'customerName required' }, { status: 400 })
    }
    const folderId = await createCustomerFolder(jobCode || 'JO', customerName)
    return NextResponse.json({
      jobFolderId:    folderId,
      artworkFolderId: folderId,
      mockupFolderId:  folderId,
      finishFolderId:  folderId,
    })
  } catch (err) {
    console.error('[drive/folder]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
