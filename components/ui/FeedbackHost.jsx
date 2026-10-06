'use client'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import {
  subscribeFeedback, getFeedbackState, getServerFeedbackState,
  dismissToast, closeDialog,
} from '@/lib/feedback'

const ICONS = { success: '✓', error: '!', warn: '!', info: 'i' }

export default function FeedbackHost() {
  const { toasts, dialog } = useSyncExternalStore(subscribeFeedback, getFeedbackState, getServerFeedbackState)
  const confirmBtn = useRef(null)

  useEffect(() => {
    if (!dialog) return
    confirmBtn.current?.focus()
    const onKey = e => {
      if (e.key === 'Escape') closeDialog(false)
      if (e.key === 'Enter') { e.preventDefault(); closeDialog(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog])

  return (
    <>
      <div className="toast-stack no-print" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span className="toast-icon" aria-hidden>{ICONS[t.type]}</span>
            <span className="toast-msg">{t.message}</span>
            {t.action && (
              <button className="toast-action" onClick={() => { dismissToast(t.id); t.action.onClick() }}>
                {t.action.label}
              </button>
            )}
            <button className="toast-close" aria-label="ปิด" onClick={() => dismissToast(t.id)}>×</button>
          </div>
        ))}
      </div>

      {dialog && (
        <div className="dialog-backdrop no-print" onMouseDown={e => { if (e.target === e.currentTarget) closeDialog(false) }}>
          <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">
            <h2 id="dlg-title" className="dialog-title">{dialog.title}</h2>
            {dialog.message && <p className="dialog-msg">{dialog.message}</p>}
            <div className="dialog-actions">
              <button className="btn btn-outline" onClick={() => closeDialog(false)}>{dialog.cancelLabel}</button>
              <button ref={confirmBtn} className={`btn ${dialog.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => closeDialog(true)}>
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
