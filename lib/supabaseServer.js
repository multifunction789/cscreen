import 'server-only'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_KEY } from './supabaseConfig'

/** Supabase client ฝั่งเซิร์ฟเวอร์ (Route Handler) — อ่าน session จาก cookie ของผู้ใช้ */
export async function createSupabaseServer() {
  const store = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: list => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)) } catch { /* อ่านอย่างเดียวในบางบริบท */ }
      },
    },
  })
}

/**
 * ใช้ต้น Route Handler: คืน { user } ถ้าล็อกอินแล้ว หรือ { response: 401 } ให้ return ทันที
 *   const auth = await requireUser(); if (auth.response) return auth.response
 */
export async function requireUser() {
  try {
    const supabase = await createSupabaseServer()
    const { data, error } = await supabase.auth.getClaims()
    if (!error && data?.claims?.sub) return { user: data.claims }
  } catch { /* ตกไปตอบ 401 */ }
  return { response: NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 }) }
}
