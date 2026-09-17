export const PRODUCTION_FIELDS = [
  ['neck_type', 'แบบคอ', 'คอกลม / คอวี / คอปก'],
  ['fabric_type', 'ชนิดผ้า', 'Cotton / TC / CVC / Drytech'],
  ['shirt_color', 'สีเสื้อ', 'สี / รหัสสี'],
  ['sleeve_type', 'แขน', 'สั้น / ยาว / จั๊ม'],
  ['fit_type', 'ทรง', 'ปกติ / เข้ารูป / Oversize'],
  ['technique', 'เทคนิค', 'สกรีน / DTF / ปัก'],
  ['print_position', 'ตำแหน่งลาย', 'หน้า / หลัง / แขน'],
  ['print_size', 'ขนาดลาย', 'กว้าง × สูง (ซม.)'],
  ['screen_color', 'สีลาย', 'สี / จำนวนสี'],
]

export function productionSnapshot(document, defaultSizes) {
  const items = Array.isArray(document.items) ? document.items : []
  const used = [...new Set(items.flatMap(it => Object.keys(it.sizes || {}).filter(s => Number(it.sizes[s]) > 0)))]
  const sizes = used.length ? [...defaultSizes.filter(s => used.includes(s)), ...used.filter(s => !defaultSizes.includes(s))] : [...defaultSizes]
  const rows = items.map(it => ({
    style: it.desc || '',
    qtys: Object.fromEntries(sizes.map(s => [s, it.sizes?.[s] ? String(it.sizes[s]) : ''])),
    ordered_qty: Number(it.qty) || 0,
    production: structuredClone(it.production || {}),
    supplier_id: '', supplier_name: '',
  }))
  return { type: 'size_matrix', sizes, rows, source_snapshot: {
    document_id: document.id, code: document.code, quotation_id: document.quotation_id || null,
    items: structuredClone(items),
  } }
}

export async function uploadJobImage(client, bucket, file) {
  if (!file) throw new Error('ไม่พบไฟล์รูป')
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('กรุณาใช้รูป JPG, PNG หรือ WebP')
  if (file.size > 10 * 1024 * 1024) throw new Error('รูปต้องมีขนาดไม่เกิน 10 MB')
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type]
  const path = `${crypto.randomUUID()}.${ext}`
  const { error } = await client.storage.from(bucket).upload(path, file, { upsert: false })
  if (error) throw new Error(`อัปโหลดรูปไม่สำเร็จ: ${error.message}`)
  const { data } = client.storage.from(bucket).getPublicUrl(path)
  if (!data?.publicUrl) throw new Error('ไม่พบที่อยู่รูปที่อัปโหลด')
  return data.publicUrl
}
