import { createBrowserClient } from '@supabase/ssr'

import { SUPABASE_URL, SUPABASE_KEY } from './supabaseConfig'

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
