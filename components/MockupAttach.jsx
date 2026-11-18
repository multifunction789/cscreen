'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { uploadJobImage } from '@/lib/jobProduction.mjs'
import { docHref } from '@/lib/docLinks'
import { notify } from '@/lib/feedback'

/**
 * รูป Mockup 1 รูป ของใบแจ้งหนี้ (invoices.mockup_url)
 * ใบเสร็จใช้รูปเดียวกันของใบแจ้งหนี้ที่ผูกอยู่ · ใบงานที่สร้างจากใบแจ้งหนี้จะได้รูปนี้ไปด้วย
 */

/** ใบงานของใบแจ้งหนี้ — ใช้ทำลิงก์จากรูป Mockup ไปใบงาน */
export function useInvoiceJobs(invoiceId) {
  const [state, setState] = useState({ id: null, jobs: [] })
  useEffect(() => {
    if (!invoiceId) return
    let alive = true
    supabase.from('job_orders').select('id, code, invoice_item_no').eq('invoice_id', invoiceId).order('code')
      .then(({ data }) => { if (alive) setState({ id: invoiceId, jobs: data || [] }) })
    return () => { alive = false }
  }, [invoiceId])
  return invoiceId && state.id === invoiceId ? state.jobs : []
}

/** ปุ่มแนบ / เปลี่ยน / ลบรูป + ลิงก์ไปใบงาน (ไม่พิมพ์ออกเอกสาร) */
export function MockupPanel({ url, onChange, jobs = [], color = '#B80F0B', disabled = false }) {
  const [busy, setBusy] = useState(false)
  const input = useRef(null)

  async function pick(file) {
    if (!file) return
    setBusy(true)
    try {
      const u = await uploadJobImage(supabase, 'job-images', file)
      await onChange(u)
    } catch (e) { notify.error(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 12px', border: '1px dashed var(--border)', borderRadius: 10, background: 'var(--card)', fontSize: 13 }}>
      <b style={{ color }}>🖼️ Mockup</b>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" title="เปิดรูปเต็ม">
          <img src={url} alt="mockup" style={{ height: 48, width: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
        </a>
      ) : <span style={{ color: 'var(--text-muted)' }}>ยังไม่มีรูป</span>}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden
        onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
      <button type="button" className="btn btn-outline btn-sm" disabled={busy || disabled} onClick={() => input.current?.click()}>
        {busy ? 'กำลังอัปโหลด...' : url ? 'เปลี่ยนรูป' : '📎 แนบรูป'}
      </button>
      {url && !busy && (
        <button type="button" className="btn btn-outline btn-sm" disabled={disabled} style={{ color: '#B91C1C' }} onClick={() => onChange(null)}>ลบรูป</button>
      )}
      {jobs.length > 0 && (
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-muted)' }}>ใบงาน:</span>
          {jobs.map(j => (
            <Link key={j.id} href={docHref('joborder', j.id)} style={{ fontWeight: 700, color }}>📝 {j.code}</Link>
          ))}
        </span>
      )}
    </div>
  )
}

/** รูป Mockup ในตัวเอกสาร (พิมพ์ออกด้วย) — คลิกแล้วไปใบงาน ถ้ามีใบงานเดียว */
export function MockupImage({ url, jobs = [], color = '#8B0000' }) {
  if (!url) return null
  const img = (
    <img src={url} alt="mockup" crossOrigin="anonymous"
      style={{ display: 'block', width: '100%', maxHeight: 220, objectFit: 'contain', background: '#fff' }} />
  )
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', marginTop: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 900, color, padding: '4px 10px', borderBottom: '1px solid #f0f0f0', letterSpacing: .5 }}>MOCKUP</div>
      <div style={{ padding: 6 }}>
        {jobs.length === 1 ? <Link href={docHref('joborder', jobs[0].id)} title={`ไปใบงาน ${jobs[0].code}`}>{img}</Link> : img}
      </div>
    </div>
  )
}
