import { NextResponse } from 'next/server'
import { createJobFolders } from '@/lib/drive'

/**
 * POST /api/drive/folder
 * Body: { jobCode, customerName }
 * Returns: { jobFolderId, artworkFolderId, mockupFolderId, finishFolderId }
 */
export async function POST(req) {
  try {
    const { jobCode, customerName } = await req.json()
    if (!jobCode || !customerName) {
      return NextResponse.json({ error: 'jobCode and customerName required' }, { status: 400 })
    }

    const folders = await createJobFolders(jobCode, customerName)
    return NextResponse.json(folders)
  } catch (err) {
    console.error('[drive/folder]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
