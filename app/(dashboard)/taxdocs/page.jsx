'use client'
import { useState, useEffect } from 'react'
import { getInvoices, getStockIn, updateInvoice, updateReceipt, getReceipts } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { fmtDate } from '@/lib/shop'
import { uploadFile, exportJpeg } from '@/lib/docUtils'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function TaxDocsPage() {
  const [tab, setTab]             = useState('vat-buy')
  const [invoices, setInvoices]   = useState([])
  const [stockIns, setStockIns]   = useState([])
  const [receipts, setReceipts]   = useState([])
  const [loading, setLoading]     = useState(true)
  // WHT upload state
  const [whtFile, setWhtFile]     = useState({})
  const [whtUploading, setWhtUploading] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const [iRes, siRes, rRes] = await Promise.all([getInvoices(), getStockIn(), getReceipts()])
    setInvoices(iRes.data || [])
    setStockIns(siRes.data || [])
    setReceipts(rRes.data || [])
    setLoading(false)
  }

  async function handleWhtUpload(inv) {
    const file = whtFile[inv.id]; if (!file) return
    setWhtUploading(inv.id)
    const url = await uploadFile(supabase, 'wht-files', file)
    await updateInvoice(inv.id, { wht_file_url: url })
    setWhtFile(f => ({ ...f, [inv.id]: null }))
    setWhtUploading(null)
    load()
  }

  // ── Data ───────────────────────────────────────────────────
  const vatBuy     = stockIns.filter(s => (s.vat_pct || 0) > 0)
  const vatSell    = invoices.filter(i => (i.vat_pct || 0) > 0)
  const whtInvs    = invoices.filter(i => (i.wht_pct || 0) > 0)

  const totalVatBuy  = vatBuy.reduce((s, r) => s + ((r.total || 0) * (r.vat_pct || 0) / (100 + (r.vat_pct || 0))), 0)
  const totalVatSell = vatSell.reduce((s, i) => s + (i.vat_amount || 0), 0)
  const totalWht     = whtInvs.reduce((s, i) => s + (i.wht_amount || 0), 0)

  // All attachments
  const allDocs = [
    ...stockIns.filter(s => s.image_url).map(s => ({ type:'ใบเสร็จซื้อ', code: s.lot_number||s.code, name: s.item_name||s.category||'—', date: s.received_at, url: s.image_url })),
    ...receipts.filter(r => r.file_url).map(r => ({ type:'ใบเสร็จขาย', code: r.code, name: r.customers?.name||'—', date: r.created_at, url: r.file_url })),
    ...invoices.filter(i => i.wht_file_url).map(i => ({ type:'หนังสือ WHT', code: i.code, name: i.customers?.name||'—', date: i.created_at, url: i.wht_file_url })),
  ]

  const TABS = [
    { id:'vat-buy',  label:'🛒 VAT ซื้อ',     count: vatBuy.length },
    { id:'vat-sell', label:'💰 VAT ขาย',       count: vatSell.length },
    { id:'wht',      label:'📋 WHT',            count: whtInvs.length },
    { id:'docs',     label:'📎 เอกสารทั้งหมด', count: allDocs.length },
  ]

  if (loading) return <LoadingSpinner />

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* KPI */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
        {[
          { label:'VAT ซื้อรวม',   value:`฿${totalVatBuy.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',')}`, accent:'var(--info)',    icon:'🛒' },
          { label:'VAT ขายรวม',   value:`฿${totalVatSell.toLocaleString()}`,   accent:'var(--success)', icon:'💰' },
          { label:'WHT รวม',       value:`฿${totalWht.toLocaleString()}`,        accent:'var(--warning)', icon:'📋' },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--card)', borderRadius:'var(--radius)', padding:'16px 18px', boxShadow:'var(--shadow)', border:'1px solid var(--border)', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, width:4, height:'100%', background:k.accent, borderRadius:'10px 0 0 10px' }} />
            <div style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', fontSize:28, opacity:.1 }}>{k.icon}</div>
            <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase' }}>{k.label}</div>
            <div style={{ fontSize:22, fontWeight:800, color:k.accent, marginTop:4 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={tab===t.id ? 'btn btn-primary' : 'btn btn-outline'}
            style={{ fontSize:13 }}>
            {t.label}
            {t.count > 0 && <span style={{ marginLeft:6, background: tab===t.id ? 'rgba(255,255,255,.3)' : 'var(--primary)', color:'#fff', fontSize:10, padding:'1px 6px', borderRadius:10 }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ── VAT ซื้อ ── */}
      {tab === 'vat-buy' && (
        <div className="card" style={{ overflow:'hidden' }}>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <h2 style={{ fontSize:14, fontWeight:700 }}>🛒 VAT ซื้อ — จากการรับสินค้าเข้า</h2>
            <button className="btn btn-outline btn-sm" onClick={() => exportJpeg('vat-buy-table','VAT-Buy')}>📷 Export</button>
          </div>
          <div id="vat-buy-table" style={{ overflowX:'auto' }}>
            <table>
              <thead>
                <tr><th>LOT</th><th>วันที่</th><th>รายการ</th><th>Supplier</th><th>ยอดก่อน VAT</th><th>VAT%</th><th>ยอด VAT</th><th>ยอดรวม</th><th>บิล</th></tr>
              </thead>
              <tbody>
                {vatBuy.length === 0 && <tr><td colSpan={9} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>ยังไม่มีรายการ VAT ซื้อ</td></tr>}
                {vatBuy.map(s => {
                  const before = (s.total || 0) / (1 + (s.vat_pct||0)/100)
                  const vat    = (s.total || 0) - before
                  return (
                    <tr key={s.id}>
                      <td style={{ fontFamily:'monospace', fontSize:12, color:'var(--primary)', fontWeight:700 }}>{s.lot_number||s.code}</td>
                      <td style={{ fontSize:12, color:'var(--text-muted)' }}>{fmtDate(s.received_at)}</td>
                      <td style={{ fontWeight:600 }}>{s.item_name||s.category||'—'}</td>
                      <td style={{ fontSize:12 }}>{s.suppliers?.name||'—'}</td>
                      <td>฿{before.toLocaleString(undefined,{maximumFractionDigits:2})}</td>
                      <td><span className="badge badge-yellow">{s.vat_pct}%</span></td>
                      <td style={{ color:'var(--info)', fontWeight:700 }}>฿{vat.toLocaleString(undefined,{maximumFractionDigits:2})}</td>
                      <td style={{ fontWeight:800, color:'var(--success)' }}>฿{(s.total||0).toLocaleString()}</td>
                      <td>{s.image_url && <a href={s.image_url} target="_blank" rel="noreferrer" className="badge badge-green" style={{ textDecoration:'none' }}>📎 ดู</a>}</td>
                    </tr>
                  )
                })}
              </tbody>
              {vatBuy.length > 0 && (
                <tfoot>
                  <tr style={{ background:'var(--bg)', fontWeight:800 }}>
                    <td colSpan={6} style={{ textAlign:'right', padding:'10px 14px' }}>รวม VAT ซื้อทั้งหมด</td>
                    <td style={{ color:'var(--info)', padding:'10px 14px' }}>฿{totalVatBuy.toLocaleString(undefined,{maximumFractionDigits:2})}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── VAT ขาย ── */}
      {tab === 'vat-sell' && (
        <div className="card" style={{ overflow:'hidden' }}>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <h2 style={{ fontSize:14, fontWeight:700 }}>💰 VAT ขาย — จาก Invoice</h2>
            <button className="btn btn-outline btn-sm" onClick={() => exportJpeg('vat-sell-table','VAT-Sell')}>📷 Export</button>
          </div>
          <div id="vat-sell-table" style={{ overflowX:'auto' }}>
            <table>
              <thead>
                <tr><th>Invoice</th><th>วันที่</th><th>ลูกค้า</th><th>ยอดก่อน VAT</th><th>VAT%</th><th>ยอด VAT</th><th>ยอดสุทธิ</th></tr>
              </thead>
              <tbody>
                {vatSell.length === 0 && <tr><td colSpan={7} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>ยังไม่มีรายการ VAT ขาย</td></tr>}
                {vatSell.map(inv => (
                  <tr key={inv.id}>
                    <td style={{ fontFamily:'monospace', fontWeight:700, color:'var(--primary)' }}>{inv.code}</td>
                    <td style={{ fontSize:12, color:'var(--text-muted)' }}>{fmtDate(inv.document_date||inv.created_at)}</td>
                    <td style={{ fontWeight:600 }}>{inv.customers?.name||'—'}</td>
                    <td>฿{(inv.subtotal||0).toLocaleString()}</td>
                    <td><span className="badge badge-yellow">{inv.vat_pct}%</span></td>
                    <td style={{ color:'var(--info)', fontWeight:700 }}>฿{(inv.vat_amount||0).toLocaleString()}</td>
                    <td style={{ fontWeight:800, color:'var(--success)' }}>฿{(inv.total||0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              {vatSell.length > 0 && (
                <tfoot>
                  <tr style={{ background:'var(--bg)', fontWeight:800 }}>
                    <td colSpan={5} style={{ textAlign:'right', padding:'10px 14px' }}>รวม VAT ขายทั้งหมด</td>
                    <td style={{ color:'var(--info)', padding:'10px 14px' }}>฿{totalVatSell.toLocaleString()}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── WHT ── */}
      {tab === 'wht' && (
        <div className="card" style={{ overflow:'hidden' }}>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <h2 style={{ fontSize:14, fontWeight:700 }}>📋 หัก ณ ที่จ่าย (Withholding Tax)</h2>
            <button className="btn btn-outline btn-sm" onClick={() => exportJpeg('wht-table','WHT-Report')}>📷 Export</button>
          </div>
          <div id="wht-table" style={{ overflowX:'auto' }}>
            <table>
              <thead>
                <tr><th>Invoice</th><th>ลูกค้า</th><th>วันที่</th><th>WHT%</th><th>ยอด WHT</th><th>เอกสาร</th><th></th></tr>
              </thead>
              <tbody>
                {whtInvs.length === 0 && <tr><td colSpan={7} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>ยังไม่มี Invoice ที่มี WHT</td></tr>}
                {whtInvs.map(inv => (
                  <tr key={inv.id}>
                    <td style={{ fontFamily:'monospace', fontWeight:700, color:'var(--primary)' }}>{inv.code}</td>
                    <td style={{ fontWeight:600 }}>{inv.customers?.name||'—'}</td>
                    <td style={{ fontSize:12, color:'var(--text-muted)' }}>{fmtDate(inv.document_date||inv.created_at)}</td>
                    <td><span className="badge badge-yellow">{inv.wht_pct}%</span></td>
                    <td style={{ fontWeight:700, color:'var(--danger)' }}>฿{(inv.wht_amount||0).toLocaleString()}</td>
                    <td>
                      {inv.wht_file_url
                        ? <a href={inv.wht_file_url} target="_blank" rel="noreferrer" className="badge badge-green" style={{ textDecoration:'none' }}>📎 ดูไฟล์</a>
                        : <span className="badge badge-gray">ยังไม่มี</span>}
                    </td>
                    <td style={{ display:'flex', gap:4 }}>
                      <label style={{ cursor:'pointer' }}>
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display:'none' }}
                          onChange={e => setWhtFile(f => ({ ...f, [inv.id]: e.target.files[0] }))} />
                        <span className="btn btn-outline btn-sm">📎 แนบ</span>
                      </label>
                      {whtFile[inv.id] && (
                        <button className="btn btn-primary btn-sm" disabled={whtUploading===inv.id}
                          onClick={() => handleWhtUpload(inv)}>
                          {whtUploading===inv.id ? '...' : 'อัปโหลด'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {whtInvs.length > 0 && (
                <tfoot>
                  <tr style={{ background:'var(--bg)', fontWeight:800 }}>
                    <td colSpan={4} style={{ textAlign:'right', padding:'10px 14px' }}>รวม WHT ทั้งหมด</td>
                    <td style={{ color:'var(--danger)', padding:'10px 14px' }}>฿{totalWht.toLocaleString()}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── เอกสารทั้งหมด ── */}
      {tab === 'docs' && (
        <div className="card" style={{ overflow:'hidden' }}>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)' }}>
            <h2 style={{ fontSize:14, fontWeight:700 }}>📎 เอกสารแนบทั้งหมด</h2>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table>
              <thead>
                <tr><th>ประเภท</th><th>รหัส</th><th>รายละเอียด</th><th>วันที่</th><th>ไฟล์</th></tr>
              </thead>
              <tbody>
                {allDocs.length === 0 && <tr><td colSpan={5} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>ยังไม่มีเอกสารแนบ</td></tr>}
                {allDocs.map((d, i) => (
                  <tr key={i}>
                    <td><span className="badge badge-gray">{d.type}</span></td>
                    <td style={{ fontFamily:'monospace', fontSize:12, color:'var(--primary)', fontWeight:700 }}>{d.code||'—'}</td>
                    <td style={{ fontWeight:600 }}>{d.name}</td>
                    <td style={{ fontSize:12, color:'var(--text-muted)' }}>{fmtDate(d.date)}</td>
                    <td>
                      <a href={d.url} target="_blank" rel="noreferrer"
                        className="btn btn-outline btn-sm" style={{ textDecoration:'none', fontSize:12 }}>
                        🔗 เปิดไฟล์
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
