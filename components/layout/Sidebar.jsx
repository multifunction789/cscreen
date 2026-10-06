'use client'
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

export default function Sidebar({ mobileOpen = false, onMobileClose = () => {}, collapsed = false, onToggleCollapse = () => {} }) {
  const pathname = usePathname()
  const isActive = href => pathname === href || pathname.startsWith(href + '/')

  return (
    <aside
      className={`sidebar${mobileOpen ? ' mobile-open' : ''}${collapsed ? ' collapsed' : ''}`}
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
      <div style={{ padding: collapsed ? '20px 12px 16px' : '20px 20px 16px', borderBottom: '1px solid #2A2A2A', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cscreen-logo.png" alt="C-Screen" style={{ width: 36, height: 36, objectFit: 'contain', flexShrink: 0 }} />
        {!collapsed && (
          <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 17, letterSpacing: .5 }}>CSCREEN</div>
            <div style={{ color: '#888', fontSize: 10 }}>Screen Printing ERP</div>
          </div>
        )}
        {/* ปุ่มปิดเมนู — มือถือเท่านั้น */}
        <button className="sidebar-close-btn" onClick={onMobileClose} aria-label="ปิดเมนู"
          style={{ display: 'none', background: 'transparent', border: 'none', color: '#999', fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
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
            {group.items.map((item) => (
              <Link key={item.href} href={item.href} onClick={onMobileClose}
                className={`nav-link${isActive(item.href) ? ' active' : ''}`}
                title={collapsed ? item.label : undefined}
                aria-current={isActive(item.href) ? 'page' : undefined}>
                <span className="nav-icon">{item.icon}</span>
                {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      {/* Collapse button — desktop only */}
      <button onClick={onToggleCollapse}
        className="sidebar-collapse-btn nav-link"
        style={{ width: '100%', background: 'transparent', fontSize: 12, border: 'none', borderTop: '1px solid #2A2A2A', color: '#888', flexShrink: 0 }}>
        <span className="nav-icon" style={{ fontSize: 12, transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform .3s' }}>◀</span>
        {!collapsed && <span>ย่อเมนู</span>}
      </button>
    </aside>
  )
}
