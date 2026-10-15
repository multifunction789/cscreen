'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { DOC_TYPES, docHref } from '@/lib/docLinks'

/**
 * แถบเส้นทางเอกสาร: ใบเสนอราคา → ใบแจ้งหนี้ → ใบงาน → ใบเสร็จ
 * ส่งเอกสารที่กำลังดูอยู่มาอันเดียว แล้ว component จะหาเอกสารที่เชื่อมกันเอง
 *
 *   <DocChain current="invoice" doc={view} version={`${jobs.length}:${receipts.length}`} />
 *   (version เปลี่ยน → โหลดเส้นทางใหม่ เช่น หลังสร้างใบงาน/ใบเสร็จ)
 */
const STEPS = ['quotation', 'invoice', 'joborder', 'receipt']

async function resolveChain(current, doc) {
  // 1) หา invoice_id ที่เป็นแกนกลางของเส้นทาง
  let invoiceId = null
  if (current === 'invoice') invoiceId = doc.id
  else if (current === 'joborder' || current === 'receipt') invoiceId = doc.invoice_id || null
  else if (current === 'quotation') {
    const { data } = await supabase.from('invoices').select('id').eq('quotation_id', doc.id).limit(1)
    invoiceId = data?.[0]?.id || null
  }

  const chain = { quotation: null, invoice: null, joborder: [], receipt: [] }
  if (current === 'quotation') chain.quotation = doc

  if (!invoiceId) {
    if (current === 'joborder') chain.joborder = [doc]
    if (current === 'receipt')  chain.receipt  = [doc]
    return chain
  }

  const [inv, jos, recs] = await Promise.all([
    supabase.from('invoices').select('id, code, total, quotation_id').eq('id', invoiceId).maybeSingle(),
    supabase.from('job_orders').select('id, code, status').eq('invoice_id', invoiceId).order('created_at'),
    supabase.from('receipts').select('id, code, paid, total').eq('invoice_id', invoiceId).order('created_at'),
  ])
  chain.invoice  = inv.data || null
  chain.joborder = jos.data || []
  chain.receipt  = recs.data || []

  const qid = chain.invoice?.quotation_id
  if (qid && !chain.quotation) {
    const { data } = await supabase.from('quotations').select('id, code, status').eq('id', qid).maybeSingle()
    chain.quotation = data || null
  }
  return chain
}

function stepStatus(type, items) {
  if (!items.length) return null
  if (type === 'receipt') {
    const allPaid = items.every(r => r.paid)
    return { text: allPaid ? 'ชำระแล้ว' : 'รอรับเงิน', tone: allPaid ? 'ok' : 'wait' }
  }
  if (type === 'joborder') {
    const s = items[items.length - 1].status
    return { text: s, tone: s === 'ส่งงานแล้ว' ? 'ok' : 'wait' }
  }
  if (type === 'quotation') return items[0].status ? { text: items[0].status, tone: 'muted' } : null
  return null
}

export default function DocChain({ current, doc, version = '' }) {
  const [chain, setChain] = useState(null)
  const docId = doc?.id
  const linkKey = `${doc?.invoice_id || ''}`

  useEffect(() => {
    if (!docId) return
    let alive = true
    resolveChain(current, doc)
      .then(c => { if (alive) setChain(c) })
      .catch(() => { if (alive) setChain(null) })
    return () => { alive = false }
  }, [current, docId, linkKey, version]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!doc) return null

  return (
    <nav className="doc-chain no-print" aria-label="เส้นทางเอกสาร">
      {STEPS.map((type, i) => {
        const t = DOC_TYPES[type]
        const raw = chain?.[type]
        const items = Array.isArray(raw) ? raw : raw ? [raw] : []
        const isCurrent = type === current
        const st = stepStatus(type, items)
        return (
          <div key={type} className="doc-chain-item">
            {i > 0 && <span className="doc-chain-arrow" aria-hidden>›</span>}
            <div className={`doc-chain-step${isCurrent ? ' current' : ''}${items.length ? ' has' : ''}`}>
              <span className="doc-chain-label">{t.icon} {t.label}</span>
              {!chain ? (
                <span className="doc-chain-code muted">…</span>
              ) : items.length === 0 ? (
                <span className="doc-chain-code muted">ยังไม่มี</span>
              ) : (
                <span className="doc-chain-codes">
                  {items.map(it => (isCurrent && it.id === doc.id) ? (
                    <span key={it.id} className="doc-chain-code">{it.code}</span>
                  ) : (
                    <Link key={it.id} href={docHref(type, it.id)} className="doc-chain-code link">{it.code}</Link>
                  ))}
                </span>
              )}
              {st && <span className={`doc-chain-status ${st.tone}`}>{st.text}</span>}
            </div>
          </div>
        )
      })}
    </nav>
  )
}
