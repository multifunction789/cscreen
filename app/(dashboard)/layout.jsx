'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'

export default function DashboardLayout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [authed, setAuthed] = useState(null) // null = กำลังเช็ค, true = ผ่าน, false = ไม่ผ่าน
  const router = useRouter()

  useEffect(() => {
    // เช็ค session ตอนโหลด
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAuthed(true)
      } else {
        setAuthed(false)
        router.replace('/login')
      }
    }).catch(() => {
      // ถ้า error ให้ผ่านไปก่อน (ไม่ block)
      setAuthed(true)
    })

    // ฟังการเปลี่ยน auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (!session && event !== 'INITIAL_SESSION')) {
        router.replace('/login')
      }
    })

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line

  if (authed === null) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1A1A1A' }}>
        <div style={{ color: '#fff', fontSize: 14, opacity: 0.7 }}>กำลังโหลด...</div>
      </div>
    )
  }

  if (authed === false) return null

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>

      {mobileOpen && (
        <div onClick={() => setMobileOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99 }}
          className="mobile-overlay" />
      )}

      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

      <div className="main-content"
        style={{ marginLeft: 240, flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', transition: 'margin-left .3s' }}>
        <Topbar onMenuToggle={() => setMobileOpen(o => !o)} />
        <main style={{ flex: 1, padding: 24 }}>
          {children}
        </main>
      </div>
    </div>
  )
}
