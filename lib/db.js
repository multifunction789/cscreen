import { supabase } from './supabase'

// ── CUSTOMERS ──────────────────────────────────────────────
export const getCustomers = () =>
  supabase.from('customers').select('*').order('created_at', { ascending: false })

export const insertCustomer = (data) =>
  supabase.from('customers').insert(data).select().single()

export const updateCustomer = (id, data) =>
  supabase.from('customers').update(data).eq('id', id)

// ── SUPPLIERS ──────────────────────────────────────────────
export const getSuppliers = () =>
  supabase.from('suppliers').select('*').order('created_at', { ascending: false })

export const insertSupplier = (data) =>
  supabase.from('suppliers').insert(data).select().single()

export const updateSupplier = (id, data) =>
  supabase.from('suppliers').update(data).eq('id', id)

// ── MATERIALS (Stock) ──────────────────────────────────────
export const getMaterials = () =>
  supabase.from('materials').select('*').order('code')

// ── STOCK IN ───────────────────────────────────────────────
export const getStockIn = () =>
  supabase
    .from('stock_in')
    .select('*, materials(name, unit), suppliers(name)')
    .order('received_at', { ascending: false })

export const insertStockIn = (data) =>
  supabase.from('stock_in').insert(data).select().single()

// ── JOB ORDERS ─────────────────────────────────────────────
export const getJobOrders = () =>
  supabase
    .from('job_orders')
    .select('*, customers(name), invoices(code)')
    .order('created_at', { ascending: false })

// หน้ารายการ: ไม่ดึงรูปเก่าที่เก็บเป็น base64 ใน items/image_url (บางใบหนักหลาย MB)
// ใช้ getJobOrder(id) ดึงตัวเต็มตอนเปิดดู/แก้ไข — แถวที่ได้จากตรงนี้มี __light: true
const JOB_LIST_COLS = [
  'id', 'code', 'customer_id', 'item_desc', 'status', 'total', 'deposit', 'due_date', 'note', 'created_at', 'qty', 'unit_price',
  'invoice_id', 'updated_at', 'document_date', 'design_detail', 'job_status', 'payment_status', 'artwork_status', 'production_status',
  'next_action', 'quotation_id', 'assigned_to', 'brand_id', 'created_by', 'is_urgent', 'artwork_due_date', 'problem_note',
  'invoice_item_no', 'urgent', 'drive_folder_id',
]
const JOB_ITEM_KEYS = ['type', 'sizes', 'rows', 'qtys', 'source', 'source_snapshot', 'customer', 'spec', 'product', 'delivery',
  'decorations', 'qc', 'production_note', 'fabric_type', 'shirt_color', 'screen_color', 'sew_note', 'design_detail', 'drive_folders', 'created_by_email']
export async function getJobOrdersList() {
  const sel = [...JOB_LIST_COLS, ...JOB_ITEM_KEYS.map(k => `i_${k}:items->${k}`), 'customers(name)', 'invoices(code)'].join(', ')
  const res = await supabase.from('job_orders').select(sel).order('created_at', { ascending: false })
  if (res.error || !res.data) return res
  const data = res.data.map(r => {
    const row = { __light: true }, items = {}
    let any = false
    for (const [k, v] of Object.entries(r)) {
      if (k.startsWith('i_')) { if (v !== null && v !== undefined) { items[k.slice(2)] = v; any = true } }
      else row[k] = v
    }
    row.items = any ? items : []
    return row
  })
  return { ...res, data }
}

export const getJobOrder = (id) =>
  supabase.from('job_orders').select('*, customers(name), invoices(code)').eq('id', id).single()

// lightweight version — ไม่ดึง items JSONB (ใช้สำหรับ dropdown/reference เท่านั้น)
export const getJobOrdersLight = () =>
  supabase
    .from('job_orders')
    .select('id, code, customer_id, invoice_id, invoice_item_no, status, item_desc, due_date, created_at, customers(name)')
    .order('created_at', { ascending: false })

export const insertJobOrder = (data) =>
  supabase.from('job_orders').insert(data).select().single()

// RLS ที่ไม่ให้สิทธิ์จะ "กรองแถวออก" แทนการ error → ต้องเช็กว่ามีแถวถูกแก้จริง ไม่งั้นหน้าเว็บบอกว่าบันทึกแล้วทั้งที่ไม่ได้บันทึก
async function mustTouch(q, what) {
  const res = await q.select('id')
  if (!res.error && !res.data?.length) return { ...res, error: { message: `${what}ไม่สำเร็จ: ไม่มีสิทธิ์ หรือไม่พบใบงานนี้` } }
  return res
}

export const updateJobOrder = (id, data) =>
  mustTouch(supabase.from('job_orders').update(data).eq('id', id), 'บันทึกใบงาน')

export const updateJobStatus = (id, status) =>
  mustTouch(supabase.from('job_orders').update({ status }).eq('id', id), 'เปลี่ยนสถานะ')

export const deleteJobOrder = (id) =>
  mustTouch(supabase.from('job_orders').delete().eq('id', id), 'ลบใบงาน')

// ── QUOTATIONS ─────────────────────────────────────────────
export const getQuotations = () =>
  supabase
    .from('quotations')
    .select('*, customers(name)')
    .order('created_at', { ascending: false })

export const insertQuotation = (data) =>
  supabase.from('quotations').insert(data).select().single()

export const updateQuotation = (id, data) =>
  supabase.from('quotations').update(data).eq('id', id)

export const deleteQuotation = (id) =>
  supabase.from('quotations').delete().eq('id', id)

// ── INVOICES ───────────────────────────────────────────────
export const getInvoices = () =>
  supabase.from('invoices').select('*, customers(name), quotations(code)').order('created_at', { ascending: false })

// สำหรับ Dashboard / ลูกหนี้ — ไม่ดึง items JSONB
export const getInvoicesLight = () =>
  supabase
    .from('invoices')
    .select('id, code, customer_id, total, deposit_pct, deposit_amount, due_date, document_date, created_at, customers(name)')
    .order('created_at', { ascending: false })

export const insertInvoice = (data) =>
  supabase.from('invoices').insert(data).select('*, customers(name)').single()

export const updateInvoice = (id, data) =>
  supabase.from('invoices').update(data).eq('id', id).select().single()

export const deleteInvoice = (id) =>
  supabase.from('invoices').delete().eq('id', id)

// ── RECEIPTS ───────────────────────────────────────────────
export const getReceipts = () =>
  supabase
    .from('receipts')
    .select('*, customers(name,address,phone,tax_id), invoices(code,wht_pct,wht_amount,items,subtotal,vat_pct,vat_amount,discount)')
    .order('created_at', { ascending: false })

export const getReceiptsLight = () =>
  supabase.from('receipts').select('id, code, invoice_id, total, paid')

export const insertReceipt = (data) =>
  supabase.from('receipts').insert(data).select().single()

export const updateReceipt = (id, data) =>
  supabase.from('receipts').update(data).eq('id', id)

export const deleteReceipt = (id) =>
  supabase.from('receipts').delete().eq('id', id)

// ── TRANSACTIONS ───────────────────────────────────────────
export const getTransactions = () =>
  supabase
    .from('transactions')
    .select('*, invoices(code, wht_pct, wht_amount, customers(name)), suppliers(name)')
    .order('transaction_date', { ascending: false })

export const insertTransaction = (data) =>
  supabase.from('transactions').insert(data).select().single()

export const updateTransaction = (id, data) =>
  supabase.from('transactions').update(data).eq('id', id)

export const deleteTransaction = (id) =>
  supabase.from('transactions').delete().eq('id', id)

// ── COST ITEMS ─────────────────────────────────────────────
export const getCostItems = () =>
  supabase
    .from('cost_items')
    .select('*, suppliers(name)')
    .order('item_name')

export const insertCostItem = (data) =>
  supabase.from('cost_items').insert(data).select('*, suppliers(name)').single()

export const deleteCostItem = (id) =>
  supabase.from('cost_items').delete().eq('id', id)

// ── SETTINGS ───────────────────────────────────────────────
export const getSetting = (key) =>
  supabase.from('settings').select('value').eq('key', key).single()

export const upsertSetting = (key, value) =>
  supabase.from('settings').upsert({ key, value })

// ── MATERIAL DEDUCT ────────────────────────────────────────
export const deductMaterial = async (id, deductQty) => {
  const { data } = await supabase.from('materials').select('qty').eq('id', id).single()
  const newQty = Math.max(0, (data?.qty || 0) - deductQty)
  return supabase.from('materials').update({ qty: newQty }).eq('id', id)
}

// ── ใบงานแบบใหม่: แผนการผลิต / ประวัติ / ไฟล์ ──────────────────
export const getJobSteps = (jobId) =>
  supabase.from('job_steps').select('*, suppliers(name)').eq('job_order_id', jobId).order('seq')

/** ขั้นตอนของหลายใบงาน (หน้าติดตามงาน) */
export const getStepsForJobs = (jobIds) =>
  jobIds.length
    ? supabase.from('job_steps').select('id, job_order_id, seq, name, phase, status, due_date, supplier_id, assignee, suppliers(name)').in('job_order_id', jobIds).order('seq')
    : Promise.resolve({ data: [], error: null })

export const insertJobStep = (data) =>
  supabase.from('job_steps').insert(data).select('*, suppliers(name)').single()

export const updateJobStep = (id, data) =>
  supabase.from('job_steps').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id).select('*, suppliers(name)').single()

export const deleteJobStep = (id) =>
  supabase.from('job_steps').delete().eq('id', id)

export const getJobLogs = (jobId) =>
  supabase.from('job_step_logs').select('*').eq('job_order_id', jobId).order('changed_at', { ascending: false }).limit(100)

export const insertJobLog = (data) =>
  supabase.from('job_step_logs').insert(data)

export const getJobFiles = (jobId) =>
  supabase.from('job_attachments').select('*').eq('job_order_id', jobId).order('created_at', { ascending: false })

export const insertJobFile = (data) =>
  supabase.from('job_attachments').insert(data).select().single()

export const updateJobFile = (id, data) =>
  supabase.from('job_attachments').update(data).eq('id', id)

export const deleteJobFile = (id) =>
  supabase.from('job_attachments').delete().eq('id', id)

/** อีเมลผู้ใช้ที่ล็อกอินอยู่ (ใช้บันทึกว่าใครแก้) */
export async function currentUserEmail() {
  const { data } = await supabase.auth.getUser()
  return data?.user?.email || 'ไม่ทราบผู้ใช้'
}
