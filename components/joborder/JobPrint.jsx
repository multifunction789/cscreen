'use client'
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import '@fontsource/sarabun/thai-400.css'
import '@fontsource/sarabun/thai-700.css'
import '@fontsource/sarabun/thai-800.css'
import '@fontsource/sarabun/latin-400.css'
import '@fontsource/sarabun/latin-700.css'
import '@fontsource/sarabun/latin-800.css'
import { SHOP } from '@/lib/shop'
import { QC_ITEMS, sizeTotal, latestFile, thDateLong, jobVariants, orderSizes, mockSide } from '@/lib/jobV2'

/**
 * ใบงานผลิต A4 แผ่นเดียว (794 × 1122 px) — ไม่แสดงราคา/กำไร และไม่แสดงแผนการผลิต
 * พิมพ์ด้วย printDoc('print-area') → ใช้ @page jo-a4 (ขอบ 0) จาก globals.css
 */
const MAX_VARIANTS = 4   // แสดงรูปแยกสีได้สูงสุด 4 สีต่อหน้า
const MAX_ROWS = 6       // รายการสินค้าในตารางสูงสุด 6 แถว
const MAX_DECO = 4       // งานตกแต่งสูงสุด 4 จุด

export default function JobPrint({ job, d, files = [] }) {
  const [qr, setQr] = useState('')
  const folderUrl = job.drive_folder_id ? `https://drive.google.com/drive/folders/${job.drive_folder_id}` : ''
  useEffect(() => {
    let alive = true
    if (folderUrl) QRCode.toDataURL(folderUrl, { margin: 0, width: 160, color: { dark: '#1F1A1A' } }).then(u => { if (alive) setQr(u) })
    return () => { alive = false }
  }, [folderUrl])

  const src = d.source || {}
  const variants = jobVariants(d)
  const total = variants.reduce((t, v) => t + sizeTotal(v.qtys), 0)
  // แสดงเฉพาะไซซ์ที่มีจำนวน
  const sizes = orderSizes((d.sizes || []).concat(variants.flatMap(v => Object.keys(v.qtys || {}))))
    .filter(s => variants.some(v => parseInt(v.qtys?.[s]) > 0))
  const sizeSum = s => variants.reduce((t, v) => t + (parseInt(v.qtys?.[s]) || 0), 0)
  const shown = variants.slice(0, MAX_VARIANTS)
  const cols = Math.max(1, shown.length)
  const deco = (d.decorations || []).slice(0, MAX_DECO)
  // ตารางยาวขึ้น → ลดความสูงรูป Mockup ให้ยังลง A4 แผ่นเดียว
  const extraRows = Math.max(0, Math.min(variants.length, MAX_ROWS) - 2) + Math.max(0, deco.length - 2)
  const mockH = Math.max(90, (cols > 2 ? 150 : 186) - extraRows * 30)
  const compact = extraRows >= 3   // ข้อมูลเยอะ → บีบช่อง QC / ลงชื่อ / ระยะบรรทัดตาราง
  const sp = d.spec || {}
  const itemCount = src.item_count || (src.item_nos || []).length || variants.length
  const shape = [sp.neck, sp.sleeve, sp.fit].filter(Boolean).join(' · ')
  const label = [sp.label, sp.buttons && `กระดุม ${sp.buttons}`].filter(Boolean).join(' · ')

  return (
    <div id="print-area" style={{ display: 'flex', justifyContent: 'center' }}>
      <div className={`jo-a4 jp${compact ? ' compact' : ''}`}>
        {/* Header */}
        <header className="jp-head">
          <div className="jp-brand">
            <img src={SHOP.logo || '/cstyle-apparel-logo.png'} alt="C Style Apparel" />
            <div><b>C STYLE<br />APPAREL</b><small>{SHOP.name}</small></div>
          </div>
          <div className="jp-title"><h1>ใบงานผลิต</h1><div>Production Job Order</div></div>
          <div className="jp-no">
            <div className="no">JO No. : <span>{job.code}</span></div>
            <div className="kv">
              <span>วันที่ออก :</span><b>{thDateLong(job.document_date || String(job.created_at || '').slice(0, 10)) || '—'}</b>
              <span>กำหนดส่ง :</span>
              <b>{job.due_date ? <span className="due">{thDateLong(job.due_date)}</span> : 'ยังไม่กำหนด'}{job.urgent && <span className="urg">ด่วน</span>}</b>
            </div>
          </div>
        </header>

        {/* Customer + spec */}
        <section className="jp-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="jp-card"><div className="jp-hd">👤 ข้อมูลลูกค้า</div>
            <div className="jp-kv">
              <span>ชื่อลูกค้า</span><span>:</span><b>{d.customer?.name || '—'}</b>
              <span>ผู้ติดต่อ / โทร</span><span>:</span><b>{[d.customer?.contact, d.customer?.phone].filter(Boolean).join(' · ') || '—'}</b>
              <span>อ้างอิงงาน</span><span>:</span><b>{src.invoice_code || '—'}{itemCount ? ` (${variants.length === itemCount ? `${itemCount} รายการ` : `${variants.length} จาก ${itemCount} รายการ`})` : ''}</b>
              <span>สินค้า</span><span>:</span><b>{d.product?.name || '—'}</b>
            </div>
          </div>
          <div className="jp-card"><div className="jp-hd">👕 สเปกสินค้า</div>
            <div className="jp-kv">
              <span>เนื้อผ้า</span><span>:</span><b>{sp.fabric || '—'}</b>
              <span>ทรงคอ / แขน</span><span>:</span><b>{shape || '—'}</b>
              <span>ป้ายคอ</span><span>:</span><b>{label || '—'}</b>
              <span>จำนวนรวม</span><span>:</span><b className="hl">{total} ตัว</b>
            </div>
          </div>
        </section>

        {/* Variants */}
        <section className="jp-card"><div className="jp-hd">👕 แยกสีและจำนวน<small>ตามรายการในใบแจ้งหนี้ {src.invoice_code}</small></div>
          <div className="jp-vars" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
            {shown.map((v, vi) => {
              const t = sizeTotal(v.qtys)
              const pct = total ? Math.round(t / total * 100) : 0
              return (
                <div key={v.id || vi} className="jp-var">
                  <div className={`vtop${cols > 2 ? ' tight' : ''}`}>
                    <span className="pill">{v.color || v.name || `รายการที่ ${vi + 1}`}</span>
                    <span className="big">{t} <small>ตัว</small></span>
                    <span className="sub">{pct}% ของงาน{v.item_no ? ` · รายการที่ ${v.item_no}` : ''}</span>
                  </div>
                  <div className="mocks" style={{ gridTemplateColumns: cols > 2 ? '1fr' : '1fr 1fr' }}>
                    {(cols > 2 ? [['front', 'ด้านหน้า']] : [['front', 'ด้านหน้า'], ['back', 'ด้านหลัง']]).map(([face, lbl]) => {
                      const f = latestFile(files, 'mockup', mockSide(face, vi))
                      return (
                        <div key={face} className="mock" style={{ height: mockH }}>
                          <span className="tag">{lbl}</span>
                          {f ? <img src={f.thumb_url || f.url} alt={`Mockup ${lbl}`} crossOrigin="anonymous" /> : <span className="none">ยังไม่มี Mockup</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          {variants.length > MAX_VARIANTS && <div className="jp-more">+ อีก {variants.length - MAX_VARIANTS} สี (ดูรูปในระบบ)</div>}
        </section>

        {/* Items × sizes */}
        <section className="jp-card"><div className="jp-hd">🧾 รายละเอียดสินค้า<small>อ้างอิงจาก {src.invoice_code || 'Invoice'}</small></div>
          <table className="jp-tbl jp-sz">
            <thead><tr><td style={{ width: 28 }}>#</td><td className="l">รายการสินค้า</td>{sizes.map(s => <td key={s} className="s">{s}</td>)}<td className="t">รวม</td></tr></thead>
            <tbody>
              {variants.slice(0, MAX_ROWS).map((v, vi) => (
                <tr key={v.id || vi}>
                  <td>{v.item_no || vi + 1}</td><td className="l"><b>{v.name || '—'}</b></td>
                  {sizes.map(s => <td key={s} className="s">{parseInt(v.qtys?.[s]) || '—'}</td>)}
                  <td className="t">{sizeTotal(v.qtys)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={2} className="r">{variants.length > MAX_ROWS ? `+ อีก ${variants.length - MAX_ROWS} รายการ · ` : ''}รวมทุกรายการ</td>{sizes.map(s => <td key={s} className="s">{sizeSum(s) || '—'}</td>)}<td className="t">{total}</td></tr></tfoot>
          </table>
        </section>

        {/* Decorations */}
        <section className="jp-card"><div className="jp-hd">🎨 รายละเอียดงานตกแต่ง<small>สำหรับช่างสกรีน / ปัก — วัดเป็นนิ้ว</small></div>
          <div className="jp-deco">
            <table className="jp-tbl jp-dt">
              <thead><tr><td style={{ width: 26 }}>#</td><td className="l">ลาย / ไฟล์</td><td className="l">ตำแหน่ง</td><td>เทคนิค</td><td>สีหมึก</td><td>ขนาดลาย<br />(กว้าง × สูง)</td><td>ระยะวาง</td></tr></thead>
              <tbody>
                {deco.map((x, i) => (
                  <tr key={x.id || i}>
                    <td><span className="n">{i + 1}</span></td>
                    <td className="l"><div className="lay">{x.image_url ? <img src={x.image_url} alt="" crossOrigin="anonymous" /> : null}<b>{x.name || '—'}</b></div></td>
                    <td className="l">{x.position || '—'}</td>
                    <td>{x.technique || '—'}</td>
                    <td>{x.colors || '—'}</td>
                    <td className="in">{x.size_in ? `${x.size_in} นิ้ว` : x.size ? `${x.size} ซม.` : '—'}</td>
                    <td className="in">{x.placement || '—'}{x.placement_note ? <><br /><span className="sub">{x.placement_note}</span></> : null}</td>
                  </tr>
                ))}
                {Array.from({ length: Math.max(1, 3 - deco.length) }).map((_, i) => <tr key={`b${i}`} className="blank"><td /><td /><td /><td /><td /><td /><td /></tr>)}
              </tbody>
            </table>
            <div className="qr">
              {qr ? <img src={qr} alt="QR โฟลเดอร์ไฟล์งาน" /> : <div className="noqr">ยังไม่มีโฟลเดอร์</div>}
              <b>ไฟล์แบบ / Artwork</b><span>สแกนเปิดโฟลเดอร์</span>
            </div>
          </div>
          {(d.decorations || []).length > MAX_DECO && <div className="jp-more">+ อีก {(d.decorations || []).length - MAX_DECO} จุด (ดูในระบบ)</div>}
        </section>

        {/* QC + note + delivery */}
        <section className="jp-row jp-grow" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div className="jp-card"><div className="jp-hd">✅ ตรวจสอบคุณภาพ (QC)</div>
            <div className="jp-qc">
              {QC_ITEMS.map(q => <span key={q.key}><i className={`box${d.qc?.[q.key] ? ' on' : ''}`} />{q.label}{q.key === 'qty' ? ` (${total} ตัว)` : ''}</span>)}
            </div>
          </div>
          <div className="jp-card"><div className="jp-hd">📝 หมายเหตุการผลิต</div>
            <div className="jp-note">{d.sew_note || ''}<div className="dots" /><div className="dots" /><div className="dots" /></div>
          </div>
          <div className="jp-card"><div className="jp-hd">🚚 การส่งมอบ</div>
            <div className="jp-deliv">
              {[['วันที่ส่งมอบ', thDateLong(d.delivery?.date)], ['ช่องทาง', d.delivery?.channel], ['Tracking', d.delivery?.tracking], ['ผู้รับสินค้า', '']].map(([k, v]) => (
                <div key={k} className="ln"><span>{k} :</span><span>{v || ''}</span></div>
              ))}
            </div>
          </div>
        </section>

        {/* Sign */}
        <section className="jp-sign">
          {['👤 ผู้ควบคุมงาน', '✔ ผู้ตรวจสอบ', '👍 ผู้อนุมัติ'].map(t => (
            <div key={t}><b>{t}</b><span className="l" /><span className="dt">วันที่ ____/____/______</span></div>
          ))}
        </section>

        <footer className="jp-foot">
          <b>{SHOP.name}</b>
          <span>Your Style · Our Passion</span>
          <span>☎ {SHOP.tel}</span>
          <span>LINE {SHOP.line}</span>
        </footer>
      </div>
    </div>
  )
}
