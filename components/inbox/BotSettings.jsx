'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { notify } from '@/lib/feedback'
import { decide } from '@/lib/bot/engine'

const KINDS = { answer: 'ตอบข้อความ', payment: 'ส่งช่องทางชำระเงิน + QR', price: 'เริ่มคิดราคาเบื้องต้น' }
const EDITORS = ['owner', 'admin']
const splitKeywords = s => s.split(/[,\n]/).map(x => x.trim()).filter(Boolean)

function Section({ title, hint, children }) {
  return (
    <section className="card bot-section">
      <h2>{title}</h2>
      {hint && <p className="bot-hint">{hint}</p>}
      {children}
    </section>
  )
}

/** "ลองคุยกับบอท": runs the same engine as the server on the current (even unsaved) settings */
function Preview({ settings, rules, prices }) {
  const [log, setLog] = useState([])
  const [text, setText] = useState('')
  const [handoffAt, setHandoffAt] = useState(null)
  const ctx = { settings: { ...settings, enabled: true }, rules, prices, conv: { botActive: true, handoffAt } }

  function run(event, shown) {
    const out = decide(event, ctx)
    if (out?.handoff) setHandoffAt(new Date().toISOString())
    setLog(l => [...l, { who: 'customer', text: shown }, ...(out ? out.messages.map(m => ({ who: 'bot', m })) : [{ who: 'none', text: '(บอทเงียบ — รอพนักงานตอบ)' }])])
  }
  return (
    <div className="bot-preview">
      <div className="bot-log" aria-live="polite">
        {!log.length && <p className="bot-hint">พิมพ์ข้อความแบบที่ลูกค้าพิมพ์ แล้วดูว่าบอทจะตอบอะไร (ไม่ส่งถึงลูกค้าจริง)</p>}
        {log.map((x, i) => x.who === 'customer' ? <div key={i} className="bot-bubble me">{x.text}</div>
          : x.who === 'none' ? <div key={i} className="bot-hint">{x.text}</div>
          : x.m.type === 'image' ? <div key={i} className="bot-bubble">🖼 รูป QR ({x.m.originalContentUrl.split('/').pop()})</div>
          : (
            <div key={i} className="bot-bubble">
              <div style={{ whiteSpace: 'pre-wrap' }}>{x.m.text}</div>
              {x.m.quickReply && (
                <div className="bot-chips">
                  {x.m.quickReply.items.map((q, j) => (
                    <button key={j} type="button" className="btn btn-outline btn-sm" onClick={() => run({ type: 'postback', data: q.action.data }, '👆 ' + q.action.label)}>{q.action.label}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
      </div>
      <form className="bot-row" onSubmit={e => { e.preventDefault(); if (text.trim()) { run({ type: 'message', kind: 'text', text }, text); setText('') } }}>
        <input type="text" value={text} onChange={e => setText(e.target.value)} placeholder="เช่น เสื้อยืด 50 ตัว ราคาเท่าไหร่" aria-label="ข้อความทดลอง" />
        <button type="submit" className="btn btn-primary btn-sm">ส่งทดลอง</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => run({ type: 'follow' }, '(ลูกค้าเพิ่มเพื่อน)')}>จำลองเพิ่มเพื่อน</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => { setLog([]); setHandoffAt(null) }}>ล้าง</button>
      </form>
    </div>
  )
}

export default function BotSettings() {
  const [role, setRole] = useState(null)
  const [settings, setSettings] = useState(null)
  const [rules, setRules] = useState([])
  const [prices, setPrices] = useState([])
  const [dirty, setDirty] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const canEdit = EDITORS.includes(role)

  async function load() {
    const [r, s, ru, p] = await Promise.all([
      supabase.rpc('app_role'),
      supabase.from('bot_settings').select('*').maybeSingle(),
      supabase.from('bot_rules').select('*').order('sort').order('created_at'),
      supabase.from('bot_prices').select('*').order('product').order('technique').order('min_qty'),
    ])
    if (s.error) { setError(s.error.message); return }
    setRole(r.data); setSettings(s.data); setRules(ru.data || []); setPrices(p.data || []); setDirty({})
  }
  // first load: async, state is set after the requests finish
  useEffect(() => { let live = true; Promise.resolve().then(() => live && load()); return () => { live = false } }, [])

  const save = async (fn, ok) => {
    setBusy(true)
    try { const { error: e } = await fn(); if (e) throw new Error(e.message); if (ok) notify.success(ok); await load() }
    catch (e) { notify.error(e.message) } finally { setBusy(false) }
  }
  const setS = (k, v) => { setSettings(s => ({ ...s, [k]: v })); setDirty(d => ({ ...d, settings: true })) }
  const setRule = (id, k, v) => { setRules(rs => rs.map(r => r.id === id ? { ...r, [k]: v } : r)); setDirty(d => ({ ...d, ['r' + id]: true })) }
  const setPrice = (id, k, v) => { setPrices(ps => ps.map(p => p.id === id ? { ...p, [k]: v } : p)); setDirty(d => ({ ...d, ['p' + id]: true })) }

  const menuCount = useMemo(() => rules.filter(r => r.enabled && r.in_menu).length, [rules])

  async function uploadQr(file) {
    if (!file) return
    if (!/^image\/(jpeg|png)$/.test(file.type)) { notify.error('ใช้รูป JPG หรือ PNG เท่านั้น (LINE รับแค่ 2 แบบนี้)'); return }
    const path = `qr-${Date.now()}.${file.type === 'image/png' ? 'png' : 'jpg'}`
    const { error: e } = await supabase.storage.from('bot-assets').upload(path, file, { contentType: file.type })
    if (e) { notify.error('อัปโหลดไม่สำเร็จ: ' + e.message); return }
    setS('qr_url', supabase.storage.from('bot-assets').getPublicUrl(path).data.publicUrl)
  }

  if (error) return <div className="card" style={{ padding: 20 }}>โหลดการตั้งค่าบอทไม่สำเร็จ: {error}</div>
  if (!settings) return <div className="card" style={{ padding: 20 }}>กำลังโหลด…</div>
  const dis = !canEdit || busy

  return (
    <div className="bot-page">
      <div className="page-header">
        <div>
          <h1>🤖 บอทตอบอัตโนมัติ (LINE)</h1>
          <p>ตอบเฉพาะสิ่งที่ร้านตั้งไว้ในหน้านี้ ไม่แต่งราคาหรือวันส่งเอง · ตอบด้วย Reply API ไม่เสียโควตา · หยุดเองเมื่อพนักงานตอบแชทนั้น</p>
        </div>
        <Link className="btn btn-outline btn-sm" href="/inbox">‹ กลับหน้าแชท</Link>
      </div>
      {!canEdit && <p className="ib-banner warn" style={{ borderRadius: 8, marginBottom: 12 }}>ดูได้อย่างเดียว — เฉพาะ owner / admin แก้ไขบอทได้</p>}

      <Section title="สถานะบอท">
        <div className={`bot-switch ${settings.enabled ? 'on' : ''}`}>
          <div>
            <b>{settings.enabled ? '● บอทเปิดอยู่ — ตอบลูกค้าจริง' : '○ บอทปิดอยู่ — ลูกค้าจะไม่ได้รับคำตอบอัตโนมัติ'}</b>
            <p className="bot-hint">แชทใหม่และแชทที่ปิดแล้วจะให้บอทดูแลก่อน · ปิดบอทเฉพาะแชทได้ที่หน้าแชท</p>
          </div>
          <button type="button" className={`btn ${settings.enabled ? 'btn-outline' : 'btn-primary'}`} disabled={dis}
            onClick={() => save(() => supabase.from('bot_settings').update({ enabled: !settings.enabled }).eq('id', true), settings.enabled ? 'ปิดบอทแล้ว' : 'เปิดบอทแล้ว')}>
            {settings.enabled ? 'ปิดบอท' : 'เปิดบอท'}
          </button>
        </div>
      </Section>

      <Section title="ข้อความหลัก">
        <label className="bot-field">ข้อความทักทาย (เมื่อลูกค้าเพิ่มเพื่อน)
          <textarea rows={3} value={settings.greeting || ''} disabled={dis} onChange={e => setS('greeting', e.target.value)} />
        </label>
        <label className="bot-field">ข้อความรับเรื่อง (เมื่อบอทตอบไม่ได้ — ส่งครั้งเดียวในรอบ 6 ชม. แล้วรอพนักงาน)
          <textarea rows={2} value={settings.handoff || ''} disabled={dis} onChange={e => setS('handoff', e.target.value)} />
        </label>
        <label className="bot-field">ช่องทางชำระเงิน (ส่งเมื่อลูกค้าถามเลขบัญชี / จะโอน)
          <textarea rows={3} value={settings.payment_text || ''} disabled={dis} placeholder={'ธนาคาร …\nชื่อบัญชี …\nเลขที่บัญชี …'} onChange={e => setS('payment_text', e.target.value)} />
        </label>
        <div className="bot-field">รูป QR ชำระเงิน
          <div className="bot-row">
            {settings.qr_url
              /* eslint-disable-next-line @next/next/no-img-element */
              ? <img src={settings.qr_url} alt="QR ชำระเงิน" className="bot-qr" />
              : <span className="bot-hint">ยังไม่มีรูป QR</span>}
            {canEdit && <label className="btn btn-outline btn-sm">อัปโหลด QR (JPG/PNG)<input type="file" accept="image/jpeg,image/png" hidden onChange={e => { uploadQr(e.target.files?.[0]); e.target.value = '' }} /></label>}
            {canEdit && <button type="button" className="btn btn-outline btn-sm" onClick={() => setS('qr_url', `${location.origin}/qr-payment.jpg`)}>ใช้ QR เดียวกับใบแจ้งหนี้</button>}
            {canEdit && settings.qr_url && <button type="button" className="btn btn-outline btn-sm" onClick={() => setS('qr_url', null)}>เอารูปออก</button>}
          </div>
        </div>
        {canEdit && (
          <button type="button" className="btn btn-primary" disabled={busy || !dirty.settings}
            onClick={() => save(() => supabase.from('bot_settings').update({ greeting: settings.greeting || null, handoff: settings.handoff || null, payment_text: settings.payment_text || null, qr_url: settings.qr_url || null }).eq('id', true), 'บันทึกข้อความแล้ว')}>
            บันทึกข้อความหลัก
          </button>
        )}
      </Section>

      <Section title="ถาม-ตอบ" hint={`บอทหาคำสำคัญในข้อความลูกค้า (ไม่สนช่องว่าง/ตัวพิมพ์) ถ้าเจอหลายข้อ ใช้คำที่ยาวที่สุด · ติ๊ก "ปุ่มเมนู" เพื่อให้ขึ้นเป็นปุ่มให้ลูกค้ากด (ตอนนี้ ${menuCount} ปุ่ม)`}>
        {rules.map(r => (
          <div key={r.id} className={`bot-rule${r.enabled ? '' : ' off'}`}>
            <div className="bot-row">
              <input type="text" value={r.title} disabled={dis} aria-label="ชื่อหัวข้อ" onChange={e => setRule(r.id, 'title', e.target.value)} style={{ flex: 1, minWidth: 140 }} />
              <select value={r.kind} disabled={dis} aria-label="ชนิดคำตอบ" onChange={e => setRule(r.id, 'kind', e.target.value)}>
                {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <label className="bot-check"><input type="checkbox" checked={r.enabled} disabled={dis} onChange={e => setRule(r.id, 'enabled', e.target.checked)} /> ใช้งาน</label>
              <label className="bot-check"><input type="checkbox" checked={r.in_menu} disabled={dis} onChange={e => setRule(r.id, 'in_menu', e.target.checked)} /> ปุ่มเมนู</label>
              <span className="bot-hint">ตอบไปแล้ว {r.hits} ครั้ง</span>
            </div>
            <label className="bot-field">คำสำคัญ (คั่นด้วย ,)
              <input type="text" value={(r.keywords || []).join(', ')} disabled={dis} onChange={e => setRule(r.id, 'keywords', splitKeywords(e.target.value))} />
            </label>
            {r.kind !== 'price' || r.answer ? (
              <label className="bot-field">{r.kind === 'payment' ? 'ข้อความก่อนส่งเลขบัญชี + QR' : r.kind === 'price' ? 'ข้อความเมื่อยังไม่มีตารางราคา' : 'คำตอบ'}
                <textarea rows={2} value={r.answer || ''} disabled={dis} onChange={e => setRule(r.id, 'answer', e.target.value)} />
              </label>
            ) : <p className="bot-hint">ถามลูกค้าทีละขั้น (ชนิดเสื้อ → เทคนิค → จำนวน) แล้วตอบราคาเริ่มต้นจากตารางด้านล่าง</p>}
            {canEdit && (
              <div className="bot-row">
                <button type="button" className="btn btn-primary btn-sm" disabled={busy || !dirty['r' + r.id]}
                  onClick={() => save(() => supabase.from('bot_rules').update({ title: r.title, kind: r.kind, keywords: r.keywords, answer: r.answer || null, enabled: r.enabled, in_menu: r.in_menu }).eq('id', r.id), 'บันทึกแล้ว')}>บันทึก</button>
                <button type="button" className="btn btn-outline btn-sm" disabled={busy}
                  onClick={() => save(() => supabase.from('bot_rules').delete().eq('id', r.id), 'ลบแล้ว')}>ลบ</button>
              </div>
            )}
          </div>
        ))}
        {canEdit && <button type="button" className="btn btn-outline" disabled={busy}
          onClick={() => save(() => supabase.from('bot_rules').insert({ title: 'หัวข้อใหม่', kind: 'answer', keywords: [], answer: '', enabled: false, sort: 100 + rules.length }), 'เพิ่มหัวข้อแล้ว (ยังปิดอยู่)')}>+ เพิ่มหัวข้อ</button>}
      </Section>

      <Section title="ตารางราคาเริ่มต้น" hint="บอทตอบเป็น &quot;ราคาเริ่มต้น&quot; เสมอ และบอกลูกค้าว่าราคาจริงอยู่ในใบเสนอราคา · จำนวนขั้นต่ำ = เริ่มใช้ราคานี้ตั้งแต่กี่ตัว">
        <div className="table-wrap">
          <table className="bot-table">
            <thead><tr><th>ชนิดเสื้อ</th><th>เทคนิค</th><th>ตั้งแต่ (ตัว)</th><th>ราคาเริ่มต้น/ตัว</th><th>หมายเหตุ</th><th>ใช้</th>{canEdit && <th />}</tr></thead>
            <tbody>
              {prices.map(p => (
                <tr key={p.id}>
                  <td><input type="text" value={p.product} disabled={dis} aria-label="ชนิดเสื้อ" onChange={e => setPrice(p.id, 'product', e.target.value)} /></td>
                  <td><input type="text" value={p.technique} disabled={dis} aria-label="เทคนิค" onChange={e => setPrice(p.id, 'technique', e.target.value)} /></td>
                  <td><input type="number" min="1" value={p.min_qty} disabled={dis} aria-label="จำนวนขั้นต่ำ" onChange={e => setPrice(p.id, 'min_qty', e.target.value)} /></td>
                  <td><input type="number" min="0" step="0.5" value={p.price_from} disabled={dis} aria-label="ราคาเริ่มต้น" onChange={e => setPrice(p.id, 'price_from', e.target.value)} /></td>
                  <td><input type="text" value={p.note || ''} disabled={dis} aria-label="หมายเหตุ" onChange={e => setPrice(p.id, 'note', e.target.value)} /></td>
                  <td><input type="checkbox" checked={p.enabled} disabled={dis} aria-label="ใช้งาน" onChange={e => setPrice(p.id, 'enabled', e.target.checked)} /></td>
                  {canEdit && (
                    <td className="bot-row" style={{ flexWrap: 'nowrap' }}>
                      <button type="button" className="btn btn-primary btn-sm" disabled={busy || !dirty['p' + p.id]}
                        onClick={() => save(() => supabase.from('bot_prices').update({ product: p.product.trim(), technique: p.technique.trim(), min_qty: Number(p.min_qty), price_from: Number(p.price_from), note: p.note || null, enabled: p.enabled }).eq('id', p.id), 'บันทึกราคาแล้ว')}>บันทึก</button>
                      <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => save(() => supabase.from('bot_prices').delete().eq('id', p.id), 'ลบแล้ว')}>ลบ</button>
                    </td>
                  )}
                </tr>
              ))}
              {!prices.length && <tr><td colSpan={7} className="bot-hint">ยังไม่มีราคา — ถ้าลูกค้าถามราคา บอทจะขอรายละเอียดแล้วส่งให้พนักงานคิดราคา</td></tr>}
            </tbody>
          </table>
        </div>
        {canEdit && <NewPrice busy={busy} onAdd={row => save(() => supabase.from('bot_prices').insert(row), 'เพิ่มราคาแล้ว')} />}
      </Section>

      <Section title="ลองคุยกับบอท" hint="ใช้ข้อความในหน้านี้ (รวมที่ยังไม่บันทึก) ไม่ส่งถึงลูกค้าจริง">
        <Preview settings={settings} rules={rules} prices={prices} />
      </Section>
    </div>
  )
}

function NewPrice({ busy, onAdd }) {
  const [row, setRow] = useState({ product: '', technique: '', min_qty: '', price_from: '' })
  const f = k => ({ value: row[k], onChange: e => setRow(r => ({ ...r, [k]: e.target.value })) })
  const ok = row.product.trim() && row.technique.trim() && Number(row.min_qty) > 0 && Number(row.price_from) > 0
  return (
    <form className="bot-row" style={{ marginTop: 10 }} onSubmit={e => { e.preventDefault(); if (ok) { onAdd({ product: row.product.trim(), technique: row.technique.trim(), min_qty: Number(row.min_qty), price_from: Number(row.price_from) }); setRow({ product: '', technique: '', min_qty: '', price_from: '' }) } }}>
      <input type="text" placeholder="ชนิดเสื้อ เช่น เสื้อยืด" aria-label="ชนิดเสื้อใหม่" {...f('product')} />
      <input type="text" placeholder="เทคนิค เช่น สกรีน" aria-label="เทคนิคใหม่" {...f('technique')} />
      <input type="number" min="1" placeholder="ตั้งแต่ (ตัว)" aria-label="จำนวนขั้นต่ำใหม่" {...f('min_qty')} style={{ width: 110 }} />
      <input type="number" min="0" step="0.5" placeholder="บาท/ตัว" aria-label="ราคาใหม่" {...f('price_from')} style={{ width: 100 }} />
      <button type="submit" className="btn btn-outline btn-sm" disabled={busy || !ok}>+ เพิ่มราคา</button>
    </form>
  )
}

