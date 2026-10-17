'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { money } from '@/lib/docs/quotation'
import { durationTh, rangePreset, stageTh, OPEN_STAGES } from '@/lib/sales/pipeline'

const PRESETS = [['today', 'วันนี้'], ['7d', '7 วัน'], ['30d', '30 วัน'], ['month', 'เดือนนี้'], ['last_month', 'เดือนก่อน']]
const PLATFORM = { line: 'LINE', facebook: 'Facebook', tiktok: 'TikTok' }
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—')
const n = v => Number(v || 0).toLocaleString('th-TH')

function Kpi({ label, value, sub, tone }) {
  return (
    <div className={`card sd-kpi${tone ? ' ' + tone : ''}`}>
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  )
}

function Bars({ rows, value, label, fmt = n, max }) {
  const top = max ?? Math.max(1, ...rows.map(value))
  return (
    <div className="sd-bars">
      {rows.map((r, i) => (
        <div key={i} className="sd-bar">
          <span className="sd-bar-label">{label(r)}</span>
          <span className="sd-bar-track"><span style={{ width: `${(value(r) / top) * 100}%` }} /></span>
          <span className="sd-bar-val">{fmt(value(r), r)}</span>
        </div>
      ))}
    </div>
  )
}

function Daily({ days }) {
  const top = Math.max(1, ...days.map(d => d.inbound))
  const step = Math.max(1, Math.ceil(days.length / 10))
  return (
    <div className="sd-daily" role="img" aria-label="ข้อความลูกค้าเข้ารายวัน">
      {days.map((d, i) => (
        <div key={d.day} className="sd-day" title={`${d.day}: ข้อความเข้า ${d.inbound} · แชทใหม่ ${d.new_chats}`}>
          <span className="sd-col" style={{ height: `${(d.inbound / top) * 100}%` }}>{d.new_chats > 0 && <i style={{ height: `${Math.min(100, (d.new_chats / Math.max(1, d.inbound)) * 100)}%` }} />}</span>
          <small>{i % step === 0 ? d.day.slice(8, 10) + '/' + d.day.slice(5, 7) : ''}</small>
        </div>
      ))}
    </div>
  )
}

/** แดชบอร์ดการขาย: numbers come from sales_dashboard() — computed from the real chats, deals, quotations and receipts */
export default function SalesDashboard() {
  const [preset, setPreset] = useState('30d')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let live = true
    const { from, to } = rangePreset(preset)
    supabase.rpc('sales_dashboard', { p_from: from, p_to: to }).then(({ data: d, error: e }) => {
      if (!live) return
      if (e) { setError(e.message); setData(null) } else { setError(null); setData(d) }
    })
    return () => { live = false }
  }, [preset])

  const c = data?.chats, r = data?.response, f = data?.funnel
  const pipeline = data ? OPEN_STAGES.map(s => data.pipeline.find(p => p.stage === s) || { stage: s, count: 0, value: 0 }) : []
  return (
    <div className="sd-page">
      <div className="sb-bar">
        <div className="pay-tabs" role="tablist" aria-label="ช่วงเวลา">
          {PRESETS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={preset === id} className={preset === id ? 'on' : ''} onClick={() => setPreset(id)}>{label}</button>)}
        </div>
        <Link className="btn btn-outline btn-sm" href="/sales">ไปบอร์ดงานขาย</Link>
      </div>
      {error && <p className="pay-err">โหลดไม่สำเร็จ: {error}</p>}
      {!data && !error && <p className="pay-intro">กำลังคำนวณ…</p>}
      {data && (
        <>
          {data.scope === 'self' && <p className="pay-intro">ตัวเลขรวมเป็นของทั้งร้าน · ตารางรายคนแสดงเฉพาะของคุณ</p>}
          <div className="sd-kpis">
            <Kpi label="แชทใหม่" value={n(c.new)} sub={Object.entries(c.by_platform || {}).map(([p, v]) => `${PLATFORM[p] || p} ${v}`).join(' · ') || '—'} />
            <Kpi label="ลูกค้าที่ทักมา" value={n(c.active)} sub={`ข้อความเข้า ${n(c.inbound)} · บอทตอบ ${n(c.bot_sent)}`} />
            <Kpi label="เวลาตอบกลับ (มัธยฐาน)" value={durationTh(r.median_min)} sub={`ตอบใน 5 นาที ${pct(r.within_5_min, r.answered)} · ใน 1 ชม. ${pct(r.within_60_min, r.answered)}`} tone={r.median_min != null && r.median_min <= 15 ? 'good' : r.median_min > 60 ? 'bad' : ''} />
            <Kpi label="ยังไม่ได้ตอบ" value={n(r.unanswered)} sub={`จาก ${n(r.asked)} ครั้งที่ลูกค้ารอ`} tone={r.unanswered > 0 ? 'bad' : 'good'} />
            <Kpi label="ส่งใบเสนอราคา" value={n(f.quoted)} sub={`${money(f.quoted_value)} ฿`} />
            <Kpi label="ปิดการขายได้" value={n(f.won)} sub={`${money(f.won_value)} ฿ · แพ้ ${n(f.lost)}`} tone="good" />
            <Kpi label="อัตราปิดการขายได้" value={pct(f.won, f.won + f.lost)} sub="ปิดได้ ÷ (ปิดได้ + ปิดไม่ได้)" />
            <Kpi label="เงินเข้า (ยืนยันแล้ว)" value={`${money(f.received)} ฿`} sub="จากใบเสร็จที่บัญชียืนยัน" />
          </div>

          <div className="sd-grid">
            <section className="card sd-sec">
              <h2>เส้นทางการขาย</h2>
              <Bars rows={[['แชทใหม่', f.chats], ['ผูกกับลูกค้าแล้ว', f.linked], ['ส่งใบเสนอราคา', f.quoted], ['ปิดการขายได้', f.won]]}
                label={x => x[0]} value={x => Number(x[1])} fmt={v => (f.chats && v <= f.chats ? `${n(v)} (${pct(v, f.chats)})` : n(v))} max={Math.max(1, f.chats, f.linked, f.quoted, f.won)} />
            </section>
            <section className="card sd-sec">
              <h2>ข้อความลูกค้าเข้ารายวัน</h2>
              <Daily days={data.daily} />
              <p className="sd-note">แท่งสีเข้ม = แชทใหม่ในวันนั้น</p>
            </section>
            <section className="card sd-sec">
              <h2>งานที่เปิดอยู่ตามขั้นตอน</h2>
              <Bars rows={pipeline} label={p => stageTh(p.stage)} value={p => Number(p.count)} fmt={(v, p) => `${n(v)} · ${money(p.value)} ฿`} />
            </section>
            <section className="card sd-sec">
              <h2>เหตุผลที่ปิดการขายไม่ได้</h2>
              {data.lost_reasons.length ? <Bars rows={data.lost_reasons} label={x => x.reason || '—'} value={x => Number(x.count)} /> : <p className="sd-note">ไม่มีในช่วงนี้</p>}
            </section>
          </div>

          <section className="card sd-sec">
            <h2>รายคน</h2>
            <div className="sb-tablewrap">
              <table className="sb-table">
                <thead><tr><th>พนักงาน</th><th className="num">แชทที่ดูแล</th><th className="num">ข้อความที่ส่ง</th><th className="num">เวลาตอบ (มัธยฐาน)</th><th className="num">ใบเสนอราคา</th><th className="num">ปิดได้</th><th className="num">มูลค่าปิดได้</th></tr></thead>
                <tbody>
                  {data.people.map(p => (
                    <tr key={p.id}>
                      <td>{p.full_name || '—'}</td><td className="num">{n(p.chats)}</td><td className="num">{n(p.sent)}</td>
                      <td className="num">{durationTh(p.median_reply_min)}</td><td className="num">{n(p.quotes)}</td><td className="num">{n(p.won)}</td><td className="num">{money(p.won_value)}</td>
                    </tr>
                  ))}
                  {!data.people.length && <tr><td colSpan={7} className="sb-empty">ไม่มีข้อมูล</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="sd-note">เวลาตอบกลับนับเฉพาะข้อความลูกค้าที่เข้ามาช่วง 09:00–21:00 ถึงข้อความตอบแรกของพนักงาน (ข้อความบอทไม่นับ)</p>
          </section>
        </>
      )}
    </div>
  )
}
