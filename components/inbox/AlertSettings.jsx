'use client'
import { useState } from 'react'
import { useChatAlerts } from './ChatAlerts'
import { enableAlerts, disableAlerts, setSound, isIOS, isStandalone } from '@/lib/inbox/alerts'
import { notify } from '@/lib/feedback'

/** 🔔 button in the chat list: turn alerts on for this device, sound on/off */
export default function AlertSettings() {
  const a = useChatAlerts()
  const [open, setOpen] = useState(false)
  if (!a.ready || !a.allowed) return null
  const on = a.push || a.permission === 'granted'
  const needsHomeScreen = isIOS() && !isStandalone()

  async function turnOn() {
    const err = await enableAlerts()
    if (err) notify.error(err)
    else notify.success('เปิดแจ้งเตือนบนเครื่องนี้แล้ว')
  }

  return (
    <div className="ib-alerts">
      <button type="button" className={`ib-icon${on ? ' on' : ''}`} aria-expanded={open} aria-label="ตั้งค่าแจ้งเตือน"
        title={on ? 'แจ้งเตือนเปิดอยู่' : 'เปิดแจ้งเตือนข้อความใหม่'} onClick={() => setOpen(o => !o)}>{on ? '🔔' : '🔕'}</button>
      {open && (
        <div className="ib-alerts-pop" role="dialog" aria-label="แจ้งเตือนข้อความ">
          <b>แจ้งเตือนข้อความลูกค้า</b>
          <p className="ib-small">แชทที่มีคนรับแล้วจะเตือนเฉพาะคนที่รับ แชทที่ยังไม่มีคนรับจะเตือน owner / admin / sales ทุกคน</p>
          {a.push ? (
            <>
              <p className="ib-small ok">✓ เครื่องนี้รับแจ้งเตือนแล้ว — เด้งได้แม้ปิดหน้าเว็บ</p>
              <button type="button" className="btn btn-outline btn-sm" disabled={a.busy} onClick={disableAlerts}>ปิดแจ้งเตือนบนเครื่องนี้</button>
            </>
          ) : a.permission === 'denied' ? (
            <p className="ib-small ib-warn">เบราว์เซอร์บล็อกการแจ้งเตือนของเว็บนี้ไว้ — เปิดใหม่ได้ที่ไอคอนแม่กุญแจ 🔒 ข้างช่อง URL → การแจ้งเตือน → อนุญาต</p>
          ) : (
            <>
              {needsHomeScreen && <p className="ib-small ib-warn">iPhone/iPad: กดปุ่มแชร์ ⬆︎ → &quot;เพิ่มไปยังหน้าจอโฮม&quot; แล้วเปิด CScreen จากไอคอนนั้น จึงจะเปิดแจ้งเตือนได้</p>}
              <button type="button" className="btn btn-primary btn-sm" disabled={a.busy || needsHomeScreen} onClick={turnOn}>เปิดแจ้งเตือนบนเครื่องนี้</button>
            </>
          )}
          <label className="ib-unread-toggle"><input type="checkbox" checked={a.sound} onChange={e => setSound(e.target.checked)} /> เสียงเตือนเมื่อเปิดหน้าเว็บอยู่</label>
        </div>
      )}
    </div>
  )
}
