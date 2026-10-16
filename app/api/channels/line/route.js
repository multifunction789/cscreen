import { NextResponse, after } from 'next/server'
import { verifySignature } from '@/lib/channels/line'
import { runTasks } from '@/lib/channels/tasks'
import { sendChatAlerts } from '@/lib/channels/alerts'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'

export const maxDuration = 30

/**
 * POST /api/channels/line — LINE OA webhook (public; trust comes from x-line-signature).
 * Every event is stored in one transaction with its follow-up tasks, then we answer 200.
 * Any storage error → 500 so LINE redelivers; duplicates are dropped by webhookEventId.
 */
export async function POST(req) {
  if (!process.env.LINE_CHANNEL_SECRET) {
    console.error('[line webhook] LINE_CHANNEL_SECRET not set')
    return NextResponse.json({ error: 'not configured' }, { status: 500 })
  }
  const raw = await req.text()
  if (!verifySignature(raw, req.headers.get('x-line-signature'))) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  }
  let body
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  if (typeof body?.destination !== 'string') return NextResponse.json({ error: 'no destination' }, { status: 400 })

  let db
  try { db = supabaseAdmin() } catch (e) {
    console.error('[line webhook]', e.message)
    return NextResponse.json({ error: 'not configured' }, { status: 500 })
  }
  const events = Array.isArray(body.events) ? body.events : []
  const fresh = []                                      // new customer messages → staff alerts
  for (const ev of events.length ? events : [null]) {   // empty list = LINE "Verify" button
    const { data, error } = await db.rpc('ingest_line_event', { p_destination: body.destination, p_event: ev })
    if (data?.status === 'processed' && data.message_id && ev?.type === 'message') fresh.push(data.message_id)
    if (error) {
      console.error('[line webhook] ingest failed', error.message)
      return NextResponse.json({ error: 'store failed' }, { status: 500 })
    }
  }
  after(async () => {
    await sendChatAlerts(db, fresh)
    await runTasks(db, { limit: 10 }).catch(e => console.error('[line webhook] tasks', e.message))
  })
  return NextResponse.json({ ok: true })
}
