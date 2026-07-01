'use client'
import { useRef, useState } from 'react'

/**
 * FileDropZone — ปุ่มเลือกไฟล์ พร้อม drag-and-drop
 *
 * Props:
 *   accept      string
 *   preview     string   — dataURL / URL สำหรับแสดงรูป
 *   fileName    string   — ชื่อไฟล์ (กรณีไม่ใช่รูป)
 *   fileSize    number   — bytes
 *   label       string   — ข้อความในปุ่ม
 *   icon        string   — emoji ด้านซ้ายปุ่ม
 *   onFile      fn(File)
 *   onClear     fn()
 *   imageOnly   bool     — แสดง image preview
 *   compact     bool     — ความสูงน้อย (source file)
 */
export default function FileDropZone({
  accept = '*',
  preview,
  fileName,
  fileSize,
  label = 'เลือกไฟล์',
  icon = '📎',
  onFile,
  onClear,
  imageOnly = false,
  compact = false,
}) {
  const inputRef    = useRef(null)
  const [drag, setDrag] = useState(false)

  function pick(file) { if (file) onFile?.(file) }

  function onDrop(e) {
    e.preventDefault(); setDrag(false)
    pick(e.dataTransfer.files?.[0])
  }

  const hasFile = !!(preview || fileName)

  /* ── shared drop handlers ── */
  const dropProps = {
    onDragOver:  e => { e.preventDefault(); setDrag(true) },
    onDragLeave: () => setDrag(false),
    onDrop,
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={e => pick(e.target.files?.[0])}
      />

      {hasFile ? (
        /* ════ FILLED ════ */
        imageOnly && preview ? (
          /* รูปภาพ — แสดง preview + overlay */
          <div
            {...dropProps}
            onClick={() => inputRef.current?.click()}
            style={{
              position: 'relative', borderRadius: 10, overflow: 'hidden',
              border: `2px solid ${drag ? 'var(--primary)' : '#6366F1'}`,
              cursor: 'pointer',
              boxShadow: drag ? '0 0 0 3px rgba(99,102,241,.2)' : '0 1px 4px rgba(0,0,0,.08)',
              transition: 'border-color .15s, box-shadow .15s',
            }}
          >
            <img
              src={preview}
              alt={label}
              style={{
                width: '100%',
                minHeight: compact ? 80 : 120,
                maxHeight: compact ? 120 : 220,
                objectFit: 'contain',
                display: 'block',
                background: '#F8FAFC',
                padding: 8,
              }}
            />
            {/* overlay bar */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 10px',
              background: 'rgba(15,23,42,.65)',
              backdropFilter: 'blur(4px)',
            }}>
              <span style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600 }}>คลิกเพื่อเปลี่ยน</span>
              {onClear && (
                <button
                  onClick={e => { e.stopPropagation(); onClear() }}
                  style={{
                    background: 'rgba(239,68,68,.85)', border: 'none', borderRadius: 5,
                    color: '#fff', fontSize: 11, fontWeight: 700,
                    padding: '2px 8px', cursor: 'pointer', lineHeight: 1.6,
                  }}
                >ลบ</button>
              )}
            </div>
          </div>
        ) : (
          /* ไฟล์ต้นฉบับ — แถบชื่อไฟล์ + ปุ่มเปลี่ยน/ลบ */
          <div
            {...dropProps}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px',
              borderRadius: 10,
              border: `2px solid ${drag ? 'var(--primary)' : '#10B981'}`,
              background: drag ? 'rgba(16,185,129,.06)' : '#F0FDF4',
              transition: 'border-color .15s, background .15s',
            }}
          >
            <span style={{ fontSize: 24, flexShrink: 0 }}>📄</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#065F46', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {fileName}
              </div>
              {fileSize != null && (
                <div style={{ fontSize: 11, color: '#6B7280' }}>{(fileSize / 1024 / 1024).toFixed(2)} MB</div>
              )}
            </div>
            <button
              onClick={() => inputRef.current?.click()}
              style={{
                flexShrink: 0, fontSize: 11, fontWeight: 700,
                padding: '4px 10px', borderRadius: 6,
                border: '1.5px solid #10B981', background: '#fff',
                color: '#059669', cursor: 'pointer',
                transition: 'background .12s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#D1FAE5'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >เปลี่ยน</button>
            {onClear && (
              <button
                onClick={onClear}
                style={{
                  flexShrink: 0, fontSize: 11, fontWeight: 700,
                  padding: '4px 10px', borderRadius: 6,
                  border: '1.5px solid #F87171', background: '#fff',
                  color: '#EF4444', cursor: 'pointer',
                  transition: 'background .12s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#FEE2E2'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
              >ลบ</button>
            )}
          </div>
        )
      ) : (
        /* ════ EMPTY — drop zone + ปุ่ม ════ */
        <div
          {...dropProps}
          onClick={() => inputRef.current?.click()}
          style={{
            display: 'flex',
            flexDirection: compact ? 'row' : 'column',
            alignItems: 'center',
            justifyContent: compact ? 'flex-start' : 'center',
            gap: compact ? 10 : 8,
            minHeight: compact ? 56 : 110,
            padding: compact ? '0 14px' : '16px 12px',
            borderRadius: 10,
            border: `2px dashed ${drag ? 'var(--primary)' : '#CBD5E1'}`,
            background: drag
              ? 'rgba(99,102,241,.06)'
              : 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
            cursor: 'pointer',
            userSelect: 'none',
            transition: 'border-color .15s, background .15s, transform .1s',
            transform: drag ? 'scale(1.015)' : 'scale(1)',
          }}
        >
          {/* ไอคอน */}
          <div style={{
            width: compact ? 36 : 44, height: compact ? 36 : 44,
            borderRadius: '50%',
            background: drag ? 'rgba(99,102,241,.12)' : '#E2E8F0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: compact ? 18 : 22,
            flexShrink: 0,
            transition: 'background .15s',
          }}>
            {drag ? '⬇️' : icon}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: compact ? 'flex-start' : 'center', gap: 6, flex: compact ? 1 : undefined }}>
            {!compact && (
              <span style={{
                fontSize: 11, fontWeight: 600,
                color: drag ? 'var(--primary)' : '#64748B',
                textAlign: 'center', lineHeight: 1.4,
              }}>
                {drag ? 'วางไฟล์ที่นี่' : label}
              </span>
            )}

            {/* ปุ่มเลือกไฟล์ */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: compact ? '6px 14px' : '7px 18px',
              borderRadius: 8,
              background: drag ? 'var(--primary)' : 'var(--primary)',
              color: '#fff',
              fontSize: compact ? 12 : 12,
              fontWeight: 700,
              letterSpacing: .2,
              boxShadow: '0 1px 3px rgba(99,102,241,.35)',
              transition: 'background .12s, box-shadow .12s',
              pointerEvents: 'none',
            }}>
              <span style={{ fontSize: 13 }}>📁</span>
              {compact ? 'เลือกไฟล์' : 'เลือกไฟล์'}
            </div>

            {compact && (
              <span style={{ fontSize: 10, color: '#94A3B8', fontWeight: 500 }}>
                {drag ? 'วางไฟล์ที่นี่' : 'หรือลากมาวาง'}
              </span>
            )}
          </div>

          {!compact && (
            <span style={{ fontSize: 10, color: '#94A3B8', fontWeight: 500 }}>
              หรือลากไฟล์มาวางที่นี่
            </span>
          )}
        </div>
      )}
    </div>
  )
}
