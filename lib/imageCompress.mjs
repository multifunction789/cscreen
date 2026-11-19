/**
 * ย่อรูปก่อนอัปโหลด — รูปจากมือถือมัก 3–12 MB ทำให้หน้าใบแจ้งหนี้ / ใบงาน / หน้าพิมพ์โหลดช้า
 * ด้านยาวสุดไม่เกิน 1600px แปลงเป็น WebP (เก็บพื้นโปร่งใสของ PNG ได้) คุณภาพ 0.85 → ปกติเหลือ 100–400 KB
 * ถ้าย่อไม่ได้ (เบราว์เซอร์เก่า / ไม่ใช่รูป) หรือย่อแล้วไม่เล็กลง จะคืนไฟล์เดิม
 */
export async function compressImage(file, { maxSide = 1600, quality = 0.85 } = {}) {
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) return file
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h)
    bmp.close?.()
    const blob = await new Promise(res => canvas.toBlob(res, 'image/webp', quality))
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return file
    const base = (file.name || 'image').replace(/\.[^.]+$/, '')
    return new File([blob], `${base}.webp`, { type: 'image/webp' })
  } catch {
    return file
  }
}
