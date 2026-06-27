'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

const SLOTS = [
  { key: 'front', label: 'มุมตรง',  icon: '⬆️' },
  { key: 'back',  label: 'มุมหลัง', icon: '⬇️' },
  { key: 'side',  label: 'มุมข้าง', icon: '↩️' },
  { key: 'group', label: 'รูปรวม',  icon: '📸' },
]

/**
 * CameraCapture — modal ถ่ายรูปงานเสร็จ 4 มุม
 *
 * Props:
 *   initialPhotos  {{ front, back, side, group }}  URL หรือ dataURL เดิม
 *   onSave(photos) callback เมื่อกด "บันทึกรูป"
 *   onClose()      callback ปิด modal
 */
export default function CameraCapture({ initialPhotos = {}, onSave, onClose }) {
  const videoRef   = useRef(null)
  const canvasRef  = useRef(null)
  const streamRef  = useRef(null)

  const [active,  setActive]  = useState('front')        // slot ที่กำลังถ่าย
  const [photos,  setPhotos]  = useState({ ...initialPhotos })
  const [camErr,  setCamErr]  = useState('')
  const [facing,  setFacing]  = useState('environment')   // environment = กล้องหลัง
  const [saving,  setSaving]  = useState(false)
  const [flash,   setFlash]   = useState(false)

  // ── เปิด/ปิดกล้อง ────────────────────────────────────────────
  const startCamera = useCallback(async (facingMode) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCamErr('')
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setCamErr('กรุณาอนุญาตให้เข้าถึงกล้องในการตั้งค่าเบราว์เซอร์')
      } else if (err.name === 'NotFoundError') {
        setCamErr('ไม่พบกล้องในอุปกรณ์นี้')
      } else {
        setCamErr('ไม่สามารถเปิดกล้องได้: ' + err.message)
      }
    }
  }, [])

  useEffect(() => {
    startCamera(facing)
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  // ── สลับกล้องหน้า/หลัง ──────────────────────────────────────
  async function toggleCamera() {
    const next = facing === 'environment' ? 'user' : 'environment'
    setFacing(next)
    await startCamera(next)
  }

  // ── ถ่ายรูป ─────────────────────────────────────────────────
  function capture() {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width  = video.videoWidth  || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')

    // กล้องหน้าต้องกลับภาพ
    if (facing === 'user') {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)

    setPhotos(p => ({ ...p, [active]: dataUrl }))

    // เอฟเฟกต์แฟลช
    setFlash(true)
    setTimeout(() => setFlash(false), 200)

    // ข้ามไปสล็อตถัดไปอัตโนมัติ
    const idx  = SLOTS.findIndex(s => s.key === active)
    const next = SLOTS[idx + 1]
    if (next) setActive(next.key)
  }

  // ── ลบรูปของ slot ────────────────────────────────────────────
  function clearSlot(key) {
    setPhotos(p => { const n = { ...p }; delete n[key]; return n })
  }

  // ── บันทึก ─────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    await onSave(photos)
    setSaving(false)
  }

  const filledCount = SLOTS.filter(s => photos[s.key]).length

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 16px', background: '#111', color: '#fff', flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>ถ่ายรูปงานเสร็จ ({filledCount}/4)</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: 'column' }}>

        {/* ── Slot tabs ── */}
        <div style={{ display: 'flex', background: '#1a1a1a', flexShrink: 0 }}>
          {SLOTS.map(s => (
            <button key={s.key} onClick={() => setActive(s.key)} style={{
              flex: 1, padding: '8px 4px', border: 'none', cursor: 'pointer',
              background: active === s.key ? '#B80F0B' : 'transparent',
              color: active === s.key ? '#fff' : '#aaa',
              fontWeight: active === s.key ? 700 : 400,
              fontSize: 12, transition: 'all .15s',
              borderBottom: active === s.key ? '2px solid #ff4444' : '2px solid transparent',
              position: 'relative',
            }}>
              {photos[s.key] && (
                <span style={{
                  position: 'absolute', top: 4, right: 8,
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#4ade80', display: 'block',
                }} />
              )}
              <div>{s.icon}</div>
              <div>{s.label}</div>
            </button>
          ))}
        </div>

        {/* ── กล้อง + preview แบบ split ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

          {/* Video feed */}
          <div style={{ flex: 1, position: 'relative', background: '#000', minWidth: 0 }}>
            {camErr ? (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', color: '#f87171', padding: 24, textAlign: 'center', gap: 12,
              }}>
                <div style={{ fontSize: 40 }}>📷</div>
                <div style={{ fontSize: 14 }}>{camErr}</div>
                <button className="btn btn-outline btn-sm" style={{ color: '#fff', borderColor: '#fff' }}
                  onClick={() => startCamera(facing)}>ลองใหม่</button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline muted autoPlay
                  style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                    transform: facing === 'user' ? 'scaleX(-1)' : 'none',
                  }}
                />
                {/* Flash overlay */}
                {flash && (
                  <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: .6, pointerEvents: 'none' }} />
                )}
                {/* ป้ายชื่อมุมปัจจุบัน */}
                <div style={{
                  position: 'absolute', top: 12, left: 12,
                  background: 'rgba(0,0,0,.6)', color: '#fff',
                  borderRadius: 6, padding: '4px 10px', fontSize: 13, fontWeight: 700,
                }}>
                  {SLOTS.find(s => s.key === active)?.icon} {SLOTS.find(s => s.key === active)?.label}
                </div>
              </>
            )}
          </div>

          {/* Preview panel — desktop: แสดงด้านขวา */}
          <div style={{
            width: 140, background: '#111', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: 8, padding: 8, flexShrink: 0,
          }}>
            {SLOTS.map(s => (
              <div key={s.key}
                onClick={() => setActive(s.key)}
                style={{
                  borderRadius: 6, overflow: 'hidden', cursor: 'pointer',
                  border: active === s.key ? '2px solid #B80F0B' : '2px solid #333',
                  position: 'relative', aspectRatio: '4/3', background: '#222',
                }}
              >
                {photos[s.key] ? (
                  <>
                    <img src={photos[s.key]} alt={s.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    <button
                      onClick={e => { e.stopPropagation(); clearSlot(s.key) }}
                      style={{
                        position: 'absolute', top: 2, right: 2, width: 18, height: 18,
                        borderRadius: '50%', background: 'rgba(0,0,0,.7)', border: 'none',
                        color: '#fff', fontSize: 11, cursor: 'pointer', lineHeight: 1,
                      }}>✕</button>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 4 }}>
                    <div style={{ fontSize: 18, opacity: .4 }}>{s.icon}</div>
                    <div style={{ fontSize: 10, color: '#666' }}>{s.label}</div>
                  </div>
                )}
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'rgba(0,0,0,.6)', fontSize: 9, color: '#ddd', padding: '2px 4px', textAlign: 'center',
                }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Controls ── */}
        <div style={{
          padding: '14px 16px', background: '#111', flexShrink: 0,
          display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center',
        }}>
          {/* สลับกล้อง */}
          <button onClick={toggleCamera} disabled={!!camErr} style={{
            width: 44, height: 44, borderRadius: '50%',
            background: '#333', border: '2px solid #555', color: '#fff',
            fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} title="สลับกล้อง">🔄</button>

          {/* ปุ่มถ่าย */}
          <button onClick={capture} disabled={!!camErr} style={{
            width: 68, height: 68, borderRadius: '50%',
            background: camErr ? '#444' : '#B80F0B',
            border: '4px solid #fff', color: '#fff',
            fontSize: 26, cursor: camErr ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 0 2px #B80F0B',
            transition: 'transform .1s',
          }}>📸</button>

          {/* บันทึก */}
          <button onClick={handleSave} disabled={saving || filledCount === 0} style={{
            width: 44, height: 44, borderRadius: '50%',
            background: filledCount > 0 ? '#16a34a' : '#333',
            border: '2px solid ' + (filledCount > 0 ? '#4ade80' : '#555'),
            color: '#fff', fontSize: 16, cursor: filledCount > 0 ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} title={`บันทึก (${filledCount} รูป)`}>
            {saving ? '⏳' : '✅'}
          </button>
        </div>
      </div>

      {/* Hidden canvas สำหรับ capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )
}
