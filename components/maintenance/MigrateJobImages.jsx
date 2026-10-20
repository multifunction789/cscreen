'use client'
// งานครั้งเดียว: รูปในใบงานเก่าบางใบถูกเก็บเป็น base64 (data:image...) ใน items / image_url / reference_url
// ทำให้ใบงานหนักหลาย MB → อัปโหลดเป็นไฟล์ใน bucket job-images (ไบต์ตรงกันทุกไบต์) แล้วแทนที่ด้วยลิงก์
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const COLS = ['items', 'image_url', 'reference_url']
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

function collect(o, out) {
  if (typeof o === 'string') { if (o.startsWith('data:image')) out.push(o) }
  else if (o && typeof o === 'object') Object.values(o).forEach(v => collect(v, out))
  return out
}
function swap(o, map) {
  if (typeof o === 'string') return map.get(o) || o
  if (Array.isArray(o)) return o.map(v => swap(v, map))
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, swap(v, map)]))
  return o
}
const kb = n => Math.round(n / 1024).toLocaleString() + ' KB'

async function uploadExact(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob()
  const path = `${crypto.randomUUID()}.${EXT[blob.type] || 'jpg'}`
  const { error } = await supabase.storage.from('job-images').upload(path, blob, { contentType: blob.type, upsert: false })
  if (error) throw new Error('อัปโหลดรูปไม่สำเร็จ: ' + error.message)
  const url = supabase.storage.from('job-images').getPublicUrl(path).data.publicUrl
  const res = await fetch(url, { cache: 'no-store' })
  const a = new Uint8Array(await blob.arrayBuffer()), b = new Uint8Array(await res.arrayBuffer())
  if (!res.ok || a.length !== b.length || a.some((x, i) => x !== b[i])) throw new Error('ตรวจรูปที่อัปโหลดแล้วไม่ตรงกับต้นฉบับ')
  return { url, size: blob.size }
}

export default function MigrateJobImages() {
  const [role, setRole] = useState(null)
  const [jobs, setJobs] = useState(null)       // [{id, code, count}]
  const [log, setLog] = useState([])
  const [running, setRunning] = useState(false)
  const add = line => setLog(l => [...l, line])

  async function scan() {
    // กรองฝั่งฐานข้อมูล: ดึงเฉพาะ id/code ของใบที่มี base64
    const { data, error } = await supabase.from('job_orders').select('id, code')
      .or([
        'image_url.like.data:image*', 'reference_url.like.data:image*',
        ...['mockup_url', 'reference_url', 'reference_images', 'mockup_images', 'artwork_images', 'finish_photos'].map(k => `items->>${k}.like.*data:image*`),
      ].join(',')).order('code')
    if (error) { add('❌ ค้นหาไม่สำเร็จ: ' + error.message); setJobs([]); return }
    setJobs(data)
  }
  useEffect(() => {
    supabase.rpc('app_role').then(({ data }) => setRole(data || ''))
    scan()   // eslint-disable-line react-hooks/set-state-in-effect -- โหลดครั้งแรก
  }, [])

  async function run() {
    setRunning(true); setLog([])
    let ok = 0
    for (const j of jobs) {
      try {
        const { data: row, error } = await supabase.from('job_orders').select('id, code, ' + COLS.join(', ')).eq('id', j.id).single()
        if (error) throw new Error(error.message)
        const found = [...new Set(COLS.flatMap(c => collect(row[c], [])))]
        if (!found.length) { add(`✓ ${row.code} — ไม่มีรูป base64 แล้ว`); ok++; continue }
        const map = new Map(); let bytes = 0
        for (const du of found) { const r = await uploadExact(du); map.set(du, r.url); bytes += r.size }
        const patch = {}
        for (const c of COLS) { const nv = swap(row[c], map); if (JSON.stringify(nv) !== JSON.stringify(row[c])) patch[c] = nv }
        const { data: saved, error: upErr } = await supabase.from('job_orders').update(patch).eq('id', row.id).select('id')
        if (upErr) throw new Error(upErr.message)
        if (!saved?.length) throw new Error('ไม่มีสิทธิ์แก้ใบงานนี้')
        add(`✓ ${row.code} — ย้าย ${found.length} รูป (${kb(bytes)})`); ok++
      } catch (e) { add(`❌ ${j.code} — ${e.message} (ใบนี้ยังไม่ถูกแก้)`) }
    }
    add(`เสร็จ ${ok}/${jobs.length} ใบ`)
    setRunning(false); setJobs(null); scan()
  }

  if (role === null) return <div className="card" style={{ padding: 24 }}>กำลังโหลด…</div>
  if (!['owner', 'admin'].includes(role)) return <div className="card" style={{ padding: 24 }}>หน้านี้สำหรับ owner / admin เท่านั้น</div>

  return (
    <div className="card" style={{ padding: 24, maxWidth: 720, display: 'grid', gap: 14 }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>ย้ายรูปเก่าในใบงาน</h2>
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
        ใบงานเก่าบางใบเก็บรูปเป็นข้อความ base64 ทำให้เปิดช้า ปุ่มนี้จะอัปโหลดรูปเป็นไฟล์ (ตรวจว่าตรงกับต้นฉบับทุกไบต์) แล้วเปลี่ยนเป็นลิงก์ รูปที่เห็นในใบงานเหมือนเดิม
      </p>
      {jobs === null ? <div>กำลังตรวจใบงาน…</div>
        : jobs.length === 0 ? <div style={{ color: 'var(--success)', fontWeight: 700 }}>✓ ไม่มีใบงานที่ต้องย้ายรูปแล้ว</div>
        : <div>พบ <b>{jobs.length}</b> ใบงาน: {jobs.map(j => j.code).join(', ')}</div>}
      {jobs?.length > 0 && (
        <div><button type="button" className="btn btn-primary" disabled={running} onClick={run}>{running ? 'กำลังย้าย…' : `ย้ายรูป ${jobs.length} ใบงาน`}</button></div>
      )}
      {log.length > 0 && <pre style={{ margin: 0, padding: 12, background: 'var(--bg)', borderRadius: 8, whiteSpace: 'pre-wrap', fontSize: 13 }}>{log.join('\n')}</pre>}
    </div>
  )
}
