import { NextResponse, after } from 'next/server'
import { verifySignature } from '@/lib/channels/line'
import { runTasks } from '@/lib/channels/tasks'
import { sendChatAlerts } from '@/lib/channels/alerts'
import { runBot } from '@/lib/bot/run'
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
  const botJobs = []                                    // what the auto-reply bot may answer
  for (const ev of events.length ? events : [null]) {   // empty list = LINE "Verify" button
    const { data, error } = await db.rpc('ingest_line_event', { p_destination: body.destination, p_event: ev })
    if (data?.status === 'processed' && data.message_id && ['message', 'postback'].includes(ev?.type)) fresh.push(data.message_id)
    if (data?.status === 'processed' && ev?.replyToken && ['message', 'postback', 'follow'].includes(ev.type)) {
      botJobs.push({
        conversationId: data.conversation_id, messageId: data.message_id, replyToken: ev.replyToken,
        event: { type: ev.type, kind: data.kind, text: ev.message?.text, data: ev.postback?.data },
        conv: { botActive: data.bot_active, handoffAt: data.bot_handoff_at },
      })
    }
    if (error) {
      console.error('[line webhook] ingest failed', error.message)
      return NextResponse.json({ error: 'store failed' }, { status: 500 })
    }
  }
  after(async () => {
    // the bot answers first (LINE reply tokens expire in about a minute)
    const answered = await runBot(db, botJobs).catch(e => { console.error('[line webhook] bot', e.message); return new Set() })
    await sendChatAlerts(db, fresh.filter(id => !answered.has(id)))
    await runTasks(db, { limit: 10 }).catch(e => console.error('[line webhook] tasks', e.message))
  })
  return NextResponse.json({ ok: true })
}
