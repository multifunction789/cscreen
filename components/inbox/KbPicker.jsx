'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { listArticles, searchArticles, kbImagePath } from '@/lib/knowledge'
import { notify } from '@/lib/feedback'

/** 📚 in the composer: find a standard answer, put it in the reply box, send its pictures */
export default function KbPicker({ onInsert, onSendImage, canSend, onClose }) {
  const [list, setList] = useState(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)

  useEffect(() => {
    let live = true
    listArticles().then(rows => { if (live) setList(rows) }, e => { if (live) { setList([]); notify.error('โหลดคลังความรู้ไม่สำเร็จ: ' + e.message) } })
    return () => { live = false }
  }, [])
  const shown = useMemo(() => searchArticles(list || [], q).sort((a, b) => (a.visibility === 'internal') - (b.visibility === 'internal')), [list, q])
  const a = open && (list || []).find(x => x.id === open)

  return (
    <div className="ib-kb" role="dialog" aria-label="คลังความรู้">
      <div className="ib-kb-head">
        {a ? <button type="button" className="ib-link" onClick={() => setOpen(null)}>‹ กลับ</button>
           : <input type="search" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาคำตอบในคลังความรู้" aria-label="ค้นหาคลังความรู้" />}
        <button type="button" className="ib-icon" onClick={onClose} aria-label="ปิดคลังความรู้">✕</button>
      </div>
      {!list && <p className="ib-small">กำลังโหลด…</p>}
      {list && !a && (
        <ul className="ib-kb-list">
          {shown.slice(0, 40).map(x => (
            <li key={x.id}>
              <button type="button" onClick={() => setOpen(x.id)}>
                <b>{x.visibility === 'internal' ? '🔒 ' : ''}{x.title}</b>
                <span className="ib-small">{x.category}{x.images?.length ? ` · 🖼 ${x.images.length}` : ''}</span>
              </button>
            </li>
          ))}
          {!shown.length && <li className="ib-small">ไม่พบหัวข้อ — <Link href="/knowledge">เปิดคลังความรู้</Link></li>}
        </ul>
      )}
      {a && (
        <div className="ib-kb-detail">
          <b>{a.title}</b>
          {a.visibility === 'internal' && <p className="ib-banner warn">🔒 ใช้ภายใน — อ่านอย่างเดียว ส่งให้ลูกค้าไม่ได้</p>}
          {a.body && <p className="ib-kb-body">{a.body}</p>}
          {a.staff_note && <p className="ib-small">📝 {a.staff_note}</p>}
          {a.visibility === 'customer' && (
            <div className="ib-kb-actions">
              {a.body && <button type="button" className="btn btn-primary btn-sm" onClick={() => { onInsert(a.body); onClose() }}>แทรกในช่องพิมพ์</button>}
              {(a.images || []).map((u, i) => (
                <span key={u} className="ib-kb-img">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" />
                  <button type="button" className="btn btn-outline btn-sm" disabled={!canSend || !kbImagePath(u)}
                    onClick={() => onSendImage({ bucket: 'bot-assets', path: kbImagePath(u), name: `${a.title} ${i + 1}`, mime: /\.png$/i.test(u) ? 'image/png' : 'image/jpeg' })}>ส่งรูปนี้</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
