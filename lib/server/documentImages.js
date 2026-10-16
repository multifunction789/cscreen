// A stored PDF document → LINE image messages (one picture per page, max 4).
// Pictures sit next to the PDF in the private `documents` bucket and are given to LINE
// as long signed links (LINE copies the picture when the message is sent).
import { pdfToImages } from '@/lib/pdf/pdfImages'

const IMAGE_LINK_DAYS = 365

/**
 * @param db       service-role Supabase client
 * @param pdfPath  path in `documents`, e.g. quotations/QT-1017-v1.pdf
 * @param pdf      the PDF bytes if already in hand (otherwise downloaded)
 * @returns {Promise<{ pages: number, messages: object[] }>} LINE image messages
 */
export async function documentImageMessages(db, pdfPath, pdf) {
  if (!pdf) {
    const { data, error } = await db.storage.from('documents').download(pdfPath)
    if (error || !data) throw new Error('เปิดไฟล์ PDF เดิมไม่ได้')
    pdf = Buffer.from(await data.arrayBuffer())
  }
  const { pages, images } = pdfToImages(pdf)
  if (!images.length) throw new Error('PDF ไม่มีหน้าเอกสาร')
  const base = pdfPath.replace(/\.pdf$/i, '')
  const messages = []
  for (const [i, im] of images.entries()) {
    const full = `${base}-p${i + 1}.jpg`, small = `${base}-p${i + 1}-s.jpg`
    for (const [path, bytes] of [[full, im.full], [small, im.preview]]) {
      const up = await db.storage.from('documents').upload(path, bytes, { contentType: 'image/jpeg', upsert: true })
      if (up.error) throw new Error('เก็บรูปเอกสารไม่สำเร็จ: ' + up.error.message)
    }
    const links = await Promise.all([full, small].map(p => db.storage.from('documents').createSignedUrl(p, IMAGE_LINK_DAYS * 86400)))
    if (links.some(l => l.error || !l.data?.signedUrl)) throw new Error('สร้างลิงก์รูปเอกสารไม่สำเร็จ')
    messages.push({ type: 'image', originalContentUrl: links[0].data.signedUrl, previewImageUrl: links[1].data.signedUrl })
  }
  return { pages, messages }
}
