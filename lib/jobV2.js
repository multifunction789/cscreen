// ใบงานแบบใหม่ (v2): 1 ใบงานครอบคลุมได้หลายรายการใน Invoice (ค่าเริ่มต้น = ทุกรายการ) — แต่ละรายการคือ 1 "สี/แบบ" (variant)
// ใบงาน v2 รุ่นแรกที่มี 1 รายการต่อ 1 ใบ ยังอ่านได้ผ่าน jobVariants()
// ข้อมูลหลักเก็บใน job_orders.items (jsonb, type: 'job_v2') — ใบงานเก่า (type: 'size_matrix') ไม่ถูกแตะ
// แผนการผลิต / ประวัติ / ไฟล์ อยู่ในตาราง job_steps, job_step_logs, job_attachments

import { SIZES } from './sizes.js'
export const DEFAULT_SIZES = SIZES

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

/* ── สร้างข้อมูลใบงานจากรายการใน Invoice (คัดลอก ไม่ผูกกลับ) ───────
 * itemNos = รายการที่ใบงานนี้ครอบคลุม (เริ่มที่ 1) — ส่งตัวเลขเดียวก็ได้ (แบบเดิม) */
export function buildFromInvoice(inv, itemNos, customer = {}) {
  const items = Array.isArray(inv.items) ? inv.items : []
  const nos = (Array.isArray(itemNos) ? itemNos : [itemNos]).filter(n => items[n - 1]).sort((a, b) => a - b)
  const picked = nos.map(n => ({ n, it: items[n - 1] || {} }))
  const used = new Set()
  picked.forEach(({ it }) => Object.keys(it.sizes || {}).forEach(s => { if (Number(it.sizes[s]) > 0) used.add(s) }))
  const sizes = used.size ? orderSizes([...used]) : DEFAULT_SIZES.slice(1, 7)
  const variants = picked.map(({ n, it }) => ({
    id: rid(), item_no: n, name: it.desc || `รายการที่ ${n}`, color: '',
    inv_qty: Number(it.qty) || sizeTotal(it.sizes),
    qtys: Object.fromEntries(sizes.map(s => [s, Number(it.sizes?.[s]) > 0 ? String(it.sizes[s]) : ''])),
  }))
  const first = picked[0]?.it || {}
  const p = first.production || {}
  const deco = (p.technique || p.print_position || p.print_size)
    ? [{ id: rid(), name: '', technique: p.technique || '', position: p.print_position || '', size_in: '', placement: '', placement_note: '', colors: p.screen_color || '', image_url: '' }]
    : []
  const totalInv = variants.reduce((t, v) => t + (v.inv_qty || 0), 0)
  return {
    type: 'job_v2',
    source: {
      invoice_code: inv.code || '', invoice_date: inv.document_date || inv.created_at || null,
      item_no: nos[0] || null, item_nos: nos, item_count: items.length,
    },
    product: { name: variants.length === 1 ? variants[0].name : commonName(variants.map(v => v.name)) || first.desc || '', qty: totalInv },
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
    variants,
    ...aggregateSizes(sizes, variants),
    sew_note: '',
    decorations: deco,
    qc: {},
    delivery: { date: '', channel: '', tracking: '' },
  }
}

/** ชื่อร่วมของหลายรายการ เช่น "เสื้อยืด Cotton 32 สีดำ", "เสื้อยืด Cotton 32 สีขาว" → "เสื้อยืด Cotton 32" */
function commonName(names) {
  if (names.length < 2) return names[0] || ''
  let p = names[0]
  for (const n of names.slice(1)) { let i = 0; while (i < p.length && p[i] === n[i]) i++; p = p.slice(0, i) }
  if (names.every(n => n.length === p.length || /\s/.test(n[p.length]))) return p.trim()
  return p.slice(0, p.lastIndexOf(' ')).trim()
}

/** เรียงไซซ์ตามลำดับมาตรฐาน ไซซ์ที่ไม่รู้จักต่อท้าย */
export function orderSizes(list) {
  const set = [...new Set(list.filter(Boolean))]
  return [...DEFAULT_SIZES.filter(s => set.includes(s)), ...set.filter(s => !DEFAULT_SIZES.includes(s))]
}

/** รายการ (สี/แบบ) ของใบงาน — ใบงาน v2 รุ่นแรก (ไม่มี variants) แปลงเป็น 1 รายการ */
export function jobVariants(d = {}) {
  if (Array.isArray(d.variants) && d.variants.length) return d.variants
  const src = d.source || {}
  return [{
    id: 'v1', item_no: src.item_no || null, name: d.product?.name || '', color: d.spec?.color || '',
    inv_qty: Number(d.product?.qty) || 0, qtys: { ...(d.qtys || {}) },
  }]
}

/** ไซซ์ / จำนวนรวมทุกรายการ — เขียนเก็บไว้ที่ d.sizes, d.qtys ให้หน้ารายการ/รายงานเดิมใช้ต่อได้ */
export function aggregateSizes(sizes, variants) {
  const qtys = {}
  sizes.forEach(s => {
    const n = variants.reduce((t, v) => t + (parseInt(v.qtys?.[s]) || 0), 0)
    qtys[s] = n ? String(n) : ''
  })
  return { sizes: [...sizes], qtys }
}

/** รายการใน Invoice ที่ใบงานนี้ครอบคลุม */
export function jobItemNos(job) {
  const src = job?.items?.source || {}
  if (Array.isArray(src.item_nos) && src.item_nos.length) return src.item_nos
  return job?.invoice_item_no ? [job.invoice_item_no] : (src.item_no ? [src.item_no] : [])
}

/** ข้อความอ้างอิงรายการ เช่น "รายการ 1–2 จาก 2" */
export function itemNosLabel(src = {}) {
  const nos = Array.isArray(src.item_nos) && src.item_nos.length ? src.item_nos : (src.item_no ? [src.item_no] : [])
  if (!nos.length) return ''
  const contiguous = nos.every((n, i) => i === 0 || n === nos[i - 1] + 1)
  const txt = nos.length === 1 ? `${nos[0]}` : contiguous ? `${nos[0]}–${nos.at(-1)}` : nos.join(', ')
  return `รายการ ${txt}${src.item_count ? ` จาก ${src.item_count}` : ''}`
}

/** ด้านของรูป Mockup ต่อรายการ: รายการแรกใช้ 'front' / 'back' (เข้ากันกับใบงานเดิม) รายการถัดไป 'front-2', 'back-2', … */
export const mockSide = (face, idx) => (idx ? `${face}-${idx + 1}` : face)
export const sideLabel = side => {
  const m = /^(front|back)(?:-(\d+))?$/.exec(side || '')
  if (!m) return ''
  return `${m[1] === 'front' ? 'หน้า' : 'หลัง'}${m[2] ? ` · สีที่ ${m[2]}` : ''}`
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
  // สถานะใบงาน = ขั้นแรกที่ยังไม่เสร็จตามลำดับแผนการผลิต (เช่น "รอออกแบบ", "กำลัง DTF")
  return { ...base, key: 'active', label: stageLabel(current), tone: statusCls(current.status) === 'wait' ? 'wait' : statusCls(current.status), phase, step: current, stage: stepKey(current.name), fix: fix || null, phases }
}

const latin = name => (/^[A-Za-z0-9]/.test(name) ? ' ' : '')
/** ชื่อขั้นตอนแบบเทียบกันได้ (ตัดช่องว่าง / ตัวพิมพ์) */
export const stepKey = name => String(name || '').trim().replace(/\s+/g, ' ')
/** ข้อความสถานะใบงานจากขั้นปัจจุบัน */
export function stageLabel(step) {
  const n = stepKey(step?.name) || 'ขั้นตอน'
  switch (statusCls(step?.status)) {
    case 'sent':  return `${n} · ส่ง Supplier แล้ว`
    case 'doing': return `กำลัง${latin(n)}${n}`
    case 'check': return `${n} · รอตรวจ`
    case 'fix':   return `${n} · ต้องแก้ไข`
    default:      return `รอ${latin(n)}${n}`
  }
}
/** ชื่อขั้นตอนที่ยังไม่เสร็จ (ไม่นับที่ยกเลิก) */
export function pendingStepKeys(steps = []) {
  return new Set(steps.filter(s => !CLOSED.has(s.status)).map(s => stepKey(s.name)))
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
/** เดิมเป็นแบบยาว (28 ต.ค. 2569) — ทั้งเว็บใช้ DD/MM/YYYY แล้ว จึงคืนรูปแบบเดียวกับ thDate */
export const thDateLong = d => thDate(d)
