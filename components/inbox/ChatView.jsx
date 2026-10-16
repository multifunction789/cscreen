'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { PLATFORMS, STATUSES, replyWindow, clockTime, newClientKey } from '@/lib/inbox/model'
import { notify } from '@/lib/feedback'
import { PlatformTag } from './ConversationList'
import MessageMedia from './MessageMedia'

export const ACTIONS = [
  { id: 'customer',  label: 'ลูกค้า' },
  { id: 'quotation', label: 'ใบเสนอราคา' },
  { id: 'payment',   label: 'รับเงิน' },
  { id: 'receipt',   label: 'ใบเสร็จ' },
  { id: 'job',       label: 'ใบงาน' },
  { id: 'assign',    label: 'มอบหมาย' },
  { id: 'followup',  label: 'ตั้งเตือน' },
]

export default function ChatView({ store, conv, messages, notes, typingBy, nameOf, demo, onBack, onInfo, onAction }) {
  const [mode, setMode] = useState('reply')          // reply | note
  const [text, setText] = useState('')
  const [pendingKey, setPendingKey] = useState(null) // one clientKey per message being sent
  const [confirmCollision, setConfirmCollision] = useState(false)
  const [openedAt, setOpenedAt] = useState(() => new Date().toISOString()) // ChatView is keyed by conversation
  const logRef = useRef(null)
  const fileRef = useRef(null)
  const p = PLATFORMS[conv.platform]
  const win = replyWindow(conv)

  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight }, [messages.length, notes.length, typingBy])

  const timeline = useMemo(() => [
    ...messages.map(m => ({ ...m, _t: 'msg' })),
    ...notes.map(n => ({ ...n, _t: 'note' })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [messages, notes])

  // someone else answered after I opened this chat → warn before I send
  const colleagueReply = messages.filter(m => m.direction === 'out' && m.sentBy && m.sentBy !== store.me && m.sentBy !== 'bot' && m.createdAt > openedAt).at(-1)
  const connected = store.canSend(conv.platform)
  const canReply = win.kind !== 'closed' && connected

  async function submit(e) {
    e?.preventDefault()
    const body = text.trim()
    if (!body) return
    if (mode === 'note') {
      try { await store.addNote(conv.id, body); setText('') } catch (err) { notify.error('บันทึกหมายเหตุไม่สำเร็จ: ' + err.message) }
      return
    }
    if (colleagueReply && !confirmCollision) { setConfirmCollision(true); return }
    const key = pendingKey || newClientKey()        // double-click / retry reuses the same key
    setPendingKey(key)
    try {
      await store.send(conv.id, { text: body, clientKey: key })
      setPendingKey(null); setText(''); setConfirmCollision(false); setOpenedAt(new Date().toISOString())
    } catch (err) {
      setPendingKey(null)
      // stored as "ส่งไม่สำเร็จ" with its own retry button → clear the box so it is not sent twice
      if (store.peekMessages?.(conv.id).some(m => m.clientKey === key)) { setText(''); setConfirmCollision(false) }
      notify.error(err.message)
    }
  }

  async function attach(file) {
    if (!file) return
    // LINE cannot receive files: anything but a JPEG/PNG goes out as a 30-day download link
    try {
      await store.send(conv.id, { text: '', clientKey: newClientKey(), attachment: { name: file.name, mime: file.type, size: file.size, file } })
    } catch (err) { notify.error(err.message) }
  }

  async function retry(m) {
    try { await store.send(conv.id, { text: m.text, clientKey: m.clientKey, attachment: null }) }
    catch (err) { notify.error(err.message) }
  }

  return (
    <section className="ib-col ib-chat" aria-label="ห้องแชท">
      <header className="ib-chat-head">
        <button type="button" className="ib-icon ib-only-mobile" onClick={onBack} aria-label="กลับไปรายการแชท">‹</button>
        <span className="ib-avatar" style={{ background: conv.contact.avatar }} aria-hidden="true">{conv.contact.displayName.slice(0, 1)}</span>
        <div className="ib-chat-who">
          <b>{conv.customer?.name || conv.contact.displayName}</b>
          <span><PlatformTag platform={conv.platform} /> {conv.contact.displayName}</span>
        </div>
        <select aria-label="ผู้รับผิดชอบ" value={conv.assignedTo || ''} onChange={e => store.update(conv.id, { assignedTo: e.target.value || null })}>
          <option value="">ยังไม่มีคนรับ</option>
          {store.staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select aria-label="สถานะแชท" value={conv.status} onChange={e => store.update(conv.id, { status: e.target.value })}>
          {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <button type="button" className="ib-icon ib-hide-wide" onClick={onInfo} aria-label="ข้อมูลลูกค้า">ⓘ</button>
      </header>

      <div className="ib-banners">
        {demo && <div className="ib-banner mock">ข้อมูลจำลอง — ยังไม่ได้เชื่อมต่อ {p.label} จริง ข้อความที่ส่งจะไม่ถึงลูกค้า</div>}
        {!demo && !connected && <div className="ib-banner warn">ยังไม่ได้เชื่อมต่อ {p.label} — อ่านแชทและจดหมายเหตุได้ แต่ยังส่งข้อความไม่ได้</div>}
        {win.kind === 'open' && win.hoursLeft != null && <div className={`ib-banner${win.hoursLeft < 4 ? ' warn' : ''}`}>ตอบได้อีก {win.hoursLeft > 0 ? `${win.hoursLeft} ชม.` : `${win.minutesLeft} นาที`} ({p.label} ให้ตอบภายใน {p.windowHours} ชม. หลังลูกค้าทักล่าสุด)</div>}
        {win.kind === 'human_agent' && <div className="ib-banner warn">เกิน {p.windowHours} ชม. แล้ว — ตอบได้แบบ Human Agent อีก {win.daysLeft} วัน (พนักงานตอบเองเท่านั้น)</div>}
        {win.kind === 'closed' && <div className="ib-banner danger">หมดเวลาตอบตามกฎ {p.label} — รอลูกค้าทักกลับก่อน</div>}
        {conv.platform === 'line' && <div className="ib-banner">LINE: {store.lineQuota ? `ข้อความที่พนักงานส่งนับโควตา ${store.lineQuota.used}/${store.lineQuota.limit} เดือนนี้ · ` : ''}{p.note}</div>}
        {conv.platform === 'tiktok' && <div className="ib-banner">{p.note} · ส่งต่อกันได้ไม่เกิน {p.maxConsecutive} ข้อความจนกว่าลูกค้าตอบ</div>}
      </div>

      <div className="ib-timeline" role="log" aria-live="polite" ref={logRef}>
        {timeline.map(item => item._t === 'note' ? (
          <div key={item.id} className="ib-note"><b>หมายเหตุภายใน · {nameOf(item.author)}</b> {item.text}<time>{clockTime(item.createdAt)}</time></div>
        ) : item.kind === 'system' ? (
          <div key={item.id} className="ib-system">{item.text}<time>{clockTime(item.createdAt)}</time></div>
        ) : (
          <div key={item.id} className={`ib-msg ${item.direction}`}>
            <div className="ib-bubble">
              {['image', 'video', 'audio', 'file'].includes(item.kind) && item.attachment && <MessageMedia kind={item.kind} attachment={item.attachment} />}
              {item.kind === 'image' && item.direction === 'in' && (item.slipCandidate || !demo) && <button type="button" className="ib-link" onClick={() => onAction('payment', item)}>บันทึกเป็นสลิป</button>}
              {item.kind === 'document' && <div className="ib-attach doc">📄 {item.document.code} v{item.document.version}</div>}
              {item.text && <div>{item.text}</div>}
            </div>
            <div className="ib-msg-meta">
              {item.direction === 'out' && (item.sentBy === 'bot' ? <span className="ib-bot">บอท</span> : nameOf(item.sentBy))}
              {' '}{clockTime(item.createdAt)}{item.status === 'sending' && ' · กำลังส่ง…'}{item.status === 'failed' && <> · <span className="ib-warn" title={item.error || ''}>ส่งไม่สำเร็จ</span>{item.clientKey && !item.attachment && <> <button type="button" className="ib-link" onClick={() => retry(item)}>ลองส่งใหม่</button></>}</>}
            </div>
          </div>
        ))}
        {typingBy && <div className="ib-typing">{nameOf(typingBy)} กำลังพิมพ์…</div>}
      </div>

      <div className="ib-actions" role="toolbar" aria-label="ทางลัด">
        {ACTIONS.map(a => <button key={a.id} type="button" className="ib-chip" onClick={() => onAction(a.id)}>{a.label}</button>)}
      </div>

      {colleagueReply && (
        <div className={`ib-banner ${confirmCollision ? 'danger' : 'warn'} ib-collision`}>
          {nameOf(colleagueReply.sentBy)} ตอบแชทนี้ไปแล้วเมื่อ {clockTime(colleagueReply.createdAt)}{confirmCollision ? ' — กดส่งอีกครั้งเพื่อยืนยัน' : ' — อ่านก่อนส่ง'}
        </div>
      )}

      <form className={`ib-composer${mode === 'note' ? ' note' : ''}`} onSubmit={submit}>
        <div className="ib-modes" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'reply'} className={mode === 'reply' ? 'on' : ''} onClick={() => setMode('reply')}>ตอบลูกค้า</button>
          <button type="button" role="tab" aria-selected={mode === 'note'} className={mode === 'note' ? 'on' : ''} onClick={() => setMode('note')}>หมายเหตุภายใน</button>
        </div>
        <div className="ib-compose-row">
          {mode === 'reply' && (
            <>
              <button type="button" className="ib-icon" aria-label="แนบไฟล์" disabled={!canReply} onClick={() => fileRef.current?.click()}>📎</button>
              <input ref={fileRef} type="file" hidden onChange={e => { attach(e.target.files?.[0]); e.target.value = '' }} />
            </>
          )}
          <textarea rows={2} value={text} disabled={mode === 'reply' && !canReply}
            placeholder={mode === 'note' ? 'ลูกค้าไม่เห็นข้อความนี้' : canReply ? `ตอบผ่าน ${p.label}…` : !connected ? `ยังไม่ได้เชื่อมต่อ ${p.label}` : 'หมดเวลาตอบตามกฎแพลตฟอร์ม'}
            aria-label={mode === 'note' ? 'หมายเหตุภายใน' : 'พิมพ์ข้อความ'}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }} />
          <button type="submit" className="btn btn-primary" disabled={!text.trim() || (mode === 'reply' && !canReply) || !!pendingKey}>
            {mode === 'note' ? 'บันทึก' : pendingKey ? 'กำลังส่ง…' : 'ส่ง'}
          </button>
        </div>
      </form>
    </section>
  )
}
