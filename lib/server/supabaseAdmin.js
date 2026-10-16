import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from '@/lib/supabaseConfig'

// Service-role client: bypasses RLS. Only for webhooks, the worker and the send API,
// after they have checked the caller themselves. Never import from a client component.
let client = null

/** what kind of key was pasted — never logs the key itself */
export function adminKeyProblem(key) {
  if (!key) return 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY ใน Vercel'
  if (key.startsWith('sb_publishable_')) return 'SUPABASE_SERVICE_ROLE_KEY เป็น publishable key (กุญแจสาธารณะ) — ต้องใช้ secret key (sb_secret_…)'
  if (key.startsWith('sb_secret_')) return null
  const parts = key.split('.')
  if (parts.length === 3) {
    try {
      const role = JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role
      return role === 'service_role' ? null : `SUPABASE_SERVICE_ROLE_KEY เป็นกุญแจ role "${role}" — ต้องใช้ service_role หรือ secret key`
    } catch { /* fall through */ }
  }
  return 'SUPABASE_SERVICE_ROLE_KEY ไม่ใช่รูปแบบกุญแจของ Supabase — ต้องใช้ secret key (sb_secret_…)'
}

export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const problem = adminKeyProblem(key)
  if (problem) throw new Error(problem)
  client ??= createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return client
}
