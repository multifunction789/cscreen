'use client'
import { useState, useSyncExternalStore, useRef, useEffect } from 'react'
import { createMockStore } from '@/lib/inbox/mockStore'
import { createSupabaseStore } from '@/lib/inbox/supabaseStore'
import { matchesSearch } from '@/lib/inbox/model'
import ConversationList from './ConversationList'
import ChatView from './ChatView'
import CustomerPanel from './CustomerPanel'
import ActionPanel from './ActionPanel'

const WIDE = '(min-width: 900px)'
const subscribeWide = fn => { const m = window.matchMedia(WIDE); m.addEventListener('change', fn); return () => m.removeEventListener('change', fn) }
const stores = {}
const getStore = mode => (stores[mode] ??= mode === 'demo' ? createMockStore() : createSupabaseStore())

export default function InboxApp() {
  const [mode, setMode] = useState('live')           // live = real tables, demo = sample data
  const store = getStore(mode)
  const version = useRef(0)
  useSyncExternalStore(
    fn => store.subscribe(() => { version.current++; fn() }),
    () => version.current,
    () => 0,
  )
  const [selectedId, setSelectedId] = useState(null)
  const [pane, setPane] = useState('list')            // mobile: list | chat | info
  const [infoOpen, setInfoOpen] = useState(false)     // medium screens: customer panel as overlay
  const [filters, setFilters] = useState({ q: '', platform: 'all', status: 'active', assignee: 'all', unreadOnly: false })
  const [action, setAction] = useState(null)          // { id, context }
  const [typingBy, setTypingBy] = useState(null)

  const nameOf = id => id === 'bot' ? 'บอท' : id && id === store.me ? 'ฉัน' : store.staff.find(s => s.id === id)?.name || '—'
  const all = store.listConversations()
  const items = all.filter(c =>
    (filters.platform === 'all' || c.platform === filters.platform) &&
    (filters.status === 'all' || (filters.status === 'active' ? c.status !== 'closed' : c.status === filters.status)) &&
    (filters.assignee === 'all' || (filters.assignee === 'none' ? !c.assignedTo : c.assignedTo === filters.assignee)) &&
    (!filters.unreadOnly || c.unread > 0) &&
    matchesSearch(c, store.peekMessages ? store.peekMessages(c.id) : store.listMessages(c.id), filters.q))

  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false)
  // desktop shows the first chat until one is picked; mobile starts on the list
  const activeId = selectedId ?? (wide ? items[0]?.id : null)
  const conv = all.find(c => c.id === activeId) || null
  const unreadTotal = all.reduce((s, c) => s + (c.unread || 0), 0)

  useEffect(() => { if (conv?.unread) store.markRead(conv.id) }, [conv?.id, conv?.unread, store])

  function open(id) { setSelectedId(id); setPane('chat') }
  function switchMode(m) { setMode(m); setSelectedId(null); setPane('list'); setAction(null) }

  function demoColleague() {
    if (!conv) return
    const other = store.staff.find(s => s.id !== store.me)?.id
    setTypingBy(other)
    setTimeout(() => { setTypingBy(null); store.demoColleagueReply(conv.id, other, 'รับเรื่องแล้วค่ะ เดี๋ยวส่งรายละเอียดให้นะคะ') }, 1500)
  }

  if (!store.loaded) return <div className="ib ib-state"><p>กำลังโหลดแชท…</p></div>
  if (store.error) return (
    <div className="ib ib-state">
      <p>โหลดแชทไม่สำเร็จ: {store.error}</p>
      <p className="ib-small">บัญชีของคุณอาจยังไม่มีสิทธิ์ดูแชท (ต้องเป็น owner, admin, sales หรือ designer)</p>
      <button type="button" className="btn btn-outline" onClick={() => switchMode('demo')}>ดูตัวอย่าง (ข้อมูลจำลอง)</button>
    </div>
  )
  if (mode === 'live' && !all.length) return (
    <div className="ib ib-state">
      <div className="ib-empty-card">
        <b>ยังไม่มีแชทจากลูกค้า</b>
        <p>แชทจะเข้ามาที่นี่เมื่อเชื่อมต่อ LINE OA แล้ว (เฟส 4) ระหว่างนี้ลองใช้งานด้วยข้อมูลจำลองได้</p>
        <ul className="ib-small">
          {['line', 'facebook', 'tiktok'].map(p => <li key={p}>{p === 'line' ? 'LINE' : p === 'facebook' ? 'Facebook' : 'TikTok'}: {store.channelStatus(p) === 'connected' ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}</li>)}
        </ul>
        <button type="button" className="btn btn-primary" onClick={() => switchMode('demo')}>ดูตัวอย่าง (ข้อมูลจำลอง)</button>
      </div>
    </div>
  )

  return (
    <div className={`ib pane-${pane}${infoOpen ? ' info-open' : ''}`}>
      <div className="ib-listwrap">
        <ConversationList items={items} selectedId={activeId} onSelect={open} filters={filters} setFilters={setFilters}
          staff={store.staff} me={store.me} unreadTotal={unreadTotal} nameOf={nameOf} />
        {mode === 'demo' && (
          <details className="ib-demo">
            <summary>ทดลองระบบ (ข้อมูลจำลอง)</summary>
            <button type="button" className="ib-chip" onClick={() => store.demoIncoming('v2', 'สนใจครับ ขอราคาด่วนหน่อย')}>ลูกค้าทักเข้ามาใหม่</button>
            <button type="button" className="ib-chip" disabled={!conv} onClick={demoColleague}>เพื่อนร่วมทีมตอบแชทที่เปิดอยู่</button>
            <button type="button" className="ib-chip" onClick={() => switchMode('live')}>กลับไปแชทจริง</button>
          </details>
        )}
      </div>
      {conv ? (
        <>
          <ChatView key={conv.id} store={store} conv={conv} messages={store.listMessages(conv.id)} notes={store.listNotes(conv.id)} typingBy={typingBy}
            nameOf={nameOf} demo={mode === 'demo'}
            onBack={() => setPane('list')} onInfo={() => { setPane('info'); setInfoOpen(true) }}
            onAction={(id, context) => setAction({ id, context })} />
          <CustomerPanel store={store} conv={conv} notes={store.listNotes(conv.id)}
            onAction={id => setAction({ id })} onClose={() => { setPane('chat'); setInfoOpen(false) }} />
        </>
      ) : (
        <section className="ib-col ib-chat ib-placeholder"><p>เลือกแชททางซ้ายเพื่อเริ่มตอบ</p></section>
      )}
      {action && conv && <ActionPanel key={action.id + conv.id} store={store} conv={conv} action={action.id} context={action.context} onClose={() => setAction(null)} />}
    </div>
  )
}
