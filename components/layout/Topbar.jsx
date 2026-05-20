'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

const pageTitles = {
  '/dashboard': { title: 'Dashboard',             subtitle: 'ภาพรวมธุรกิจ' },
  '/customers': { title: 'ลูกค้า',                subtitle: 'Customer Management' },
  '/quotation': { title: 'ใบเสนอราคา',            subtitle: 'Quotation' },
  '/invoice':   { title: 'ใบแจ้งหนี้',            subtitle: 'Invoice' },
  '/receipt':   { title: 'ใบเสร็จ',               subtitle: 'Receipt' },
  '/joborder':  { title: 'ใบงาน',                 subtitle: 'Job Order' },
  '/production':{ title: 'ติดตามงาน',             subtitle: 'Production Tracking' },
  '/stock':     { title: 'สต๊อกวัตถุดิบ',          subtitle: 'Raw Material Stock' },
  '/stock-in':  { title: 'รับสินค้าเข้า',          subtitle: 'Stock In' },
  '/supplier':  { title: 'Supplier',               subtitle: 'จัดการซัพพลายเออร์' },
  '/finance':   { title: 'รายรับ-รายจ่าย',         subtitle: 'Finance' },
  '/taxdocs':   { title: 'เอกสารภาษี',             subtitle: 'Tax Documents' },
  '/cost':      { title: 'เปรียบเทียบต้นทุน',      subtitle: 'Cost Comparison' },
  '/excel':     { title: 'ดึงรายงาน Excel',         subtitle: 'Export Report' },
}

export default function Topbar({ onMenuToggle }) {
  const pathname = usePathname()
  const page     = pageTitles[pathname] || { title: 'CSCREEN', subtitle: '' }

  const [username, setUsername] = useState('เจ้าของร้าน')
  const [editing,  setEditing]  = useState(false)
  const [tmp, setTmp]           = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('cscreen_username')
    if (saved) setUsername(saved)
  }, [])

  function saveName() {
    const name = tmp.trim() || username
    setUsername(name)
    localStorage.setItem('cscreen_username', name)
    setEditing(false)
  }

  return (
    <header style={{
      background: '#fff',
      borderBottom: '1px solid var(--border)',
      padding: '0 20px',
      height: 58,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      gap: 12,
    }}>

      {/* Left: hamburger (mobile) + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {/* Hamburger — hidden on desktop, shown on mobile via CSS */}
        <button
          className="topbar-hamburger"
          onClick={onMenuToggle}
          style={{
            display: 'none',          /* CSS overrides to flex on mobile */
            width: 36, height: 36,
            border: '1.5px solid var(--border)',
            borderRadius: 8,
            background: '#fff',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            cursor: 'pointer',
            flexShrink: 0,
            color: 'var(--text)',
          }}>
          ☰
        </button>

        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {page.title}
          </h1>
          {page.subtitle && (
            <p className="topbar-subtitle" style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{page.subtitle}</p>
          )}
        </div>
      </div>

      {/* Right: user */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {/* Notification */}
        <button style={{ width: 36, height: 36, border: '1.5px solid var(--border)', borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: 'var(--text-muted)', position: 'relative', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}>
          🔔
          <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, background: 'var(--primary)', borderRadius: '50%', border: '2px solid #fff' }} />
        </button>

        {/* User */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 34, height: 34, background: 'var(--primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
            {username.charAt(0).toUpperCase()}
          </div>
          {editing ? (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input autoFocus value={tmp}
                onChange={e => setTmp(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditing(false) }}
                style={{ width: 120, fontSize: 12, padding: '4px 8px', borderRadius: 6 }} />
              <button onClick={saveName}
                style={{ background: 'var(--primary)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, padding: '4px 8px', cursor: 'pointer' }}>✓</button>
            </div>
          ) : (
            <div className="topbar-username" style={{ cursor: 'pointer' }}
              onClick={() => { setTmp(username); setEditing(true) }} title="คลิกเพื่อแก้ไขชื่อ">
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.2 }}>{username} ✏️</div>
              <div className="topbar-subtitle" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Owner · C-Screen</div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
