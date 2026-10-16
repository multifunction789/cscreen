'use client'
import { PLATFORMS, STATUSES, timeAgo, replyWindow } from '@/lib/inbox/model'

export function PlatformTag({ platform }) {
  const p = PLATFORMS[platform]
  return <span className="ib-ptag" style={{ background: p.color }} title={p.label}>{p.short}</span>
}

export default function ConversationList({ items, selectedId, onSelect, filters, setFilters, staff, me, unreadTotal, nameOf }) {
  const set = patch => setFilters(f => ({ ...f, ...patch }))
  return (
    <section className="ib-col ib-list" aria-label="รายการแชท">
      <div className="ib-list-head">
        <div className="ib-title">แชทลูกค้า {unreadTotal > 0 && <span className="ib-count">{unreadTotal}</span>}</div>
        <input className="ib-search" type="search" placeholder="ค้นชื่อ / เบอร์ / ข้อความ" aria-label="ค้นหาแชท"
          value={filters.q} onChange={e => set({ q: e.target.value })} />
        <div className="ib-chips" role="group" aria-label="ช่องทาง">
          {[['all', 'ทั้งหมด'], ...Object.values(PLATFORMS).map(p => [p.id, p.short])].map(([id, label]) => (
            <button key={id} type="button" className={`ib-chip${filters.platform === id ? ' on' : ''}`} aria-pressed={filters.platform === id}
              onClick={() => set({ platform: id })}>{label}</button>
          ))}
        </div>
        <div className="ib-filters">
          <select aria-label="สถานะ" value={filters.status} onChange={e => set({ status: e.target.value })}>
            <option value="active">ยังไม่ปิด</option>
            <option value="all">ทุกสถานะ</option>
            {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <select aria-label="ผู้รับผิดชอบ" value={filters.assignee} onChange={e => set({ assignee: e.target.value })}>
            <option value="all">ทุกคน</option>
            <option value={me}>ของฉัน</option>
            <option value="none">ยังไม่มีคนรับ</option>
            {staff.filter(s => s.id !== me).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label className="ib-unread-toggle"><input type="checkbox" checked={filters.unreadOnly} onChange={e => set({ unreadOnly: e.target.checked })} /> ยังไม่อ่าน</label>
        </div>
      </div>
      <ul className="ib-items">
        {items.map(c => {
          const w = replyWindow(c)
          const urgent = w.kind === 'open' && w.hoursLeft != null && w.hoursLeft < 4
          return (
            <li key={c.id}>
              <button type="button" className={`ib-item${c.id === selectedId ? ' on' : ''}${c.unread ? ' unread' : ''}`} onClick={() => onSelect(c.id)}
                aria-label={`${c.contact.displayName}${c.unread ? ` ยังไม่อ่าน ${c.unread}` : ''}`}>
                <span className="ib-avatar" style={{ background: c.contact.avatar }} aria-hidden="true">{c.contact.displayName.slice(0, 1)}</span>
                <span className="ib-item-main">
                  <span className="ib-item-top">
                    <PlatformTag platform={c.platform} />
                    <b className="ib-name">{c.customer?.name || c.contact.displayName}</b>
                    <span className="ib-time">{timeAgo(c.lastMessageAt)}</span>
                  </span>
                  <span className="ib-snippet">{c.lastMessageText}</span>
                  <span className="ib-meta">
                    {c.assignedTo ? nameOf(c.assignedTo) : <em className="ib-warn">ยังไม่มีคนรับ</em>}
                    {urgent && <em className="ib-warn"> · เหลือ {w.hoursLeft} ชม.</em>}
                    {w.kind === 'human_agent' && <em className="ib-warn"> · เกิน {PLATFORMS[c.platform].windowHours} ชม.</em>}
                    {c.botActive && <span className="ib-bot"> · บอท</span>}
                  </span>
                </span>
                {c.unread > 0 && <span className="ib-badge">{c.unread}</span>}
              </button>
            </li>
          )
        })}
        {!items.length && <li className="ib-empty">ไม่พบแชทที่ตรงกับตัวกรอง</li>}
      </ul>
    </section>
  )
}
