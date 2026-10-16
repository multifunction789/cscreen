'use client'
import { supabase } from '@/lib/supabase'
import { openStoredFile } from '@/lib/docUtils'
import { notify } from '@/lib/feedback'

/** ลิงก์เปิดไฟล์ที่แนบไว้ — ไฟล์ลับ (storage://…) ขอลิงก์ชั่วคราวตอนกด, ไฟล์ทั่วไปเปิดตรง */
export default function StoredFileLink({ url, children, ...props }) {
  const secret = typeof url === 'string' && url.startsWith('storage://')
  return (
    <a
      href={secret ? '#' : url}
      target="_blank"
      rel="noreferrer"
      {...props}
      onClick={secret ? e => { e.preventDefault(); openStoredFile(supabase, url).catch(err => notify.error(err.message)) } : undefined}
    >
      {children}
    </a>
  )
}
