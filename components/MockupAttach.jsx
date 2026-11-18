'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { uploadJobImage } from '@/lib/jobProduction.mjs'
import { docHref } from '@/lib/docLinks'
import { notify } from '@/lib/feedback'

/**
 * รูป Mockup ของใบแจ้งหนี้ (สูงสุด 2 รูป) — แนบได้ที่ฟอร์มแก้ไขใบแจ้งหนี้เท่านั้น
 * เก็บที่ invoices.mockup_urls (text[]) · invoices.mockup_url = รูปแรก (ของเดิม ยังเขียนไว้ให้เข้ากันได้)
 * ใบเสร็จแสดงรูปของใบแจ้งหนี้ที่ผูกอยู่ · ใบงานที่สร้างจากใบแจ้งหนี้ได้รูป 1 = หน้า, รูป 2 = หลัง
 */
export const MOCKUP_MAX = 2

/** รูป Mockup ของใบแจ้งหนี้ เป็น array (รองรับข้อมูลเก่าที่มีแค่ mockup_url) */
export function mockupList(inv) {
  if (!inv) return []
  const list = Array.isArray(inv.mockup_urls) ? inv.mockup_urls.filter(Boolean) : []
  if (list.length) return list.slice(0, MOCKUP_MAX)
  return inv.mockup_url ? [inv.mockup_url] : []
}

/** ค่าที่ต้องบันทึกลงใบแจ้งหนี้ */
export const mockupPayload = urls => {
  const list = (urls || []).filter(Boolean).slice(0, MOCKUP_MAX)
  return { mockup_urls: list, mockup_url: list[0] || null }
}

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

/** ช่องแนบรูปในฟอร์มแก้ไขใบแจ้งหนี้ (สูงสุด 2 รูป) */
export function MockupPanel({ urls = [], onChange, color = '#B80F0B' }) {
  const [busy, setBusy] = useState(false)
  const input = useRef(null)
  const list = urls.filter(Boolean).slice(0, MOCKUP_MAX)

  async function pick(files) {
    const room = MOCKUP_MAX - list.length
    const chosen = Array.from(files || []).slice(0, room)
    if (!chosen.length) return
    if ((files?.length || 0) > room) notify.warn(`แนบได้สูงสุด ${MOCKUP_MAX} รูป`)
    setBusy(true)
    try {
      const added = []
      for (const f of chosen) added.push(await uploadJobImage(supabase, 'job-images', f))
      onChange([...list, ...added])
    } catch (e) { notify.error(e.message) } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 12px', border: '1px dashed var(--border)', borderRadius: 10, background: 'var(--card)', fontSize: 13 }}>
      <b style={{ color }}>🖼️ Mockup</b>
      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>({list.length}/{MOCKUP_MAX} รูป)</span>
      {list.map((u, i) => (
        <span key={u} style={{ position: 'relative', display: 'inline-block' }}>
          <a href={u} target="_blank" rel="noreferrer" title="เปิดรูปเต็ม">
            <img src={u} alt={`mockup ${i + 1}`} style={{ height: 56, width: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', display: 'block' }} />
          </a>
          <button type="button" aria-label={`ลบรูป ${i + 1}`} disabled={busy} onClick={() => onChange(list.filter((_, j) => j !== i))}
            style={{ position: 'absolute', top: -7, right: -7, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#B91C1C', color: '#fff', fontSize: 12, lineHeight: '20px', padding: 0, cursor: 'pointer' }}>×</button>
        </span>
      ))}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
        onChange={e => { pick(e.target.files); e.target.value = '' }} />
      {list.length < MOCKUP_MAX && (
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'กำลังอัปโหลด...' : '📎 แนบรูป'}
        </button>
      )}
    </div>
  )
}

/** รูป Mockup ในตัวเอกสาร (พิมพ์ออกด้วย) — คลิกแล้วไปใบงาน ถ้ามีใบงานเดียว */
export function MockupImage({ urls = [], jobs = [], color = '#8B0000' }) {
  const list = urls.filter(Boolean).slice(0, MOCKUP_MAX)
  if (!list.length) return null
  const wrap = (img, key) => jobs.length === 1
    ? <Link key={key} href={docHref('joborder', jobs[0].id)} title={`ไปใบงาน ${jobs[0].code}`}>{img}</Link>
    : <div key={key}>{img}</div>
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', marginTop: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 900, color, padding: '4px 10px', borderBottom: '1px solid #f0f0f0', letterSpacing: .5 }}>MOCKUP</div>
      <div style={{ padding: 6, display: 'grid', gridTemplateColumns: list.length > 1 ? '1fr 1fr' : '1fr', gap: 6 }}>
        {list.map((u, i) => wrap(
          <img src={u} alt={`mockup ${i + 1}`} crossOrigin="anonymous"
            style={{ display: 'block', width: '100%', maxHeight: list.length > 1 ? 160 : 220, objectFit: 'contain', background: '#fff' }} />, u))}
      </div>
    </div>
  )
}
