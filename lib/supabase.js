import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qhhihhyboxorzlowfqza.supabase.co'
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_VkLsT7WBbbpYbOGsaCEQsA_6q5cnVlM'

let _client = null

function getClient() {
  if (!_client) {
    _client = createBrowserClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  }
  return _client
}

// Proxy — สร้าง client จริงตอนใช้งาน ไม่ใช่ตอน build
export const supabase = new Proxy({}, {
  get(_, prop) { return getClient()[prop] }
})
