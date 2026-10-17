'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import GlobalSearch from '@/components/GlobalSearch'
import { supabase } from '@/lib/supabase'

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
  '/sales':     { title: 'งานขาย',                subtitle: 'บอร์ด · ตาราง · งานของฉัน' },
  '/sales/dashboard': { title: 'แดชบอร์ดการขาย', subtitle: 'แชท · เวลาตอบ · ปิดการขาย' },
  '/payments':  { title: 'ตรวจรับเงิน',            subtitle: 'ยืนยันสลิป → ออกใบเสร็จ' },
  '/finance':   { title: 'รายรับ-รายจ่าย',         subtitle: 'Finance' },
  '/taxdocs':   { title: 'เอกสารภาษี',             subtitle: 'Tax Documents' },
  '/report':    { title: 'รายงานรายเดือน',         subtitle: 'Monthly Report' },
  '/cost':      { title: 'เปรียบเทียบต้นทุน',      subtitle: 'Cost Comparison' },
  '/excel':     { title: 'ดึงรายงาน Excel',         subtitle: 'Export Report' },
}

export default function Topbar({ onMenuToggle }) {
  const pathname = usePathname()
  const base     = '/' + (pathname.split('/')[1] || '')
  const page     = pageTitles[pathname] || pageTitles[base] || { title: 'CSCREEN', subtitle: '' }

  const [user, setUser]         = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)

  // ผู้ใช้ที่ล็อกอินอยู่ (จาก Supabase Auth) — เดิมเป็นชื่อที่พิมพ์เก็บไว้ในเบราว์เซอร์
  useEffect(() => {
    let alive = true
    supabase.auth.getUser().then(({ data }) => { if (alive) setUser(data?.user || null) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user || null))
    return () => { alive = false; sub?.subscription?.unsubscribe() }
  }, [])

  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || '…'

  async function logout() {
    setMenuOpen(false)
    await supabase.auth.signOut()
    window.location.href = '/login'
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
        <GlobalSearch />

        {/* User */}
        <div style={{ position: 'relative' }}>
          <button type="button" onClick={() => setMenuOpen(o => !o)} aria-haspopup="menu" aria-expanded={menuOpen}
            title={user?.email || ''}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            <span style={{ width: 34, height: 34, background: 'var(--primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
              {displayName.charAt(0).toUpperCase()}
            </span>
            <span className="topbar-username" style={{ textAlign: 'left' }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.2 }}>{displayName} ▾</span>
              <span className="topbar-subtitle" style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>{user?.email || ''}</span>
            </span>
          </button>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
              <div role="menu" style={{ position: 'absolute', right: 0, top: 44, zIndex: 61, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-md)', minWidth: 220, padding: 6 }}>
                <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', marginBottom: 4, wordBreak: 'break-all' }}>{user?.email || 'ไม่ทราบผู้ใช้'}</div>
                <button type="button" role="menuitem" onClick={logout}
                  style={{ width: '100%', textAlign: 'left', padding: '9px 10px', border: 'none', background: 'none', borderRadius: 6, fontSize: 13.5, fontWeight: 600, color: 'var(--danger)', cursor: 'pointer' }}>
                  ออกจากระบบ
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
