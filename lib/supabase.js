import { createBrowserClient } from '@supabase/ssr'

let _client = null

function getClient() {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          detectSessionInUrl: false,
          persistSession: true,
          autoRefreshToken: true,
        },
      }
    )
  }
  return _client
}

// Proxy — สร้าง client จริงตอนใช้งาน ไม่ใช่ตอน build
export const supabase = new Proxy({}, {
  get(_, prop) { return getClient()[prop] }
})
