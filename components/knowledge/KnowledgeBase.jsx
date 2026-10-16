'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { notify } from '@/lib/feedback'
import { KB_CATEGORIES, KB_EDITORS, MAX_IMAGES, listArticles, saveArticle, deleteArticle, uploadKbImage, searchArticles } from '@/lib/knowledge'

const EMPTY = { category: KB_CATEGORIES[0], title: '', body: '', staff_note: '', images: [], keywords: [], visibility: 'customer', bot_enabled: false, in_menu: false, sort: 100 }

function Editor({ article, categories, onSaved, onClose, onDeleted }) {
  const [a, setA] = useState(article)
  const [kw, setKw] = useState((article.keywords || []).join(', '))
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const set = (k, v) => setA(x => ({ ...x, [k]: v }))
  const internal = a.visibility === 'internal'

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    try { const saved = await saveArticle({ ...a, keywords: kw.split(/[,\n]/) }); notify.success('บันทึกแล้ว'); onSaved(saved) }
    catch (err) { notify.error(err.message) } finally { setBusy(false) }
  }
  async function addImage(file) {
    if (!file) return
    try { const url = await uploadKbImage(file); set('images', [...(a.images || []), url].slice(0, MAX_IMAGES)) } catch (err) { notify.error(err.message) }
  }

  return (
    <div className="kb-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <form className="kb-editor" onSubmit={save} role="dialog" aria-modal="true" aria-label={a.id ? 'แก้ไขหัวข้อ' : 'เพิ่มหัวข้อ'}>
        <div className="kb-editor-head">
          <b>{a.id ? 'แก้ไขหัวข้อ' : 'เพิ่มหัวข้อใหม่'}</b>
          <button type="button" className="kb-x" onClick={onClose} aria-label="ปิด">✕</button>
        </div>
        <div className="kb-editor-body">
          <div className="kb-seg" role="radiogroup" aria-label="ใครเห็นหัวข้อนี้">
            <label className={!internal ? 'on' : ''}><input type="radio" name="vis" checked={!internal} onChange={() => set('visibility', 'customer')} /> 💬 ส่งให้ลูกค้าได้</label>
            <label className={internal ? 'on internal' : ''}><input type="radio" name="vis" checked={internal} onChange={() => setA(x => ({ ...x, visibility: 'internal', bot_enabled: false, in_menu: false }))} /> 🔒 ใช้ภายในเท่านั้น</label>
          </div>
          <label className="bot-field">หมวด
            <input type="text" list="kb-cats" value={a.category} onChange={e => set('category', e.target.value)} required />
            <datalist id="kb-cats">{categories.map(c => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="bot-field">หัวข้อ
            <input type="text" value={a.title} onChange={e => set('title', e.target.value)} required maxLength={120} placeholder="เช่น ผ้า Cotton กับ TC ต่างกันยังไง" />
          </label>
          <label className="bot-field">{internal ? 'เนื้อหา (ภายใน)' : 'เนื้อหาที่ส่งให้ลูกค้า'}
            <textarea rows={6} value={a.body} onChange={e => set('body', e.target.value)} placeholder={internal ? '' : 'เขียนแบบที่ตอบลูกค้าได้ทันที'} />
          </label>
          {!internal && (
            <label className="bot-field">หมายเหตุสำหรับพนักงาน (ไม่ส่งให้ลูกค้า)
              <textarea rows={2} value={a.staff_note || ''} onChange={e => set('staff_note', e.target.value)} placeholder="เช่น ถ้าลูกค้าถามต่อเรื่องสี ให้ส่งแคตตาล็อกสีผ้า" />
            </label>
          )}
          <div className="bot-field">รูป ({(a.images || []).length}/{MAX_IMAGES}) {!internal && <span className="bot-hint">— เปิดดูได้ด้วยลิงก์ อย่าใส่รูปข้อมูลลับ</span>}
            <div className="bot-row">
              {(a.images || []).map(u => (
                <span key={u} className="kb-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" />
                  <button type="button" aria-label="เอารูปออก" onClick={() => set('images', a.images.filter(x => x !== u))}>✕</button>
                </span>
              ))}
              {(a.images || []).length < MAX_IMAGES && <label className="btn btn-outline btn-sm">+ รูป (JPG/PNG)<input type="file" accept="image/jpeg,image/png" hidden onChange={e => { addImage(e.target.files?.[0]); e.target.value = '' }} /></label>}
            </div>
          </div>
          <label className="bot-field">คำสำคัญ (ช่วยค้นหา และให้บอทรู้ว่าตอบเมื่อไหร่ — คั่นด้วย ,)
            <input type="text" value={kw} onChange={e => setKw(e.target.value)} placeholder="เช่น ไซซ์, size, อก, ความยาว" />
          </label>
          {!internal && (
            <div className="bot-row kb-bot">
              <label className="bot-check"><input type="checkbox" checked={!!a.bot_enabled} onChange={e => set('bot_enabled', e.target.checked)} /> 🤖 ให้บอทใช้ตอบลูกค้า</label>
              <label className="bot-check"><input type="checkbox" checked={!!a.in_menu} onChange={e => set('in_menu', e.target.checked)} /> แสดงเป็นปุ่มเมนูของบอท</label>
              {a.bot_enabled && !kw.trim() && !a.in_menu && <span className="bot-hint ib-warn">ใส่คำสำคัญ หรือเปิดปุ่มเมนู ไม่อย่างนั้นบอทจะไม่ใช้หัวข้อนี้</span>}
            </div>
          )}
        </div>
        <div className="kb-editor-foot">
          {a.id && (confirmDel
            ? <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={async () => { try { await deleteArticle(a.id); notify.success('ลบแล้ว'); onDeleted(a.id) } catch (err) { notify.error(err.message) } }}>ยืนยันลบ</button>
            : <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirmDel(true)}>ลบหัวข้อ</button>)}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-outline" onClick={onClose}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
        </div>
      </form>
    </div>
  )
}

export default function KnowledgeBase() {
  const [list, setList] = useState(null)
  const [role, setRole] = useState(null)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [editing, setEditing] = useState(null)
  const canEdit = KB_EDITORS.includes(role)

  async function load() {
    try {
      const [rows, r] = await Promise.all([listArticles(), supabase.rpc('app_role')])
      setList(rows); setRole(r.data)
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { let live = true; Promise.resolve().then(() => live && load()); return () => { live = false } }, [])

  const categories = useMemo(() => [...new Set([...KB_CATEGORIES, ...(list || []).map(a => a.category)])], [list])
  const shown = useMemo(() => searchArticles(list || [], q, cat), [list, q, cat])
  const groups = useMemo(() => {
    const m = new Map()
    for (const a of shown) m.set(a.category, [...(m.get(a.category) || []), a])
    return [...m.entries()]
  }, [shown])

  async function copy(a) {
    try { await navigator.clipboard.writeText(a.body); notify.success('คัดลอกคำตอบแล้ว') } catch { notify.error('คัดลอกไม่ได้') }
  }

  if (error) return <div className="card" style={{ padding: 20 }}>โหลดคลังความรู้ไม่สำเร็จ: {error}</div>
  if (!list) return <div className="card" style={{ padding: 20 }}>กำลังโหลด…</div>

  return (
    <div className="kb-page">
      <div className="page-header">
        <div>
          <h1>📚 คลังความรู้</h1>
          <p>คำตอบมาตรฐานสำหรับตอบลูกค้า — พนักงานแทรกจากหน้าแชทได้ และบอทใช้หัวข้อที่เปิด 🤖 · หัวข้อ 🔒 ใช้ภายใน ไม่ถูกส่งให้ลูกค้า</p>
        </div>
        <div className="bot-row">
          <Link className="btn btn-outline btn-sm" href="/inbox/bot">🤖 ตั้งค่าบอท</Link>
          {canEdit && <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing({ ...EMPTY, category: cat || KB_CATEGORIES[0] })}>+ เพิ่มหัวข้อ</button>}
        </div>
      </div>

      <div className="card kb-toolbar">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา หัวข้อ เนื้อหา คำสำคัญ" aria-label="ค้นหาคลังความรู้" />
        <div className="bot-row">
          <button type="button" className={`kb-chip${!cat ? ' on' : ''}`} onClick={() => setCat('')}>ทั้งหมด ({list.length})</button>
          {categories.map(c => {
            const n = list.filter(a => a.category === c).length
            return <button key={c} type="button" className={`kb-chip${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}>{c} ({n})</button>
          })}
        </div>
      </div>
      {!canEdit && <p className="bot-hint">ดู/คัดลอกได้ — เฉพาะ owner / admin เพิ่มหรือแก้หัวข้อได้</p>}

      {groups.map(([g, rows]) => (
        <section key={g} className="kb-group">
          <h2>{g}</h2>
          <div className="kb-grid">
            {rows.map(a => (
              <article key={a.id} className={`card kb-card${a.visibility === 'internal' ? ' internal' : ''}`}>
                <div className="kb-card-head">
                  <b>{a.title}</b>
                  <span className="kb-tags">
                    {a.visibility === 'internal' ? <span className="kb-tag internal">🔒 ภายใน</span> : <span className="kb-tag">💬 ลูกค้า</span>}
                    {a.bot_enabled && <span className="kb-tag bot" title={`บอทตอบไปแล้ว ${a.hits} ครั้ง`}>🤖 {a.hits}</span>}
                  </span>
                </div>
                {a.body && <p className="kb-body">{a.body}</p>}
                {a.images?.length > 0 && (
                  <div className="bot-row">
                    {a.images.map(u => (
                      <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="kb-thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" loading="lazy" />
                      </a>
                    ))}
                  </div>
                )}
                {a.staff_note && <p className="kb-note">📝 {a.staff_note}</p>}
                {a.keywords?.length > 0 && <p className="bot-hint">คำสำคัญ: {a.keywords.join(', ')}</p>}
                <div className="bot-row">
                  {a.visibility === 'customer' && a.body && <button type="button" className="btn btn-outline btn-sm" onClick={() => copy(a)}>คัดลอกคำตอบ</button>}
                  {canEdit && <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(a)}>แก้ไข</button>}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      {!shown.length && <div className="card" style={{ padding: 20 }}><p className="bot-hint">{list.length ? 'ไม่พบหัวข้อที่ค้นหา' : 'ยังไม่มีหัวข้อ'}</p></div>}

      {editing && (
        <Editor key={editing.id || 'new'} article={editing} categories={categories} onClose={() => setEditing(null)}
          onSaved={saved => { setEditing(null); setList(l => [...l.filter(x => x.id !== saved.id), saved]) }}
          onDeleted={id => { setEditing(null); setList(l => l.filter(x => x.id !== id)) }} />
      )}
    </div>
  )
}
