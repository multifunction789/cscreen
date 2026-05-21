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

// ── MATERIALS (Stock) ──────────────────────────────────────
export const getMaterials = () =>
  supabase.from('materials').select('*').order('code')

export const updateMaterialQty = (id, qty) =>
  supabase.from('materials').update({ qty }).eq('id', id)

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

export const getJobOrdersByStatus = (status) =>
  supabase
    .from('job_orders')
    .select('*, customers(name)')
    .eq('status', status)
    .order('due_date')

export const updateJobStatus = (id, status) =>
  supabase.from('job_orders').update({ status }).eq('id', id)

export const updateJobOrder = (id, data) =>
  supabase.from('job_orders').update(data).eq('id', id)

export const deleteJobOrder = (id) =>
  supabase.from('job_orders').delete().eq('id', id)

export const insertJobOrder = (data) =>
  supabase.from('job_orders').insert(data).select().single()

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

// ── RECEIPTS ───────────────────────────────────────────────
export const getReceipts = () =>
  supabase
    .from('receipts')
    .select('*, customers(name,address,phone,tax_id), invoices(code,wht_pct,wht_amount,items,subtotal,vat_pct,vat_amount,discount)')
    .order('created_at', { ascending: false })

// ── TRANSACTIONS ───────────────────────────────────────────
export const getTransactions = () =>
  supabase
    .from('transactions')
    .select('*, invoices(code, wht_pct, wht_amount, customers(name))')
    .order('transaction_date', { ascending: false })

export const insertTransaction = (data) =>
  supabase.from('transactions').insert(data).select().single()

// ── INVOICES ───────────────────────────────────────────────
export const getInvoices = () =>
  supabase.from('invoices').select('*, customers(name), quotations(code)').order('created_at', { ascending: false })

export const getInvoiceById = (id) =>
  supabase.from('invoices').select('*, customers(*), quotations(code)').eq('id', id).single()

export const insertInvoice = (data) =>
  supabase.from('invoices').insert(data).select('*, customers(name)').single()

export const updateInvoice = (id, data) =>
  supabase.from('invoices').update(data).eq('id', id).select().single()

export const deleteInvoice = (id) =>
  supabase.from('invoices').delete().eq('id', id)

// ── RECEIPTS (insert) ──────────────────────────────────────
export const insertReceipt = (data) =>
  supabase.from('receipts').insert(data).select().single()

export const updateReceipt = (id, data) =>
  supabase.from('receipts').update(data).eq('id', id)

// ── PAYMENTS ───────────────────────────────────────────────
export const getPayments = () =>
  supabase.from('payments').select('*').order('payment_date', { ascending: false })

export const getPaymentsByInvoice = (invoiceId) =>
  supabase.from('payments').select('*').eq('invoice_id', invoiceId).order('payment_date')

export const insertPayment = (data) =>
  supabase.from('payments').insert(data).select().single()

export const deletePayment = (id) =>
  supabase.from('payments').delete().eq('id', id)

// ── SETTINGS ───────────────────────────────────────────────
export const getSetting = (key) =>
  supabase.from('settings').select('value').eq('key', key).single()

export const upsertSetting = (key, value) =>
  supabase.from('settings').upsert({ key, value })

// ── COST ITEMS ─────────────────────────────────────────────
export const getCostItems = () =>
  supabase
    .from('cost_items')
    .select('*, suppliers(name)')
    .order('item_name')

export const insertCostItem = (data) =>
  supabase.from('cost_items').insert(data).select('*, suppliers(name)').single()

export const updateCostItem = (id, data) =>
  supabase.from('cost_items').update(data).eq('id', id)

export const deleteCostItem = (id) =>
  supabase.from('cost_items').delete().eq('id', id)

// ── MATERIAL DEDUCT ────────────────────────────────────────
export const deductMaterial = async (id, deductQty) => {
  const { data } = await supabase.from('materials').select('qty').eq('id', id).single()
  const newQty = Math.max(0, (data?.qty || 0) - deductQty)
  return supabase.from('materials').update({ qty: newQty }).eq('id', id)
}

// ── DASHBOARD aggregates ───────────────────────────────────
export const getDashboardStats = async () => {
  const [txRes, jobRes] = await Promise.all([
    supabase.from('transactions').select('type, amount'),
    supabase.from('job_orders').select('status, total'),
  ])
  const tx   = txRes.data  || []
  const jobs = jobRes.data || []

  const totalIn  = tx.filter(t => t.type === 'รายรับ').reduce((s, t) => s + t.amount, 0)
  const totalOut = tx.filter(t => t.type === 'รายจ่าย').reduce((s, t) => s + t.amount, 0)
  const overdue  = jobs.filter(j => j.status === 'เลยกำหนด').length
  const activeJobs = jobs.filter(j => j.status !== 'ส่งงานแล้ว').length

  return { totalIn, totalOut, profit: totalIn - totalOut, activeJobs, overdue }
}
