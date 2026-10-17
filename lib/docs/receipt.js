// Receipt content (pure) — shared by the send route and tests.
/** what this receipt says about the invoice, as of when it was paid (later payments do not change it) */
export function receiptSnapshot({ shop, receipt: r, invoice: inv, customer: c, others, submission, receivedBy }) {
  const at = x => `${x.paid_at || ''}|${x.created_at || ''}`
  const before = others.filter(x => x.id !== r.id && at(x) < at(r)).reduce((t, x) => t + Number(x.total), 0)
  const paidToDate = Math.round((before + Number(r.total)) * 100) / 100
  const balance = Math.max(Math.round((Number(inv.total) - paidToDate) * 100) / 100, 0)
  const label = before === 0 && balance > 0 ? 'รับชำระเงินมัดจำ' : balance === 0 ? (before === 0 ? 'รับชำระเงินเต็มจำนวน' : 'รับชำระเงินงวดสุดท้าย') : 'รับชำระเงินบางส่วน'
  return {
    shop, received_by: receivedBy || null, label,
    customer: { name: c?.name || '—', phone: c?.phone || null, address: c?.address || null, tax_id: c?.tax_id || null },
    receipt: { code: r.code, document_date: r.document_date, total: Number(r.total), payment_method: r.payment_method, paid_at: r.paid_at, bank_reference: submission?.bank_reference || null },
    invoice: { code: inv.code, total: Number(inv.total), paid_to_date: paidToDate, balance },
  }
}

