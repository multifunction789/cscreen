// ใบงาน Supplier / PO — ค่าคงที่และตัวช่วยที่ใช้ร่วมกัน
import { DEFAULT_SIZES } from '@/lib/jobV2'

/** ประเภท PO: unit = หน่วยคิดเงิน, spec = ป้ายของช่องรายละเอียดในแต่ละแถว */
export const PO_TYPES = [
  { key: 'dft',         label: 'ส่ง DFT',               unit: 'เมตร', desc: 'ลาย / ตำแหน่ง', spec: 'ขนาดลาย (กว้าง × สูง ซม.)' },
  { key: 'uv_dft',      label: 'ส่ง UV DFT',            unit: 'เมตร', desc: 'ลาย / ตำแหน่ง', spec: 'ขนาดลาย / วัสดุที่ติด' },
  { key: 'sublimation', label: 'ส่งผลิตเสื้อพิมพ์ลาย',  unit: 'ชิ้น', desc: 'แบบเสื้อ / ลาย', spec: 'ผ้า / ทรง / คอ' },
  { key: 'ready_made',  label: 'สั่งซื้อสำเร็จ',         unit: 'ชิ้น', desc: 'สินค้า / รุ่น',  spec: 'ยี่ห้อ / สี' },
  { key: 'embroidery',  label: 'ส่งปัก',                unit: 'ชิ้น', desc: 'ลาย / ตำแหน่ง', spec: 'ขนาด / สีด้าย' },
  { key: 'sewing',      label: 'ส่ง ตัด-เย็บ',          unit: 'ชิ้น', desc: 'แบบเสื้อ',      spec: 'ผ้า / สี / คอ / แขน' },
  { key: 'screen',      label: 'ส่งสกรีน',              unit: 'ชิ้น', desc: 'ลาย / ตำแหน่ง', spec: 'ขนาด / จำนวนสี' },
  { key: 'dtg',         label: 'ส่ง DTG',               unit: 'ชิ้น', desc: 'ลาย / ตำแหน่ง', spec: 'ขนาดลาย / สีเสื้อ' },
]
export const poType = key => PO_TYPES.find(t => t.key === key) || PO_TYPES[0]
export const isMeter = key => poType(key).unit === 'เมตร'

export const PO_STATUSES = [
  { id: 'ร่าง',        cls: 'badge-gray' },
  { id: 'ส่งแล้ว',     cls: 'badge-yellow' },
  { id: 'กำลังผลิต',   cls: 'badge-blue' },
  { id: 'รับของแล้ว',  cls: 'badge-cyan' },
  { id: 'มีปัญหา',     cls: 'badge-red' },
  { id: 'ปิดแล้ว',     cls: 'badge-green' },
  { id: 'ยกเลิก',      cls: 'badge-gray' },
]
export const OPEN_STATUSES = new Set(['ร่าง', 'ส่งแล้ว', 'กำลังผลิต', 'รับของแล้ว', 'มีปัญหา'])
export const statusClass = s => PO_STATUSES.find(x => x.id === s)?.cls || 'badge-gray'

/** ไซซ์และจำนวนของใบงาน (ใบงานแบบใหม่: items.qtys, แบบเดิม: รวมทุกแถวของ size matrix) */
export function jobSizes(job) {
  const it = job?.items || {}
  let qtys = {}
  if (it.type === 'job_v2') qtys = it.qtys || {}
  else if (Array.isArray(it.rows)) {
    for (const r of it.rows) for (const [s, v] of Object.entries(r.qtys || {})) qtys[s] = (Number(qtys[s]) || 0) + (Number(v) || 0)
  }
  const used = Object.keys(qtys).filter(s => Number(qtys[s]) > 0)
  const order = [...DEFAULT_SIZES.filter(s => used.includes(s)), ...used.filter(s => !DEFAULT_SIZES.includes(s))]
  return order.map(s => ({ size: s, qty: Number(qtys[s]) || 0 }))
}

export const sumSizes = sizes => Object.values(sizes || {}).reduce((a, v) => a + (Number(v) || 0), 0)
export const sizesText = sizes => Object.entries(sizes || {}).filter(([, v]) => Number(v) > 0).map(([s, v]) => `${s} ${v}`).join(' · ')

/** ประมาณความยาวฟิล์ม (เมตร) จาก "กว้าง × สูง" ซม. × จำนวน บนหน้ากว้างฟิล์ม (+ระยะห่าง 1 ซม.) */
export function estimateMeters(spec, qty, filmWidthCm) {
  const m = /(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i.exec(spec || '')
  const width = Number(filmWidthCm) || 0
  if (!m || !qty || !width) return null
  const w = Number(m[1]) + 1, h = Number(m[2]) + 1
  const perRow = Math.max(1, Math.floor(width / w))
  const rows = Math.ceil(qty / perRow)
  return Math.round((rows * h) / 100 * 100) / 100
}

/** ยอดรวม PO ที่คำนวณได้ (เมตร: เมตรรวม × ราคา, ชิ้น: จำนวนรวม × ราคา) */
export function computedTotal(po, lines) {
  const price = Number(po.unit_price) || 0
  if (isMeter(po.po_type)) return Math.round((Number(po.total_meters) || 0) * price * 100) / 100
  return Math.round(lines.reduce((s, l) => s + (Number(l.qty) || 0), 0) * price * 100) / 100
}

export const baht = n => '฿' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
export const thMonthNow = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7)
