// ใบงานแบบใหม่ (v2): 1 ใบงาน = 1 รายการใน Invoice
// ข้อมูลหลักเก็บใน job_orders.items (jsonb, type: 'job_v2') — ใบงานเก่า (type: 'size_matrix') ไม่ถูกแตะ
// แผนการผลิต / ประวัติ / ไฟล์ อยู่ในตาราง job_steps, job_step_logs, job_files

export const DEFAULT_SIZES = ['SS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL']

export const OPTIONS = {
  neck:   ['คอกลม', 'คอวี', 'คอโปโล', 'คอจีน', 'คอเชิ้ต', 'คอเต่า', 'ฮู้ด'],
  sleeve: ['แขนสั้น', 'แขนยาว', 'แขนสามส่วน', 'แขนกุด', 'แขนจั๊ม'],
  fabric: ['Cotton 100%', 'TC', 'CVC', 'จูติ (TK)', 'ไมโคร / ดรายเทค', 'สปอร์ตโพลี'],
  fit:    ['ปกติ', 'เข้ารูป (หญิง)', 'Oversize'],
}

export const SPEC_FIELDS = [
  { key: 'neck',    label: 'ทรงคอ',   options: OPTIONS.neck },
  { key: 'sleeve',  label: 'แขน',     options: OPTIONS.sleeve },
  { key: 'fabric',  label: 'เนื้อผ้า', options: OPTIONS.fabric },
  { key: 'fit',     label: 'ทรงเสื้อ', options: OPTIONS.fit },
  { key: 'color',   label: 'สีผ้า' },
  { key: 'buttons', label: 'กระดุม' },
  { key: 'label',   label: 'ป้ายคอ' },
]

export const TECHNIQUES = [
  'สกรีน Plastisol', 'สกรีนจม (Discharge)', 'สกรีนน้ำ', 'DTF', 'Sublimation', 'เฟล็กซ์ (Flex)',
  'ปักแบน', 'ปักนูน 3D', 'ปักตัวอักษร', 'อาร์มติด',
]

export const PHASES = ['ออกแบบ', 'จัดซื้อ', 'ผลิต', 'QC', 'ส่งมอบ']
export const QUICK_STEPS = ['ออกแบบ', 'สั่งผ้า', 'ตัดเย็บ', 'DTF', 'ปัก', 'Sublimation', 'สกรีน', 'QC', 'ส่งมอบ']

/** ช่วงการผลิตที่เดาจากชื่อขั้นตอน (ผู้ใช้เปลี่ยนเองได้) */
export function guessPhase(name = '') {
  const n = name.trim()
  if (/ออกแบบ|กราฟิก|artwork|mockup/i.test(n)) return 'ออกแบบ'
  if (/สั่ง|จัดซื้อ|ซื้อ/.test(n)) return 'จัดซื้อ'
  if (/^qc|ตรวจ/i.test(n)) return 'QC'
  if (/ส่งมอบ|จัดส่ง|ขนส่ง/.test(n)) return 'ส่งมอบ'
  return 'ผลิต'
}

export const STEP_STATUSES = [
  { id: 'รอเริ่ม',    cls: 'wait'  },
  { id: 'ส่งงานแล้ว', cls: 'sent'  },
  { id: 'กำลังผลิต',  cls: 'doing' },
  { id: 'รอตรวจ',     cls: 'check' },
  { id: 'ต้องแก้ไข',  cls: 'fix'   },
  { id: 'เสร็จแล้ว',  cls: 'done'  },
  { id: 'ยกเลิก',     cls: 'cancel' },
]
export const statusCls = s => STEP_STATUSES.find(x => x.id === s)?.cls || 'wait'
const CLOSED = new Set(['เสร็จแล้ว', 'ยกเลิก'])

export const FILE_KINDS = [
  { id: 'mockup',    label: 'Mockup' },
  { id: 'logo',      label: 'Logo' },
  { id: 'artwork',   label: 'Artwork' },
  { id: 'pattern',   label: 'Pattern' },
  { id: 'reference', label: 'รูปตัวอย่าง' },
  { id: 'finished',  label: 'รูปหลังผลิตเสร็จ' },
]
export const fileKindLabel = id => FILE_KINDS.find(k => k.id === id)?.label || id

export const QC_ITEMS = [
  { key: 'qty',    label: 'จำนวนครบ' },
  { key: 'sizes',  label: 'ไซส์ครบ' },
  { key: 'color',  label: 'สี / ตำแหน่งตรงแบบ' },
  { key: 'sewing', label: 'งานเย็บเรียบร้อย' },
  { key: 'photos', label: 'รูปหลังผลิตแนบแล้ว' },
]
export const DELIVERY_CHANNELS = ['ลูกค้ามารับเอง', 'ส่งเอง', 'ขนส่งเอกชน', 'ไปรษณีย์ไทย', 'Grab / Lalamove']

export const isV2 = job => job?.items?.type === 'job_v2'

/* ── เลขใบงาน: JO-<ชุด>-<ลำดับ> ─────────────────────────────────
 * Invoice เดียวกันใช้เลขชุดเดียวกัน: INV-0123 → JO-1024-01, JO-1024-02
 * ใบงานเก่า (JO-1023) ยังคงเลขเดิม และถูกนับรวมตอนหาเลขชุดถัดไป */
export function nextJobCodes(allJobs, invoiceId, count) {
  const parse = c => /^JO-(\d+)(?:-(\d+))?$/.exec(c || '')
  const sameInv = allJobs.filter(j => j.invoice_id === invoiceId && parse(j.code)?.[2])
  let group, start
  if (sameInv.length) {
    group = parse(sameInv[0].code)[1]
    start = Math.max(...sameInv.map(j => +parse(j.code)[2])) + 1
  } else {
    const maxGroup = allJobs.reduce((m, j) => Math.max(m, +(parse(j.code)?.[1] || 0)), 0)
    group = String(Math.max(maxGroup + 1, 1001)).padStart(4, '0')
    start = 1
  }
  return Array.from({ length: count }, (_, i) => `JO-${group}-${String(start + i).padStart(2, '0')}`)
}

/* ── สร้างข้อมูลใบงานจากรายการใน Invoice (คัดลอก ไม่ผูกกลับ) ─────── */
export function buildFromInvoice(inv, itemNo, customer = {}) {
  const items = Array.isArray(inv.items) ? inv.items : []
  const it = items[itemNo - 1] || {}
  const raw = it.sizes || {}
  const used = Object.keys(raw).filter(s => Number(raw[s]) > 0)
  const sizes = used.length
    ? [...DEFAULT_SIZES.filter(s => used.includes(s)), ...used.filter(s => !DEFAULT_SIZES.includes(s))]
    : DEFAULT_SIZES.slice(0, 7)
  const qtys = Object.fromEntries(sizes.map(s => [s, raw[s] ? String(raw[s]) : '']))
  const p = it.production || {}
  const deco = (p.technique || p.print_position || p.print_size)
    ? [{ id: rid(), technique: p.technique || '', position: p.print_position || '', size: p.print_size || '', colors: p.screen_color || '', image_url: '' }]
    : []
  return {
    type: 'job_v2',
    source: {
      invoice_code: inv.code || '', invoice_date: inv.document_date || inv.created_at || null,
      item_no: itemNo, item_count: items.length,
    },
    product: { name: it.desc || '', qty: Number(it.qty) || 0 },
    customer: {
      name: customer.name || inv.customers?.name || '',
      contact: customer.contact_person || customer.contact || '',
      phone: customer.phone || '', line: customer.line || '',
      address: customer.address || '',
    },
    spec: {
      neck: p.neck_type || '', sleeve: p.sleeve_type || '', fabric: p.fabric_type || '',
      fit: p.fit_type || '', color: p.shirt_color || '', buttons: '', label: '',
    },
    sizes, qtys,
    sew_note: '',
    decorations: deco,
    qc: {},
    delivery: { date: '', channel: '', tracking: '' },
  }
}

export const rid = () => Math.random().toString(36).slice(2, 10)
export const sizeTotal = qtys => Object.values(qtys || {}).reduce((s, v) => s + (parseInt(v) || 0), 0)

/* ── สถานะรวมจากแผนการผลิต ───────────────────────────────────────── */
export function computeOverall(steps = []) {
  const list = [...steps].sort((a, b) => (a.seq || 0) - (b.seq || 0))
  const active = list.filter(s => s.status !== 'ยกเลิก')
  const doneCount = active.filter(s => s.status === 'เสร็จแล้ว').length
  const base = { total: active.length, doneCount }
  if (!active.length) return { ...base, key: 'none', label: 'ยังไม่วางแผน', tone: 'wait', phase: null, phases: PHASES.map(p => ({ name: p, state: 'todo' })) }

  const current = active.find(s => !CLOSED.has(s.status))
  const fix = active.find(s => s.status === 'ต้องแก้ไข')
  const phases = PHASES.map(name => {
    const inPhase = active.filter(s => (s.phase || guessPhase(s.name)) === name)
    if (!inPhase.length) return { name, state: 'skip', done: 0, total: 0 }
    const done = inPhase.filter(s => s.status === 'เสร็จแล้ว').length
    const isNow = current && (current.phase || guessPhase(current.name)) === name
    return { name, state: done === inPhase.length ? 'done' : isNow ? 'now' : 'todo', done, total: inPhase.length }
  })

  if (!current) return { ...base, key: 'done', label: 'เสร็จแล้ว', tone: 'done', phase: 'ส่งมอบ', step: null, phases }
  const phase = current.phase || guessPhase(current.name)
  if (fix) return { ...base, key: 'fix', label: `ต้องแก้ไข · ${fix.name}`, tone: 'fix', phase, step: fix, phases }
  return { ...base, key: 'active', label: `${phase} · ${current.name}`, tone: statusCls(current.status) === 'wait' ? 'wait' : 'doing', phase, step: current, phases }
}

/** แปลงสถานะรวม → สถานะเดิมของระบบ (ให้บอร์ดติดตามงาน/Dashboard เดิมยังทำงาน) */
export function legacyStatus(overall) {
  if (overall.key === 'done') return 'ส่งงานแล้ว'
  return { 'ออกแบบ': 'รอออกแบบ', 'จัดซื้อ': 'สั่งของ', 'ผลิต': 'กำลังสกรีน', 'QC': 'แพ็คพร้อมส่ง', 'ส่งมอบ': 'แพ็คพร้อมส่ง' }[overall.phase] || 'รอออกแบบ'
}

/** ไฟล์ล่าสุดที่อนุมัติของแต่ละประเภท (ไม่มีอนุมัติ → ใช้เวอร์ชันล่าสุด) */
export function latestFile(files, kind, side) {
  const list = files.filter(f => f.kind === kind && (!side || f.side === side))
  const pick = arr => arr.sort((a, b) => (b.version - a.version) || String(b.created_at).localeCompare(String(a.created_at)))[0]
  return pick(list.filter(f => f.approved)) || pick(list) || null
}

/** วันที่ไทยแบบสั้น 2026-10-28 → 28/10/2569 */
export function thDate(d) {
  if (!d) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d))
  return m ? `${m[3]}/${m[2]}/${+m[1] + 543}` : ''
}
/** วันที่ไทยแบบยาว 2026-10-28 → 28 ต.ค. 2569 */
export function thDateLong(d) {
  if (!d) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d))
  if (!m) return ''
  const M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  return `${+m[3]} ${M[+m[2] - 1]} ${+m[1] + 543}`
}
