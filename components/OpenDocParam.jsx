'use client'
import { Suspense, useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { clearOpenParam, pushOpenParam } from '@/lib/docLinks'
import { notify } from '@/lib/feedback'

/**
 * อ่าน ?open=<id> จาก URL แล้วเรียก onOpen(id) ทุกครั้งที่ค่าเปลี่ยน (id = null เมื่อไม่มี)
 * แยกเป็น component ใน <Suspense> เพื่อให้หน้าหลักยัง prerender ได้ตามปกติ
 */
function Listener({ onOpen }) {
  const id = useSearchParams().get('open')
  useEffect(() => { onOpen(id) }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

export default function OpenDocParam({ onOpen }) {
  return (
    <Suspense fallback={null}>
      <Listener onOpen={onOpen} />
    </Suspense>
  )
}

/**
 * ผูกมุมมองเอกสาร (view) ของหน้า เข้ากับ URL ?open=<id>
 *   - เปิดจากลิงก์/ค้นหา/แถบเส้นทางเอกสาร ได้ทันที
 *   - ปุ่ม Back ของเบราว์เซอร์/มือถือ กลับมาที่รายการได้
 *
 *   const doc = useDocView(setView)
 *   ...ใน load():  doc.loaded(rows)
 *   ...ปุ่มดู:    doc.open(row)        ปุ่มกลับ: doc.close()
 *   ...ใน JSX:    {doc.param}
 */
export function useDocView(setView) {
  const pathname = usePathname()
  const idRef    = useRef(null)
  const listRef  = useRef(null)
  // ค่า ?open= ล่าสุดที่จัดการไปแล้ว — Listener ถูก mount ใหม่เมื่อสลับรายการ↔เอกสาร
  // จึงต้องกันไม่ให้ค่าเดิม (ที่ URL ยังไม่ทันเปลี่ยน) เปิดเอกสารซ้ำ
  const seenRef  = useRef(undefined)

  function apply() {
    const id = idRef.current
    if (!id) { setView(null); return }
    if (!listRef.current) return            // ยังโหลดข้อมูลไม่เสร็จ — รอ loaded()
    const row = listRef.current.find(r => r.id === id)
    if (row) setView(row)
    else {
      notify.warn('ไม่พบเอกสารนี้ อาจถูกลบไปแล้ว')
      idRef.current = null
      clearOpenParam(pathname)
    }
  }

  return {
    param: <OpenDocParam onOpen={id => {
      if (id === seenRef.current) return
      seenRef.current = id
      idRef.current = id
      apply()
    }} />,
    loaded(list) {
      listRef.current = list || []
      if (idRef.current) apply()
    },
    open(row) {
      idRef.current = row.id
      setView(row)
      pushOpenParam(pathname, row.id)
      window.scrollTo({ top: 0 })
    },
    close() {
      idRef.current = null
      setView(null)
      clearOpenParam(pathname)
    },
  }
}
