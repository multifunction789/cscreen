'use client'
import { useState, useEffect } from 'react'
import { getLineLeads, updateLineLead, getCustomers, insertCustomer, updateCustomer } from '@/lib/db'
import { fmtDate } from '@/lib/shop'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { createCustomerFolderClient } from '@/lib/driveClient'

const STATUSES = ['ใหม่', 'ติดต่อแล้ว', 'เปิดลูกค้าแล้ว', 'ปิด']
const BADGE = { 'ใหม่': 'badge badge-red', 'ติดต่อแล้ว': 'badge badge-yellow', 'เปิดลูกค้าแล้ว': 'badge badge-green', 'ปิด': 'badge badge-gray' }

export default function LineLeadsPage() {
  const [rows, setRows]           = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState('ใหม่')
  const [busy, setBusy]           = useState(null)
  const [linkPick, setLinkPick]   = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    const [l, c] = await Promise.all([getLineLeads(), getCustomers()])
    setRows(l.data || []); setCustomers(c.data || []); setLoading(false)
  }

  async function setStatus(lead, status) {
    await updateLineLead(lead.id, { status }); load()
  }

  // เปิดเป็นลูกค้าใหม่ + ผูก LINE
  async function createCustomer(lead) {
    setBusy(lead.id)
    try {
      const maxNum = customers.reduce((m, r) => Math.max(m, parseInt(r.code?.replace('C-', '') || '0') || 0), 0)
      const code = 'C-' + String(maxNum + 1).padStart(3, '0')
      const name = lead.company || lead.contact_name || lead.display_name || 'ลูกค้า LINE'
      let drive_folder_id = null
      try { drive_folder_id = (await createCustomerFolderClient(code, name)).folderId } catch (e) { console.warn(e) }
      const { data, error } = await insertCustomer({
        code, name, phone: lead.phone, contact_person: lead.contact_name,
        platform: 'Line', line_user_id: lead.line_user_id, drive_folder_id,
        type: lead.company ? 'นิติบุคคล' : 'บุคคลธรรมดา',
      })
      if (error) throw error
      await updateLineLead(lead.id, { customer_id: data.id, status: 'เปิดลูกค้าแล้ว' })
      load()
    } catch (e) { alert(e.message) } finally { setBusy(null) }
  }

  // ผูกกับลูกค้าที่มีอยู่แล้ว
  async function linkCustomer(lead) {
    const cid = linkPick[lead.id]; if (!cid) return
    setBusy(lead.id)
    try {
      const { error } = await updateCustomer(cid, { line_user_id: lead.line_user_id })
      if (error) throw error
      await updateLineLead(lead.id, { customer_id: cid, status: 'เปิดลูกค้าแล้ว' })
      load()
    } catch (e) { alert(e.message) } finally { setBusy(null) }
  }

  const shown = rows.filter(r => !filter || r.status === filter)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="page-header">
        <div>
          <h1>💬 คำขอจาก LINE</h1>
          <p>ลูกค้ากรอกฟอร์มขอใบเสนอราคาใน LINE OA — ผูกเป็นลูกค้าเพื่อให้ระบบแจ้งสถานะงานทาง LINE อัตโนมัติ</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['', ...STATUSES].map(s => (
          <button key={s || 'all'} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter(s)}>
            {s || 'ทั้งหมด'} ({rows.filter(r => !s || r.status === s).length})
          </button>
        ))}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? <LoadingSpinner /> : shown.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>ไม่มีรายการ</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr><th>วันที่</th><th>ลูกค้า</th><th>งาน</th><th>ต้องการรับ</th><th>สถานะ</th><th>ลูกค้าใน ERP</th></tr>
              </thead>
              <tbody>
                {shown.map(l => (
                  <tr key={l.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(l.created_at)}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{l.contact_name || l.display_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{[l.company, l.phone].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td>
                      <div>{l.product} · {l.qty} ตัว</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{[l.method, l.positions, l.color].filter(Boolean).join(' · ')}</div>
                      {l.note && <div style={{ fontSize: 12, marginTop: 4 }}>📝 {l.note}</div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{l.need_date || '-'}</td>
                    <td>
                      <select value={l.status} onChange={e => setStatus(l, e.target.value)} className={BADGE[l.status]} style={{ border: 0 }}>
                        {STATUSES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={{ minWidth: 220 }}>
                      {l.customers ? (
                        <span className="badge badge-green">{l.customers.code} {l.customers.name}</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <button className="btn btn-primary btn-sm" disabled={busy === l.id} onClick={() => createCustomer(l)}>+ เปิดลูกค้าใหม่</button>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <select value={linkPick[l.id] || ''} onChange={e => setLinkPick({ ...linkPick, [l.id]: e.target.value })} style={{ flex: 1, fontSize: 12 }}>
                              <option value="">ผูกลูกค้าเดิม…</option>
                              {customers.filter(c => !c.line_user_id).map(c => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
                            </select>
                            <button className="btn btn-outline btn-sm" disabled={!linkPick[l.id] || busy === l.id} onClick={() => linkCustomer(l)}>ผูก</button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
