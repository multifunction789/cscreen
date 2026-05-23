'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { group: 'หลัก / Main', items: [
    { href: '/dashboard', icon: '📊', label: 'Dashboard' },
  ]},
  { group: 'การขาย / Sales', items: [
    { href: '/customers', icon: '👥', label: 'ลูกค้า (Customer)' },
    { href: '/quotation', icon: '📋', label: 'ใบเสนอราคา' },
    { href: '/invoice',   icon: '📄', label: 'ใบแจ้งหนี้ (Invoice)' },
    { href: '/receipt',   icon: '🧾', label: 'ใบเสร็จ (Receipt)' },
  ]},
  { group: 'การผลิต / Production', items: [
    { href: '/joborder',   icon: '📝', label: 'ใบงาน (Job Order)' },
    { href: '/production', icon: '🖨️', label: 'ติดตามงาน' },
  ]},
  { group: 'คลังสินค้า / Stock', items: [
    { href: '/stock',    icon: '📦', label: 'สต๊อกวัตถุดิบ' },
    { href: '/stock-in', icon: '📥', label: 'รับสินค้าเข้า' },
    { href: '/supplier', icon: '🏢', label: 'Supplier' },
  ]},
  { group: 'การเงิน / Finance', items: [
    { href: '/finance',  icon: '💰', label: 'รายรับ-รายจ่าย' },
    { href: '/taxdocs',  icon: '📑', label: 'เอกสารภาษี / Tax Docs' },
  ]},
  { group: 'เครื่องมือ / Tools', items: [
    { href: '/report', icon: '📈', label: 'รายงานรายเดือน' },
    { href: '/cost',   icon: '🧮', label: 'เปรียบเทียบต้นทุน' },
    { href: '/excel',  icon: '📊', label: 'ดึงรายงาน Excel' },
  ]},
]

export default function Sidebar({ mobileOpen = false, onMobileClose = () => {} }) {
  const pathname  = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  // Close mobile sidebar when navigating
  function handleNavClick() {
    onMobileClose()
  }

  return (
    <aside
      className={`sidebar${mobileOpen ? ' mobile-open' : ''}`}
      style={{
        width: collapsed ? 60 : 240,
        background: 'var(--sidebar-bg)',
        position: 'fixed',
        top: 0, left: 0,
        height: '100vh',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        transition: 'width .3s, transform .3s',
        overflow: 'hidden',
      }}>

      {/* Logo */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #2A2A2A', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, background: 'var(--primary)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#fff', flexShrink: 0, letterSpacing: -1 }}>CS</div>
        {!collapsed && (
          <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 17, letterSpacing: .5 }}>CSCREEN</div>
            <div style={{ color: '#888', fontSize: 10 }}>Screen Printing ERP</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {navItems.map((group) => (
          <div key={group.group}>
            {!collapsed && (
              <div style={{ fontSize: 10, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: 1, padding: '14px 20px 6px' }}>
                {group.group}
              </div>
            )}
            {group.items.map((item) => {
              const active = pathname === item.href
              return (
                <Link key={item.href} href={item.href} onClick={handleNavClick}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: collapsed ? '12px 0' : '11px 20px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    color: active ? '#fff' : 'var(--sidebar-text)',
                    background: active ? '#2A0505' : 'transparent',
                    borderLeft: active ? '3px solid var(--primary)' : '3px solid transparent',
                    fontSize: 13.5, textDecoration: 'none',
                    transition: 'background .15s, color .15s',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.background = '#2A2A2A'; e.currentTarget.style.color = '#fff' } }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sidebar-text)' } }}
                >
                  <span style={{ fontSize: 17, width: 22, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                  {!collapsed && <span style={{ flex: 1, fontWeight: active ? 600 : 400 }}>{item.label}</span>}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Collapse button — desktop only */}
      <button onClick={() => setCollapsed(!collapsed)}
        className="sidebar-collapse-btn"
        style={{ width: '100%', padding: '12px 0', background: 'transparent', color: '#666', fontSize: 12, border: 'none', borderTop: '1px solid #2A2A2A', display: 'flex', alignItems: 'center', gap: 8, paddingLeft: collapsed ? 0 : 20, justifyContent: collapsed ? 'center' : 'flex-start', cursor: 'pointer', transition: 'background .15s, color .15s', flexShrink: 0 }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.05)'; e.currentTarget.style.color = '#fff' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#666' }}
      >
        <span style={{ display: 'inline-block', transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform .3s' }}>◀</span>
        {!collapsed && <span>ย่อเมนู</span>}
      </button>
    </aside>
  )
}
