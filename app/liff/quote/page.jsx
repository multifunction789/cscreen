'use client'
import { useEffect, useState } from 'react'

// LIFF: ฟอร์มขอใบเสนอราคา — เปิดจาก Rich Menu / ลิงก์ https://liff.line.me/<LIFF_ID>
const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID_QUOTE
const RED = '#B80F0B'
const PRODUCTS = ['เสื้อโปโล', 'เสื้อยืด', 'เสื้อพิมพ์ลาย (กีฬา)', 'เสื้อทำงาน', 'หมวก', 'ผ้ากันเปื้อน', 'อื่นๆ']
const METHODS  = ['สกรีน', 'ปัก', 'ยังไม่แน่ใจ']

function loadSdk() {
  return new Promise((resolve, reject) => {
    if (window.liff) return resolve(window.liff)
    const s = document.createElement('script')
    s.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js'
    s.onload = () => resolve(window.liff)
    s.onerror = reject
    document.head.appendChild(s)
  })
}

export default function LiffQuotePage() {
  const [liff, setLiff]     = useState(null)
  const [name, setName]     = useState('')
  const [state, setState]   = useState('loading')   // loading | ready | sending | done | error
  const [error, setError]   = useState('')
  const [f, setF] = useState({
    product: '', qty: '', method: '', positions: '', color: '',
    need_date: '', contact_name: '', phone: '', company: '', note: '',
  })
  const set = k => e => setF({ ...f, [k]: e.target.value })

  useEffect(() => {
    (async () => {
      try {
        if (!LIFF_ID) throw new Error('ยังไม่ได้ตั้งค่า LIFF ID')
        const l = await loadSdk()
        await l.init({ liffId: LIFF_ID })
        if (!l.isLoggedIn()) { l.login({ redirectUri: window.location.href }); return }
        const p = await l.getProfile()
        setName(p.displayName); setF(prev => ({ ...prev, contact_name: p.displayName }))
        setLiff(l); setState('ready')
      } catch (e) { setError(e.message); setState('error') }
    })()
  }, [])

  async function submit(e) {
    e.preventDefault()
    if (!f.product || !f.qty) return setError('กรุณาเลือกประเภทเสื้อและจำนวน')
    setState('sending'); setError('')
    try {
      const res = await fetch('/api/line/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, idToken: liff.getIDToken() }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'ส่งไม่สำเร็จ')
      setState('done')
    } catch (e) { setError(e.message); setState('ready') }
  }

  const wrap  = { minHeight: '100vh', background: '#F6F6F6', fontFamily: 'system-ui, sans-serif', color: '#222' }
  const card  = { background: '#fff', borderRadius: 14, padding: 16, margin: '12px 16px' }
  const label = { display: 'block', fontSize: 13, color: '#666', margin: '12px 0 6px' }
  const input = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', fontSize: 16, border: '1px solid #ddd', borderRadius: 10, background: '#fff' }
  const chip  = on => ({ padding: '9px 14px', borderRadius: 20, fontSize: 14, border: `1px solid ${on ? RED : '#ddd'}`, background: on ? RED : '#fff', color: on ? '#fff' : '#333' })

  if (state === 'loading') return <div style={{ ...wrap, display: 'grid', placeItems: 'center' }}>กำลังโหลด…</div>
  if (state === 'error')   return <div style={{ ...wrap, padding: 24 }}>เปิดฟอร์มไม่ได้: {error}</div>
  if (state === 'done') return (
    <div style={{ ...wrap, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
      <div>
        <div style={{ fontSize: 48 }}>✅</div>
        <h2 style={{ margin: '8px 0' }}>ส่งคำขอเรียบร้อยค่ะ</h2>
        <p style={{ color: '#666' }}>แอดมินจะส่งราคาให้ในแชท LINE ภายในเวลาทำการ</p>
        <button onClick={() => liff?.closeWindow()} style={{ marginTop: 16, padding: '12px 28px', background: RED, color: '#fff', border: 0, borderRadius: 10, fontSize: 16 }}>กลับไปที่แชท</button>
      </div>
    </div>
  )

  return (
    <form onSubmit={submit} style={wrap}>
      <div style={{ background: RED, color: '#fff', padding: '22px 20px 18px' }}>
        <div style={{ fontSize: 13, opacity: .85 }}>C-Screen · สวัสดีคุณ {name}</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>ขอใบเสนอราคา</div>
      </div>

      <div style={card}>
        <span style={label}>ประเภทเสื้อ *</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PRODUCTS.map(p => <button type="button" key={p} style={chip(f.product === p)} onClick={() => setF({ ...f, product: p })}>{p}</button>)}
        </div>
        <label style={label}>จำนวน (ตัว) *</label>
        <input style={input} type="number" inputMode="numeric" min="1" value={f.qty} onChange={set('qty')} placeholder="เช่น 50" />
        <span style={label}>งานสกรีน / ปัก</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {METHODS.map(m => <button type="button" key={m} style={chip(f.method === m)} onClick={() => setF({ ...f, method: m })}>{m}</button>)}
        </div>
        <label style={label}>ตำแหน่ง / จำนวนจุด</label>
        <input style={input} value={f.positions} onChange={set('positions')} placeholder="เช่น อกซ้าย + หลัง" />
        <label style={label}>สีเสื้อ</label>
        <input style={input} value={f.color} onChange={set('color')} placeholder="เช่น กรมท่า" />
        <label style={label}>ต้องการรับของวันที่</label>
        <input style={input} type="date" value={f.need_date} onChange={set('need_date')} />
      </div>

      <div style={card}>
        <label style={label}>ชื่อผู้ติดต่อ</label>
        <input style={input} value={f.contact_name} onChange={set('contact_name')} />
        <label style={label}>เบอร์โทร</label>
        <input style={input} type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} />
        <label style={label}>บริษัท / โรงเรียน / ทีม</label>
        <input style={input} value={f.company} onChange={set('company')} />
        <label style={label}>รายละเอียดเพิ่มเติม</label>
        <textarea style={{ ...input, minHeight: 80 }} value={f.note} onChange={set('note')} placeholder="ไฟล์โลโก้ส่งในแชทได้หลังกดส่งค่ะ" />
      </div>

      {error && <div style={{ color: RED, margin: '0 20px' }}>{error}</div>}
      <div style={{ padding: '8px 16px 32px' }}>
        <button disabled={state === 'sending'} style={{ width: '100%', padding: 15, background: RED, color: '#fff', border: 0, borderRadius: 12, fontSize: 17, fontWeight: 700, opacity: state === 'sending' ? .6 : 1 }}>
          {state === 'sending' ? 'กำลังส่ง…' : 'ส่งคำขอใบเสนอราคา'}
        </button>
        <p style={{ fontSize: 12, color: '#999', textAlign: 'center' }}>สั่ง 30 ตัวขึ้นไป ออกแบบฟรี · ผลิต 7–14 วัน</p>
      </div>
    </form>
  )
}
