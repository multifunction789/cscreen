'use client'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import '@fontsource/sarabun/thai-400.css'
import '@fontsource/sarabun/thai-700.css'
import '@fontsource/sarabun/thai-800.css'
import '@fontsource/sarabun/latin-400.css'
import '@fontsource/sarabun/latin-700.css'
import '@fontsource/sarabun/latin-800.css'
import { SHOP } from '@/lib/shop'
import { SPEC_FIELDS, QC_ITEMS, PHASES, statusCls, sizeTotal, latestFile, fileKindLabel, thDate, thDateLong } from '@/lib/jobV2'

/**
 * ใบงานผลิต A4 แผ่นเดียว (794 × 1122 px) — ไม่แสดงราคา/กำไร
 * พิมพ์ด้วย printDoc('print-area') → ใช้ @page jo-a4 (ขอบ 0) จาก globals.css
 */
export default function JobPrint({ job, d, steps, files, invoice, siblings = [], supplierName, overall }) {
  const [qr, setQr] = useState('')
  const folderUrl = job.drive_folder_id ? `https://drive.google.com/drive/folders/${job.drive_folder_id}` : ''
  useEffect(() => {
    let alive = true
    if (folderUrl) QRCode.toDataURL(folderUrl, { margin: 0, width: 160, color: { dark: '#1F1A1A' } }).then(u => { if (alive) setQr(u) })
    return () => { alive = false }
  }, [folderUrl])

  const src = d.source || {}
  const total = sizeTotal(d.qtys)
  const front = latestFile(files, 'mockup', 'front')
  const back = latestFile(files, 'mockup', 'back')
  const fileCards = ['mockup', 'logo', 'artwork', 'pattern'].map(k => latestFile(files, k)).filter(Boolean)
  const invItems = invoice?.items || []
  const printedAt = new Date()
  const stamp = `${thDate(printedAt.toISOString().slice(0, 10))} ${String(printedAt.getHours()).padStart(2, '0')}:${String(printedAt.getMinutes()).padStart(2, '0')}`
  const rows = steps.slice(0, 9)

  return (
    <div id="print-area" style={{ display: 'flex', justifyContent: 'center' }}>
      <div className="jo-a4">
        {/* Header */}
        <header className="a4-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/cscreen-logo.png" alt="CSCREEN" style={{ height: 62, width: 'auto' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <b style={{ fontSize: 10, letterSpacing: 2.4 }}>C STYLE APPAREL</b>
              <span style={{ fontSize: 8.5, color: '#6B5B5A', lineHeight: 1.25 }}>{SHOP.name}<br />โทร {SHOP.tel}</span>
            </div>
          </div>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>ใบงานผลิต</span><span className="a4-code">{job.code}</span></div>
            <b style={{ fontSize: 13 }}>อ้างอิง {src.invoice_code || '—'} · รายการที่ {src.item_no || '—'} จาก {src.item_count || '—'}</b>
            <span className="a4-pill">{d.product?.name || '—'} — {total || d.product?.qty || 0} ตัว</span>
            <span style={{ fontSize: 8.5, color: '#6B5B5A' }}>1 ใบงาน = 1 แบบสินค้า · INV เดียวสร้างได้หลายใบงาน</span>
          </div>
          <div style={{ fontSize: 10, textAlign: 'center', lineHeight: 1.5 }}>วันที่สร้างใบงาน<br /><b style={{ fontSize: 11.5 }}>{thDateLong(job.document_date || String(job.created_at || '').slice(0, 10)) || '—'}</b></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="a4-due"><div style={{ fontSize: 11, fontWeight: 700 }}>กำหนดส่ง</div><div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>{thDateLong(job.due_date) || 'ยังไม่กำหนด'}</div></div>
            {job.urgent && <div className="a4-urgent">ด่วน</div>}
          </div>
        </header>

        {/* Customer + invoice */}
        <section className="a4-2">
          <div className="a4-card"><div className="a4-hd">ข้อมูลลูกค้า</div>
            <div className="a4-kv">
              <span>ชื่อลูกค้า</span><span>:</span><b>{d.customer?.name || '—'}</b>
              <span>ผู้ติดต่อ</span><span>:</span><b>{d.customer?.contact || '—'}</b>
              <span>โทรศัพท์</span><span>:</span><span>{d.customer?.phone || '—'}{d.customer?.line ? `  ·  LINE: ${d.customer.line}` : ''}</span>
              <span>ที่อยู่จัดส่ง</span><span>:</span><span>{d.customer?.address || '—'}</span>
            </div>
          </div>
          <div className="a4-card"><div className="a4-hd">อ้างอิงใบแจ้งหนี้ {src.invoice_code}<small>{src.invoice_date ? `ลงวันที่ ${thDateLong(String(src.invoice_date).slice(0, 10))}` : ''}</small></div>
            <table className="a4-inv">
              <thead><tr><td style={{ width: 22 }}></td><td style={{ width: 38 }}>รายการ</td><td style={{ textAlign: 'left' }}>สินค้า</td><td>จำนวน</td><td>สถานะใบงาน</td></tr></thead>
              <tbody>
                {invItems.slice(0, 5).map((it, i) => {
                  const n = i + 1, me = n === src.item_no
                  const other = siblings.find(s => s.invoice_item_no === n && s.id !== job.id)
                  return (
                    <tr key={n} className={me ? 'sel' : ''}>
                      <td><span className={`a4-radio${me ? ' on' : ''}`} /></td><td>{n}</td><td style={{ textAlign: 'left' }}>{it.desc || '—'}</td>
                      <td>{Number(it.qty) || sizeTotal(it.sizes)} ตัว</td><td>{me ? 'ใบงานนี้' : other ? other.code : 'ยังไม่สร้าง'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Product */}
        <section className="a4-card"><div className="a4-hd" style={{ justifyContent: 'flex-start', gap: 6 }}>รายละเอียดสินค้า<small style={{ marginLeft: 0 }}>(ตามรายการที่เลือก)</small></div>
          <table className="a4-grid"><thead><tr>{SPEC_FIELDS.map(f => <td key={f.key}>{f.label}</td>)}</tr></thead>
            <tbody><tr>{SPEC_FIELDS.map(f => <td key={f.key}>{d.spec?.[f.key] || '—'}</td>)}</tr></tbody></table>
        </section>

        {/* Sizes + note */}
        <section className="a4-2" style={{ gridTemplateColumns: '1.55fr 1fr' }}>
          <div className="a4-card"><table className="a4-sz">
            <thead><tr><td style={{ width: 76 }}>ไซส์</td>{(d.sizes || []).map(s => <td key={s}>{s}</td>)}<td>รวม</td></tr></thead>
            <tbody><tr><td style={{ fontSize: 11 }}>จำนวน (ตัว)</td>{(d.sizes || []).map(s => <td key={s}>{d.qtys?.[s] || '—'}</td>)}<td className="tot">{total}</td></tr></tbody>
          </table></div>
          <div className="a4-card" style={{ padding: '4px 9px' }}><b>หมายเหตุการผลิต</b><div style={{ fontSize: 10.5, whiteSpace: 'pre-line', maxHeight: 30, overflow: 'hidden' }}>{d.sew_note || '—'}</div></div>
        </section>

        {/* Mockup + decoration + files */}
        <section className="a4-2" style={{ gridTemplateColumns: '1.08fr 1fr', flex: '0 0 auto' }}>
          <div className="a4-card" style={{ display: 'flex', flexDirection: 'column' }}><div className="a4-hd">แบบเสื้อ (Mockup)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: 6, flex: 1 }}>
              {[['ด้านหน้า', front], ['ด้านหลัง', back]].map(([label, f]) => (
                <div key={label} className="a4-mock">
                  <span className="a4-tag">{label}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {f ? <img src={f.thumb_url || f.url} alt={`Mockup ${label}`} crossOrigin="anonymous" /> : <span style={{ color: '#9CA3AF' }}>ยังไม่มี Mockup</span>}
                  {f && <span className="a4-ver">v{f.version}{f.approved ? ' · อนุมัติ' : ''}</span>}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
            <div className="a4-card"><div className="a4-hd">รายละเอียดงานตกแต่ง</div>
              {(d.decorations || []).slice(0, 3).map((x, i) => (
                <div key={x.id || i} className="a4-deco">
                  <b>{x.position || '—'}</b>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <div className="th">{x.image_url ? <img src={x.image_url} alt="" crossOrigin="anonymous" /> : null}</div>
                  <div className="kv"><span>เทคนิค</span><span>: {x.technique || '—'}</span><span>ขนาด</span><span>: {x.size ? `${x.size} cm` : '—'}</span><span>สี</span><span>: {x.colors || '—'}</span></div>
                </div>
              ))}
              {!(d.decorations || []).length && <div style={{ padding: 8, color: '#9CA3AF' }}>ไม่มีงานตกแต่ง</div>}
              {(d.decorations || []).length > 3 && <div style={{ padding: '2px 8px', fontSize: 10, color: '#6B5B5A' }}>+ อีก {(d.decorations || []).length - 3} จุด (ดูในระบบ)</div>}
            </div>
            <div className="a4-card" style={{ flex: 1 }}><div className="a4-hd">ไฟล์งานที่ใช้</div>
              <div className="a4-files">
                {fileCards.slice(0, 4).map(f => (
                  <div key={f.id} className="a4-file">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <div className="t">{f.thumb_url ? <img src={f.thumb_url} alt="" crossOrigin="anonymous" /> : (f.name.split('.').pop() || '').toUpperCase().slice(0, 4)}</div>
                    <b>{fileKindLabel(f.kind)}</b><span>v{f.version}{f.approved ? ' ✓' : ''}</span>
                  </div>
                ))}
                {!fileCards.length && <div style={{ gridColumn: '1/5', color: '#9CA3AF', padding: 6 }}>ยังไม่มีไฟล์</div>}
                <div className="a4-file" style={{ border: 'none' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {qr ? <img src={qr} alt="QR โฟลเดอร์ Drive" style={{ width: 44, height: 44, margin: '0 auto 2px', display: 'block' }} /> : <div className="t" style={{ fontSize: 8 }}>ไม่มีโฟลเดอร์</div>}
                  <b>โฟลเดอร์ไฟล์</b><span>SCAN</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Phases */}
        <section className="a4-chev">
          <div className="cap">ลำดับการผลิต</div>
          {(overall?.phases || PHASES.map(name => ({ name, state: 'todo' }))).map(p => <div key={p.name} className={p.state}>{p.name}</div>)}
        </section>

        {/* Plan */}
        <section className="a4-card"><div className="a4-hd">แผนการผลิต / ผู้รับผิดชอบ<small>สถานะล่าสุด ณ วันที่พิมพ์ {stamp}</small></div>
          <table className="a4-plan">
            <thead><tr><td style={{ width: 36 }}>ลำดับ</td><td className="l">ขั้นตอน</td><td className="l">Supplier / ผู้รับผิดชอบ</td><td>วันที่ส่ง</td><td>กำหนดรับ</td><td>รับจริง</td><td style={{ width: 92 }}>สถานะ</td></tr></thead>
            <tbody>
              {rows.map((s, i) => (
                <tr key={s.id}><td>{i + 1}</td><td className="l"><b>{s.name}</b></td><td className="l">{supplierName(s.supplier_id) || s.assignee || 'ภายใน'}</td>
                  <td>{thDate(s.sent_date) || '—'}</td><td><b>{thDate(s.due_date) || '—'}</b></td><td>{thDate(s.received_date) || '—'}</td>
                  <td><span className={`a4-st ${statusCls(s.status)}`}>{s.status}</span></td></tr>
              ))}
              {!rows.length && <tr><td colSpan={7} style={{ color: '#9CA3AF', padding: 8 }}>ยังไม่มีแผนการผลิต</td></tr>}
              {steps.length > rows.length && <tr><td colSpan={7} style={{ fontSize: 10, color: '#6B5B5A' }}>+ อีก {steps.length - rows.length} ขั้นตอน (ดูในระบบ)</td></tr>}
            </tbody>
          </table>
        </section>

        {/* QC */}
        <section className="a4-card a4-qc"><div className="a4-hd">ตรวจสอบคุณภาพ (QC Checklist)</div>
          {QC_ITEMS.map(q => <span key={q.key}><i className={`a4-box${d.qc?.[q.key] ? ' on' : ''}`} />{q.label}{q.key === 'qty' ? ` (${total} ตัว)` : ''}</span>)}
        </section>

        {/* Delivery + sign */}
        <section className="a4-2" style={{ flex: 1 }}>
          <div className="a4-card"><div className="a4-hd">การส่งมอบ / การติดตาม</div>
            <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[['ส่งมอบวันที่', thDate(d.delivery?.date)], ['ช่องทางจัดส่ง', d.delivery?.channel], ['เลขที่พัสดุ / Tracking', d.delivery?.tracking]].map(([k, v]) => (
                <div key={k} className="a4-ln"><span>{k} :</span><span>{v || ''}</span></div>
              ))}
            </div>
          </div>
          <div className="a4-card"><div className="a4-hd">ลงชื่อยืนยัน</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: '6px 14px', textAlign: 'center' }}>
              {['ผู้ควบคุมงาน CSCREEN', 'ผู้ตรวจรับ / ส่งมอบ'].map(t => (
                <div key={t} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><span>{t}</span><span style={{ borderBottom: '1px solid #6B7280', height: 20 }} /><span>(...............................)</span><span>วันที่ ____/____/______</span></div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
