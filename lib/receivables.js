// ลูกหนี้ค้างชำระ — คำนวณจากใบแจ้งหนี้ ใบเสร็จ และใบงาน (ไม่ต้องเพิ่มคอลัมน์ในฐานข้อมูล)
import { daysUntil, DONE_STATUS } from './jobStatus'

const PRIORITY = { delivered: 0, overdue: 1, receipt: 2, nojob: 3, producing: 4 }

/**
 * @returns {{ items: Array, total: number, deliveredUnpaid: number }}
 *   items: [{ invoice, outstanding, paid, deposit, ageDays, job, flag: {key, text, tone} }]
 */
export function computeReceivables(invoices = [], receipts = [], jobs = []) {
  const paidBy = {}, unpaidRec = {}
  for (const r of receipts) {
    if (!r.invoice_id) continue
    if (r.paid) paidBy[r.invoice_id] = (paidBy[r.invoice_id] || 0) + (Number(r.total) || 0)
    else unpaidRec[r.invoice_id] = r
  }
  const jobBy = {}
  for (const j of jobs) if (j.invoice_id && !jobBy[j.invoice_id]) jobBy[j.invoice_id] = j

  const items = []
  for (const inv of invoices) {
    const total = Number(inv.total) || 0
    const paid = paidBy[inv.id] || 0
    const outstanding = Math.round((total - paid) * 100) / 100
    if (outstanding <= 0.5) continue

    const job = jobBy[inv.id] || null
    const issued = inv.document_date || inv.created_at
    const ageDays = issued ? -(daysUntil(String(issued).slice(0, 10)) ?? 0) : 0
    const dueIn = daysUntil(inv.due_date)
    const deposit = Number(inv.deposit_amount) > 0
      ? Number(inv.deposit_amount)
      : total * (Number(inv.deposit_pct) || 0) / 100

    let flag
    if (job?.status === DONE_STATUS)  flag = { key: 'delivered', text: 'ส่งงานแล้ว ยังไม่ได้เงิน', tone: 'danger' }
    else if (dueIn !== null && dueIn < 0) flag = { key: 'overdue', text: `เลยกำหนดชำระ ${-dueIn} วัน`, tone: 'danger' }
    else if (unpaidRec[inv.id])       flag = { key: 'receipt', text: `ออก ${unpaidRec[inv.id].code} แล้ว รอยืนยันรับเงิน`, tone: 'warning' }
    else if (!job)                    flag = { key: 'nojob', text: 'ยังไม่เปิดใบงาน', tone: 'warning' }
    else                              flag = { key: 'producing', text: job.status, tone: 'muted' }

    items.push({ invoice: inv, outstanding, paid, deposit, ageDays, job, flag })
  }

  items.sort((a, b) => (PRIORITY[a.flag.key] - PRIORITY[b.flag.key]) || (b.ageDays - a.ageDays))
  return {
    items,
    total: items.reduce((s, x) => s + x.outstanding, 0),
    deliveredUnpaid: items.filter(x => x.flag.key === 'delivered').length,
  }
}
