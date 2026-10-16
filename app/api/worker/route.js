import { NextResponse } from 'next/server'
import { runTasks } from '@/lib/channels/tasks'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'

export const maxDuration = 60

/**
 * GET|POST /api/worker — runs due background tasks (called by Supabase Cron).
 * Public on purpose: it only processes work that is already queued, a few
 * items at a time, so calling it early or often does no harm.
 */
async function handle() {
  try {
    const result = await runTasks(supabaseAdmin(), { limit: 20 })
    return NextResponse.json(result)
  } catch (e) {
    console.error('[worker]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
export const GET = handle
export const POST = handle
