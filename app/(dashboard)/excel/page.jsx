'use client'
import { useState } from 'react'
import { getJobOrders, getQuotations, getReceipts, getCustomers, getMaterials, getStockIn, getTransactions, getSuppliers } from '@/lib/db'

const salesReports = [
  { id: 'joborder',   icon: '📝', label: 'ใบงาน (Job Order)',     desc: 'Export ใบงานทั้งหมดพร้อมสถานะ, ลูกค้า, มูลค่า' },
  { id: 'quotation',  icon: '📋', label: 'ใบเสนอราคา',            desc: 'Export ใบเสนอราคาทั้งหมดตามช่วงวันที่' },
  { id: 'receipt',    icon: '🧾', label: 'ใบเสร็จ / Invoice',     desc: 'Export ใบเสร็จและ Invoice ที่ออกแล้ว' },
  { id: 'customer',   icon: '👥', label: 'รายชื่อลูกค้า',         desc: 'Export ข้อมูลลูกค้าทั้งหมดพร้อมประวัติสั่งซื้อ' },
]
const stockReports = [
  { id: 'stock',      icon: '📦', label: 'สต๊อกวัตถุดิบ',         desc: 'Export สต๊อกคงเหลือ ณ วันปัจจุบัน' },
  { id: 'stock_in',   icon: '📥', label: 'ประวัติรับเข้าสต๊อก',   desc: 'Export รายการรับเข้าวัตถุดิบทั้งหมด' },
  { id: 'finance',    icon: '💰', label: 'รายรับ-รายจ่าย',        desc: 'Export รายการเงินตามช่วงเวลา + สรุปกำไร' },
  { id: 'supplier',   icon: '🏢', label: 'Supplier',               desc: 'Export รายชื่อซัพพลายเออร์ทั้งหมด' },
]

const fmt = (d) => d ? new Date(d).toLocaleDateString('th-TH') : ''

async function fetchData(id) {
  switch (id) {
    case 'joborder': {
      const { data } = await getJobOrders()
      return {
        headers: ['เลขที่', 'ลูกค้า', 'รายการ', 'จำนวน', 'ราคา/หน่วย', 'รวม', 'สถานะ', 'กำหนดส่ง', 'วันที่สร้าง'],
        rows: (data || []).map(r => [
          r.code, r.customers?.name, r.item_desc, r.qty, r.unit_price,
          r.total, r.status, fmt(r.due_date), fmt(r.created_at),
        ])
      }
    }
    case 'quotation': {
      const { data } = await getQuotations()
      return {
        headers: ['เลขที่', 'ลูกค้า', 'รายการ', 'มูลค่า', 'สถานะ', 'ใช้ได้ถึง', 'วันที่สร้าง'],
        rows: (data || []).map(r => [
          r.code, r.customers?.name, r.item_desc, r.total,
          r.status, fmt(r.valid_until), fmt(r.created_at),
        ])
      }
    }
    case 'receipt': {
      const { data } = await getReceipts()
      return {
        headers: ['เลขที่', 'ลูกค้า', 'อ้างอิง JO', 'มูลค่า', 'วิธีชำระ', 'สถานะ', 'วันที่'],
        rows: (data || []).map(r => [
          r.code, r.customers?.name, r.job_orders?.code, r.total,
          r.payment_method, r.paid ? 'ชำระแล้ว' : 'รอชำระ', fmt(r.created_at),
        ])
      }
    }
    case 'customer': {
      const { data } = await getCustomers()
      return {
        headers: ['รหัส', 'ชื่อลูกค้า', 'เบอร์โทร', 'อีเมล', 'Line', 'ที่อยู่', 'วันที่เพิ่ม'],
        rows: (data || []).map(r => [
          r.code, r.name, r.phone, r.email, r.line, r.address, fmt(r.created_at),
        ])
      }
    }
    case 'stock': {
      const { data } = await getMaterials()
      return {
        headers: ['รหัส', 'ชื่อวัตถุดิบ', 'ประเภท', 'คงเหลือ', 'หน่วย', 'ขั้นต่ำ', 'ราคาทุน/หน่วย'],
        rows: (data || []).map(r => [
          r.code, r.name, r.category, r.qty, r.unit, r.min_qty, r.cost_per_unit,
        ])
      }
    }
    case 'stock_in': {
      const { data } = await getStockIn()
      return {
        headers: ['รหัส', 'วันที่รับ', 'วัตถุดิบ', 'ซัพพลายเออร์', 'จำนวน', 'หน่วย', 'ราคาทุน', 'รวม'],
        rows: (data || []).map(r => [
          r.code, fmt(r.received_at), r.materials?.name, r.suppliers?.name,
          r.qty, r.materials?.unit, r.cost_per_unit, r.total,
        ])
      }
    }
    case 'finance': {
      const { data } = await getTransactions()
      return {
        headers: ['วันที่', 'รายการ', 'ประเภท', 'จำนวน (฿)', 'อ้างอิง JO', 'หมายเหตุ'],
        rows: (data || []).map(r => [
          fmt(r.transaction_date), r.description, r.type,
          r.amount, r.job_orders?.code, r.note,
        ])
      }
    }
    case 'supplier': {
      const { data } = await getSuppliers()
      return {
        headers: ['รหัส', 'ชื่อบริษัท', 'หมวดหมู่', 'ผู้ติดต่อ', 'เบอร์โทร', 'อีเมล', 'คะแนน'],
        rows: (data || []).map(r => [
          r.code, r.name, r.category, r.contact, r.phone, r.email, r.rating,
        ])
      }
    }
    default: return { headers: [], rows: [] }
  }
}

function filterByDate(rows, headers, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return rows
  // find date column index (วันที่ / created_at position)
  const dateIdx = headers.findIndex(h => h.includes('วันที่') || h.includes('created'))
  if (dateIdx < 0) return rows
  const from = dateFrom ? new Date(dateFrom) : null
  const to   = dateTo   ? new Date(dateTo + 'T23:59:59') : null
  return rows.filter(r => {
    const parts = (r[dateIdx] || '').split('/')
    if (parts.length < 3) return true
    // th-TH format: dd/mm/yyyy (buddhist year, subtract 543)
    const d = new Date(`${parseInt(parts[2]) - 543}-${parts[1]}-${parts[0]}`)
    if (from && d < from) return false
    if (to   && d > to)   return false
    return true
  })
}

export default function ExcelPage() {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [format, setFormat]     = useState('xlsx')
  const [loading, setLoading]   = useState(null) // id of report being downloaded

  async function handleExport(id, label) {
    setLoading(id)
    try {
      const { headers, rows } = await fetchData(id)
      const filtered = filterByDate(rows, headers, dateFrom, dateTo)

      if (format === 'csv') {
        downloadCSV(headers, filtered, label)
      } else {
        await downloadXLSX(headers, filtered, label)
      }
    } catch (e) {
      alert('เกิดข้อผิดพลาด: ' + e.message)
    }
    setLoading(null)
  }

  async function handleExportAll() {
    setLoading('all')
    try {
      const XLSX = (await import('xlsx')).default
      const wb = XLSX.utils.book_new()
      const allReports = [...salesReports, ...stockReports]
      for (const r of allReports) {
        const { headers, rows } = await fetchData(r.id)
        const filtered = filterByDate(rows, headers, dateFrom, dateTo)
        const ws = XLSX.utils.aoa_to_sheet([headers, ...filtered])
        XLSX.utils.book_append_sheet(wb, ws, r.label.slice(0, 31))
      }
      XLSX.writeFile(wb, `cscreen_export_${new Date().toISOString().slice(0,10)}.xlsx`)
    } catch (e) {
      alert('เกิดข้อผิดพลาด: ' + e.message)
    }
    setLoading(null)
  }

  function downloadCSV(headers, rows, label) {
    const escape = (v) => {
      const s = v == null ? '' : String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const lines = [headers, ...rows].map(r => r.map(escape).join(','))
    const bom = '﻿' // UTF-8 BOM for Excel
    const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    triggerDownload(blob, `${label}_${new Date().toISOString().slice(0,10)}.csv`)
  }

  async function downloadXLSX(headers, rows, label) {
    const XLSX = (await import('xlsx')).default
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, label.slice(0, 31))
    XLSX.writeFile(wb, `${label}_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const ReportCard = ({ r, accentColor }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px',
      background: 'var(--bg)', borderRadius: 8,
      border: '1px solid var(--border)', transition: 'border-color .15s',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = accentColor}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <span style={{ fontSize: 22, flexShrink: 0 }}>{r.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{r.label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{r.desc}</div>
      </div>
      <button
        className="btn btn-sm"
        style={{ whiteSpace: 'nowrap', background: accentColor, color: '#fff', border: 'none', opacity: loading === r.id ? .6 : 1 }}
        onClick={() => handleExport(r.id, r.label)}
        disabled={!!loading}
      >
        {loading === r.id ? '⏳' : '⬇️'} .{format}
      </button>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Settings */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>⚙️ ตั้งค่าการ Export</div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label>ตั้งแต่วันที่</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 180 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label>ถึงวันที่</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: 180 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label>รูปแบบไฟล์</label>
            <select value={format} onChange={e => setFormat(e.target.value)} style={{ width: 160 }}>
              <option value="xlsx">Excel (.xlsx)</option>
              <option value="csv">CSV (.csv)</option>
            </select>
          </div>
          {dateFrom && dateTo && (
            <span className="badge badge-green" style={{ marginBottom: 2 }}>✓ {dateFrom} — {dateTo}</span>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <button className="btn btn-primary" onClick={handleExportAll} disabled={!!loading}>
              {loading === 'all' ? '⏳ กำลัง Export...' : '📦 Export ทั้งหมด (.xlsx)'}
            </button>
          </div>
        </div>
      </div>

      {/* 2-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: '#FEF2F2' }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>💼 รายงานการขาย / Sales</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>ใบงาน, ใบเสนอราคา, ใบเสร็จ, ลูกค้า</p>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {salesReports.map(r => <ReportCard key={r.id} r={r} accentColor="var(--primary)" />)}
          </div>
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: '#EFF6FF' }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--info)' }}>🏭 รายงานสต๊อก / Operations</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>สต๊อก, รับเข้า, การเงิน, Supplier</p>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {stockReports.map(r => <ReportCard key={r.id} r={r} accentColor="var(--info)" />)}
          </div>
        </div>
      </div>
    </div>
  )
}
