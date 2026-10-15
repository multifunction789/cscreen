'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { DOC_TYPES, docHref } from '@/lib/docLinks'

/**
 * ค้นหาทั้งระบบ — ลูกค้า / ใบเสนอราคา / ใบแจ้งหนี้ / ใบงาน / ใบเสร็จ
 * เปิดด้วยปุ่มใน Topbar, Ctrl+K (⌘K) หรือ /
 */
const GROUP_ORDER = ['joborder', 'invoice', 'quotation', 'receipt', 'customer']
const PER_GROUP = 5
const CACHE_MS = 60_000

let cache = { at: 0, data: null }

async function loadIndex() {
  if (cache.data && Date.now() - cache.at < CACHE_MS) return cache.data
  const [cus, qt, inv, jo, rec] = await Promise.all([
    supabase.from('customers').select('id, code, name, phone, line').order('created_at', { ascending: false }),
    supabase.from('quotations').select('id, code, status, total, item_desc, customers(name)').order('created_at', { ascending: false }),
    supabase.from('invoices').select('id, code, total, customers(name)').order('created_at', { ascending: false }),
    supabase.from('job_orders').select('id, code, status, item_desc, customers(name)').order('created_at', { ascending: false }),
    supabase.from('receipts').select('id, code, paid, total, customers(name)').order('created_at', { ascending: false }),
  ])
  const baht = n => (n || n === 0) ? '฿' + Number(n).toLocaleString() : ''
  const data = [
    ...(cus.data || []).map(r => ({ type: 'customer',  id: r.id, code: r.code, sub: r.name, meta: r.phone || r.line || '', hay: [r.code, r.name, r.phone, r.line] })),
    ...(qt.data  || []).map(r => ({ type: 'quotation', id: r.id, code: r.code, sub: r.customers?.name || '—', meta: r.status || baht(r.total), hay: [r.code, r.customers?.name, r.item_desc] })),
    ...(inv.data || []).map(r => ({ type: 'invoice',   id: r.id, code: r.code, sub: r.customers?.name || '—', meta: baht(r.total), hay: [r.code, r.customers?.name] })),
    ...(jo.data  || []).map(r => ({ type: 'joborder',  id: r.id, code: r.code, sub: [r.customers?.name, r.item_desc].filter(Boolean).join(' · ') || '—', meta: r.status, hay: [r.code, r.customers?.name, r.item_desc] })),
    ...(rec.data || []).map(r => ({ type: 'receipt',   id: r.id, code: r.code, sub: r.customers?.name || '—', meta: r.paid ? 'ชำระแล้ว' : 'รอชำระ', hay: [r.code, r.customers?.name] })),
  ].map(x => ({ ...x, hay: x.hay.filter(Boolean).join(' ').toLowerCase() }))
  const err = cus.error || qt.error || inv.error || jo.error || rec.error
  if (!err) cache = { at: Date.now(), data }
  return data
}

function search(index, q) {
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (!tokens.length) return []
  const groups = {}
  for (const x of index) {
    if (!tokens.every(t => x.hay.includes(t))) continue
    const g = (groups[x.type] ||= [])
    if (g.length < PER_GROUP) g.push(x)
  }
  // เลขที่ตรงเป๊ะขึ้นก่อน
  const flat = []
  for (const type of GROUP_ORDER) {
    const g = groups[type]
    if (!g) continue
    g.sort((a, b) => Number((b.code || '').toLowerCase() === q.toLowerCase()) - Number((a.code || '').toLowerCase() === q.toLowerCase()))
    flat.push(...g)
  }
  return flat
}

export default function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [index, setIndex] = useState(null)
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  function show() {
    setOpen(true)
    setQ('')
    setActive(0)
    loadIndex().then(setIndex).catch(() => setIndex([]))
  }

  // คีย์ลัด: Ctrl/⌘+K หรือ / (เมื่อไม่ได้พิมพ์ในช่องอื่น)
  useEffect(() => {
    function onKey(e) {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); show() }
      else if (e.key === '/' && !typing) { e.preventDefault(); show() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { if (open) inputRef.current?.focus() }, [open])

  const results = useMemo(() => (index ? search(index, q.trim()) : []), [index, q])

  useEffect(() => {
    listRef.current?.querySelector('.gsearch-item.active')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function go(item) {
    setOpen(false)
    router.push(docHref(item.type, item.id))
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { setOpen(false); return }
    if (!results.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % results.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + results.length) % results.length) }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[Math.min(active, results.length - 1)]) }
  }

  let lastType = null
  return (
    <>
      <button type="button" className="gsearch-trigger" onClick={show} aria-label="ค้นหา (Ctrl+K)" title="ค้นหา (Ctrl+K)">
        <span aria-hidden>🔍</span>
        <span className="gs-label">ค้นหาเลขที่, ลูกค้า…</span>
        <kbd>Ctrl K</kbd>
      </button>

      {open && (
        <div className="gsearch-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="gsearch" role="dialog" aria-modal="true" aria-label="ค้นหาทั้งระบบ">
            <div className="gsearch-input-row">
              <span aria-hidden>🔍</span>
              <input
                ref={inputRef} type="text" value={q}
                onChange={e => { setQ(e.target.value); setActive(0) }}
                onKeyDown={onKeyDown}
                placeholder="พิมพ์เลขที่เอกสาร ชื่อลูกค้า เบอร์โทร หรือรายการสินค้า"
                aria-label="คำค้นหา"
                role="combobox" aria-expanded={results.length > 0} aria-controls="gsearch-list"
                aria-activedescendant={results.length ? `gs-${active}` : undefined}
              />
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>Esc</button>
            </div>

            <div className="gsearch-results" id="gsearch-list" role="listbox" ref={listRef}>
              {!index ? (
                <div className="gsearch-hint">กำลังโหลดข้อมูล…</div>
              ) : !q.trim() ? (
                <div className="gsearch-hint">ค้นหาได้ทั้ง ใบงาน · ใบแจ้งหนี้ · ใบเสนอราคา · ใบเสร็จ · ลูกค้า</div>
              ) : results.length === 0 ? (
                <div className="gsearch-hint">ไม่พบ “{q}”</div>
              ) : results.map((r, i) => {
                const header = r.type !== lastType
                lastType = r.type
                const t = DOC_TYPES[r.type]
                return (
                  <div key={r.type + r.id}>
                    {header && <div className="gsearch-group">{t.icon} {t.label}</div>}
                    <button
                      type="button" id={`gs-${i}`} role="option" aria-selected={i === active}
                      className={`gsearch-item${i === active ? ' active' : ''}`}
                      onMouseMove={() => setActive(i)}
                      onClick={() => go(r)}
                    >
                      <span className="gsearch-item-code">{r.code}</span>
                      <span className="gsearch-item-sub">{r.sub}</span>
                      {r.meta && <span className="gsearch-item-meta">{r.meta}</span>}
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="gsearch-foot">
              <span>↑↓ เลือก</span><span>Enter เปิด</span><span>Esc ปิด</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
