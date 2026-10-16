'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message === 'Invalid login credentials' ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : error.message)
      setLoading(false)
    } else {
      // กลับไปหน้าที่ตั้งใจจะเปิด (?next=) — รับเฉพาะ path ภายในเว็บ กัน open redirect
      const next = new URLSearchParams(window.location.search).get('next') || ''
      const safe = next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') && !next.startsWith('/login')
      router.replace(safe ? next : '/dashboard')
      router.refresh()
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #1A1A1A 0%, #2D0B0A 50%, #1A1A1A 100%)',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 16,
        padding: 40,
        width: 400,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cstyle-apparel-logo.png" alt="C Style Apparel"
            style={{ height: 110, width: 'auto', display: 'block', margin: '0 auto 12px' }} />
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>CSCREEN</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>Screen Printing ERP</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label>อีเมล</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="your@email.com"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label>รหัสผ่าน</label>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                ลืมรหัสผ่าน? ติดต่อผู้ดูแลระบบ
              </span>
            </div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div style={{
              background: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: 8, padding: '10px 14px',
              fontSize: 13, color: 'var(--danger)', fontWeight: 500,
            }}>
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{
              width: '100%', justifyContent: 'center',
              padding: '11px 0', fontSize: 14, marginTop: 4,
              opacity: loading ? .7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 24 }}>
          CSCREEN v1.0 · ระบบจัดการโรงพิมพ์สกรีน
        </p>
      </div>
    </div>
  )
}
