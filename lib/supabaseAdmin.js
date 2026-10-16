// Server-only Supabase client with the service role key (bypasses RLS).
// Never import this from a 'use client' file.
import { createClient } from '@supabase/supabase-js'

let _admin = null

export function supabaseAdmin() {
  if (!_admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qhhihhyboxorzlowfqza.supabase.co'
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
    _admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  return _admin
}

// Verify the caller is a signed-in ERP user (Authorization: Bearer <supabase access token>)
export async function requireUser(req) {
  const auth = req.headers.get('authorization') || ''
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!jwt) return null
  const { data, error } = await supabaseAdmin().auth.getUser(jwt)
  return error ? null : data.user
}
