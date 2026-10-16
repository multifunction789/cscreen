import { NextResponse } from 'next/server'
import { quota } from '@/lib/channels/line'
import { requireUser } from '@/lib/supabaseServer'

/** GET /api/channels/line/quota (login) → { limit, used } for this month's push messages */
export async function GET() {
  const auth = await requireUser()
  if (auth.response) return auth.response
  try {
    return NextResponse.json(await quota())
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 })
  }
}
