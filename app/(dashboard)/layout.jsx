'use client'
import { useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'
import ErrorBoundary from '@/components/ErrorBoundary'
import FeedbackHost from '@/components/ui/FeedbackHost'

export default function DashboardLayout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed]   = useState(false)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>

      {mobileOpen && (
        <div onClick={() => setMobileOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99 }}
          className="mobile-overlay" />
      )}

      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(c => !c)}
      />

      {/* เนื้อหาขยับตามความกว้าง sidebar (เดิมค้างที่ 240px แม้ย่อเมนูแล้ว) */}
      <div className="main-content"
        style={{ marginLeft: collapsed ? 60 : 240, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: '100vh', transition: 'margin-left .3s' }}>
        <Topbar onMenuToggle={() => setMobileOpen(o => !o)} />
        <main style={{ flex: 1, padding: 24, minWidth: 0 }}>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>

      <FeedbackHost />
    </div>
  )
}
