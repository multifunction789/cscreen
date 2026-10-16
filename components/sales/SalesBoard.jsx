'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { notify } from '@/lib/feedback'
import { money, thaiDate } from '@/lib/docs/quotation'
import { DEAL_STAGES } from '@/lib/inbox/model'
import { toDeal, dealName, dealOwner, flags, groupByStage, stageTotal, filterDeals, sortDeals, myTasks, stageTh, daysSince } from '@/lib/sales/pipeline'

const EDITORS = ['owner', 'admin', 'sales']
const VIEWS = [['board', 'บอร์ด'], ['table', 'ตาราง'], ['mine', 'งานของฉัน']]
const PLATFORM_ICON = { line: '🟢', facebook: '🔵', tiktok: '⚫' }
const DEAL_SELECT = 'id, title, stage, value, owner, follow_up_at, next_action, lost_reason, stage_changed_at, closed_at, created_at, updated_at, conversation_id, customer_id, ' +
  'customer:customers(id, code, name), conversation:conversations(id, platform, status, assigned_to, last_message_at, last_inbound_at, identity:contact_identities(display_name)), ' +
  'quotation:quotations(id, code, total), invoice:invoices(id, code, total)'
const toLocal = iso => (iso ? new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(0, 16) : '')
const fromLocal = v => (v ? new Date(v + ':00+07:00').toISOString() : null)
const tomorrow10 = () => { const d = new Date(Date.now() + 7 * 3600e3 + 86400e3); return d.toISOString().slice(0, 10) + 'T10:00' }
const FLAG = { overdue: ['เลยเวลาติดตาม', 'danger'], stale: ['ค้างนาน', 'warn'], waiting_reply: ['ลูกค้ารอตอบ', 'info'] }

function Badge({ f, d }) {
  const [label, tone] = FLAG[f]
  return <span className={`sb-badge ${tone}`}>{f === 'stale' ? `ค้าง ${daysSince(d.stageChangedAt)} วัน` : label}</span>
}

function DealCard({ d, nameOf, canEdit, onOpen }) {
  const f = flags(d)
  return (
    <button type="button" className={`sb-card${f.includes('overdue') ? ' overdue' : ''}`} draggable={canEdit}
      onDragStart={e => { e.dataTransfer.setData('text/deal', d.id); e.dataTransfer.effectAllowed = 'move' }} onClick={() => onOpen(d.id)}>
      <span className="sb-card-top"><b>{dealName(d)}</b>{d.platform && <span aria-label={d.platform}>{PLATFORM_ICON[d.platform]}</span>}</span>
      {d.value != null && <span className="sb-val">{money(d.value)} ฿</span>}
      {(d.quotation || d.invoice) && <span className="sb-meta">{[d.quotation, d.invoice].filter(Boolean).join(' · ')}</span>}
      {d.nextAction && <span className="sb-next">➜ {d.nextAction}</span>}
      {d.followUpAt && <span className="sb-meta">⏰ {thaiDate(d.followUpAt)} {new Date(d.followUpAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })}</span>}
      <span className="sb-card-foot"><span className="sb-owner">{nameOf(dealOwner(d)) || 'ยังไม่มีผู้ดูแล'}</span>{f.map(x => <Badge key={x} f={x} d={d} />)}</span>
    </button>
  )
}

function Board({ deals, nameOf, canEdit, showClosed, onOpen, onMove }) {
  // the "lost" column is always a drop target; its cards show only with "แสดงที่ปิดแล้ว"
  const g = useMemo(() => { const x = groupByStage(deals, { showClosed }); if (!showClosed) x['Cancelled / Lost'] = []; return x }, [deals, showClosed])
  const [over, setOver] = useState(null)
  return (
    <div className="sb-board" role="list">
      {Object.entries(g).map(([stage, list]) => (
        <section key={stage} className={`sb-col${over === stage ? ' over' : ''}${!showClosed && stage === 'Cancelled / Lost' ? ' drop-only' : ''}`} role="listitem" aria-label={stageTh(stage)}
          onDragOver={e => { if (canEdit) { e.preventDefault(); setOver(stage) } }} onDragLeave={() => setOver(o => (o === stage ? null : o))}
          onDrop={e => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/deal'); if (id) onMove(id, stage) }}>
          <header><b>{stageTh(stage)}</b><span>{list.length}</span></header>
          {list.length > 0 && <div className="sb-colsum">{money(stageTotal(list))} ฿</div>}
          {!showClosed && stage === 'Cancelled / Lost' && <p className="sb-meta">ลากการ์ดมาวางเพื่อปิดงาน (ต้องใส่เหตุผล)</p>}
          <div className="sb-cards">{list.map(d => <DealCard key={d.id} d={d} nameOf={nameOf} canEdit={canEdit} onOpen={onOpen} />)}</div>
        </section>
      ))}
    </div>
  )
}

function Table({ deals, nameOf, onOpen }) {
  const [sort, setSort] = useState(['updatedAt', 'desc'])
  const rows = useMemo(() => sortDeals(deals, ...sort), [deals, sort])
  const th = (key, label) => (
    <th aria-sort={sort[0] === key ? (sort[1] === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => setSort(([k, d]) => [key, k === key && d === 'desc' ? 'asc' : 'desc'])}>{label}{sort[0] === key ? (sort[1] === 'asc' ? ' ▲' : ' ▼') : ''}</button>
    </th>
  )
  return (
    <div className="sb-tablewrap">
      <table className="sb-table">
        <thead><tr>{th('name', 'ลูกค้า / งาน')}{th('stage', 'ขั้นตอน')}{th('value', 'มูลค่า')}<th>ผู้ดูแล</th>{th('followUpAt', 'ติดตาม')}<th>เอกสาร</th>{th('updatedAt', 'อัปเดต')}</tr></thead>
        <tbody>
          {rows.map(d => (
            <tr key={d.id} onClick={() => onOpen(d.id)} className={flags(d).includes('overdue') ? 'overdue' : ''}>
              <td><b>{dealName(d)}</b>{d.nextAction && <div className="sb-meta">➜ {d.nextAction}</div>}</td>
              <td>{stageTh(d.stage)}{d.stage === 'Cancelled / Lost' && d.lostReason ? <div className="sb-meta">{d.lostReason}</div> : null}</td>
              <td className="num">{d.value != null ? money(d.value) : '—'}</td>
              <td>{nameOf(dealOwner(d)) || '—'}</td>
              <td>{d.followUpAt ? thaiDate(d.followUpAt) : '—'}</td>
              <td>{[d.quotation, d.invoice].filter(Boolean).join(' · ') || '—'}</td>
              <td>{thaiDate(d.updatedAt)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="sb-empty">ไม่มีงานขายตามตัวกรอง</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function Mine({ deals, chats, me, onOpen, onSnooze, canEdit }) {
  const tasks = useMemo(() => myTasks({ deals, chats, me }), [deals, chats, me])
  if (!me) return null
  if (!tasks.length) return <div className="card sb-emptycard">ไม่มีงานค้าง 🎉 — แชทที่ได้รับมอบหมายและงานขายที่คุณดูแลจะขึ้นที่นี่เมื่อถึงเวลาติดตาม</div>
  return (
    <ul className="sb-tasks">
      {tasks.map((t, i) => {
        const d = t.deal, c = t.chat
        const name = d ? dealName(d) : (c.name || 'แชทลูกค้า')
        const chatId = d?.conversationId || c?.id
        return (
          <li key={i} className={`card sb-task${t.due ? ' due' : ''}`}>
            <div>
              <b>{name}</b> {d && <span className="sb-meta">· {stageTh(d.stage)}{d.value != null ? ` · ${money(d.value)} ฿` : ''}</span>}
              <div className="sb-tasktext">{t.due ? '🔴 ' : '🕒 '}{t.text}{t.at && (t.kind.endsWith('follow_up')) ? ` · ${thaiDate(t.at)} ${new Date(t.at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })}` : ''}</div>
            </div>
            <div className="sb-taskbtns">
              {chatId && <Link className="btn btn-primary btn-sm" href={`/inbox?c=${chatId}`}>เปิดแชท</Link>}
              {d && <button type="button" className="btn btn-outline btn-sm" onClick={() => onOpen(d.id)}>รายละเอียด</button>}
              {d && canEdit && t.kind === 'deal_follow_up' && <button type="button" className="btn btn-outline btn-sm" onClick={() => onSnooze(d)}>เลื่อนไปพรุ่งนี้</button>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function DealDrawer({ deal, staff, canEdit, onClose, onSaved, customers }) {
  const isNew = !deal.id
  const [f, setF] = useState(() => ({
    title: deal.title || '', stage: deal.stage || 'New Lead', value: deal.value ?? '', owner: deal.owner || '', followUpAt: toLocal(deal.followUpAt),
    nextAction: deal.nextAction || '', lostReason: deal.lostReason || '', customerId: deal.customerId || '',
  }))
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }))
  useEffect(() => {
    if (isNew) return
    let live = true
    supabase.from('deal_stage_history').select('id, from_stage, to_stage, changed_by, changed_at').eq('deal_id', deal.id).order('changed_at', { ascending: false }).limit(20)
      .then(({ data }) => { if (live) setHistory(data || []) })
    return () => { live = false }
  }, [deal.id, isNew])
  const nameOf = id => staff.find(s => s.id === id)?.name

  async function save(e) {
    e.preventDefault()
    if (f.stage === 'Cancelled / Lost' && !f.lostReason.trim()) { notify.warn('ระบุเหตุผลที่ปิดการขายไม่ได้'); return }
    if (isNew && !f.customerId && !f.title.trim()) { notify.warn('เลือกลูกค้า หรือใส่ชื่องาน'); return }
    setBusy(true)
    const row = {
      title: f.title.trim() || null, stage: f.stage, value: f.value === '' ? null : Number(f.value), owner: f.owner || null,
      follow_up_at: fromLocal(f.followUpAt), next_action: f.nextAction.trim() || null, lost_reason: f.stage === 'Cancelled / Lost' ? f.lostReason.trim() : null,
      ...(isNew ? { customer_id: f.customerId || null } : {}),
    }
    const { error } = isNew ? await supabase.from('deals').insert(row) : await supabase.from('deals').update(row).eq('id', deal.id)
    setBusy(false)
    if (error) { notify.error(error.message); return }
    notify.success(isNew ? 'เพิ่มงานขายแล้ว' : 'บันทึกแล้ว')
    onSaved()
  }

  return (
    <div className="sb-drawer-bg" onClick={onClose}>
      <aside className="sb-drawer" role="dialog" aria-modal="true" aria-label={isNew ? 'งานขายใหม่' : dealName(deal)} onClick={e => e.stopPropagation()}>
        <header><b>{isNew ? 'งานขายใหม่' : dealName(deal)}</b><button type="button" className="ib-icon" aria-label="ปิด" onClick={onClose}>✕</button></header>
        <form className="sb-form" onSubmit={save}>
          {isNew && (
            <label>ลูกค้า
              <select value={f.customerId} onChange={set('customerId')}>
                <option value="">— ยังไม่ระบุ —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.code ? `${c.code} · ` : ''}{c.name}</option>)}
              </select>
            </label>
          )}
          {!isNew && (deal.customer || deal.contactName) && <p className="sb-meta">ลูกค้า: {deal.customer || deal.contactName}{deal.quotation ? ` · ${deal.quotation}` : ''}{deal.invoice ? ` · ${deal.invoice}` : ''}</p>}
          <label>ชื่องาน (ถ้ามี)<input value={f.title} onChange={set('title')} placeholder="เช่น เสื้อกีฬาสี 300 ตัว" disabled={!canEdit} /></label>
          <div className="sb-2">
            <label>ขั้นตอน<select value={f.stage} onChange={set('stage')} disabled={!canEdit}>{DEAL_STAGES.map(s => <option key={s} value={s}>{stageTh(s)}</option>)}</select></label>
            <label>มูลค่า (บาท)<input type="number" min="0" step="0.01" value={f.value} onChange={set('value')} disabled={!canEdit} /></label>
          </div>
          {f.stage === 'Cancelled / Lost' && <label>เหตุผลที่ปิดการขายไม่ได้<input value={f.lostReason} onChange={set('lostReason')} placeholder="เช่น ราคาสูงกว่าเจ้าอื่น / ลูกค้าเงียบ" required disabled={!canEdit} /></label>}
          <label>ผู้ดูแล<select value={f.owner} onChange={set('owner')} disabled={!canEdit}><option value="">{deal.assignedTo ? `ตามแชท (${nameOf(deal.assignedTo) || '—'})` : '— ยังไม่มี —'}</option>{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <div className="sb-2">
            <label>เตือนติดตาม<input type="datetime-local" value={f.followUpAt} onChange={set('followUpAt')} disabled={!canEdit} /></label>
            <label>สิ่งที่ต้องทำต่อ<input value={f.nextAction} onChange={set('nextAction')} placeholder="เช่น โทรถามแบบเสื้อ" disabled={!canEdit} /></label>
          </div>
          {canEdit && !f.followUpAt && <button type="button" className="ib-link" onClick={() => setF(s => ({ ...s, followUpAt: tomorrow10() }))}>+ เตือนพรุ่งนี้ 10:00</button>}
          <div className="sb-btns">
            {canEdit && <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>}
            {deal.conversationId && <Link className="btn btn-outline" href={`/inbox?c=${deal.conversationId}`}>เปิดแชท</Link>}
          </div>
        </form>
        {history.length > 0 && (
          <div className="sb-history">
            <b>ประวัติขั้นตอน</b>
            <ol>{history.map(h => <li key={h.id}>{thaiDate(h.changed_at)} · {h.from_stage ? `${stageTh(h.from_stage)} → ` : ''}<b>{stageTh(h.to_stage)}</b>{nameOf(h.changed_by) ? ` · ${nameOf(h.changed_by)}` : ''}</li>)}</ol>
          </div>
        )}
      </aside>
    </div>
  )
}

/** งานขาย: board / table / my tasks over deals */
export default function SalesBoard() {
  const router = useRouter()
  const params = useSearchParams()
  const view = VIEWS.some(v => v[0] === params.get('view')) ? params.get('view') : 'board'
  const [deals, setDeals] = useState(null)
  const [chats, setChats] = useState([])
  const [staff, setStaff] = useState([])
  const [customers, setCustomers] = useState([])
  const [me, setMe] = useState(null)
  const [role, setRole] = useState(null)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')
  const [owner, setOwner] = useState('')
  const [showClosed, setShowClosed] = useState(false)
  const [open, setOpen] = useState(null)        // deal id | 'new'
  const [preset, setPreset] = useState(null)    // stage chosen by dragging to "lost"
  const canEdit = EDITORS.includes(role)

  const load = useCallback(async () => {
    const [{ data: u }, r, d, s] = await Promise.all([
      supabase.auth.getUser(), supabase.rpc('app_role'),
      supabase.from('deals').select(DEAL_SELECT).order('updated_at', { ascending: false }).limit(1000),
      supabase.rpc('list_job_assignees'),
    ])
    if (d.error) { setError(d.error.message); return }
    const uid = u?.user?.id || null
    setMe(uid); setRole(r.data); setError(null)
    setDeals((d.data || []).map(toDeal))
    setStaff((s.data || []).map(x => ({ id: x.id, name: x.full_name || 'ไม่มีชื่อ' })))
    if (uid) {
      const { data: c } = await supabase.from('conversations').select('id, assigned_to, follow_up_at, status, last_inbound_at, last_message_at, customer:customers(name), identity:contact_identities(display_name)')
        .eq('assigned_to', uid).neq('status', 'closed').limit(300)
      setChats((c || []).map(x => ({ ...x, name: x.customer?.name || x.identity?.display_name })))
    }
  }, [])

  useEffect(() => {
    let live = true
    Promise.resolve().then(() => live && load())
    const ch = supabase.channel('sales-board').on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, () => load()).subscribe()
    return () => { live = false; supabase.removeChannel(ch) }
  }, [load])
  useEffect(() => {
    if (open !== 'new' || customers.length) return
    let live = true
    supabase.from('customers').select('id, code, name').order('name').limit(2000).then(({ data }) => { if (live) setCustomers(data || []) })
    return () => { live = false }
  }, [open, customers.length])

  const nameOf = useCallback(id => staff.find(s => s.id === id)?.name, [staff])
  const shown = useMemo(() => filterDeals(deals || [], { q, owner }), [deals, q, owner])
  const setView = v => router.replace(`/sales${v === 'board' ? '' : `?view=${v}`}`, { scroll: false })

  async function move(id, stage) {
    const d = deals.find(x => x.id === id)
    if (!d || d.stage === stage) return
    if (stage === 'Cancelled / Lost') { setPreset(stage); setOpen(id); notify.info('ระบุเหตุผลที่ปิดการขายไม่ได้ แล้วกดบันทึก'); return }
    setDeals(list => list.map(x => (x.id === id ? { ...x, stage, stageChangedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : x)))
    const { error: e } = await supabase.from('deals').update({ stage }).eq('id', id)
    if (e) { notify.error(e.message); load() } else notify.success(`ย้าย "${dealName(d)}" ไป ${stageTh(stage)}`)
  }
  async function snooze(d) {
    const { error: e } = await supabase.from('deals').update({ follow_up_at: fromLocal(tomorrow10()) }).eq('id', d.id)
    if (e) notify.error(e.message); else { notify.success('เลื่อนไปพรุ่งนี้ 10:00'); load() }
  }

  const found = open === 'new' ? { stage: 'New Lead', owner: me } : deals?.find(d => d.id === open)
  const openDeal = found && preset ? { ...found, stage: preset } : found
  const pipelineValue = stageTotal((deals || []).filter(d => !['Completed', 'Cancelled / Lost'].includes(d.stage)))
  const mineCount = useMemo(() => (me && deals ? myTasks({ deals, chats, me }).filter(t => t.due).length : 0), [deals, chats, me])

  return (
    <div className="sb-page">
      <div className="sb-bar">
        <div className="pay-tabs" role="tablist">
          {VIEWS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>
              {label}{id === 'mine' && mineCount ? ` (${mineCount})` : ''}
            </button>
          ))}
        </div>
        {view !== 'mine' && (
          <div className="sb-filters">
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาลูกค้า / งาน / เลขเอกสาร" aria-label="ค้นหางานขาย" />
            <select value={owner} onChange={e => setOwner(e.target.value)} aria-label="ผู้ดูแล">
              <option value="">ทุกคน</option>{me && <option value={me}>ของฉัน</option>}<option value="none">ยังไม่มีผู้ดูแล</option>
              {staff.filter(s => s.id !== me).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {view === 'board' && <label className="sb-check"><input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} /> แสดงที่ปิดแล้ว</label>}
            {canEdit && <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen('new')}>+ งานขายใหม่</button>}
          </div>
        )}
      </div>
      {deals && <p className="pay-intro">งานที่ยังเปิดอยู่ {(deals || []).filter(d => !['Completed', 'Cancelled / Lost'].includes(d.stage)).length} งาน · มูลค่ารวม {money(pipelineValue)} บาท{canEdit && view === 'board' ? ' · ลากการ์ดหรือกดที่การ์ดเพื่อเปลี่ยนขั้นตอน' : ''}</p>}
      {error && <p className="pay-err">โหลดไม่สำเร็จ: {error}</p>}
      {!deals && !error && <p className="pay-intro">กำลังโหลด…</p>}
      {deals && view === 'board' && <Board deals={shown} nameOf={nameOf} canEdit={canEdit} showClosed={showClosed} onOpen={setOpen} onMove={move} />}
      {deals && view === 'table' && <Table deals={shown} nameOf={nameOf} onOpen={setOpen} />}
      {deals && view === 'mine' && <Mine deals={deals} chats={chats} me={me} onOpen={setOpen} onSnooze={snooze} canEdit={canEdit} />}
      {openDeal && <DealDrawer key={open + (preset || '')} deal={openDeal} staff={staff} canEdit={canEdit} customers={customers} onClose={() => { setOpen(null); setPreset(null) }} onSaved={() => { setOpen(null); setPreset(null); load() }} />}
    </div>
  )
}
